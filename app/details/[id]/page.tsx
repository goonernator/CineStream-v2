'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import CastModal from '@/components/CastModal';
import EpisodeCard from '@/components/EpisodeCard';
import { DetailsSkeleton, CastSkeleton, EpisodeListSkeleton } from '@/components/DetailsSkeleton';
import { tmdb, TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { watchProgress } from '@/lib/watchProgress';
import { streaming } from '@/lib/streaming';
import { auth } from '@/lib/auth';
import type { Movie, TVShow, Video, Episode, CastMember } from '@/lib/types';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function DetailsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mediaItem, setMediaItem] = useState<Movie | TVShow | null>(null);
  const [trailer, setTrailer] = useState<Video | null>(null);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [episodeAvailability, setEpisodeAvailability] = useState<Map<number, boolean>>(new Map());
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [selectedCast, setSelectedCast] = useState<CastMember | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const playerRef = useRef<any>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  const id = parseInt(params.id as string);
  const type = searchParams.get('type') as 'movie' | 'tv' | null;

  // Parallax scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const loadDetails = async () => {
      if (!type || !id) {
        router.push('/');
        return;
      }

      try {
        let details: Movie | TVShow;
        if (type === 'movie') {
          details = await tmdb.getMovieDetails(id);
          const videos = await tmdb.getMovieTrailers(id);
          if (videos.length > 0) setTrailer(videos[0]);
        } else {
          details = await tmdb.getTVDetails(id);
          const videos = await tmdb.getTVTrailers(id);
          if (videos.length > 0) setTrailer(videos[0]);
        }
        setMediaItem(details);
        
        // Load cast
        try {
          const castData = await tmdb.getCast(id, type);
          setCast(castData);
        } catch (error) {
          console.error('Failed to load cast:', error);
        }

        // Load episodes for TV shows
        if (type === 'tv' && 'seasons' in details) {
          const validSeasons = details.seasons?.filter(s => s.season_number > 0 && s.episode_count > 0) || [];
          if (validSeasons.length > 0) {
            // Check for watch progress to set default season/episode
            const allProgress = watchProgress.getAllProgress();
            const tvProgress = allProgress
              .filter(p => p.id === id && p.type === 'tv' && p.season && p.episode)
              .sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0))[0];
            
            if (tvProgress && tvProgress.season && tvProgress.episode) {
              // Check if the season exists
              const seasonExists = validSeasons.some(s => s.season_number === tvProgress.season);
              if (seasonExists) {
                setSelectedSeason(tvProgress.season);
                loadEpisodes(id, tvProgress.season, tvProgress.episode);
              } else {
                setSelectedSeason(1);
                loadEpisodes(id, 1);
              }
            } else {
              setSelectedSeason(1);
              loadEpisodes(id, 1);
            }
          }
        }

        // Load watchlist/favorites status
        const authState = auth.getAuthState();
        if (authState.isAuthenticated && authState.accountId && authState.sessionId) {
          try {
            const [watchlisted, favorited] = await Promise.all([
              tmdb.checkWatchlistStatus(authState.sessionId, authState.accountId, id, type),
              tmdb.checkFavoritesStatus(authState.sessionId, authState.accountId, id, type),
            ]);
            setIsWatchlisted(watchlisted);
            setIsFavorited(favorited);
          } catch (error) {
            console.error('Failed to load account state:', error);
          }
        }
      } catch (error) {
        console.error('Failed to load details:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [id, type, router]);

  // Load YouTube IFrame API
  useEffect(() => {
    if (showTrailerModal && trailer) {
      const loadYouTubeAPI = () => {
        if (window.YT && window.YT.Player) {
          initializePlayer();
        } else {
          const tag = document.createElement('script');
          tag.src = 'https://www.youtube.com/iframe_api';
          const firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

          window.onYouTubeIframeAPIReady = () => {
            initializePlayer();
          };
        }
      };

      const initializePlayer = () => {
        const container = document.getElementById('trailer-iframe');
        if (container && !playerRef.current && trailer && window.YT && window.YT.Player) {
          container.innerHTML = '';
          
          setTimeout(() => {
            try {
              playerRef.current = new window.YT.Player(container, {
                videoId: trailer.key,
                width: '100%',
                height: '100%',
                playerVars: {
                  autoplay: 1,
                  controls: 1,
                  rel: 0,
                  modestbranding: 1,
                  enablejsapi: 1,
                },
                events: {
                  onReady: (event: any) => {
                    event.target.setVolume(35);
                  },
                },
              });
            } catch (error) {
              console.error('Error initializing YouTube player:', error);
            }
          }, 100);
        }
      };

      loadYouTubeAPI();

      return () => {
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch (e) {
            console.error('Error destroying player:', e);
          }
          playerRef.current = null;
        }
      };
    }
  }, [showTrailerModal, trailer]);

  const loadEpisodes = async (tvId: number, seasonNumber: number, defaultEpisode?: number) => {
    setLoadingEpisodes(true);
    try {
      const seasonData = await tmdb.getSeasonDetails(tvId, seasonNumber);
      const loadedEpisodes = seasonData.episodes || [];
      setEpisodes(loadedEpisodes);
      
      if (loadedEpisodes.length > 0) {
        if (defaultEpisode && defaultEpisode <= loadedEpisodes.length) {
          setSelectedEpisode(defaultEpisode);
          // Scroll to episode after a short delay to ensure DOM is updated
          setTimeout(() => {
            const episodeElement = document.getElementById(`episode-${defaultEpisode}`);
            if (episodeElement) {
              episodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 100);
        } else {
          setSelectedEpisode(1);
        }
        
        // Check availability for all episodes (in batches to avoid overwhelming the API)
        checkEpisodeAvailability(tvId, seasonNumber, loadedEpisodes);
      }
    } catch (error) {
      console.error('Failed to load episodes:', error);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const checkEpisodeAvailability = async (tvId: number, seasonNumber: number, episodes: Episode[]) => {
    // Check availability in batches of 5 to avoid overwhelming the API
    const batchSize = 5;
    const availabilityMap = new Map<number, boolean>();
    
    for (let i = 0; i < episodes.length; i += batchSize) {
      const batch = episodes.slice(i, i + batchSize);
      
      // Check all episodes in batch in parallel
      const availabilityChecks = await Promise.allSettled(
        batch.map(async (episode) => {
          try {
            const result = await streaming.getTVStreamSourcesAsync(tvId, seasonNumber, episode.episode_number);
            return { episodeNumber: episode.episode_number, available: result.sources.length > 0 };
          } catch (error) {
            return { episodeNumber: episode.episode_number, available: false };
          }
        })
      );
      
      // Update availability map with results
      availabilityChecks.forEach((result) => {
        if (result.status === 'fulfilled') {
          availabilityMap.set(result.value.episodeNumber, result.value.available);
        }
      });
      
      // Update state after each batch to show progress
      setEpisodeAvailability(new Map(availabilityMap));
      
      // Small delay between batches to be respectful to the API
      if (i + batchSize < episodes.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  };

  const handleSeasonChange = (seasonNumber: number) => {
    setSelectedSeason(seasonNumber);
    if (type === 'tv') {
      loadEpisodes(id, seasonNumber);
    }
  };

  const handleEpisodeClick = (episodeNumber: number) => {
    setSelectedEpisode(episodeNumber);
    router.push(`/watch/${id}?type=tv&season=${selectedSeason}&episode=${episodeNumber}`);
  };

  const handlePlay = () => {
    if (type === 'tv') {
      // Check for watch progress to resume
      const allProgress = watchProgress.getAllProgress();
      const tvProgress = allProgress
        .filter(p => p.id === id && p.type === 'tv' && p.season && p.episode)
        .sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0))[0];
      
      if (tvProgress && tvProgress.season && tvProgress.episode && tvProgress.progress > 0 && tvProgress.progress < 90) {
        router.push(`/watch/${id}?type=${type}&season=${tvProgress.season}&episode=${tvProgress.episode}`);
      } else {
        router.push(`/watch/${id}?type=${type}&season=${selectedSeason}&episode=${selectedEpisode}`);
      }
    } else {
      const progress = watchProgress.getProgress(id, 'movie');
      if (progress && progress.progress > 0 && progress.progress < 90) {
        router.push(`/watch/${id}?type=${type}`);
      } else {
        router.push(`/watch/${id}?type=${type}`);
      }
    }
  };

  const handleAddToWatchlist = async () => {
    const authState = auth.getAuthState();
    if (!authState.isAuthenticated || !authState.accountId || !authState.sessionId) {
      await auth.initiateLogin();
      return;
    }

    try {
      const newState = !isWatchlisted;
      await tmdb.addToWatchlist(authState.sessionId!, authState.accountId!, id, type!, newState);
      setIsWatchlisted(newState);
    } catch (error) {
      console.error('Failed to update watchlist:', error);
    }
  };

  const handleAddToFavorites = async () => {
    const authState = auth.getAuthState();
    if (!authState.isAuthenticated || !authState.accountId || !authState.sessionId) {
      await auth.initiateLogin();
      return;
    }

    try {
      const newState = !isFavorited;
      await tmdb.addToFavorites(authState.sessionId!, authState.accountId!, id, type!, newState);
      setIsFavorited(newState);
    } catch (error) {
      console.error('Failed to update favorites:', error);
    }
  };

  const closeTrailerModal = () => {
    if (playerRef.current) {
      try {
        playerRef.current.stopVideo();
        playerRef.current.destroy();
      } catch (e) {
        console.error('Error stopping player:', e);
      }
      playerRef.current = null;
    }
    setShowTrailerModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <DetailsSkeleton />
      </div>
    );
  }

  if (!mediaItem) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-16">
        <div className="text-center">
            <svg className="w-24 h-24 text-netflix-gray/50 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
            </svg>
            <h2 className="text-2xl font-bold text-netflix-light mb-2">Media not found</h2>
            <p className="text-netflix-gray mb-6">The content you're looking for doesn't exist.</p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 bg-netflix-red hover:bg-red-600 text-white rounded-lg font-semibold transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
    );
  }

  const isMovie = 'title' in mediaItem;
  const title = isMovie ? mediaItem.title : mediaItem.name;
  const backdropPath = mediaItem.backdrop_path
    ? `${TMDB_IMAGE_BASE}/original${mediaItem.backdrop_path}`
    : null;
  const posterPath = mediaItem.poster_path
    ? `${TMDB_IMAGE_BASE}/w500${mediaItem.poster_path}`
    : null;
  const releaseYear = isMovie
    ? mediaItem.release_date?.split('-')[0]
    : mediaItem.first_air_date?.split('-')[0];

  // Calculate parallax values
  const parallaxOffset = Math.min(scrollY * 0.4, 200);
  const backdropOpacity = Math.max(0.1, 0.5 - scrollY / 800);
  const backdropScale = 1 + Math.min(scrollY / 2000, 0.1);

  return (
    <div className="min-h-screen">
      {/* Immersive Hero Backdrop with Parallax - extends behind header */}
        <div ref={heroRef} className="relative h-[80vh] w-full overflow-hidden -mt-16 pt-16">
          {backdropPath && (
            <div 
              className="absolute inset-0 -top-16 transition-transform duration-100"
              style={{ 
                transform: `translateY(${parallaxOffset}px) scale(${backdropScale})`,
              }}
            >
              <Image
                src={backdropPath}
                alt={title}
                fill
                className="object-cover object-top"
                sizes="100vw"
                unoptimized
                priority
                style={{ opacity: backdropOpacity }}
              />
            </div>
          )}
          
          {/* Gradient overlays - extend to cover the extra top area */}
          <div className="absolute inset-0 -top-16 bg-gradient-to-t from-netflix-bg via-netflix-bg/40 to-transparent" />
          <div className="absolute inset-0 -top-16 bg-gradient-to-r from-netflix-bg/50 via-transparent to-netflix-bg/50" />
        </div>

        {/* Content - Positioned over the hero */}
        <div className="relative -mt-[50vh] px-8 pb-12 z-10">
          {/* Back button */}
          <button
            onClick={() => router.back()}
            className="mb-8 px-4 py-2 bg-netflix-dark/60 backdrop-blur-sm hover:bg-netflix-dark/80 rounded-lg transition-all duration-300 flex items-center gap-2 group"
          >
            <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back</span>
          </button>

          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Poster with glassmorphism card */}
            <div className="flex-shrink-0 mx-auto lg:mx-0 animate-slide-in" style={{ animationDelay: '0.1s' }}>
              <div className="relative group">
                {/* Glow effect */}
                <div className="absolute -inset-4 bg-netflix-red/20 rounded-2xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Poster */}
                <div className="relative w-64 lg:w-72 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                  {posterPath ? (
                    <Image
                      src={posterPath}
                      alt={title}
                      fill
                      className="object-cover"
                      sizes="288px"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-netflix-dark to-netflix-bg flex items-center justify-center">
                      <span className="text-6xl">🎬</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Trailer button */}
              {trailer && (
                <button
                  onClick={() => setShowTrailerModal(true)}
                  className="w-full mt-4 bg-netflix-dark/60 backdrop-blur-sm hover:bg-netflix-dark/80 border border-netflix-gray/30 hover:border-netflix-red/50 text-netflix-light px-4 py-3 rounded-lg transition-all duration-300 flex items-center justify-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-full bg-netflix-red/20 group-hover:bg-netflix-red/30 flex items-center justify-center transition-colors">
                    <svg className="w-5 h-5 text-netflix-red" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                  <span className="font-medium">Watch Trailer</span>
                </button>
              )}

              {/* Season Selector - Below trailer */}
              {type === 'tv' && mediaItem && 'seasons' in mediaItem && mediaItem.seasons && (
                <select
                  value={selectedSeason}
                  onChange={(e) => handleSeasonChange(parseInt(e.target.value))}
                  className="w-full mt-3 bg-netflix-dark border border-netflix-gray/30 text-white px-4 py-3 rounded-lg hover:border-netflix-red/50 transition-colors cursor-pointer appearance-none font-medium text-center"
                  style={{ 
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23ffffff'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                    backgroundSize: '1.25rem',
                    paddingRight: '3rem',
                    colorScheme: 'dark'
                  }}
                >
                  {mediaItem.seasons
                    .filter(s => s.season_number > 0 && s.episode_count > 0)
                    .map(season => (
                      <option 
                        key={season.id} 
                        value={season.season_number}
                        className="bg-netflix-dark text-white py-2"
                      >
                        Season {season.season_number}
                      </option>
                    ))}
                </select>
              )}
            </div>

            {/* Info section */}
            <div className="flex-1 min-w-0">
              {/* Title */}
              <h1 
                className="text-4xl lg:text-5xl xl:text-6xl font-bold text-netflix-light mb-4 animate-slide-in"
                style={{ animationDelay: '0.15s' }}
              >
                {title}
              </h1>
              
              {/* Meta info */}
              <div 
                className="flex flex-wrap items-center gap-4 mb-6 animate-slide-in"
                style={{ animationDelay: '0.2s' }}
              >
                {/* Rating badge */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-full">
                  <span className="text-green-400 text-lg">★</span>
                  <span className="text-green-400 font-semibold">
                    {(mediaItem.vote_average * 10).toFixed(0)}%
                  </span>
                </div>
                
                {releaseYear && (
                  <span className="text-netflix-light font-medium">{releaseYear}</span>
                )}
                
                {isMovie && mediaItem.runtime && (
                  <span className="text-netflix-gray">{mediaItem.runtime} min</span>
                )}
                
                {!isMovie && 'number_of_seasons' in mediaItem && mediaItem.number_of_seasons && (
                  <span className="text-netflix-gray">
                    {mediaItem.number_of_seasons} Season{mediaItem.number_of_seasons > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div 
                className="flex flex-wrap gap-4 mb-8 animate-slide-in"
                style={{ animationDelay: '0.25s' }}
              >
                {/* Play button */}
                <button
                  onClick={handlePlay}
                  className="bg-netflix-red hover:bg-red-500 text-white px-8 py-4 font-semibold transition-all duration-300 flex items-center gap-3 shadow-lg shadow-netflix-red/40 hover:shadow-xl hover:shadow-netflix-red/50 hover:-translate-y-1 rounded-xl"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  <span>
                    {(() => {
                      if (type === 'tv') {
                        const allProgress = watchProgress.getAllProgress();
                        const tvProgress = allProgress
                          .filter(p => p.id === id && p.type === 'tv' && p.season && p.episode)
                          .sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0))[0];
                        if (tvProgress && tvProgress.season && tvProgress.episode && tvProgress.progress > 0 && tvProgress.progress < 90) {
                          return `Resume S${tvProgress.season}E${tvProgress.episode}`;
                        }
                        return `Play S${selectedSeason}E${selectedEpisode}`;
                      } else {
                        const progress = watchProgress.getProgress(id, 'movie');
                        if (progress && progress.progress > 0 && progress.progress < 90) {
                          return 'Resume';
                        }
                        return 'Play Now';
                      }
                    })()}
                  </span>
                </button>
                
                {/* Watchlist button */}
                <button
                  onClick={handleAddToWatchlist}
                  className={`w-14 h-14 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    isWatchlisted 
                      ? 'bg-white text-netflix-dark border-white' 
                      : 'border-netflix-gray/50 hover:border-netflix-light text-netflix-light hover:text-netflix-red'
                  }`}
                  title={isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}
                >
                  {isWatchlisted ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                    </svg>
                  )}
                </button>
                
                {/* Favorites button */}
                <button
                  onClick={handleAddToFavorites}
                  className={`w-14 h-14 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    isFavorited 
                      ? 'bg-netflix-red text-white border-netflix-red' 
                      : 'border-netflix-gray/50 hover:border-netflix-red text-netflix-light hover:text-netflix-red'
                  }`}
                  title={isFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
                >
                  <svg className="w-6 h-6" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                  </svg>
                </button>
              </div>

              {/* Overview */}
              <p 
                className="text-lg text-netflix-light/90 mb-10 max-w-3xl leading-relaxed animate-slide-in"
                style={{ animationDelay: '0.3s' }}
              >
                {mediaItem.overview}
              </p>

              {/* Cast Section - Interactive */}
              {cast.length > 0 && (
                <div 
                  className="mb-10 animate-slide-in"
                  style={{ animationDelay: '0.35s' }}
                >
                  <h2 className="text-2xl font-bold text-netflix-light mb-6 flex items-center gap-3">
                    <svg className="w-6 h-6 text-netflix-red" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                    Cast
                  </h2>
                  <div className="flex gap-5 overflow-x-auto pb-4 -mx-2 px-2">
                    {cast.slice(0, 12).map((actor, index) => (
                      <button
                        key={actor.id}
                        onClick={() => setSelectedCast(actor)}
                        className="flex-shrink-0 text-center group cursor-pointer animate-scale-up"
                        style={{ animationDelay: `${0.4 + index * 0.05}s` }}
                      >
                        <div className="relative w-28 h-28 mb-3 rounded-full overflow-hidden bg-netflix-dark ring-3 ring-transparent group-hover:ring-netflix-red transition-all duration-300 group-hover:scale-105">
                          {actor.profile_path ? (
                            <Image
                              src={`${TMDB_IMAGE_BASE}/w185${actor.profile_path}`}
                              alt={actor.name}
                              fill
                              className="object-cover"
                              sizes="112px"
                              unoptimized
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-4xl text-netflix-gray">
                              👤
                            </div>
                          )}
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-netflix-red/0 group-hover:bg-netflix-red/20 flex items-center justify-center transition-colors">
                            <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-netflix-light group-hover:text-netflix-red transition-colors line-clamp-1">{actor.name}</p>
                        <p className="text-xs text-netflix-gray line-clamp-1">{actor.character}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Episode List - Vertical layout with scroll */}
              {type === 'tv' && (
                <div className="animate-slide-in" style={{ animationDelay: '0.4s' }}>
                  <h2 className="text-2xl font-bold text-netflix-light mb-6 flex items-center gap-3">
                    <svg className="w-6 h-6 text-netflix-red" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
                    </svg>
                    Season {selectedSeason} Episodes
                    <span className="text-sm font-normal text-netflix-gray">({episodes.length} episodes)</span>
                  </h2>
                  
                  {loadingEpisodes ? (
                    <EpisodeListSkeleton />
                  ) : episodes.length === 0 ? (
                    <p className="text-netflix-gray">No episodes available for this season.</p>
                  ) : (
                    <div 
                      className="space-y-3 overflow-y-auto pr-2 custom-scrollbar"
                      style={{ maxHeight: 'calc(7 * 100px)' }} /* 7 episodes visible */
                    >
                      {episodes.map((episode, index) => {
                        const progress = watchProgress.getProgress(id, 'tv', selectedSeason, episode.episode_number);
                        const hasProgress = progress && progress.progress > 0 && progress.progress < 100;
                        const isAvailable = episodeAvailability.has(episode.episode_number) 
                          ? episodeAvailability.get(episode.episode_number) 
                          : null; // null means not checked yet
                        const isUnavailable = isAvailable === false;
                        
                        return (
                          <div 
                            key={episode.id}
                            id={`episode-${episode.episode_number}`}
                            onClick={() => !isUnavailable && handleEpisodeClick(episode.episode_number)}
                            className={`group flex gap-4 p-4 rounded-xl transition-all duration-200 animate-slide-in ${
                              isUnavailable 
                                ? 'opacity-60 cursor-not-allowed' 
                                : 'cursor-pointer'
                            } ${
                              episode.episode_number === selectedEpisode 
                                ? 'bg-netflix-red/20 border-l-4 border-netflix-red' 
                                : 'bg-netflix-dark/40 hover:bg-netflix-dark/70 border-l-4 border-transparent hover:border-netflix-gray/50'
                            }`}
                            style={{ animationDelay: `${0.45 + index * 0.03}s` }}
                          >
                            {/* Thumbnail */}
                            <div className="relative w-40 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-netflix-dark">
                              {episode.still_path ? (
                                <Image
                                  src={`${TMDB_IMAGE_BASE}/w300${episode.still_path}`}
                                  alt={episode.name}
                                  fill
                                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                                  sizes="160px"
                                  unoptimized
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-netflix-dark to-netflix-bg">
                                  <svg className="w-10 h-10 text-netflix-gray/50" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                                  </svg>
                                </div>
                              )}
                              
                              {/* Episode number badge */}
                              <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-bold text-white">
                                E{episode.episode_number}
                              </div>

                              {/* Play icon overlay - only show for available episodes */}
                              {!isUnavailable && (
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                                  <div className="w-10 h-10 rounded-full bg-netflix-red/90 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M8 5v14l11-7z"/>
                                    </svg>
                                  </div>
                                </div>
                              )}

                              {/* Progress bar */}
                              {hasProgress && (
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                                  <div 
                                    className="h-full bg-netflix-red"
                                    style={{ width: `${progress.progress}%` }}
                                  />
                                </div>
                              )}

                              {/* Unavailable overlay */}
                              {isUnavailable && (
                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center backdrop-blur-sm">
                                  <div className="text-center px-3">
                                    <svg className="w-8 h-8 text-netflix-gray mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-xs text-netflix-gray font-medium">Not Available</p>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Episode Info */}
                            <div className="flex-1 min-w-0 py-1">
                              <div className="flex items-start justify-between gap-3 mb-1">
                                <h3 className="font-semibold text-netflix-light group-hover:text-netflix-red line-clamp-1 transition-colors">
                                  {episode.name}
                                </h3>
                                {episode.vote_average > 0 && (
                                  <div className="flex items-center gap-1 text-xs text-netflix-gray flex-shrink-0">
                                    <span className="text-yellow-400">★</span>
                                    <span>{episode.vote_average.toFixed(1)}</span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-3 text-xs text-netflix-gray mb-2">
                                {episode.runtime && <span>{episode.runtime} min</span>}
                                {episode.air_date && (
                                  <span>{new Date(episode.air_date).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric',
                                    year: 'numeric' 
                                  })}</span>
                                )}
                                {hasProgress && (
                                  <span className="text-netflix-red font-medium">{progress.progress.toFixed(0)}% watched</span>
                                )}
                              </div>
                              
                              <p className="text-sm text-netflix-gray/80 line-clamp-2">
                                {episode.overview || 'No description available.'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      {/* Cast Modal */}
      {selectedCast && (
        <CastModal
          personId={selectedCast.id}
          personName={selectedCast.name}
          profilePath={selectedCast.profile_path}
          isOpen={!!selectedCast}
          onClose={() => setSelectedCast(null)}
        />
      )}

      {/* Trailer Modal */}
      {showTrailerModal && trailer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
          onClick={closeTrailerModal}
        >
          <div
            className="relative w-full max-w-6xl p-4 md:p-8 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeTrailerModal}
              className="absolute -top-2 -right-2 md:top-0 md:right-0 z-10 w-12 h-12 bg-netflix-dark/80 hover:bg-netflix-dark rounded-full flex items-center justify-center text-netflix-light hover:text-netflix-red transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
            <div className="relative w-full rounded-xl overflow-hidden" style={{ paddingBottom: '56.25%', height: 0 }}>
              <div 
                id="trailer-iframe"
                className="absolute top-0 left-0 w-full h-full"
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
