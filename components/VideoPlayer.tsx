'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { watchProgress } from '@/lib/watchProgress';
import { logger } from '@/lib/logger';
import type { StreamCaption } from '@/lib/streaming';
import { detectHDRSupport, isHDRSupported, checkVideoHDRSupport } from '@/lib/hdr';
import { useLayout } from '@/components/LayoutProvider';

interface VideoPlayerProps {
  src: string;
  type?: 'movie' | 'tv';
  title?: string;
  discordTitle?: string;
  discordEpisodeName?: string;
  mediaId?: number;
  season?: number;
  episode?: number;
  onError?: () => void;
  sources?: Array<{ url: string; quality: string; provider?: string }>;
  providerHealth?: Record<string, 'checking' | 'ok' | 'failed'>;
  captions?: StreamCaption[];
  onSourceChange?: (index: number) => void;
  currentSourceIndex?: number;
  onNextEpisode?: () => void;
  hasNextEpisode?: boolean;
  onControlsVisibilityChange?: (visible: boolean) => void;
  pausedForStillWatching?: boolean;
  rating?: number;
  contentRating?: { label: string; reason: string } | null;
  onEnterNextEpisodeWindow?: () => void;
  mediaTitle?: string;
  episodeTitle?: string;
  /** Short description (movie overview or episode overview for TV). Shown when paused. */
  mediaOverview?: string;
  /** Release year (movie release_date or show first_air_date). Shown when paused. */
  releaseYear?: string | number;
  /** When set, controls visibility is controlled by parent (e.g. wrapper including back button). */
  showControlsOverride?: boolean;
  /** Notify parent when playback state changes (for keeping controls/back button visible when paused). */
  onPlaybackStateChange?: (isPlaying: boolean) => void;
}

// Subtitle preference key for localStorage
const SUBTITLE_PREFERENCE_KEY = 'cinestream_subtitle_language';
const AUDIO_BOOST_PREFERENCE_KEY = 'cinestream_audio_boost';

// Read autoplay settings from localStorage
const getAutoplaySettings = () => {
  if (typeof window === 'undefined') return { autoplay: true, autoNext: true };
  
  const autoplay = localStorage.getItem('cinestream_autoplay');
  const autoNext = localStorage.getItem('cinestream_auto_next');
  
  return {
    autoplay: autoplay !== 'false', // Default to true if not set
    autoNext: autoNext !== 'false', // Default to true if not set
  };
};

export default function VideoPlayer({ 
  src, 
  type = 'movie', 
  title,
  discordTitle,
  discordEpisodeName,
  mediaId,
  season,
  episode,
  onError,
  sources = [],
  providerHealth = {},
  captions = [],
  onSourceChange,
  currentSourceIndex = 0,
  onNextEpisode,
  hasNextEpisode = false,
  onControlsVisibilityChange,
  pausedForStillWatching = false,
  rating,
  contentRating,
  onEnterNextEpisodeWindow,
  mediaTitle,
  episodeTitle,
  mediaOverview,
  releaseYear,
  showControlsOverride,
  onPlaybackStateChange,
}: VideoPlayerProps) {
  const { layout } = useLayout();
  const isNoirFlix = layout === 'noirflix';
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioGainNodeRef = useRef<GainNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [audioBoost, setAudioBoost] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [isSourceStarting, setIsSourceStarting] = useState(true);
  const [startupElapsedSeconds, setStartupElapsedSeconds] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showQualitySubmenu, setShowQualitySubmenu] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showCaptionMenu, setShowCaptionMenu] = useState(false);
  const [selectedCaptionIndex, setSelectedCaptionIndex] = useState<number>(-1); // -1 = off
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
  const [subtitleCues, setSubtitleCues] = useState<Array<{ start: number; end: number; text: string }>>([]);
  const [hdrSupported, setHdrSupported] = useState(false);
  const [isPlayingHDR, setIsPlayingHDR] = useState(false);
  const [showRatingOverlay, setShowRatingOverlay] = useState(false);
  const [ratingOverlayFadeIn, setRatingOverlayFadeIn] = useState(false);
  const [ratingOverlayFadeOut, setRatingOverlayFadeOut] = useState(false);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);
  const ratingShownRef = useRef(false);
  const ratingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nextEpisodeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const enteredNextEpisodeWindowRef = useRef(false);
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const progressRestored = useRef(false);
  const lastSaveTime = useRef<number>(0);
  const onErrorRef = useRef(onError);
  const onNextEpisodeRef = useRef(onNextEpisode);
  const hdrCheckRef = useRef<boolean>(false);
  const startupIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Refs for values used in video event handlers (to avoid effect re-runs)
  const mediaInfoRef = useRef({ mediaId, type, season, episode, title });
  const pausedForStillWatchingRef = useRef(pausedForStillWatching);
  
  // Keep refs up to date
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onNextEpisodeRef.current = onNextEpisode;
  }, [onNextEpisode]);
  
  useEffect(() => {
    mediaInfoRef.current = { mediaId, type, season, episode, title };
  }, [mediaId, type, season, episode, title]);
  
  useEffect(() => {
    pausedForStillWatchingRef.current = pausedForStillWatching;
  }, [pausedForStillWatching]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = Number(localStorage.getItem(AUDIO_BOOST_PREFERENCE_KEY) || '1');
    if ([1, 2, 3, 4].includes(saved)) {
      setAudioBoost(saved);
    }
  }, []);

  const ensureAudioBoostGraph = async () => {
    const video = videoRef.current;
    if (!video || typeof window === 'undefined') return;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }

      const ctx = audioContextRef.current;
      if (!ctx) return;

      if (!audioSourceNodeRef.current) {
        audioSourceNodeRef.current = ctx.createMediaElementSource(video);
      }

      if (!audioGainNodeRef.current) {
        audioGainNodeRef.current = ctx.createGain();
        audioSourceNodeRef.current.connect(audioGainNodeRef.current);
        audioGainNodeRef.current.connect(ctx.destination);
      }

      audioGainNodeRef.current.gain.value = audioBoost;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
    } catch (error) {
      logger.debug('Audio boost unavailable:', error);
    }
  };

  useEffect(() => {
    if (audioGainNodeRef.current) {
      audioGainNodeRef.current.gain.value = audioBoost;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(AUDIO_BOOST_PREFERENCE_KEY, String(audioBoost));
    }
  }, [audioBoost]);
  
  // Parse VTT file content into cues
  const parseVTT = (vttText: string): Array<{ start: number; end: number; text: string }> => {
    const cues: Array<{ start: number; end: number; text: string }> = [];
    const lines = vttText.split('\n');
    let i = 0;
    
    // Skip WEBVTT header
    while (i < lines.length && !lines[i].includes('-->')) {
      i++;
    }
    
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Look for timestamp line (e.g., "00:00:01.000 --> 00:00:04.000")
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split('-->').map(s => s.trim().split(' ')[0]);
        
        // Parse timestamp to seconds
        const parseTime = (timeStr: string): number => {
          const parts = timeStr.split(':');
          if (parts.length === 3) {
            const [h, m, s] = parts;
            return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
          } else if (parts.length === 2) {
            const [m, s] = parts;
            return parseInt(m) * 60 + parseFloat(s.replace(',', '.'));
          }
          return 0;
        };
        
        const start = parseTime(startStr);
        const end = parseTime(endStr);
        
        // Collect text lines until empty line or next timestamp
        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
          // Skip numeric cue identifiers
          if (!/^\d+$/.test(lines[i].trim())) {
            textLines.push(lines[i].trim());
          }
          i++;
        }
        
        if (textLines.length > 0) {
          // Clean up HTML tags and join lines
          const text = textLines.join('\n')
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ');
          cues.push({ start, end, text });
        }
      } else {
        i++;
      }
    }
    
    return cues;
  };

  // Load saved subtitle preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLanguage = localStorage.getItem(SUBTITLE_PREFERENCE_KEY);
      if (savedLanguage && captions.length > 0) {
        // Find caption matching saved language
        const matchIndex = captions.findIndex(c => c.language.toLowerCase() === savedLanguage.toLowerCase());
        if (matchIndex !== -1) {
          setSelectedCaptionIndex(matchIndex);
        }
      }
    }
  }, [captions]);

  // Fetch and parse subtitle file when caption is selected
  useEffect(() => {
    if (selectedCaptionIndex < 0 || !captions[selectedCaptionIndex]) {
      setSubtitleCues([]);
      setCurrentSubtitle('');
      return;
    }
    
    const caption = captions[selectedCaptionIndex];
    logger.debug('Loading subtitle:', caption.language, caption.url);
    
    fetch(caption.url)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch subtitle: ${res.status}`);
        return res.text();
      })
      .then(vttText => {
        const cues = parseVTT(vttText);
        logger.debug(`Parsed ${cues.length} subtitle cues`);
        setSubtitleCues(cues);
      })
      .catch(err => {
        logger.error('Error loading subtitle:', err);
        setSubtitleCues([]);
      });
  }, [selectedCaptionIndex, captions]);

  // Update current subtitle based on video time
  useEffect(() => {
    if (subtitleCues.length === 0) {
      setCurrentSubtitle('');
      return;
    }
    
    // Find the cue that matches current time
    const activeCue = subtitleCues.find(cue => 
      currentTime >= cue.start && currentTime <= cue.end
    );
    
    setCurrentSubtitle(activeCue?.text || '');
  }, [currentTime, subtitleCues]);

  // Check HDR support on mount (only once)
  const hdrSupportedRef = useRef<boolean | null>(null);
  useEffect(() => {
    // Only detect once and cache the result
    // Use try-catch to prevent any errors from crashing the app
    if (hdrSupportedRef.current === null && typeof window !== 'undefined') {
      try {
        const hdrCapabilities = detectHDRSupport();
        hdrSupportedRef.current = hdrCapabilities.supported;
        setHdrSupported(hdrCapabilities.supported);
        if (hdrCapabilities.supported) {
          logger.debug('HDR support detected:', hdrCapabilities);
        }
      } catch (error) {
        // If HDR detection fails, just disable HDR support
        logger.debug('HDR detection failed, disabling HDR:', error);
        hdrSupportedRef.current = false;
        setHdrSupported(false);
      }
    }
  }, []);

  // HLS configuration helper
  const createHlsConfig = () => {
    const config = {
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
      fragLoadingTimeOut: 120000,
      manifestLoadingTimeOut: 120000,
      levelLoadingTimeOut: 120000,
      fragLoadingMaxRetry: 3, // Reduced from 6 to avoid rate limiting
      manifestLoadingMaxRetry: 3, // Reduced from 6
      levelLoadingMaxRetry: 3, // Reduced from 6
      fragLoadingRetryDelay: 2000, // Increased from 1000ms to reduce request rate
      levelLoadingRetryDelay: 2000,
      manifestLoadingRetryDelay: 2000,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      startLevel: -1,
      capLevelToPlayerSize: true,
      abrEwmaDefaultEstimate: 500000,
      abrBandWidthFactor: 0.95,
      abrBandWidthUpFactor: 0.7,
      debug: false, // Disable debug logs
    };

    // HLS.js will automatically prefer HDR variants if available in the manifest
    // The manifest parsing logic below will handle HDR level selection

    return config;
  };

  // Reset HDR state when src changes
  useEffect(() => {
    setIsPlayingHDR(false);
    hdrCheckRef.current = false;
    setIsSourceStarting(true);
    setStartupElapsedSeconds(0);
    setBuffering(true);
    ratingShownRef.current = false;
    setShowRatingOverlay(false);
    setRatingOverlayFadeIn(false);
    setRatingOverlayFadeOut(false);
    if (ratingTimeoutRef.current) {
      clearTimeout(ratingTimeoutRef.current);
      ratingTimeoutRef.current = null;
    }
  }, [src]);

  // Rating overlay: show when playback starts (content rating or score), visible 8s then fade out
  useEffect(() => {
    const hasContentRating = contentRating?.label?.trim();
    const hasScore = rating != null && rating > 0;
    if (!isPlaying || (!hasContentRating && !hasScore) || ratingShownRef.current) return;
    ratingShownRef.current = true;
    setRatingOverlayFadeOut(false);
    setRatingOverlayFadeIn(false);
    setShowRatingOverlay(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setRatingOverlayFadeIn(true));
    });
    ratingTimeoutRef.current = setTimeout(() => {
      setRatingOverlayFadeOut(true);
      ratingTimeoutRef.current = setTimeout(() => {
        setShowRatingOverlay(false);
        setRatingOverlayFadeOut(false);
        ratingTimeoutRef.current = null;
      }, 750);
    }, 8000);
    return () => {
      if (ratingTimeoutRef.current) {
        clearTimeout(ratingTimeoutRef.current);
        ratingTimeoutRef.current = null;
      }
    };
  }, [isPlaying, rating, contentRating]);

  useEffect(() => {
    if (!isSourceStarting) {
      if (startupIntervalRef.current) {
        clearInterval(startupIntervalRef.current);
        startupIntervalRef.current = null;
      }
      return;
    }

    startupIntervalRef.current = setInterval(() => {
      setStartupElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => {
      if (startupIntervalRef.current) {
        clearInterval(startupIntervalRef.current);
        startupIntervalRef.current = null;
      }
    };
  }, [isSourceStarting]);

  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    let isCleaningUp = false;

    // Use HLS.js for m3u8 streams
    if (src.includes('.m3u8') && Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls(createHlsConfig());

      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Check for HDR levels in the manifest (use ref to avoid stale closure)
        const isHdrSupported = hdrSupportedRef.current === true;
        if (hls.levels && hls.levels.length > 0 && isHdrSupported) {
          // Find HDR levels (check for HDR codecs)
          const hdrLevels: number[] = [];
          hls.levels.forEach((level, index) => {
            // Check if level has HDR indicators in codec
            const codec = (level as any).codecs || '';
            if (codec.includes('hev1') || codec.includes('dvh1') || codec.includes('av01')) {
              hdrLevels.push(index);
            }
          });
          
          if (hdrLevels.length > 0) {
            // Prefer highest quality HDR level (usually last in array)
            const preferredHdrLevel = hdrLevels[hdrLevels.length - 1];
            hls.currentLevel = preferredHdrLevel;
            logger.debug('HDR level selected:', preferredHdrLevel, 'out of', hdrLevels.length, 'HDR levels');
          }
        }

        // Don't auto-play here - let the pausedForStillWatching effect handle it
        // This prevents play() interruption when modal appears
        const { autoplay } = getAutoplaySettings();
        if (!pausedForStillWatchingRef.current && autoplay) {
          video.play().catch((error) => {
            // Ignore errors if video was removed or interrupted
            if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
              logger.error('Failed to play video:', error);
            }
          });
        }
      });

      // Monitor HDR playback (use ref to track state to prevent repeated updates)
      hls.on(Hls.Events.LEVEL_SWITCHED, () => {
        const isHdrSupported = hdrSupportedRef.current === true;
        if (hls.levels && hls.currentLevel !== undefined && isHdrSupported) {
          const currentLevel = hls.levels[hls.currentLevel];
          if (currentLevel) {
            const codec = (currentLevel as any).codecs || '';
            const isHDR = codec.includes('hev1') || codec.includes('dvh1') || codec.includes('av01');
            // Only update state if it changed to prevent unnecessary re-renders
            if (isHDR !== hdrCheckRef.current) {
              setIsPlayingHDR(isHDR);
              hdrCheckRef.current = isHDR;
              if (isHDR) {
                logger.debug('Playing HDR content:', codec);
              }
            }
          }
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (isCleaningUp) {
          return;
        }

        // Suppress 429 rate limit errors from being logged (they're handled by HLS.js retry logic)
        if (data.response?.code === 429) {
          return; // Let HLS.js handle retry automatically
        }
        
        if (data.fatal) {
          // Build error details; ensure we always have something to log (HLS.js payload shape can vary)
          const errorInfo: Record<string, unknown> = {
            fatal: true,
            src: src ?? '(no src)',
          };
          if (data.type !== undefined) errorInfo.type = data.type;
          if (data.details !== undefined) errorInfo.details = data.details;
          if (data.response) {
            errorInfo.response = {
              code: data.response.code,
              text: data.response.text?.substring(0, 500),
              url: data.response.url
            };
          }
          if (data.frag) {
            errorInfo.frag = { url: data.frag.url };
          }
          if (data.url) {
            errorInfo.url = data.url;
          }
          if (data.err) {
            errorInfo.err = data.err;
          }
          // Fallback: if we still have no useful fields, include safe keys from data (handles different HLS.js versions)
          const hasDetails = Object.keys(errorInfo).length > 2;
          if (!hasDetails && data && typeof data === 'object') {
            try {
              const safe: Record<string, unknown> = {};
              for (const key of ['type', 'details', 'reason', 'context'] as const) {
                if (key in data && (data as Record<string, unknown>)[key] !== undefined) {
                  safe[key] = (data as Record<string, unknown>)[key];
                }
              }
              if (Object.keys(safe).length > 0) {
                Object.assign(errorInfo, safe);
              }
            } catch (_) {
              // ignore
            }
          }
          logger.error('Fatal HLS error', errorInfo);
          
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              logger.debug('Network error, attempting to recover...');
              try {
                hls.startLoad();
              } catch (e) {
                logger.error('Failed to recover from network error:', e);
                if (onErrorRef.current) onErrorRef.current();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              logger.debug('Media error, attempting to recover...');
              try {
                hls.recoverMediaError();
              } catch (e) {
                logger.error('Failed to recover from media error:', e);
                // Try destroying and recreating HLS instance
                try {
                  hls.destroy();
                  const newHls = new Hls(createHlsConfig());
                  newHls.loadSource(src);
                  newHls.attachMedia(video);
                  hlsRef.current = newHls;
                } catch (recreateError) {
                  logger.error('Failed to recreate HLS instance:', recreateError);
                  if (onErrorRef.current) onErrorRef.current();
                }
              }
              break;
            case Hls.ErrorTypes.MUX_ERROR:
            case Hls.ErrorTypes.OTHER_ERROR:
              // For parsing/manifest errors, log details and try to recover
              logger.error('HLS parsing/manifest error:', {
                type: data.type,
                details: data.details,
                url: data.url || src,
                response: data.response
              });
              // Try recreating HLS instance
              try {
                hls.destroy();
                const newHls = new Hls(createHlsConfig());
                newHls.loadSource(src);
                newHls.attachMedia(video);
                hlsRef.current = newHls;
              } catch (recreateError) {
                logger.error('Failed to recreate HLS instance after parsing error:', recreateError);
                if (onErrorRef.current) onErrorRef.current();
              }
              break;
            default:
              // For other fatal errors, try to recover by recreating HLS
              logger.debug('Unknown fatal error, attempting to recover...');
              logger.error('Unknown fatal HLS error type:', data.type, 'Details:', data.details);
              try {
                hls.destroy();
                const newHls = new Hls(createHlsConfig());
                newHls.loadSource(src);
                newHls.attachMedia(video);
                hlsRef.current = newHls;
              } catch (recreateError) {
                logger.error('Failed to recover from fatal error:', recreateError);
                if (onErrorRef.current) onErrorRef.current();
              }
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        // Don't auto-play here - let the pausedForStillWatching effect handle it
        const { autoplay } = getAutoplaySettings();
        if (!pausedForStillWatchingRef.current && autoplay) {
          video.play().catch((error) => {
            // Ignore errors if video was removed or interrupted
            if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
              logger.error('Failed to play video:', error);
            }
          });
        }
      });
    } else {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        // Don't auto-play here - let the pausedForStillWatching effect handle it
        const { autoplay } = getAutoplaySettings();
        if (!pausedForStillWatchingRef.current && autoplay) {
          video.play().catch((error) => {
            // Ignore errors if video was removed or interrupted
            if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
              logger.error('Failed to play video:', error);
            }
          });
        }
      });
    }

    // Video event listeners
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const SAVE_INTERVAL = 10000; // Save every 10 seconds

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);
      
      // Show Skip Intro button between 5 and 75 seconds (typical intro length)
      if (time >= 5 && time <= 75 && duration > 120) {
        setShowSkipIntro(true);
      } else {
        setShowSkipIntro(false);
      }
      
      // Save progress periodically (every 10 seconds)
      const { mediaId: mid, type: t, title: tl, season: s, episode: ep } = mediaInfoRef.current;
      if (mid && video.duration > 0) {
        const now = Date.now();
        const timeSinceLastSave = now - lastSaveTime.current;
        
        // Save if it's been more than SAVE_INTERVAL since last save
        if (timeSinceLastSave >= SAVE_INTERVAL) {
          const currentTime = video.currentTime;
          const currentDuration = video.duration;
          const progressPercent = (currentTime / currentDuration) * 100;
          
          // Only save if there's meaningful progress (at least 1 second watched)
          if (currentTime >= 1 && progressPercent > 0 && progressPercent < 90) {
            try {
              watchProgress.saveProgress({
                id: mid,
                type: t,
                title: tl || 'Unknown',
                poster_path: null,
                backdrop_path: null,
                progress: progressPercent,
                currentTime: currentTime,
                duration: currentDuration,
                season: t === 'tv' ? s : undefined,
                episode: t === 'tv' ? ep : undefined,
                episodeTitle: undefined,
                lastWatched: Date.now(),
              });
              lastSaveTime.current = now;
              logger.debug('Progress saved:', { mediaId: mid, type: t, progress: progressPercent.toFixed(1) + '%' });
            } catch (error) {
              logger.error('Failed to save progress:', error);
            }
          }
        }
      }
    };
    const handleDurationChange = () => {
      const dur = video.duration;
      setDuration(dur);
    };
    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    const handleWaiting = () => setBuffering(true);
    const handleCanPlay = async () => {
      setBuffering(false);
      setIsSourceStarting(false);
      
      // Check if video is playing in HDR (only check once per video load)
      if (hdrSupported && !isPlayingHDR) {
        try {
          const isHDR = await checkVideoHDRSupport(video);
          setIsPlayingHDR(isHDR);
          if (isHDR) {
            logger.debug('Video is playing in HDR mode');
          }
        } catch (error) {
          // Ignore errors to prevent loops
          logger.debug('HDR check failed:', error);
        }
      }
      
      // Restore progress when video is ready (can seek) - only once
      const { mediaId: mid, type: t, season: s, episode: ep } = mediaInfoRef.current;
      if (!progressRestored.current && mid && video.duration > 0 && video.seekable.length > 0) {
        const saved = watchProgress.getProgress(mid, t, s, ep);
        if (saved && saved.currentTime > 0 && saved.currentTime < video.duration - 10) {
          // Restore if there's at least 10 seconds remaining
          // Use seekable range to ensure we're within bounds
          const seekableEnd = video.seekable.length > 0 ? video.seekable.end(0) : video.duration;
          const restoreTime = Math.min(saved.currentTime, seekableEnd - 1);
          if (restoreTime > 0) {
            try {
              video.currentTime = restoreTime;
              progressRestored.current = true;
            } catch (error) {
              logger.error('Failed to restore progress:', error);
            }
          }
        }
      }
      
      // Don't auto-play here - let the pausedForStillWatching effect handle it
      // This prevents play() interruption when modal appears
      const { autoplay } = getAutoplaySettings();
      if (!pausedForStillWatchingRef.current && !video.paused && autoplay) {
        video.play().catch((error) => {
          // Ignore errors if video was removed or interrupted
          if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
            console.error('Failed to play video:', error);
          }
        });
      }
    };
    const handleError = () => {
      if (isCleaningUp) return;
      setIsSourceStarting(false);
      if (onErrorRef.current) onErrorRef.current();
    };
    const handleLoadedData = () => {
      setIsSourceStarting(false);
    };
    const handlePlaying = () => {
      setIsSourceStarting(false);
      setBuffering(false);
    };
    const handleLoadStart = () => {
      setIsSourceStarting(true);
      setBuffering(true);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    return () => {
      isCleaningUp = true;

      // Remove listeners first so teardown doesn't trigger source fallback logic.
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      // Stop video playback and clear source to prevent background playback
      video.pause();
      video.removeAttribute('src');
      video.load(); // Reset the video element

      progressRestored.current = false;
      lastSaveTime.current = 0;
    };
    // Only re-run when src changes - all other dependencies are handled via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const currentSourceLabel = sources[currentSourceIndex];
  const currentProviderLabel = currentSourceLabel?.provider
    ? ({
        sanction: 'Sanction',
        flowcast: 'Flowcast',
        hindicast: 'HindiCast',
        vidlink: 'Vidlink',
      } as Record<string, string>)[currentSourceLabel.provider] || currentSourceLabel.provider
    : 'Source';
  const currentQualityLabel = currentSourceLabel?.quality || 'Auto';
  const showStartupOverlay = isSourceStarting || (buffering && currentTime < 2);

  const pushDiscordSelfPresence = (playbackStateOverride?: 'playing' | 'paused' | 'buffering') => {
    if (typeof window === 'undefined' || !(window as any).electron?.discordSelfPresenceUpdate) return;
    if (!mediaId || !title) return;

    const state = playbackStateOverride || (buffering ? 'buffering' : isPlaying ? 'playing' : 'paused');
    const hasTiming =
      state === 'playing' &&
      Number.isFinite(currentTime) &&
      Number.isFinite(duration) &&
      duration > 0;
    const now = Date.now();
    const safeCurrentTime = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
    const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    const startTimestampMs = hasTiming ? now - Math.floor(safeCurrentTime * 1000) : undefined;
    const endTimestampMs = hasTiming ? startTimestampMs! + Math.floor(safeDuration * 1000) : undefined;
    const sanctionUrl = 'https://sanction.tv';

    (window as any).electron.discordSelfPresenceUpdate({
      mediaType: type,
      tmdbId: mediaId,
      title,
      discordTitle,
      episodeName: discordEpisodeName,
      season: type === 'tv' ? season : undefined,
      episode: type === 'tv' ? episode : undefined,
      playbackState: state,
      currentTimeSec: Number.isFinite(currentTime) ? currentTime : undefined,
      durationSec: Number.isFinite(duration) ? duration : undefined,
      startTimestampMs,
      endTimestampMs,
      provider: currentSourceLabel?.provider,
      quality: currentQualityLabel,
      forceRawRich: true,
      rawActivityType: 'watching',
      buttons: [{ label: 'Open Sanction', url: sanctionUrl }],
      updatedAtMs: now,
    });
  };

  useEffect(() => {
    pushDiscordSelfPresence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, buffering, currentSourceIndex, title, discordTitle, discordEpisodeName, mediaId, type, season, episode]);

  useEffect(() => {
    if (!isPlaying || buffering) return;
    const interval = setInterval(() => {
      pushDiscordSelfPresence('playing');
    }, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, buffering, currentSourceIndex, title, discordTitle, discordEpisodeName, mediaId, type, season, episode]);

  // Handle pausedForStillWatching separately to avoid recreating video element
  useEffect(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    // Check if video is still in the document
    if (!video.isConnected) return;

    if (pausedForStillWatching) {
      // Pause video when modal appears
      try {
        video.pause();
      } catch (error) {
        // Ignore pause errors
      }
    } else {
      // Only try to play if video is ready and not already playing
      if (video.readyState >= 2 && video.paused && video.isConnected) {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            // Ignore errors if video was removed, interrupted, or user interaction required
            if (
              error.name !== 'AbortError' &&
              error.name !== 'NotAllowedError' &&
              !error.message.includes('removed from the document') &&
              !error.message.includes('interrupted')
            ) {
              console.error('Failed to resume playback:', error);
            }
          });
        }
      }
    }
  }, [pausedForStillWatching]);

  const effectiveShowControls = showControlsOverride !== undefined ? showControlsOverride : showControls;

  // Notify parent of playback state (so parent can keep controls/back button visible when paused)
  useEffect(() => {
    onPlaybackStateChange?.(isPlaying);
  }, [isPlaying, onPlaybackStateChange]);

  // Notify parent of controls visibility changes
  useEffect(() => {
    if (onControlsVisibilityChange) {
      onControlsVisibilityChange(effectiveShowControls);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveShowControls]);

  // When paused and uncontrolled, keep controls visible
  useEffect(() => {
    if (showControlsOverride === undefined && !isPlaying) {
      setShowControls(true);
    }
  }, [showControlsOverride, isPlaying]);

  // Auto-hide controls (only when not controlled by parent)
  useEffect(() => {
    if (showControlsOverride !== undefined) return;

    const handleMouseMove = () => {
      setShowControls(true);
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
      if (isPlaying) {
        hideControlsTimeout.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', () => {
        if (isPlaying) setShowControls(false);
      });
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, [isPlaying, showControlsOverride]);

  const togglePlay = () => {
    if (videoRef.current) {
      void ensureAudioBoostGraph();
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (videoRef.current) {
      videoRef.current.currentTime = parseFloat(e.target.value);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (videoRef.current) {
      videoRef.current.volume = parseFloat(e.target.value);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      void ensureAudioBoostGraph();
      videoRef.current.muted = !isMuted;
    }
  };

  const cycleAudioBoost = () => {
    void ensureAudioBoostGraph();
    setAudioBoost((prev) => (prev === 1 ? 2 : prev === 2 ? 3 : prev === 3 ? 4 : 1));
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const skipTime = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
    }
  };

  const handleSkipIntro = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 90; // Skip to 1.5 min (typical intro end)
      setShowSkipIntro(false);
    }
  };

  // Next episode: show card in last 30s, 10s countdown then auto-next when autoNext is on
  const { autoNext } = getAutoplaySettings();
  const NEXT_EPISODE_WINDOW = 30; // seconds before end to show next episode card
  const isInNextEpisodeWindow = duration > 0 && (duration <= NEXT_EPISODE_WINDOW || currentTime >= duration - NEXT_EPISODE_WINDOW);
  const showNextEpisode = hasNextEpisode && type === 'tv' && duration > 0 && isInNextEpisodeWindow;

  // Start/clear next episode countdown when entering/leaving the window; notify parent for "Still Watching"
  useEffect(() => {
    if (!showNextEpisode || !onNextEpisodeRef.current) {
      if (nextEpisodeIntervalRef.current) {
        clearInterval(nextEpisodeIntervalRef.current);
        nextEpisodeIntervalRef.current = null;
      }
      setNextEpisodeCountdown(null);
      enteredNextEpisodeWindowRef.current = false;
      return;
    }
    if (!enteredNextEpisodeWindowRef.current) {
      enteredNextEpisodeWindowRef.current = true;
      onEnterNextEpisodeWindow?.();
    }
    if (autoNext) {
      setNextEpisodeCountdown(10);
      nextEpisodeIntervalRef.current = setInterval(() => {
        setNextEpisodeCountdown((prev) => {
          if (prev === null || prev <= 1) {
            if (nextEpisodeIntervalRef.current) {
              clearInterval(nextEpisodeIntervalRef.current);
              nextEpisodeIntervalRef.current = null;
            }
            if (prev === 1) {
              try {
                onNextEpisodeRef.current?.();
              } catch (e) {
                logger.error('Auto next episode failed:', e);
              }
            }
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setNextEpisodeCountdown(null);
    }
    return () => {
      if (nextEpisodeIntervalRef.current) {
        clearInterval(nextEpisodeIntervalRef.current);
        nextEpisodeIntervalRef.current = null;
      }
    };
  }, [showNextEpisode, autoNext]);

  // Handle caption selection changes
  const handleCaptionChange = (index: number) => {
    setSelectedCaptionIndex(index);
    setShowCaptionMenu(false);
    
    // Save preference
    if (typeof window !== 'undefined') {
      if (index === -1) {
        localStorage.removeItem(SUBTITLE_PREFERENCE_KEY);
      } else if (captions[index]) {
        localStorage.setItem(SUBTITLE_PREFERENCE_KEY, captions[index].language);
      }
    }
    
    // Update track visibility
    const video = videoRef.current;
    if (video && video.textTracks) {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = i === index ? 'showing' : 'hidden';
      }
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-black group"
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        playsInline
        preload="auto"
        onClick={togglePlay}
        aria-label={title || 'Video player'}
      />

      {/* Startup Loading Overlay */}
      {showStartupOverlay && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className={`absolute inset-0 ${
            isNoirFlix ? 'bg-[#050505]/78' : 'bg-black/70'
          }`} />
          <div className="relative flex flex-col items-center text-center px-6 max-w-md">
            <div className={`w-14 h-14 border-4 rounded-full animate-spin mb-4 ${
              isNoirFlix ? 'border-white/40 border-t-white' : 'border-white/35 border-t-netflix-red'
            }`} />
            <div className="text-white font-semibold text-lg">
              Loading stream...
            </div>
            <div className="text-white/80 text-sm mt-1">
              {currentProviderLabel} • {currentQualityLabel}
            </div>
            {startupElapsedSeconds >= 4 && (
              <div className="text-white/70 text-xs mt-3">
                Some sources take a bit longer to initialize.
              </div>
            )}
            {startupElapsedSeconds >= 10 && (
              <div className="text-white/60 text-xs mt-1">
                Still loading ({startupElapsedSeconds}s)... Flowcast can take 10-30s on some episodes.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content rating overlay - left side, red bar + RATED label + reason; fades in then out after 8s */}
      {showRatingOverlay && contentRating?.label?.trim() && (
        <div
          className={`absolute left-6 top-1/2 -translate-y-1/2 z-40 pointer-events-none transition-all duration-700 ease-out ${
            !ratingOverlayFadeIn || ratingOverlayFadeOut
              ? 'opacity-0 -translate-x-4'
              : 'opacity-100 translate-x-0'
          }`}
          style={{ transitionProperty: 'opacity, transform' }}
          aria-hidden
        >
          <div
            className={`flex items-stretch rounded-lg overflow-hidden shadow-2xl ${
              isNoirFlix
                ? 'bg-[#0a0a0a]/95 border border-white/10 backdrop-blur-sm'
                : 'bg-black/90 backdrop-blur-md ring-1 ring-white/10'
            }`}
          >
            <div className="w-1.5 rounded-l-full bg-netflix-red shrink-0 min-h-[3rem]" aria-hidden />
            <div className="pl-4 pr-5 py-2.5">
              <div className="text-white font-bold text-xl uppercase tracking-wider drop-shadow-sm">
                RATED {contentRating.label}
              </div>
              {contentRating.reason && (
                <div className={`text-sm mt-1 font-medium ${isNoirFlix ? 'text-white/80' : 'text-white/90'}`}>
                  {contentRating.reason.toLowerCase()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Subtitle Overlay */}
      {currentSubtitle && (
        <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none z-20">
          <div 
            className={`px-4 py-2 rounded text-white text-lg md:text-xl font-medium max-w-[80%] text-center ${
              isNoirFlix ? 'bg-[#050505]/90 border border-[#1a1a1a]' : 'bg-black/80'
            }`}
            style={{ 
              textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
              whiteSpace: 'pre-line'
            }}
          >
            {currentSubtitle}
          </div>
        </div>
      )}

      {/* Skip Intro Button - Higher z-index to be above controls overlay */}
      {showSkipIntro && (
        <div className="absolute bottom-24 right-4 z-[60] animate-fade-in pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSkipIntro();
            }}
            className={`bg-white/95 hover:bg-white text-black px-6 py-3 rounded-md flex items-center gap-2 transition-all duration-200 hover:scale-105 shadow-xl pointer-events-auto ${
              isNoirFlix ? 'font-mono text-xs uppercase tracking-[2px]' : 'font-semibold text-lg'
            }`}
            aria-label="Skip intro"
          >
            <span>Skip Intro</span>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>
        </div>
      )}

      {/* Next Episode Button - Higher z-index to be above controls overlay */}
      {showNextEpisode && onNextEpisode && (
        <div className="absolute bottom-24 right-4 z-[60] animate-fade-in pointer-events-auto">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              logger.debug('Next episode button clicked');
              if (nextEpisodeIntervalRef.current) {
                clearInterval(nextEpisodeIntervalRef.current);
                nextEpisodeIntervalRef.current = null;
              }
              setNextEpisodeCountdown(null);
              if (onNextEpisode) {
                try {
                  onNextEpisode();
                } catch (error) {
                  logger.error('Error in onNextEpisode handler:', error);
                }
              }
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            className={`bg-white/95 hover:bg-white text-black px-6 py-3 rounded-md flex items-center gap-2 transition-all duration-200 hover:scale-105 shadow-xl pointer-events-auto cursor-pointer ${
              isNoirFlix ? 'font-mono text-xs uppercase tracking-[2px]' : 'font-semibold text-lg'
            }`}
            aria-label={nextEpisodeCountdown != null && nextEpisodeCountdown > 0 ? `Next episode in ${nextEpisodeCountdown} seconds` : 'Play next episode'}
            type="button"
          >
            {nextEpisodeCountdown != null && nextEpisodeCountdown > 0 ? (
              <span className="tabular-nums">Next episode in {nextEpisodeCountdown}</span>
            ) : (
              <>
                <span>Next Episode</span>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </>
            )}
          </button>
        </div>
      )}

      {/* Buffering Spinner */}
      {buffering && !showStartupOverlay && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
          <div className={`w-16 h-16 border-4 rounded-full animate-spin ${
            isNoirFlix 
              ? 'border-white/40 border-t-transparent' 
              : 'border-netflix-red border-t-transparent'
          }`} />
        </div>
      )}

      {/* Paused overlay: title, episode/description, release year — left-aligned with faded background */}
      {!isPlaying && !buffering && !showStartupOverlay && (mediaTitle || mediaOverview || releaseYear != null) && (
        <div
          className="absolute inset-0 z-20 flex items-center pointer-events-none pt-[12%]"
          aria-hidden
        >
          <div
            className={`max-w-xl ml-8 md:ml-12 lg:ml-16 pr-8 py-6 pl-6 rounded-lg text-left ${
              isNoirFlix ? 'text-white' : 'text-white'
            }`}
            style={{
              background: 'linear-gradient(105deg, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.08) 70%, transparent 100%)',
            }}
          >
            {mediaTitle && (
              <h2 className={`text-2xl md:text-3xl font-bold mb-1.5 leading-tight ${
                isNoirFlix ? 'font-mono uppercase tracking-wide' : 'drop-shadow-sm'
              }`}>
                {mediaTitle}
              </h2>
            )}
            {(type === 'tv' && episodeTitle) || releaseYear != null ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mb-2">
                {type === 'tv' && episodeTitle && (
                  <span className={`text-base md:text-lg font-semibold ${
                    isNoirFlix ? 'font-mono text-sm uppercase tracking-wider text-white/95' : 'text-white/95'
                  }`}>
                    {episodeTitle}
                  </span>
                )}
                {releaseYear != null && releaseYear !== '' && (
                  <span className={`text-sm ${isNoirFlix ? 'font-mono text-white/75' : 'text-white/80'}`}>
                    {type === 'tv' && episodeTitle ? ' · ' : ''}{String(releaseYear)}
                  </span>
                )}
              </div>
            ) : null}
            {mediaOverview && (
              <p className={`text-sm md:text-base leading-relaxed line-clamp-3 ${
                isNoirFlix ? 'text-white/85' : 'text-white/90'
              }`}>
                {mediaOverview}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div 
        className={`absolute inset-0 transition-opacity duration-300 pointer-events-none z-30 ${
          effectiveShowControls ? 'opacity-100' : 'opacity-0'
        } ${
          isNoirFlix
            ? 'bg-gradient-to-t from-[#050505]/95 via-transparent to-[#050505]/50'
            : 'bg-gradient-to-t from-black/90 via-transparent to-black/50'
        }`}
      >
        {/* Bottom Controls - 25% larger */}
        <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2.5 pointer-events-auto">
          {/* Progress Bar */}
          <div className="relative group/progress cursor-pointer">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              onClick={(e) => e.stopPropagation()}
              aria-label="Seek video"
              className={`w-full h-1.5 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:opacity-0 
                group-hover/progress:[&::-webkit-slider-thumb]:opacity-100
                [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full ${
                  isNoirFlix
                    ? '[&::-webkit-slider-thumb]:bg-white'
                    : '[&::-webkit-slider-thumb]:bg-netflix-red'
                }`}
              style={{
                background: isNoirFlix
                  ? `linear-gradient(to right, #ffffff ${(currentTime / duration) * 100}%, #1a1a1a ${(currentTime / duration) * 100}%)`
                  : `linear-gradient(to right, #e50914 ${(currentTime / duration) * 100}%, #4b5563 ${(currentTime / duration) * 100}%)`
              }}
            />
          </div>

          {/* Control Buttons + media info inline */}
          <div className={`flex items-center justify-between gap-4 ${
            isNoirFlix ? 'text-white' : 'text-white'
          }`}>
            <div className="flex items-center space-x-5 shrink-0">
              {/* Play/Pause */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className={`transition-all duration-200 hover:scale-110 hover:shadow-lg ${
                  isNoirFlix ? 'hover:text-white' : 'hover:text-netflix-red'
                }`}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Skip Backward */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  skipTime(-10);
                }}
                className="hover:text-netflix-red transition-all duration-200 hover:scale-110 hover:shadow-lg"
                title="Rewind 10s"
                aria-label="Rewind 10 seconds"
              >
                <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                  <text x="12" y="16" fontSize="8" fill="currentColor" textAnchor="middle" fontWeight="bold">10</text>
                </svg>
              </button>

              {/* Skip Forward */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  skipTime(10);
                }}
                className="hover:text-netflix-red transition-all duration-200 hover:scale-110 hover:shadow-lg"
                title="Forward 10s"
                aria-label="Forward 10 seconds"
              >
                <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
                  <text x="12" y="16" fontSize="8" fill="currentColor" textAnchor="middle" fontWeight="bold">10</text>
                </svg>
              </button>

              {/* Volume */}
              <div className="flex items-center space-x-2 group/volume">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute();
                  }} 
                  className="hover:text-netflix-red transition-all duration-200 hover:scale-110 hover:shadow-lg"
                  aria-label={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? (
                    <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : volume < 0.5 ? (
                    <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 9v6h4l5 5V4l-5 5H7z"/>
                    </svg>
                  ) : (
                    <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                    </svg>
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Volume control"
                  className={`w-0 group-hover/volume:w-24 transition-all h-1.5 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white 
                    [&::-webkit-slider-thumb]:cursor-pointer ${
                      isNoirFlix ? 'bg-[#1a1a1a]' : 'bg-gray-600'
                    }`}
                />
              </div>

              {/* Time */}
              <div className={`text-base font-medium ${
                isNoirFlix ? 'font-mono text-sm' : ''
              }`}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              {/* HDR Indicator */}
              {isPlayingHDR && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm font-semibold border ${
                  isNoirFlix
                    ? 'bg-white/10 text-white border-white/30'
                    : 'bg-netflix-red/20 text-netflix-red border-netflix-red/30'
                }`}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l8 4v8.64l-8 4-8-4V8.18l8-4z"/>
                    <path d="M12 8l-4 2v4l4 2 4-2v-4l-4-2zm0 2.18l2 1v1.64l-2 1-2-1v-1.64l2-1z"/>
                  </svg>
                  <span>HDR</span>
                </div>
              )}
            </div>

            {/* Media info - center of bar, single line */}
            {(mediaTitle || episodeTitle || (type === 'tv' && season != null && episode != null)) && (
              <div className={`flex items-center justify-center gap-2 text-center pointer-events-none text-base truncate min-w-0 flex-1 px-2 ${
                isNoirFlix ? 'text-white font-medium' : 'text-white/95'
              }`}>
                {mediaTitle && <span>{mediaTitle}</span>}
                {type === 'tv' && (season != null && episode != null) && (
                  <>
                    {mediaTitle && <span aria-hidden> · </span>}
                    <span className="tabular-nums shrink-0">S{season} E{episode}</span>
                  </>
                )}
                {type === 'tv' && episodeTitle && (
                  <>
                    {(mediaTitle || (season != null && episode != null)) && <span aria-hidden> · </span>}
                    <span className="truncate">{episodeTitle}</span>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center space-x-5 shrink-0">
              {/* Subtitles/CC Button */}
              {captions.length > 0 && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCaptionMenu(!showCaptionMenu);
                      setShowSettings(false);
                    }}
                    className={`transition-all duration-200 hover:scale-110 hover:shadow-lg ${
                      isNoirFlix
                        ? `hover:text-white ${selectedCaptionIndex >= 0 ? 'text-white' : ''}`
                        : `hover:text-netflix-red ${selectedCaptionIndex >= 0 ? 'text-netflix-red' : ''}`
                    }`}
                    title="Subtitles"
                    aria-label="Toggle subtitles menu"
                    aria-expanded={showCaptionMenu}
                    aria-haspopup="true"
                  >
                    <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm-6-4h8v2h-8z"/>
                    </svg>
                  </button>

                  {/* Caption Menu Dropdown */}
                  {showCaptionMenu && (
                    <div className={`absolute bottom-full right-0 mb-2 backdrop-blur-sm rounded-lg overflow-hidden min-w-[200px] shadow-2xl ${
                      isNoirFlix
                        ? 'bg-[#0a0a0a] border border-[#1a1a1a]'
                        : 'bg-black/95 ring-1 ring-white/10'
                    }`}>
                      <div className={`px-4 py-2 border-b ${
                        isNoirFlix ? 'border-[#1a1a1a]' : 'border-gray-700'
                      }`}>
                        <div className={`text-sm font-semibold ${
                          isNoirFlix ? 'text-white font-mono uppercase text-xs tracking-[1px]' : 'text-white'
                        }`}>Subtitles</div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {/* Off option */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCaptionChange(-1);
                          }}
                          className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                            selectedCaptionIndex === -1
                              ? isNoirFlix
                                ? 'bg-white text-[#050505]'
                                : 'bg-netflix-red text-white'
                              : isNoirFlix
                                ? 'text-[#888] hover:bg-[rgba(255,255,255,0.03)]'
                                : 'text-gray-300 hover:bg-gray-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>Off</span>
                            {selectedCaptionIndex === -1 && (
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                              </svg>
                            )}
                          </div>
                        </button>
                        
                        {/* Caption options */}
                        {captions.map((caption, index) => (
                          <button
                            key={`caption-${index}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCaptionChange(index);
                            }}
                            className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                              selectedCaptionIndex === index
                                ? isNoirFlix
                                  ? 'bg-white text-[#050505]'
                                  : 'bg-netflix-red text-white'
                                : isNoirFlix
                                  ? 'text-[#888] hover:bg-[rgba(255,255,255,0.03)]'
                                  : 'text-gray-300 hover:bg-gray-800'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{caption.language}</span>
                              {selectedCaptionIndex === index && (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                </svg>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Settings (cog) */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSettings(!showSettings);
                    setShowCaptionMenu(false);
                    if (!showSettings) setShowQualitySubmenu(false);
                  }}
                  className="hover:text-netflix-red transition-all duration-200 hover:scale-110 hover:shadow-lg"
                  title="Settings"
                  aria-label="Settings"
                  aria-expanded={showSettings}
                >
                  <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.04.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                  </svg>
                </button>

                {showSettings && (
                  <div
                    className={`absolute bottom-full right-0 mb-2 flex flex-row-reverse shadow-2xl z-50 overflow-visible ${
                      isNoirFlix ? 'bg-[#0a0a0a] border border-[#1a1a1a]' : 'bg-black/95 ring-1 ring-white/10'
                    } rounded-lg min-w-[200px]`}
                    onMouseLeave={() => {
                      setShowQualitySubmenu(false);
                    }}
                  >
                    {/* Quality submenu - opens to the left (first in flex due to flex-row-reverse) */}
                    {showQualitySubmenu && sources.length > 0 && (
                      <div
                        className={`min-w-[200px] max-h-[70vh] overflow-y-auto py-1 rounded-l-lg border-r ${
                          isNoirFlix ? 'bg-[#0a0a0a] border-[#1a1a1a]' : 'bg-black/95 ring-1 ring-white/10 border-gray-700'
                        }`}
                        onMouseEnter={() => setShowQualitySubmenu(true)}
                        onMouseLeave={() => setShowQualitySubmenu(false)}
                      >
                        <SettingsQualitySubmenu
                          sources={sources}
                          providerHealth={providerHealth}
                          currentSourceIndex={currentSourceIndex}
                          onSourceChange={onSourceChange}
                          isNoirFlix={isNoirFlix}
                          onSelect={() => setShowQualitySubmenu(false)}
                        />
                      </div>
                    )}
                    {/* Main settings list */}
                    <div className={`py-1 min-w-[200px] rounded-lg overflow-hidden ${isNoirFlix ? '' : 'border-l border-gray-700'}`}>
                      <div className={`px-4 py-2 border-b ${isNoirFlix ? 'border-[#1a1a1a]' : 'border-gray-700'}`}>
                        <div className={`text-sm font-semibold ${isNoirFlix ? 'text-white font-mono uppercase text-xs tracking-[1px]' : 'text-white'}`}>Settings</div>
                      </div>
                      {/* Quality - row with arrow to open submenu (show even with one source so user sees current quality) */}
                      {sources.length > 0 && (
                        <div
                          onMouseEnter={() => setShowQualitySubmenu(true)}
                          onMouseLeave={() => setShowQualitySubmenu(false)}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowQualitySubmenu((v) => !v);
                            }}
                            className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors ${
                              isNoirFlix ? 'text-[#ccc] hover:bg-[rgba(255,255,255,0.06)]' : 'text-gray-300 hover:bg-gray-800'
                            }`}
                          >
                            <span>Quality</span>
                            <svg className={`w-4 h-4 transition-transform ${showQualitySubmenu ? '-rotate-90' : ''}`} viewBox="0 0 24 24" fill="currentColor">
                              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                            </svg>
                          </button>
                        </div>
                      )}
                      {/* Audio boost - click to cycle 1x -> 2x -> 3x -> 4x */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          cycleAudioBoost();
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors ${
                          isNoirFlix ? 'text-[#ccc] hover:bg-[rgba(255,255,255,0.06)]' : 'text-gray-300 hover:bg-gray-800'
                        }`}
                        title="Click to cycle: 1x → 2x → 3x → 4x"
                      >
                        <span>Audio boost</span>
                        <span className={`tabular-nums font-medium ${isNoirFlix ? 'text-white' : 'text-white'}`}>{audioBoost}x</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Fullscreen */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="hover:text-netflix-red transition-all duration-200 hover:scale-110 hover:shadow-lg"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? (
                  <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                  </svg>
                ) : (
                  <svg className="w-9 h-9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Settings quality submenu (used inside Settings cog menu)
function SettingsQualitySubmenu({
  sources,
  providerHealth,
  currentSourceIndex,
  onSourceChange,
  isNoirFlix,
  onSelect,
}: {
  sources: Array<{ url: string; quality: string; provider?: string }>;
  providerHealth: Record<string, 'checking' | 'ok' | 'failed'>;
  currentSourceIndex: number;
  onSourceChange?: (index: number) => void;
  isNoirFlix: boolean;
  onSelect: () => void;
}) {
  const parseQualityRank = (quality?: string | number): number => {
    if (!quality) return -1;
    const q = String(quality).toLowerCase();
    if (q === 'auto') return 0;
    if (q === '4k') return 2160;
    const match = q.match(/(\d{3,4})p/);
    if (match) return parseInt(match[1], 10);
    const num = q.match(/(\d{3,4})/);
    return num ? parseInt(num[1], 10) : -1;
  };
  const hasSpecificQuality = (quality?: string | number): boolean => {
    if (!quality) return false;
    const q = String(quality).trim().toLowerCase();
    return q !== '' && q !== 'unknown' && q !== 'auto';
  };
  const getProviderLabel = (provider?: string) => {
    const p = provider || 'unknown';
    if (p === 'sanction') return 'Sanction';
    if (p === 'flowcast' || p === 'rivestream') return 'Flowcast';
    if (p === 'hindicast') return 'HindiCast';
    if (p === 'vidlink') return 'VidLink';
    return p.charAt(0).toUpperCase() + p.slice(1);
  };

  const sortedSources = sources
    .map((s, index) => ({ ...s, originalIndex: index }))
    .sort((a, b) => {
      const providerA = (a.provider || 'unknown') === 'rivestream' ? 'flowcast' : (a.provider || 'unknown');
      const providerB = (b.provider || 'unknown') === 'rivestream' ? 'flowcast' : (b.provider || 'unknown');
      if (providerA !== providerB) return providerA.localeCompare(providerB);
      return parseQualityRank(b.quality) - parseQualityRank(a.quality);
    });

  return (
    <div className="py-1">
      <div className={`px-3 py-2 border-b ${isNoirFlix ? 'border-[#1a1a1a]' : 'border-gray-700'}`}>
        <div className={`text-xs font-semibold ${isNoirFlix ? 'text-white font-mono uppercase tracking-[1px]' : 'text-white'}`}>Quality</div>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {sortedSources.map((source) => {
          const provider = (source.provider || 'unknown') === 'rivestream' ? 'flowcast' : (source.provider || 'unknown');
          const health = providerHealth[provider] || 'checking';
          const isCurrent = source.originalIndex === currentSourceIndex;
          const isFailed = health === 'failed' && !isCurrent;
          const label = hasSpecificQuality(source.quality) ? source.quality : 'Auto';
          const providerLabel = getProviderLabel(source.provider);
          return (
            <button
              key={source.originalIndex}
              onClick={(e) => {
                e.stopPropagation();
                if (isFailed) return;
                onSourceChange?.(source.originalIndex);
                onSelect();
              }}
              disabled={isFailed}
              className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between ${
                isFailed
                  ? isNoirFlix ? 'text-white/35 cursor-not-allowed' : 'text-gray-500 cursor-not-allowed'
                  : isCurrent
                    ? isNoirFlix ? 'bg-white text-[#050505]' : 'bg-netflix-red text-white'
                    : isNoirFlix ? 'text-[#888] hover:bg-[rgba(255,255,255,0.06)]' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>{providerLabel} · {label}</span>
              {isCurrent && (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Source Provider Menu Component
function SourceProviderMenu({ 
  providers, 
  sources, 
  providerHealth,
  currentSourceIndex, 
  onSourceChange,
  isNoirFlix 
}: { 
  providers: string[]; 
  sources: Array<{ url: string; quality: string; provider?: string }>; 
  providerHealth: Record<string, 'checking' | 'ok' | 'failed'>;
  currentSourceIndex: number; 
  onSourceChange?: (index: number) => void;
  isNoirFlix: boolean;
}) {
  const [hoveredProvider, setHoveredProvider] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const parseQualityRank = (quality?: string | number): number => {
    if (!quality) return -1;
    const q = String(quality).toLowerCase();
    if (q === 'auto') return 0;
    if (q === '4k') return 2160;
    const match = q.match(/(\d{3,4})p/);
    if (match) return parseInt(match[1], 10);
    const num = q.match(/(\d{3,4})/);
    return num ? parseInt(num[1], 10) : -1;
  };

  const hasSpecificQuality = (quality?: string | number): boolean => {
    if (!quality) return false;
    const q = String(quality).trim().toLowerCase();
    return q !== '' && q !== 'unknown' && q !== 'auto';
  };
  
  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  
  const handleMouseEnter = (provider: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredProvider(provider);
  };
  
  const handleMouseLeave = () => {
    // Add a small delay before hiding to allow moving to dropdown
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredProvider(null);
    }, 200);
  };
  
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {providers.map(provider => {
          const providerSources = sources
            .map((source, index) => ({ ...source, originalIndex: index }))
            .filter(s => {
              const sourceProvider = s.provider || 'unknown';
              // Normalize provider names - handle both 'flowcast' and 'rivestream'
              const normalizedSourceProvider = sourceProvider === 'rivestream' ? 'flowcast' : sourceProvider;
              return normalizedSourceProvider === provider;
            })
            .sort((a, b) => parseQualityRank(b.quality) - parseQualityRank(a.quality));
          
          // Skip if no sources found after filtering
          if (providerSources.length === 0) return null;
          
          const currentProviderSource = providerSources.find(s => s.originalIndex === currentSourceIndex);
          const health = providerHealth[provider] || 'checking';
          const providerDisabled = health === 'failed' && !currentProviderSource;
          const providerLabel = provider === 'sanction' ? 'Sanction' 
            : provider === 'flowcast' ? 'Flowcast'
            : provider === 'hindicast' ? 'HindiCast'
            : provider === 'vidlink' ? 'VidLink'
            : provider.charAt(0).toUpperCase() + provider.slice(1);
          
          return (
            <div
              key={provider}
              className="relative"
              onMouseEnter={() => handleMouseEnter(provider)}
              onMouseLeave={handleMouseLeave}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (providerDisabled) return;
                  // If clicking provider with multiple qualities, toggle menu
                  if (providerSources.length > 1) {
                    setHoveredProvider(hoveredProvider === provider ? null : provider);
                  } else if (providerSources.length === 1 && onSourceChange) {
                    // If only one quality, switch directly
                    onSourceChange(providerSources[0].originalIndex);
                  }
                }}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  providerDisabled
                    ? isNoirFlix
                      ? 'bg-[rgba(255,255,255,0.05)] text-white/35 cursor-not-allowed'
                      : 'bg-gray-900 text-gray-500 cursor-not-allowed'
                    :
                  currentProviderSource
                    ? isNoirFlix
                      ? 'bg-white text-[#050505]'
                      : 'bg-netflix-red text-white'
                    : isNoirFlix
                      ? 'bg-[rgba(255,255,255,0.1)] text-white hover:bg-[rgba(255,255,255,0.2)]'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                title={providerSources.length > 1 ? `${providerLabel} - ${providerSources.length} qualities` : providerLabel}
              >
                {providerLabel}
                {health === 'checking' && (
                  <span className="ml-1 text-xs opacity-70">...</span>
                )}
                {health === 'failed' && (
                  <span className="ml-1 text-xs opacity-70">x</span>
                )}
                {currentProviderSource && hasSpecificQuality(currentProviderSource.quality) && (
                  <span className="ml-1 text-xs opacity-75">({currentProviderSource.quality})</span>
                )}
              </button>

              {/* Quality Dropdown on Hover */}
              {hoveredProvider === provider && providerSources.length > 1 && !providerDisabled && (
                <div 
                  className={`absolute bottom-full right-0 mb-2 backdrop-blur-sm rounded-lg overflow-hidden min-w-[180px] shadow-2xl z-50 ${
                    isNoirFlix
                      ? 'bg-[#0a0a0a] border border-[#1a1a1a]'
                      : 'bg-black/95 ring-1 ring-white/10'
                  }`}
                  onMouseEnter={() => handleMouseEnter(provider)}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className={`px-3 py-2 border-b ${
                    isNoirFlix ? 'border-[#1a1a1a]' : 'border-gray-700'
                  }`}>
                    <div className={`text-xs font-semibold ${
                      isNoirFlix ? 'text-white font-mono uppercase tracking-[1px]' : 'text-white'
                    }`}>{providerLabel} Quality</div>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {providerSources.map((source) => (
                      <button
                        key={source.originalIndex}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (providerDisabled) return;
                          if (onSourceChange) {
                            onSourceChange(source.originalIndex);
                          }
                          setHoveredProvider(null);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                          source.originalIndex === currentSourceIndex
                            ? isNoirFlix
                              ? 'bg-white text-[#050505]'
                              : 'bg-netflix-red text-white'
                            : isNoirFlix
                              ? 'text-[#888] hover:bg-[rgba(255,255,255,0.03)]'
                              : 'text-gray-300 hover:bg-gray-800'
                        }`}
                        >
                          <div className="flex items-center justify-between">
                          <span>{hasSpecificQuality(source.quality) ? source.quality : 'Auto'}</span>
                          {source.originalIndex === currentSourceIndex && (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                            </svg>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
