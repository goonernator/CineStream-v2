'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { tmdb, TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { watchProgress } from '@/lib/watchProgress';
import { notifications } from '@/lib/notifications';
import { filterValidMedia } from '@/lib/mediaFilter';
import { logger } from '@/lib/logger';
import { auth } from '@/lib/auth';
import type { Movie, TVShow } from '@/lib/types';

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function NoirFlixHome() {
  const router = useRouter();
  const [latestReleases, setLatestReleases] = useState<Movie[]>([]);
  const [popularMovies, setPopularMovies] = useState<Movie[]>([]);
  const [popularTV, setPopularTV] = useState<TVShow[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<Movie[]>([]);
  const [topRatedTV, setTopRatedTV] = useState<TVShow[]>([]);
  const [nowPlayingMovies, setNowPlayingMovies] = useState<Movie[]>([]);
  const [onTheAirTV, setOnTheAirTV] = useState<TVShow[]>([]);
  const [upcomingMovies, setUpcomingMovies] = useState<Movie[]>([]);
  const [trendingToday, setTrendingToday] = useState<(Movie | TVShow)[]>([]);
  const [recommendations, setRecommendations] = useState<(Movie | TVShow)[]>([]);
  const [continueWatching, setContinueWatching] = useState<(Movie | TVShow)[]>([]);
  const [continueWatchingLoading, setContinueWatchingLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<(Movie | TVShow)[]>([]);
  const [favorites, setFavorites] = useState<(Movie | TVShow)[]>([]);
  const [watchlistTotal, setWatchlistTotal] = useState(0);
  const [favoritesTotal, setFavoritesTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const notificationCooldownRef = useRef<number>(0);

  useEffect(() => {
    const loadData = async () => {
      let apiLoadSuccess = false; // Declare outside to use in fallback
      try {
        if (typeof window !== 'undefined') {
          setContinueWatchingLoading(true);
          try {
            const continueItems = watchProgress.getContinueWatching();
            
            if (continueItems.length > 0) {
              const detailsPromises = continueItems.map(async (item) => {
                try {
                  if (item.type === 'movie') {
                    return await tmdb.getMovieDetails(item.id);
                  } else {
                    return await tmdb.getTVDetails(item.id);
                  }
                } catch (error) {
                  logger.error(`Failed to load continue watching item ${item.id}:`, error);
                  return null;
                }
              });
              
              const details = await Promise.all(detailsPromises);
              const validDetails = details.filter((detail): detail is Movie | TVShow => detail !== null);
              
              const seenIds = new Set<number>();
              const uniqueDetails = validDetails.filter((detail) => {
                if (seenIds.has(detail.id)) {
                  return false;
                }
                seenIds.add(detail.id);
                return true;
              });
              
              const filteredDetails = filterValidMedia(uniqueDetails);
              setContinueWatching(filteredDetails);
              
              const now = Date.now();
              if (filteredDetails.length > 0 && now - notificationCooldownRef.current > 5 * 60 * 1000) {
                notificationCooldownRef.current = now;
                notifications.checkContinueWatching(filteredDetails, tmdb);
              }

              // Load recommendations and watchlist/favorites after continue watching is loaded
              try {
                const authState = auth.getAuthState();
                if (authState.isAuthenticated && authState.sessionId && authState.accountId) {
                  try {
                    const [favoritesData, watchlistData] = await Promise.all([
                      tmdb.getFavorites(authState.sessionId, authState.accountId),
                      tmdb.getWatchlist(authState.sessionId, authState.accountId),
                    ]);
                    
                    // Set watchlist and favorites from TMDB API (includes type information)
                    if (watchlistData && watchlistData.length > 0) {
                      setWatchlist(watchlistData.slice(0, 2) as (Movie | TVShow)[]);
                      setWatchlistTotal(watchlistData.length);
                      apiLoadSuccess = true;
                    }
                    if (favoritesData && favoritesData.length > 0) {
                      setFavorites(favoritesData.slice(0, 2) as (Movie | TVShow)[]);
                      setFavoritesTotal(favoritesData.length);
                      apiLoadSuccess = true;
                    }
                    
                    const watchHistory = filteredDetails.map(item => ({
                      id: item.id,
                      type: ('title' in item ? 'movie' : 'tv') as 'movie' | 'tv',
                    }));
                    
                    const recs = await tmdb.getPersonalizedRecommendations(
                      watchHistory,
                      {
                        watchHistoryDetails: filteredDetails,
                        favorites: favoritesData,
                        watchlist: watchlistData,
                        sessionId: authState.sessionId,
                        accountId: authState.accountId,
                      }
                    );
                    setRecommendations(shuffleArray(recs.slice(0, 20)));
                  } catch (apiError) {
                    logger.error('Failed to load from TMDB API:', apiError);
                    apiLoadSuccess = false;
                  }
                }
              } catch (error) {
                logger.error('Failed to load recommendations:', error);
                apiLoadSuccess = false;
              }
            } else {
              setContinueWatching([]);
            }
          } catch (error) {
            console.error('Failed to load continue watching:', error);
            setContinueWatching([]);
          } finally {
            setContinueWatchingLoading(false);
          }

          // Load watchlist and favorites from local storage (fallback if not authenticated or API failed)
          try {
            const authState = auth.getAuthState();
            // Load from local storage if not authenticated or if API didn't successfully load data
            if (!authState.isAuthenticated || !authState.sessionId || !authState.accountId || !apiLoadSuccess) {
              const watchlistData = watchProgress.getWatchlist();
              const favoritesData = watchProgress.getFavorites();
              
              if (watchlistData.length > 0) {
                setWatchlistTotal(watchlistData.length);
                const watchlistDetails = await Promise.all(
                  watchlistData.slice(0, 2).map(async (id) => {
                    // Try both movie and TV in parallel
                    const [movieResult, tvResult] = await Promise.allSettled([
                      tmdb.getMovieDetails(id),
                      tmdb.getTVDetails(id),
                    ]);
                    
                    if (movieResult.status === 'fulfilled') {
                      return movieResult.value;
                    }
                    if (tvResult.status === 'fulfilled') {
                      return tvResult.value;
                    }
                    return null;
                  })
                );
                const validItems = watchlistDetails.filter((item): item is Movie | TVShow => item !== null);
                if (validItems.length > 0) {
                  setWatchlist(validItems);
                }
              }

              if (favoritesData.length > 0) {
                setFavoritesTotal(favoritesData.length);
                const favoritesDetails = await Promise.all(
                  favoritesData.slice(0, 2).map(async (id) => {
                    // Try both movie and TV in parallel
                    const [movieResult, tvResult] = await Promise.allSettled([
                      tmdb.getMovieDetails(id),
                      tmdb.getTVDetails(id),
                    ]);
                    
                    if (movieResult.status === 'fulfilled') {
                      return movieResult.value;
                    }
                    if (tvResult.status === 'fulfilled') {
                      return tvResult.value;
                    }
                    return null;
                  })
                );
                const validItems = favoritesDetails.filter((item): item is Movie | TVShow => item !== null);
                if (validItems.length > 0) {
                  setFavorites(validItems);
                }
              }
            }
          } catch (error) {
            logger.error('Failed to load watchlist/favorites:', error);
          }
        }

        const randomPages = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10) + 1);

        const [
          latestMovies,
          popularMoviesData,
          popularTVData,
          topRatedMoviesData,
          topRatedTVData,
          nowPlayingData,
          onTheAirData,
          upcomingData,
          trendingData,
        ] = await Promise.all([
          tmdb.getLatestReleases(),
          tmdb.getPopularMovies(),
          tmdb.getPopularTV(),
          tmdb.getTopRatedMovies(),
          tmdb.getTopRatedTV(),
          tmdb.getNowPlayingMovies(),
          tmdb.getOnTheAirTV(),
          tmdb.getUpcomingMovies(),
          tmdb.getTrendingAll('day'),
        ]);

        setLatestReleases(shuffleArray(latestMovies.slice(0, 20)));
        setPopularMovies(shuffleArray(popularMoviesData.slice(0, 20)));
        setPopularTV(shuffleArray(popularTVData.slice(0, 20)));
        setTopRatedMovies(shuffleArray(topRatedMoviesData.slice(0, 20)));
        setTopRatedTV(shuffleArray(topRatedTVData.slice(0, 20)));
        setNowPlayingMovies(shuffleArray(nowPlayingData.slice(0, 20)));
        setOnTheAirTV(shuffleArray(onTheAirData.slice(0, 20)));
        setUpcomingMovies(shuffleArray(upcomingData.slice(0, 20)));
        setTrendingToday(shuffleArray(trendingData.slice(0, 20)));
      } catch (error) {
        logger.error('Failed to load home page data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleContinueWatchingClick = (item: Movie | TVShow) => {
    const progress = watchProgress.getProgress(
      item.id,
      'title' in item ? 'movie' : 'tv',
      'title' in item ? undefined : 1,
      'title' in item ? undefined : 1
    );
    
    if (progress && 'title' in item === false) {
      router.push(`/watch/${item.id}?type=tv&season=${progress.season || 1}&episode=${progress.episode || 1}`);
    } else {
      router.push(`/watch/${item.id}?type=${'title' in item ? 'movie' : 'tv'}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] pt-32">
        <div className="px-16 py-8">
          <div className="text-white/50 font-mono text-xs uppercase tracking-[4px]">Loading...</div>
        </div>
      </div>
    );
  }

  const featuredItem = continueWatching[0] || trendingToday[0];
  const featuredProgress = featuredItem ? watchProgress.getProgress(
    featuredItem.id,
    'title' in featuredItem ? 'movie' : 'tv',
    'title' in featuredItem ? undefined : 1,
    'title' in featuredItem ? undefined : 1
  ) : null;

  return (
    <div className="min-h-screen bg-[#050505] pt-32" style={{
      backgroundImage: 'radial-gradient(circle at 50% -20%, #111 0%, transparent 60%), linear-gradient(to bottom, transparent 0%, #000 100%)'
    }}>
      {/* Hero Section with Continue Watching */}
      <section className="px-16 py-8 flex gap-16 items-stretch animate-reveal">
        <div 
          className="flex-[2] relative bg-[#111] overflow-hidden border border-[#1a1a1a] transition-transform duration-600 hover:scale-[0.99] cursor-pointer"
          onClick={() => featuredItem && handleContinueWatchingClick(featuredItem)}
        >
          {featuredItem && (
            <>
              <Image
                src={featuredItem.backdrop_path 
                  ? `${TMDB_IMAGE_BASE}/original${featuredItem.backdrop_path}`
                  : featuredItem.poster_path
                    ? `${TMDB_IMAGE_BASE}/original${featuredItem.poster_path}`
                    : '/placeholder.jpg'
                }
                alt={'title' in featuredItem ? featuredItem.title : featuredItem.name}
                fill
                className="object-cover opacity-60 grayscale-[40%]"
                priority
              />
              <div className="absolute bottom-0 left-0 w-full p-12 bg-gradient-to-t from-[#050505] to-transparent">
                <span className="label font-mono text-[0.7rem] text-[#888] uppercase tracking-[4px] block mb-4">
                  Continue Watching
                </span>
                <h1 className="monolith-title text-6xl font-black leading-[0.9] mb-6 uppercase">
                  {'title' in featuredItem ? featuredItem.title : featuredItem.name}
                </h1>
                {featuredProgress && featuredProgress.progress > 0 && (
                  <>
                    <div className="progress-bar w-full h-0.5 bg-[#1a1a1a] relative mb-8">
                      <div 
                        className="progress-fill absolute left-0 top-0 h-full bg-white shadow-[0_0_15px_white]"
                        style={{ width: `${featuredProgress.progress}%` }}
                      />
                    </div>
                    <div className="font-mono text-[0.7rem] text-[#888]">
                      RESUME AT {Math.floor((featuredProgress.currentTime || 0) / 60)}:{String(Math.floor((featuredProgress.currentTime || 0) % 60)).padStart(2, '0')} // 
                      {featuredProgress.type === 'tv' ? `EPISODE ${featuredProgress.episode || 1}` : 'MOVIE'}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Sidebar with Watchlist and Favorites */}
        <div className="flex-1 flex flex-col gap-8">
          {/* Watchlist */}
          <div 
            className="bg-[#0a0a0a] border border-[#1a1a1a] p-8 relative cursor-pointer transition-all hover:border-[rgba(255,255,255,0.4)]"
            onClick={() => router.push('/watchlist')}
          >
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.4)] to-transparent"></div>
            <div className="collection-header flex justify-between items-center mb-6">
              <span className="collection-title font-mono text-xs uppercase tracking-[2px] text-white">Watchlist</span>
              <span className="font-mono text-[0.6rem] text-[#888]">[{watchlistTotal || watchlist.length}]</span>
            </div>
            {watchlist.length > 0 ? (
              <div className="space-y-4">
                {watchlist.slice(0, 2).map((item) => (
                  <div
                    key={item.id}
                    className="item-row flex items-center gap-4 pb-4 border-b border-[rgba(255,255,255,0.03)] transition-opacity hover:opacity-70"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/details/${item.id}?type=${'title' in item ? 'movie' : 'tv'}`);
                    }}
                  >
                    <div className="w-10 h-[60px] bg-[#222] relative overflow-hidden">
                      {item.poster_path && (
                        <Image
                          src={`${TMDB_IMAGE_BASE}/w92${item.poster_path}`}
                          alt={('title' in item ? item.title : item.name) || 'Media'}
                          fill
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="item-info flex-1">
                      <span className="item-name text-sm font-bold text-white block">
                        {'title' in item ? item.title : item.name}
                      </span>
                      <span className="item-meta font-mono text-[0.65rem] text-[#888]">
                        {('title' in item ? item.release_date?.split('-')[0] : item.first_air_date?.split('-')[0]) || 'N/A'} // 
                        {'title' in item ? 'MOVIE' : 'TV'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[#888] font-mono text-xs">No items in watchlist</div>
            )}
          </div>

          {/* Favorites */}
          <div 
            className="bg-[#0a0a0a] border border-[#1a1a1a] p-8 flex-grow relative cursor-pointer transition-all hover:border-[rgba(255,255,255,0.4)]"
            onClick={() => router.push('/favorites')}
          >
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.4)] to-transparent"></div>
            <div className="collection-header flex justify-between items-center mb-6">
              <span className="collection-title font-mono text-xs uppercase tracking-[2px] text-white">Favourites</span>
              <span className="font-mono text-[0.6rem] text-[#888]">[{favoritesTotal || favorites.length}]</span>
            </div>
            {favorites.length > 0 ? (
              <div className="space-y-4">
                {favorites.slice(0, 2).map((item) => (
                  <div
                    key={item.id}
                    className="item-row flex items-center gap-4 pb-4 border-b border-[rgba(255,255,255,0.03)] transition-opacity hover:opacity-70"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/details/${item.id}?type=${'title' in item ? 'movie' : 'tv'}`);
                    }}
                  >
                    <div className="w-10 h-[60px] bg-[#222] relative overflow-hidden">
                      {item.poster_path && (
                        <Image
                          src={`${TMDB_IMAGE_BASE}/w92${item.poster_path}`}
                          alt={('title' in item ? item.title : item.name) || 'Media'}
                          fill
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="item-info flex-1">
                      <span className="item-name text-sm font-bold text-white block">
                        {'title' in item ? item.title : item.name}
                      </span>
                      <span className="item-meta font-mono text-[0.65rem] text-[#888]">
                        {('title' in item ? item.release_date?.split('-')[0] : item.first_air_date?.split('-')[0]) || 'N/A'} // 
                        {'title' in item ? 'MOVIE' : 'TV'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[#888] font-mono text-xs">No favorites</div>
            )}
          </div>
        </div>
      </section>

      {/* Trending Section */}
      {trendingToday.length > 0 && (
        <section className="px-16 py-16 animate-reveal" style={{ animationDelay: '0.2s' }}>
          <div className="grid-header flex items-baseline gap-8 mb-8">
            <h2 className="text-3xl font-black uppercase text-white">Trending Now</h2>
            <span className="font-mono text-xs text-[#888]">VIEW ALL COLLECTIONS →</span>
          </div>
          
          <div className="movie-grid grid grid-cols-4 gap-6">
            {trendingToday.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="movie-card aspect-[2/3] bg-[#0a0a0a] relative border border-[#1a1a1a] overflow-hidden transition-all duration-500 hover:border-[rgba(255,255,255,0.4)] hover:-translate-y-2.5 cursor-pointer group"
                onClick={() => router.push(`/details/${item.id}?type=${'title' in item ? 'movie' : 'tv'}`)}
              >
                <div className="w-full h-full relative">
                  {item.poster_path ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
                      alt={('title' in item ? item.title : item.name) || 'Media'}
                      fill
                      className="object-cover brightness-[0.7] transition-all duration-800 group-hover:scale-110 group-hover:brightness-100"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222]"></div>
                  )}
                </div>
                <div className="card-details absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 to-transparent opacity-0 translate-y-5 transition-all duration-400 group-hover:opacity-100 group-hover:translate-y-0">
                  <span className="label font-mono text-[0.5rem] tracking-[2px] text-[#888] block mb-2">
                    {('title' in item ? item.release_date?.split('-')[0] : item.first_air_date?.split('-')[0]) || 'N/A'} // {item.vote_average?.toFixed(1)}
                  </span>
                  <h3 className="text-xl uppercase font-bold text-white">
                    {'title' in item ? item.title : item.name}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <section className="px-16 py-16 animate-reveal" style={{ animationDelay: '0.3s' }}>
          <div className="grid-header flex items-baseline gap-8 mb-8">
            <h2 className="text-3xl font-black uppercase text-white">Recommendations for You</h2>
            <span className="font-mono text-xs text-[#888]">PERSONALIZED →</span>
          </div>
          
          <div className="movie-grid grid grid-cols-4 gap-6">
            {recommendations.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="movie-card aspect-[2/3] bg-[#0a0a0a] relative border border-[#1a1a1a] overflow-hidden transition-all duration-500 hover:border-[rgba(255,255,255,0.4)] hover:-translate-y-2.5 cursor-pointer group"
                onClick={() => router.push(`/details/${item.id}?type=${'title' in item ? 'movie' : 'tv'}`)}
              >
                <div className="w-full h-full relative">
                  {item.poster_path ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
                      alt={('title' in item ? item.title : item.name) || 'Media'}
                      fill
                      className="object-cover brightness-[0.7] transition-all duration-800 group-hover:scale-110 group-hover:brightness-100"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222]"></div>
                  )}
                </div>
                <div className="card-details absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 to-transparent opacity-0 translate-y-5 transition-all duration-400 group-hover:opacity-100 group-hover:translate-y-0">
                  <span className="label font-mono text-[0.5rem] tracking-[2px] text-[#888] block mb-2">
                    {('title' in item ? item.release_date?.split('-')[0] : item.first_air_date?.split('-')[0]) || 'N/A'} // {item.vote_average?.toFixed(1)}
                  </span>
                  <h3 className="text-xl uppercase font-bold text-white">
                    {'title' in item ? item.title : item.name}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Latest Releases */}
      {latestReleases.length > 0 && (
        <section className="px-16 py-16 animate-reveal" style={{ animationDelay: '0.4s' }}>
          <div className="grid-header flex items-baseline gap-8 mb-8">
            <h2 className="text-3xl font-black uppercase text-white">Latest Releases</h2>
            <span className="font-mono text-xs text-[#888]">VIEW ALL →</span>
          </div>
          
          <div className="movie-grid grid grid-cols-4 gap-6">
            {latestReleases.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="movie-card aspect-[2/3] bg-[#0a0a0a] relative border border-[#1a1a1a] overflow-hidden transition-all duration-500 hover:border-[rgba(255,255,255,0.4)] hover:-translate-y-2.5 cursor-pointer group"
                onClick={() => router.push(`/details/${item.id}?type=movie`)}
              >
                <div className="w-full h-full relative">
                  {item.poster_path ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
                      alt={item.title || 'Movie'}
                      fill
                      className="object-cover brightness-[0.7] transition-all duration-800 group-hover:scale-110 group-hover:brightness-100"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222]"></div>
                  )}
                </div>
                  <div className="card-details absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 to-transparent opacity-0 translate-y-5 transition-all duration-400 group-hover:opacity-100 group-hover:translate-y-0">
                    <span className="label font-mono text-[0.5rem] tracking-[2px] text-[#888] block mb-2">
                      {item.release_date?.split('-')[0] || 'N/A'}
                    </span>
                    <h3 className="text-xl uppercase font-bold text-white">
                      {item.title}
                    </h3>
                  </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Movies */}
      {upcomingMovies.length > 0 && (
        <section className="px-16 py-16 animate-reveal" style={{ animationDelay: '0.5s' }}>
          <div className="grid-header flex items-baseline gap-8 mb-8">
            <h2 className="text-3xl font-black uppercase text-white">Coming Soon</h2>
            <span className="font-mono text-xs text-[#888]">UPCOMING →</span>
          </div>
          
          <div className="movie-grid grid grid-cols-4 gap-6">
            {upcomingMovies.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="movie-card aspect-[2/3] bg-[#0a0a0a] relative border border-[#1a1a1a] overflow-hidden transition-all duration-500 hover:border-[rgba(255,255,255,0.4)] hover:-translate-y-2.5 cursor-pointer group"
                onClick={() => router.push(`/details/${item.id}?type=movie`)}
              >
                <div className="w-full h-full relative">
                  {item.poster_path ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
                      alt={item.title}
                      fill
                      className="object-cover brightness-[0.7] transition-all duration-800 group-hover:scale-110 group-hover:brightness-100"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222]"></div>
                  )}
                </div>
                <div className="card-details absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 to-transparent opacity-0 translate-y-5 transition-all duration-400 group-hover:opacity-100 group-hover:translate-y-0">
                  <span className="label font-mono text-[0.5rem] tracking-[2px] text-[#888] block mb-2">
                    {item.release_date?.split('-')[0]} // {item.vote_average?.toFixed(1)}
                  </span>
                  <h3 className="text-xl uppercase font-bold text-white">{item.title}</h3>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Airing Now */}
      {onTheAirTV.length > 0 && (
        <section className="px-16 py-16 animate-reveal" style={{ animationDelay: '0.6s' }}>
          <div className="grid-header flex items-baseline gap-8 mb-8">
            <h2 className="text-3xl font-black uppercase text-white">Airing Now</h2>
            <span className="font-mono text-xs text-[#888]">CURRENT →</span>
          </div>
          
          <div className="movie-grid grid grid-cols-4 gap-6">
            {onTheAirTV.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="movie-card aspect-[2/3] bg-[#0a0a0a] relative border border-[#1a1a1a] overflow-hidden transition-all duration-500 hover:border-[rgba(255,255,255,0.4)] hover:-translate-y-2.5 cursor-pointer group"
                onClick={() => router.push(`/details/${item.id}?type=tv`)}
              >
                <div className="w-full h-full relative">
                  {item.poster_path ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
                      alt={item.name}
                      fill
                      className="object-cover brightness-[0.7] transition-all duration-800 group-hover:scale-110 group-hover:brightness-100"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222]"></div>
                  )}
                </div>
                <div className="card-details absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 to-transparent opacity-0 translate-y-5 transition-all duration-400 group-hover:opacity-100 group-hover:translate-y-0">
                  <span className="label font-mono text-[0.5rem] tracking-[2px] text-[#888] block mb-2">
                    {item.first_air_date?.split('-')[0]} // {item.vote_average?.toFixed(1)}
                  </span>
                  <h3 className="text-xl uppercase font-bold text-white">{item.name}</h3>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Popular TV */}
      {popularTV.length > 0 && (
        <section className="px-16 py-16 animate-reveal" style={{ animationDelay: '0.7s' }}>
          <div className="grid-header flex items-baseline gap-8 mb-8">
            <h2 className="text-3xl font-black uppercase text-white">Popular TV Shows</h2>
            <span className="font-mono text-xs text-[#888]">TRENDING →</span>
          </div>
          
          <div className="movie-grid grid grid-cols-4 gap-6">
            {popularTV.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="movie-card aspect-[2/3] bg-[#0a0a0a] relative border border-[#1a1a1a] overflow-hidden transition-all duration-500 hover:border-[rgba(255,255,255,0.4)] hover:-translate-y-2.5 cursor-pointer group"
                onClick={() => router.push(`/details/${item.id}?type=tv`)}
              >
                <div className="w-full h-full relative">
                  {item.poster_path ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
                      alt={item.name}
                      fill
                      className="object-cover brightness-[0.7] transition-all duration-800 group-hover:scale-110 group-hover:brightness-100"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222]"></div>
                  )}
                </div>
                <div className="card-details absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 to-transparent opacity-0 translate-y-5 transition-all duration-400 group-hover:opacity-100 group-hover:translate-y-0">
                  <span className="label font-mono text-[0.5rem] tracking-[2px] text-[#888] block mb-2">
                    {item.first_air_date?.split('-')[0]} // {item.vote_average?.toFixed(1)}
                  </span>
                  <h3 className="text-xl uppercase font-bold text-white">{item.name}</h3>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top Rated TV */}
      {topRatedTV.length > 0 && (
        <section className="px-16 py-16 animate-reveal" style={{ animationDelay: '0.8s' }}>
          <div className="grid-header flex items-baseline gap-8 mb-8">
            <h2 className="text-3xl font-black uppercase text-white">Top Rated TV</h2>
            <span className="font-mono text-xs text-[#888]">ELITE →</span>
          </div>
          
          <div className="movie-grid grid grid-cols-4 gap-6">
            {topRatedTV.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="movie-card aspect-[2/3] bg-[#0a0a0a] relative border border-[#1a1a1a] overflow-hidden transition-all duration-500 hover:border-[rgba(255,255,255,0.4)] hover:-translate-y-2.5 cursor-pointer group"
                onClick={() => router.push(`/details/${item.id}?type=tv`)}
              >
                <div className="w-full h-full relative">
                  {item.poster_path ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
                      alt={item.name}
                      fill
                      className="object-cover brightness-[0.7] transition-all duration-800 group-hover:scale-110 group-hover:brightness-100"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222]"></div>
                  )}
                </div>
                <div className="card-details absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 to-transparent opacity-0 translate-y-5 transition-all duration-400 group-hover:opacity-100 group-hover:translate-y-0">
                  <span className="label font-mono text-[0.5rem] tracking-[2px] text-[#888] block mb-2">
                    {item.first_air_date?.split('-')[0]} // {item.vote_average?.toFixed(1)}
                  </span>
                  <h3 className="text-xl uppercase font-bold text-white">{item.name}</h3>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Popular Movies */}
      {popularMovies.length > 0 && (
        <section className="px-16 py-16 animate-reveal" style={{ animationDelay: '0.9s' }}>
          <div className="grid-header flex items-baseline gap-8 mb-8">
            <h2 className="text-3xl font-black uppercase text-white">Popular Movies</h2>
            <span className="font-mono text-xs text-[#888]">TRENDING →</span>
          </div>
          
          <div className="movie-grid grid grid-cols-4 gap-6">
            {popularMovies.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="movie-card aspect-[2/3] bg-[#0a0a0a] relative border border-[#1a1a1a] overflow-hidden transition-all duration-500 hover:border-[rgba(255,255,255,0.4)] hover:-translate-y-2.5 cursor-pointer group"
                onClick={() => router.push(`/details/${item.id}?type=movie`)}
              >
                <div className="w-full h-full relative">
                  {item.poster_path ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
                      alt={item.title}
                      fill
                      className="object-cover brightness-[0.7] transition-all duration-800 group-hover:scale-110 group-hover:brightness-100"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222]"></div>
                  )}
                </div>
                <div className="card-details absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 to-transparent opacity-0 translate-y-5 transition-all duration-400 group-hover:opacity-100 group-hover:translate-y-0">
                  <span className="label font-mono text-[0.5rem] tracking-[2px] text-[#888] block mb-2">
                    {item.release_date?.split('-')[0]} // {item.vote_average?.toFixed(1)}
                  </span>
                  <h3 className="text-xl uppercase font-bold text-white">{item.title}</h3>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Now Playing Movies */}
      {nowPlayingMovies.length > 0 && (
        <section className="px-16 py-16 animate-reveal" style={{ animationDelay: '1s' }}>
          <div className="grid-header flex items-baseline gap-8 mb-8">
            <h2 className="text-3xl font-black uppercase text-white">New Releases</h2>
            <span className="font-mono text-xs text-[#888]">FRESH →</span>
          </div>
          
          <div className="movie-grid grid grid-cols-4 gap-6">
            {nowPlayingMovies.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="movie-card aspect-[2/3] bg-[#0a0a0a] relative border border-[#1a1a1a] overflow-hidden transition-all duration-500 hover:border-[rgba(255,255,255,0.4)] hover:-translate-y-2.5 cursor-pointer group"
                onClick={() => router.push(`/details/${item.id}?type=movie`)}
              >
                <div className="w-full h-full relative">
                  {item.poster_path ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
                      alt={item.title}
                      fill
                      className="object-cover brightness-[0.7] transition-all duration-800 group-hover:scale-110 group-hover:brightness-100"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222]"></div>
                  )}
                </div>
                <div className="card-details absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 to-transparent opacity-0 translate-y-5 transition-all duration-400 group-hover:opacity-100 group-hover:translate-y-0">
                  <span className="label font-mono text-[0.5rem] tracking-[2px] text-[#888] block mb-2">
                    {item.release_date?.split('-')[0]} // {item.vote_average?.toFixed(1)}
                  </span>
                  <h3 className="text-xl uppercase font-bold text-white">{item.title}</h3>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top Rated Movies */}
      {topRatedMovies.length > 0 && (
        <section className="px-16 py-16 animate-reveal" style={{ animationDelay: '1.1s' }}>
          <div className="grid-header flex items-baseline gap-8 mb-8">
            <h2 className="text-3xl font-black uppercase text-white">Top Rated Movies</h2>
            <span className="font-mono text-xs text-[#888]">ELITE →</span>
          </div>
          
          <div className="movie-grid grid grid-cols-4 gap-6">
            {topRatedMovies.slice(0, 12).map((item) => (
              <div
                key={item.id}
                className="movie-card aspect-[2/3] bg-[#0a0a0a] relative border border-[#1a1a1a] overflow-hidden transition-all duration-500 hover:border-[rgba(255,255,255,0.4)] hover:-translate-y-2.5 cursor-pointer group"
                onClick={() => router.push(`/details/${item.id}?type=movie`)}
              >
                <div className="w-full h-full relative">
                  {item.poster_path ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
                      alt={item.title}
                      fill
                      className="object-cover brightness-[0.7] transition-all duration-800 group-hover:scale-110 group-hover:brightness-100"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222]"></div>
                  )}
                </div>
                <div className="card-details absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 to-transparent opacity-0 translate-y-5 transition-all duration-400 group-hover:opacity-100 group-hover:translate-y-0">
                  <span className="label font-mono text-[0.5rem] tracking-[2px] text-[#888] block mb-2">
                    {item.release_date?.split('-')[0]} // {item.vote_average?.toFixed(1)}
                  </span>
                  <h3 className="text-xl uppercase font-bold text-white">{item.title}</h3>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

