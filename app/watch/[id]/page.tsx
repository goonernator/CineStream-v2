'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import StreamPlayer from '@/components/StreamPlayer';
import ErrorBoundary from '@/components/ErrorBoundary';
import StillWatchingModal from '@/components/StillWatchingModal';
import { streaming } from '@/lib/streaming';
import { tmdb } from '@/lib/tmdb';
import { watchProgress } from '@/lib/watchProgress';
import type { Movie, TVShow } from '@/lib/types';
import type { StreamSource, StreamCaption } from '@/lib/streaming';

export default function WatchPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mediaItem, setMediaItem] = useState<Movie | TVShow | null>(null);
  const [streamSources, setStreamSources] = useState<StreamSource[]>([]);
  const [captions, setCaptions] = useState<StreamCaption[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasNextEpisode, setHasNextEpisode] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStillWatching, setShowStillWatching] = useState(false);
  const [isPausedForStillWatching, setIsPausedForStillWatching] = useState(false);

  const id = parseInt(params.id as string);
  const type = searchParams.get('type') as 'movie' | 'tv' | null;
  const season = searchParams.get('season') ? parseInt(searchParams.get('season')!) : 1;
  const episode = searchParams.get('episode') ? parseInt(searchParams.get('episode')!) : 1;

  // All hooks must be called before any conditional returns
  // Use useCallback with stable reference to prevent VideoPlayer remounting
  const handleControlsVisibilityChange = useCallback((visible: boolean) => {
    setShowControls(visible);
  }, []); // Empty deps - callback never changes

  const handleNextEpisode = useCallback(async () => {
    if (type !== 'tv' || !mediaItem) return;

    try {
      const tv = mediaItem as TVShow;
      const seasonDetails = await tmdb.getSeasonDetails(id, season);
      const hasMoreEpisodesInSeason = seasonDetails.episodes && episode < seasonDetails.episodes.length;

      if (hasMoreEpisodesInSeason) {
        // Go to next episode in same season
        const nextEpisode = episode + 1;
        router.push(`/watch/${id}?type=tv&season=${season}&episode=${nextEpisode}`);
      } else {
        // Go to first episode of next season
        const nextSeason = season + 1;
        if (nextSeason <= (tv.number_of_seasons || 0)) {
          router.push(`/watch/${id}?type=tv&season=${nextSeason}&episode=1`);
        }
      }
    } catch (error) {
      console.error('Failed to load next episode:', error);
    }
  }, [type, id, season, episode, mediaItem, router]);

  const handleStillWatchingContinue = useCallback(() => {
    setShowStillWatching(false);
    setIsPausedForStillWatching(false);
  }, []);

  const handleStillWatchingStay = useCallback(() => {
    // Keep modal open and video paused
    setShowStillWatching(true);
    setIsPausedForStillWatching(true);
  }, []);

  useEffect(() => {
    // Use a flag to prevent state updates after unmount (handles StrictMode double-invocation)
    let isCancelled = false;
    
    const loadMedia = async () => {
      if (!type || !id) {
        router.push('/');
        return;
      }

      // Reset consecutive count if switching shows
      // Check previous showId in localStorage
      try {
        const allKeys = Object.keys(localStorage);
        const consecutiveKeys = allKeys.filter(key => key.startsWith('cinestream_consecutive_episodes_'));
        for (const key of consecutiveKeys) {
          try {
            const storedData = localStorage.getItem(key);
            if (storedData) {
              const data = JSON.parse(storedData);
              if (data && data.showId && data.showId !== id) {
                // Different show - reset the old one
                watchProgress.resetConsecutiveEpisodeCount(data.showId);
              }
            }
          } catch (parseError) {
            // Skip corrupted entries
            logger.warn(`Failed to parse consecutive episode data for key ${key}:`, parseError);
          }
        }
      } catch (error) {
        logger.error('Failed to check consecutive episode keys:', error);
      }

      // Set a maximum loading time
      const loadingTimeout = setTimeout(() => {
        if (!isCancelled) {
          setError('Loading is taking longer than expected. This might be due to network issues. Please check your connection and try again.');
          setLoading(false);
        }
      }, 120000); // 120 seconds (2 minutes) max

      try {
        if (isCancelled) return;
        setError(null);
        
        if (type === 'movie') {
          const movie = await tmdb.getMovieDetails(id);
          if (isCancelled) return;
          setMediaItem(movie);
          
          const result = await streaming.getMovieStreamSourcesAsync(id);
          if (isCancelled) return;
          
          logger.debug('Movie sources:', result.sources, 'Captions:', result.captions);
          clearTimeout(loadingTimeout);
          if (result.sources.length === 0) {
            setError('Unable to find streaming sources for this movie. Please try again later or check back soon.');
          }
          setStreamSources(result.sources);
          setCaptions(result.captions);
          setHasNextEpisode(false);
        } else {
          const tv = await tmdb.getTVDetails(id);
          if (isCancelled) return;
          setMediaItem(tv);
          
          const result = await streaming.getTVStreamSourcesAsync(id, season, episode);
          if (isCancelled) return;
          
          logger.debug('TV sources:', result.sources, 'Captions:', result.captions);
          clearTimeout(loadingTimeout);
          if (result.sources.length === 0) {
            setError(`Unable to find streaming sources for Season ${season}, Episode ${episode}. Please try again later or check back soon.`);
          }
          setStreamSources(result.sources);
          setCaptions(result.captions);
          
          // Check if there's a next episode
          const seasonDetails = await tmdb.getSeasonDetails(id, season);
          if (isCancelled) return;
          
          const hasMoreEpisodesInSeason = seasonDetails.episodes && episode < seasonDetails.episodes.length;
          const hasNextSeason = season < (tv.number_of_seasons || 0);
          setHasNextEpisode(hasMoreEpisodesInSeason || hasNextSeason);
          
          // Check for "Still Watching" modal (TV shows only)
          const episodeId = `s${season}e${episode}`;
          const consecutiveCount = watchProgress.incrementConsecutiveEpisodeCount(id, episodeId);
          
          // If this is the 5th consecutive episode (after watching 4), show modal
          if (consecutiveCount === 4) { // Show at start of 5th episode
            setShowStillWatching(true);
            setIsPausedForStillWatching(true);
          } else {
            // Reset if switching to different show (check stored showId)
            try {
              const storedData = localStorage.getItem(watchProgress.getConsecutiveEpisodeKey(id));
              if (storedData) {
                const data = JSON.parse(storedData);
                if (data && data.showId !== id) {
                  watchProgress.resetConsecutiveEpisodeCount(id);
                }
              }
            } catch (error) {
              logger.error('Failed to check consecutive episode data:', error);
              // If data is corrupted, reset the count
              watchProgress.resetConsecutiveEpisodeCount(id);
            }
          }
        }
      } catch (error) {
        clearTimeout(loadingTimeout);
        if (isCancelled) return;
        logger.error('Failed to load media:', error);
        const errorMessage = error instanceof Error 
          ? (error.message.includes('fetch') || error.message.includes('network') 
              ? 'Network error: Unable to connect to the server. Please check your internet connection and try again.'
              : `Unable to load this content: ${error.message}. Please try again later.`)
          : 'Unable to load this content. Please try again later or contact support if the problem persists.';
        setError(errorMessage);
        setLoading(false);
      } finally {
        clearTimeout(loadingTimeout);
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadMedia();
    
    // Cleanup: cancel any pending state updates when effect re-runs or component unmounts
    return () => {
      isCancelled = true;
    };
  }, [id, type, season, episode, router]);

  // Update watch progress with poster/backdrop when media loads
  useEffect(() => {
    if (mediaItem && id) {
      const title = 'title' in mediaItem ? mediaItem.title : mediaItem.name;
      const current = watchProgress.getProgress(id, type || 'movie', type === 'tv' ? season : undefined, type === 'tv' ? episode : undefined);
      if (current) {
        // Update with poster and backdrop from TMDB
        watchProgress.saveProgress({
          ...current,
          poster_path: mediaItem.poster_path,
          backdrop_path: mediaItem.backdrop_path,
          title: title,
        });
      }
    }
  }, [mediaItem, id, type, season, episode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-netflix-bg">
        <div className="text-xl">Loading player...</div>
      </div>
    );
  }

  if (error || (!mediaItem || streamSources.length === 0)) {
    return (
      <div className="min-h-screen bg-netflix-dark">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center px-4 max-w-md">
            <p className="text-netflix-light text-lg mb-6">
              No stream available, check back soon
            </p>
            <button
              onClick={() => router.back()}
              className="px-6 py-2 bg-netflix-red hover:bg-red-600 transition-all duration-300 rounded-lg shadow-lg shadow-netflix-red/50 hover:shadow-xl hover:shadow-netflix-red/70 hover:-translate-y-1"
            >
              ← Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const title = 'title' in mediaItem ? mediaItem.title : mediaItem.name;

  return (
    <div className="min-h-screen bg-netflix-dark">
      <div className="relative w-full" style={{ height: 'calc(100vh)' }}>
        <ErrorBoundary
          fallback={
            <div className="min-h-screen bg-netflix-dark flex items-center justify-center">
              <div className="text-center px-4 max-w-md">
                <div className="text-xl text-netflix-gray font-semibold mb-2">
                  Player error occurred. Please try again.
                </div>
                <button
                  onClick={() => router.back()}
                  className="px-6 py-2 bg-netflix-red hover:bg-red-600 transition-all duration-300 rounded-lg shadow-lg shadow-netflix-red/50 hover:shadow-xl hover:shadow-netflix-red/70 hover:-translate-y-1"
                >
                  ← Go Back
                </button>
              </div>
            </div>
          }
        >
          <StreamPlayer 
            sources={streamSources}
            captions={captions}
            type={type || 'movie'} 
            title={type === 'tv' ? `${title} - S${season}E${episode}` : title}
            mediaId={id}
            season={type === 'tv' ? season : undefined}
            episode={type === 'tv' ? episode : undefined}
            hasNextEpisode={hasNextEpisode}
            onNextEpisode={handleNextEpisode}
            onControlsVisibilityChange={handleControlsVisibilityChange}
            pausedForStillWatching={isPausedForStillWatching}
          />
        </ErrorBoundary>
        {/* Back Button - fades with controls */}
        <div className={`absolute top-14 left-4 z-50 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-netflix-red hover:bg-red-600 transition-all duration-300 rounded-lg pointer-events-auto shadow-lg shadow-netflix-red/50 hover:shadow-xl hover:shadow-netflix-red/70 hover:-translate-y-1"
          >
            ← Back
          </button>
        </div>
      </div>
      {/* Still Watching Modal */}
      {type === 'tv' && mediaItem && (
        <StillWatchingModal
          isOpen={showStillWatching}
          onContinue={handleStillWatchingContinue}
          onStay={handleStillWatchingStay}
          showTitle={title}
          season={season}
          episode={episode}
        />
      )}
    </div>
  );
}

