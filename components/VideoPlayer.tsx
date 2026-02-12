'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { watchProgress } from '@/lib/watchProgress';
import { logger } from '@/lib/logger';
import type { StreamCaption } from '@/lib/streaming';
import { detectHDRSupport, isHDRSupported, checkVideoHDRSupport } from '@/lib/hdr';

interface VideoPlayerProps {
  src: string;
  type?: 'movie' | 'tv';
  title?: string;
  mediaId?: number;
  season?: number;
  episode?: number;
  onError?: () => void;
  sources?: Array<{ url: string; quality: string; provider?: string }>;
  captions?: StreamCaption[];
  onSourceChange?: (index: number) => void;
  currentSourceIndex?: number;
  onNextEpisode?: () => void;
  hasNextEpisode?: boolean;
  onControlsVisibilityChange?: (visible: boolean) => void;
  pausedForStillWatching?: boolean;
}

// Subtitle preference key for localStorage
const SUBTITLE_PREFERENCE_KEY = 'cinestream_subtitle_language';

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
  mediaId,
  season,
  episode,
  onError,
  sources = [],
  captions = [],
  onSourceChange,
  currentSourceIndex = 0,
  onNextEpisode,
  hasNextEpisode = false,
  onControlsVisibilityChange,
  pausedForStillWatching = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showCaptionMenu, setShowCaptionMenu] = useState(false);
  const [selectedCaptionIndex, setSelectedCaptionIndex] = useState<number>(-1); // -1 = off
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
  const [subtitleCues, setSubtitleCues] = useState<Array<{ start: number; end: number; text: string }>>([]);
  const [hdrSupported, setHdrSupported] = useState(false);
  const [isPlayingHDR, setIsPlayingHDR] = useState(false);
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const progressRestored = useRef(false);
  const lastSaveTime = useRef<number>(0);
  const onErrorRef = useRef(onError);
  const hdrCheckRef = useRef<boolean>(false);
  
  // Refs for values used in video event handlers (to avoid effect re-runs)
  const mediaInfoRef = useRef({ mediaId, type, season, episode, title });
  const pausedForStillWatchingRef = useRef(pausedForStillWatching);
  
  // Keep refs up to date
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  
  useEffect(() => {
    mediaInfoRef.current = { mediaId, type, season, episode, title };
  }, [mediaId, type, season, episode, title]);
  
  useEffect(() => {
    pausedForStillWatchingRef.current = pausedForStillWatching;
  }, [pausedForStillWatching]);
  
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
  }, [src]);

  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

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
        // Suppress 429 rate limit errors from being logged (they're handled by HLS.js retry logic)
        if (data.response?.code === 429) {
          return; // Let HLS.js handle retry automatically
        }
        
        if (data.fatal) {
          // Only log if there's meaningful error information
          const hasErrorInfo = data.type !== undefined || data.details !== undefined || data.response !== undefined || data.frag !== undefined;
          if (hasErrorInfo) {
            const errorInfo: Record<string, unknown> = {};
            if (data.type !== undefined) errorInfo.type = data.type;
            if (data.details !== undefined) errorInfo.details = data.details;
            if (data.response) {
              errorInfo.response = {
                code: data.response.code,
                text: data.response.text?.substring(0, 100), // Limit text length
                url: data.response.url
              };
            }
            if (data.frag) {
              errorInfo.frag = { url: data.frag.url };
            }
            console.error('Fatal HLS error:', errorInfo);
          }
          
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
            default:
              // For other fatal errors, try to recover by recreating HLS
              logger.debug('Unknown fatal error, attempting to recover...');
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
      
      // Show Skip Intro button between 5 and 90 seconds (typical intro length)
      if (time >= 5 && time <= 90 && duration > 120) {
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
      if (onErrorRef.current) onErrorRef.current();
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    return () => {
      // Stop video playback and clear source to prevent background playback
      video.pause();
      video.removeAttribute('src');
      video.load(); // Reset the video element
      
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      progressRestored.current = false;
      lastSaveTime.current = 0;
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
    // Only re-run when src changes - all other dependencies are handled via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

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

  // Notify parent of controls visibility changes
  useEffect(() => {
    if (onControlsVisibilityChange) {
      onControlsVisibilityChange(showControls);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showControls]);

  // Auto-hide controls
  useEffect(() => {
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
  }, [isPlaying]);

  const togglePlay = () => {
    if (videoRef.current) {
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
      videoRef.current.muted = !isMuted;
    }
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
      videoRef.current.currentTime = 120; // Skip to 2 minutes
      setShowSkipIntro(false);
    }
  };

  // Show next episode button when there's a next episode and auto-next is enabled
  // Show it always (not just in last 6 minutes) so users can click it anytime
  const { autoNext } = getAutoplaySettings();
  const showNextEpisode = hasNextEpisode && type === 'tv' && autoNext && duration > 0;

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
        onClick={togglePlay}
        aria-label={title || 'Video player'}
      />

      {/* Custom Subtitle Overlay */}
      {currentSubtitle && (
        <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none z-20">
          <div 
            className="bg-black/80 px-4 py-2 rounded text-white text-lg md:text-xl font-medium max-w-[80%] text-center"
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
            className="bg-white/95 hover:bg-white text-black px-6 py-3 rounded-md flex items-center gap-2 transition-all duration-200 hover:scale-105 shadow-xl font-semibold text-lg pointer-events-auto"
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
            className="bg-white/95 hover:bg-white text-black px-6 py-3 rounded-md flex items-center gap-2 transition-all duration-200 hover:scale-105 shadow-xl font-semibold text-lg pointer-events-auto cursor-pointer"
            aria-label="Play next episode"
            type="button"
          >
            <span>Next Episode</span>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>
        </div>
      )}

      {/* Buffering Spinner */}
      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
          <div className="w-16 h-16 border-4 border-netflix-red border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Controls Overlay */}
      <div 
        className={`absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/50 transition-opacity duration-300 pointer-events-none z-30 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Title Above Progress Bar */}
        {title && (
          <div className="absolute bottom-20 left-4 pointer-events-none">
            <h2 className="text-white text-2xl font-bold drop-shadow-lg">
              {title}
            </h2>
          </div>
        )}

        {/* Center Play Button - lower z-index so controls work */}
        {!isPlaying && !buffering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="w-20 h-20 rounded-full bg-netflix-red/90 hover:bg-netflix-red flex items-center justify-center transition-all duration-300 hover:scale-110 pointer-events-auto shadow-2xl shadow-netflix-red/60 hover:shadow-3xl glow-red-hover"
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
            >
              <svg className="w-10 h-10 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2 pointer-events-auto">
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
              className="w-full h-1 bg-gray-600 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-netflix-red 
                [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:opacity-0 
                group-hover/progress:[&::-webkit-slider-thumb]:opacity-100
                [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full"
              style={{
                background: `linear-gradient(to right, #e50914 ${(currentTime / duration) * 100}%, #4b5563 ${(currentTime / duration) * 100}%)`
              }}
            />
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center space-x-4">
              {/* Play/Pause */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="hover:text-netflix-red transition-all duration-200 hover:scale-110 hover:shadow-lg"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
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
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
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
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
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
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : volume < 0.5 ? (
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 9v6h4l5 5V4l-5 5H7z"/>
                    </svg>
                  ) : (
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
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
                  className="w-0 group-hover/volume:w-20 transition-all h-1 bg-gray-600 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white 
                    [&::-webkit-slider-thumb]:cursor-pointer"
                />
              </div>

              {/* Time */}
              <div className="text-sm font-medium">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              {/* HDR Indicator */}
              {isPlayingHDR && (
                <div className="flex items-center gap-1 px-2 py-1 bg-netflix-red/20 rounded text-xs font-semibold text-netflix-red border border-netflix-red/30">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l8 4v8.64l-8 4-8-4V8.18l8-4z"/>
                    <path d="M12 8l-4 2v4l4 2 4-2v-4l-4-2zm0 2.18l2 1v1.64l-2 1-2-1v-1.64l2-1z"/>
                  </svg>
                  <span>HDR</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-4">
              {/* Subtitles/CC Button */}
              {captions.length > 0 && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCaptionMenu(!showCaptionMenu);
                      setShowSettings(false);
                    }}
                    className={`hover:text-netflix-red transition-all duration-200 hover:scale-110 hover:shadow-lg ${
                      selectedCaptionIndex >= 0 ? 'text-netflix-red' : ''
                    }`}
                    title="Subtitles"
                    aria-label="Toggle subtitles menu"
                    aria-expanded={showCaptionMenu}
                    aria-haspopup="true"
                  >
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm-6-4h8v2h-8z"/>
                    </svg>
                  </button>

                  {/* Caption Menu Dropdown */}
                  {showCaptionMenu && (
                    <div className="absolute bottom-full right-0 mb-2 bg-black/95 backdrop-blur-sm rounded-lg overflow-hidden min-w-[200px] shadow-2xl ring-1 ring-white/10">
                      <div className="px-4 py-2 border-b border-gray-700">
                        <div className="text-white text-sm font-semibold">Subtitles</div>
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
                              ? 'bg-netflix-red text-white'
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
                                ? 'bg-netflix-red text-white'
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

              {/* Settings Menu */}
              {sources.length > 1 && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSettings(!showSettings);
                      setShowCaptionMenu(false);
                    }}
                    className="hover:text-netflix-red transition-all duration-200 hover:scale-110 hover:shadow-lg"
                    title="Settings"
                    aria-label="Toggle settings menu"
                    aria-expanded={showSettings}
                    aria-haspopup="true"
                  >
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2"/>
                      <circle cx="12" cy="12" r="2"/>
                      <circle cx="12" cy="19" r="2"/>
                    </svg>
                  </button>

                  {/* Settings Dropdown */}
                  {showSettings && (
                    <div className="absolute bottom-full right-0 mb-2 bg-black/95 backdrop-blur-sm rounded-lg overflow-hidden min-w-[240px] shadow-2xl ring-1 ring-white/10">
                      <div className="px-4 py-2 border-b border-gray-700">
                        <div className="text-white text-sm font-semibold">Source Quality</div>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {/* Group sources by provider */}
                        {(() => {
                          const providers = Array.from(new Set(sources.map(s => s.provider || 'unknown')));
                          return providers.map(provider => {
                            const providerSources = sources
                              .map((source, index) => ({ ...source, originalIndex: index }))
                              .filter(s => (s.provider || 'unknown') === provider);
                            
                            const providerLabel = provider === 'sanction' ? 'Sanction' 
                              : provider === 'flowcast' ? 'Flowcast'
                              : provider;
                            
                            return (
                              <div key={provider}>
                                <div className="px-4 py-1.5 bg-gray-900 text-xs font-semibold text-netflix-red uppercase tracking-wider">
                                  {providerLabel}
                                </div>
                                {providerSources.map((source) => (
                                  <button
                                    key={source.originalIndex}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onSourceChange) {
                                        onSourceChange(source.originalIndex);
                                      }
                                      setShowSettings(false);
                                    }}
                                    className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                                      source.originalIndex === currentSourceIndex
                                        ? 'bg-netflix-red text-white'
                                        : 'text-gray-300 hover:bg-gray-800'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span>{source.quality}</span>
                                      {source.originalIndex === currentSourceIndex && (
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                        </svg>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                  </svg>
                ) : (
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
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
