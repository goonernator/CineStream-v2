'use client';

import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import VideoPlayer from './VideoPlayer';
import { logger } from '@/lib/logger';
import type { StreamSource, StreamCaption } from '@/lib/streaming';

interface StreamPlayerProps {
  sources: StreamSource[];
  captions?: StreamCaption[];
  type?: 'movie' | 'tv';
  title?: string;
  discordTitle?: string;
  discordEpisodeName?: string;
  mediaId?: number;
  season?: number;
  episode?: number;
  hasNextEpisode?: boolean;
  onNextEpisode?: () => void;
  onControlsVisibilityChange?: (visible: boolean) => void;
  pausedForStillWatching?: boolean;
}

function StreamPlayer({ sources, captions = [], type = 'movie', title, discordTitle, discordEpisodeName, mediaId, season, episode, hasNextEpisode, onNextEpisode, onControlsVisibilityChange, pausedForStillWatching = false }: StreamPlayerProps) {
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [providerHealth, setProviderHealth] = useState<Record<string, 'checking' | 'ok' | 'failed'>>({});
  const currentSourceIndexRef = useRef(0);
  const manualSwitchIndexRef = useRef<number | null>(null);
  const manualSwitchLockUntilRef = useRef(0);
  const warmedSourceUrlsRef = useRef<Set<string>>(new Set());
  const currentSource = sources[currentSourceIndex];

  useEffect(() => {
    currentSourceIndexRef.current = currentSourceIndex;
  }, [currentSourceIndex]);

  const warmSourceIfNeeded = useCallback((source?: StreamSource) => {
    if (!source) return;

    const isRiveProvider = source.provider === 'flowcast' || source.provider === 'hindicast';
    const isLocalProxyUrl = source.url.startsWith('/api/proxy-hls?url=');
    if (!isRiveProvider || !isLocalProxyUrl) return;

    if (warmedSourceUrlsRef.current.has(source.url)) return;
    warmedSourceUrlsRef.current.add(source.url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(source.url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeout);
        logger.debug('StreamPlayer: Warm-up request complete', {
          provider: source.provider,
          quality: source.quality,
          status: res.status,
        });
      })
      .catch((error) => {
        clearTimeout(timeout);
        // Warm-up is best-effort only; actual playback still proceeds normally.
        logger.debug('StreamPlayer: Warm-up request skipped/failed', {
          provider: source.provider,
          quality: source.quality,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, []);

  // Provider status is based on parsed source presence only.
  // Avoid probing stream URLs here: many are signed/cross-origin and probing them can cause 403s
  // or consume short-lived URLs before the actual player uses them.
  useEffect(() => {
    const normalizeProvider = (provider?: string) => {
      const p = provider || 'unknown';
      return p === 'rivestream' ? 'flowcast' : p;
    };
    const grouped = new Map<string, StreamSource[]>();
    for (const source of sources) {
      const key = normalizeProvider(source.provider);
      const arr = grouped.get(key) || [];
      arr.push(source);
      grouped.set(key, arr);
    }

    if (grouped.size === 0) {
      setProviderHealth({});
      return;
    }

    const next: Record<string, 'checking' | 'ok' | 'failed'> = {};
    grouped.forEach((providerSources, provider) => {
      next[provider] = providerSources.length > 0 ? 'ok' : 'failed';
    });
    setProviderHealth(next);
  }, [sources]);

  // Memoize callbacks to prevent unnecessary VideoPlayer re-renders
  const handleSourceChange = useCallback((index: number) => {
    warmSourceIfNeeded(sources[index]);
    manualSwitchIndexRef.current = index;
    manualSwitchLockUntilRef.current = Date.now() + 2000;
    setCurrentSourceIndex(index);
    setHasError(false);
  }, [sources, warmSourceIfNeeded]);

  const handleError = useCallback(() => {
    const now = Date.now();
    const isManualSwitchProtected =
      manualSwitchIndexRef.current !== null &&
      currentSourceIndexRef.current === manualSwitchIndexRef.current &&
      now < manualSwitchLockUntilRef.current;

    if (isManualSwitchProtected) {
      logger.debug('StreamPlayer: Ignoring error during manual source switch grace period', {
        sourceIndex: currentSourceIndexRef.current,
      });
      return;
    }

    setCurrentSourceIndex(prevIndex => {
      const nextIndex = prevIndex + 1;
      if (nextIndex < sources.length) {
        logger.debug(`StreamPlayer: Source ${prevIndex + 1}/${sources.length} failed, switching to ${nextIndex + 1}`);
        setHasError(false);
        return nextIndex;
      } else {
        logger.error('StreamPlayer: All sources failed');
        setHasError(true);
        return prevIndex;
      }
    });
  }, [sources.length]);

  // Reset error state when source changes
  useEffect(() => {
    setHasError(false);
  }, [currentSourceIndex]);

  // Warm up the currently selected Rivestream source (initial load + auto-fallback) once.
  useEffect(() => {
    warmSourceIfNeeded(currentSource);
  }, [currentSource, warmSourceIfNeeded]);

  // Clear stale manual-switch lock after the grace period
  useEffect(() => {
    if (manualSwitchIndexRef.current !== currentSourceIndex) return;
    const timeout = setTimeout(() => {
      if (manualSwitchIndexRef.current === currentSourceIndex) {
        manualSwitchIndexRef.current = null;
      }
    }, 2100);
    return () => clearTimeout(timeout);
  }, [currentSourceIndex]);

  // Log current source info
  useEffect(() => {
    if (currentSource) {
      logger.debug('StreamPlayer: Current source:', {
        index: currentSourceIndex + 1,
        total: sources.length,
        url: currentSource?.url,
        provider: currentSource?.provider,
        type: currentSource?.type,
      });
    }
  }, [currentSourceIndex, currentSource, sources.length]);

  // Convert sources to the format VideoPlayer expects, including provider info
  // Memoize to prevent unnecessary re-renders
  const videoSources = useMemo(() => sources.map(source => ({
    url: source.url,
    quality: source.quality || 'Unknown',
    provider: source.provider || 'unknown'
  })), [sources]);

  // No source available
  if (!currentSource) {
    return (
      <div className="w-full h-full bg-netflix-dark flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-netflix-light text-lg">No stream available, check back soon</p>
        </div>
      </div>
    );
  }

  // Iframe embed for embed-based sources
  if (currentSource.type === 'iframe') {
    // Common iframe props
    const iframeProps = {
      src: currentSource.url,
      id: `stream-iframe-${currentSourceIndex}`,
      className: "w-full h-full border-0",
      allowFullScreen: true,
      allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
      referrerPolicy: "no-referrer-when-downgrade" as const,
      onError: handleError,
      style: {
        display: 'block' as const,
        overflow: 'hidden' as const,
      },
    };

    return (
      <div className="w-full h-full bg-netflix-dark relative overflow-hidden">
        {/* Render iframe with sandbox restrictions */}
        <iframe 
          {...iframeProps} 
          sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation allow-top-navigation-by-user-activation"
        />
        {hasError && currentSourceIndex === sources.length - 1 && (
          <div className="absolute inset-0 flex items-center justify-center bg-netflix-dark/90">
            <div className="text-center px-4">
              <p className="text-red-500 text-lg font-semibold mb-2">Stream Failed to Load</p>
              <p className="text-netflix-gray text-sm mb-4">The current streaming source is unavailable. We'll try an alternative source automatically.</p>
              {currentSourceIndex > 0 && (
                <button
                  onClick={() => setCurrentSourceIndex(0)}
                  className="px-6 py-3 bg-netflix-red hover:bg-red-600 text-white rounded-lg font-semibold transition-colors"
                >
                  Try Primary Source
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // All direct sources exhausted, show error
  if (hasError && currentSourceIndex === sources.length - 1 && sources.length > 1) {
    return (
      <div className="w-full h-full bg-netflix-dark flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-netflix-light text-lg">No stream available, check back soon</p>
        </div>
      </div>
    );
  }

  // Direct video stream (HLS player)
  return (
    <div className="w-full h-full relative">
      <VideoPlayer 
        key={`${currentSourceIndex}-${currentSource.url}`}
        src={currentSource.url} 
        type={type}
        title={title}
        discordTitle={discordTitle}
        discordEpisodeName={discordEpisodeName}
        mediaId={mediaId}
        season={season}
        episode={episode}
        sources={videoSources}
        providerHealth={providerHealth}
        captions={captions}
        currentSourceIndex={currentSourceIndex}
        onSourceChange={handleSourceChange}
        onError={currentSourceIndex < sources.length - 1 ? handleError : undefined}
        hasNextEpisode={hasNextEpisode}
        onNextEpisode={onNextEpisode}
        onControlsVisibilityChange={onControlsVisibilityChange}
        pausedForStillWatching={pausedForStillWatching}
      />
    </div>
  );
}

// Memoize to prevent unnecessary re-renders when parent state changes
export default memo(StreamPlayer);
