'use client';

import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import VideoPlayer from './VideoPlayer';
import type { StreamSource, StreamCaption } from '@/lib/streaming';

interface StreamPlayerProps {
  sources: StreamSource[];
  captions?: StreamCaption[];
  type?: 'movie' | 'tv';
  title?: string;
  mediaId?: number;
  season?: number;
  episode?: number;
  hasNextEpisode?: boolean;
  onNextEpisode?: () => void;
  onControlsVisibilityChange?: (visible: boolean) => void;
  pausedForStillWatching?: boolean;
}

function StreamPlayer({ sources, captions = [], type = 'movie', title, mediaId, season, episode, hasNextEpisode, onNextEpisode, onControlsVisibilityChange, pausedForStillWatching = false }: StreamPlayerProps) {
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const currentSource = sources[currentSourceIndex];

  // Memoize callbacks to prevent unnecessary VideoPlayer re-renders
  const handleSourceChange = useCallback((index: number) => {
    setCurrentSourceIndex(index);
    setHasError(false);
  }, []);

  const handleError = useCallback(() => {
    setCurrentSourceIndex(prevIndex => {
      const nextIndex = prevIndex + 1;
      if (nextIndex < sources.length) {
        console.log(`StreamPlayer: Source ${prevIndex + 1}/${sources.length} failed, switching to ${nextIndex + 1}`);
        setHasError(false);
        return nextIndex;
      } else {
        console.error('StreamPlayer: All sources failed');
        setHasError(true);
        return prevIndex;
      }
    });
  }, [sources.length]);

  // Reset error state when source changes
  useEffect(() => {
    setHasError(false);
  }, [currentSourceIndex]);

  // Log current source info
  useEffect(() => {
    if (currentSource) {
      console.log('StreamPlayer: Current source:', {
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
          <p className="text-red-500 text-lg font-semibold mb-2">No Streaming Sources Available</p>
          <p className="text-netflix-gray text-sm">Unable to find any streaming sources at this time. Please try again later.</p>
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
          <p className="text-red-500 text-lg font-semibold mb-2">All Streaming Sources Failed</p>
          <p className="text-netflix-gray text-sm mb-4">We've tried all available sources, but none are working at the moment. Please try again later.</p>
          <button
            onClick={() => {
              setCurrentSourceIndex(0);
              setHasError(false);
            }}
            className="px-6 py-3 bg-netflix-red hover:bg-red-600 text-white rounded-lg font-semibold transition-colors"
          >
            Retry All Sources
          </button>
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
        mediaId={mediaId}
        season={season}
        episode={episode}
        sources={videoSources}
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

