'use client';

import { useState, useEffect, useRef } from 'react';
import Carousel from '@/components/Carousel';
import Hero from '@/components/Hero';
import CarouselSkeleton, { HomePageSkeleton } from '@/components/CarouselSkeleton';
import { tmdb } from '@/lib/tmdb';
import { watchProgress } from '@/lib/watchProgress';
import { notifications } from '@/lib/notifications';
import { filterValidMedia } from '@/lib/mediaFilter';
import { logger } from '@/lib/logger';
import { auth } from '@/lib/auth';
import type { Movie, TVShow } from '@/lib/types';

export default function Home() {
  const [latestReleases, setLatestReleases] = useState<Movie[]>([]);
  const [popularMovies, setPopularMovies] = useState<Movie[]>([]);
  const [popularTV, setPopularTV] = useState<TVShow[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<Movie[]>([]);
  const [topRatedTV, setTopRatedTV] = useState<TVShow[]>([]);
  const [nowPlayingMovies, setNowPlayingMovies] = useState<Movie[]>([]);
  const [onTheAirTV, setOnTheAirTV] = useState<TVShow[]>([]);
  const [continueWatching, setContinueWatching] = useState<(Movie | TVShow)[]>([]);
  const [continueWatchingLoading, setContinueWatchingLoading] = useState(true);
  const [trendingToday, setTrendingToday] = useState<(Movie | TVShow)[]>([]);
  const [upcomingMovies, setUpcomingMovies] = useState<Movie[]>([]);
  const [recommendations, setRecommendations] = useState<(Movie | TVShow)[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Track previous state for notifications
  const prevRecommendationsCountRef = useRef(0);
  const prevTrendingIdsRef = useRef<Set<number>>(new Set());
  const prevLatestReleaseIdsRef = useRef<Set<number>>(new Set());
  const notificationCooldownRef = useRef<number>(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load continue watching first (ensure we're on client)
        if (typeof window !== 'undefined') {
          setContinueWatchingLoading(true);
          try {
            const continueItems = watchProgress.getContinueWatching();
            
            // Load details for continue watching items
            if (continueItems.length > 0) {
              // Load all items in parallel for better performance
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
              
              // Deduplicate by ID (same TV show can have multiple episodes in continue watching)
              const seenIds = new Set<number>();
              const uniqueDetails = validDetails.filter((detail) => {
                if (seenIds.has(detail.id)) {
                  return false;
                }
                seenIds.add(detail.id);
                return true;
              });
              
              // Filter out items without thumbnails or ratings
              const filteredDetails = filterValidMedia(uniqueDetails);
              setContinueWatching(filteredDetails);
              
              // Check for continue watching notifications (includes new episode checking)
              // Only check if enough time has passed since last check (cooldown)
              const now = Date.now();
              if (filteredDetails.length > 0 && now - notificationCooldownRef.current > 5 * 60 * 1000) {
                notificationCooldownRef.current = now;
                notifications.checkContinueWatching(filteredDetails, tmdb);
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
        } else {
          setContinueWatchingLoading(false);
        }

        // Load other categories including new ones
        const [latest, movies, tv, topRatedM, topRatedT, nowPlaying, onTheAir, trending, upcoming] = await Promise.all([
          tmdb.getLatestReleases(),
          tmdb.getPopularMovies(),
          tmdb.getPopularTV(),
          tmdb.getTopRatedMovies(),
          tmdb.getTopRatedTV(),
          tmdb.getNowPlayingMovies(),
          tmdb.getOnTheAirTV(),
          tmdb.getTrendingAll('day'),
          tmdb.getUpcomingMovies(),
        ]);
        setLatestReleases(filterValidMedia(latest));
        setPopularMovies(filterValidMedia(movies));
        setPopularTV(filterValidMedia(tv));
        setTopRatedMovies(filterValidMedia(topRatedM));
        setTopRatedTV(filterValidMedia(topRatedT));
        setNowPlayingMovies(filterValidMedia(nowPlaying));
        setOnTheAirTV(filterValidMedia(onTheAir));
        setTrendingToday(filterValidMedia(trending));
        setUpcomingMovies(filterValidMedia(upcoming));
        
            // Check for trending updates (only if we have previous state to compare)
            if (trending.length > 0 && prevTrendingIdsRef.current.size > 0) {
              prevTrendingIdsRef.current = notifications.checkTrendingUpdates(trending, prevTrendingIdsRef.current);
            } else if (trending.length > 0) {
              // Initialize previous state without sending notification
              prevTrendingIdsRef.current = new Set(trending.map(item => item.id));
            }
            
            // Check for what's new (latest releases) (only if we have previous state to compare)
            if (latest.length > 0 && prevLatestReleaseIdsRef.current.size > 0) {
              prevLatestReleaseIdsRef.current = notifications.checkWhatsNew(latest, prevLatestReleaseIdsRef.current);
            } else if (latest.length > 0) {
              // Initialize previous state without sending notification
              prevLatestReleaseIdsRef.current = new Set(latest.map(item => item.id));
            }
      } catch (error) {
        logger.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Load recommendations separately (non-blocking) after main data loads
    const loadRecommendations = async () => {
      try {
        if (typeof window === 'undefined') return;
        
        setRecommendationsLoading(true);
        const watchHistory = watchProgress.getAllProgress();
        if (watchHistory.length === 0) {
          // No watch history - skip recommendations
          setRecommendations([]);
          setRecommendationsLoading(false);
          return;
        }
        
        const watchHistoryItems = watchHistory
          .slice(0, 10) // Get top 10 most recent items
          .map(item => ({ id: item.id, type: item.type }));
        
        // Remove duplicates by ID
        const uniqueHistoryItems = watchHistoryItems.filter((item, index, self) =>
          index === self.findIndex(t => t.id === item.id && t.type === item.type)
        );
        
        if (uniqueHistoryItems.length === 0) {
          setRecommendations([]);
          setRecommendationsLoading(false);
          return;
        }

        // Load watch history details for better recommendations
        const watchHistoryDetailsPromises = uniqueHistoryItems.map(async (item) => {
          try {
            if (item.type === 'movie') {
              return await tmdb.getMovieDetails(item.id);
            } else {
              return await tmdb.getTVDetails(item.id);
            }
          } catch (error) {
            logger.error(`Failed to load details for ${item.type} ${item.id}:`, error);
            return null;
          }
        });

        const watchHistoryDetails = (await Promise.all(watchHistoryDetailsPromises))
          .filter((item): item is Movie | TVShow => item !== null);

        // Get favorites and watchlist if authenticated
        const authState = auth.getAuthState();
        let favorites: (Movie | TVShow)[] = [];
        let watchlist: (Movie | TVShow)[] = [];

        if (authState.isAuthenticated && authState.sessionId && authState.accountId) {
          try {
            [favorites, watchlist] = await Promise.all([
              tmdb.getFavorites(authState.sessionId, authState.accountId).catch(() => []),
              tmdb.getWatchlist(authState.sessionId, authState.accountId).catch(() => []),
            ]);
          } catch (error) {
            logger.error('Failed to load favorites/watchlist for recommendations:', error);
          }
        }
        
        const personalizedRecs = await tmdb.getPersonalizedRecommendations(uniqueHistoryItems, {
          watchHistoryDetails,
          favorites,
          watchlist,
          sessionId: authState.sessionId || undefined,
          accountId: authState.accountId || undefined,
        });
        
        setRecommendations(filterValidMedia(personalizedRecs));
        
        // Check for new recommendations
        if (personalizedRecs.length > prevRecommendationsCountRef.current && prevRecommendationsCountRef.current > 0) {
          notifications.checkNewRecommendations(personalizedRecs, prevRecommendationsCountRef.current);
        }
        prevRecommendationsCountRef.current = personalizedRecs.length;
      } catch (error) {
        logger.error('Failed to load recommendations:', error);
        setRecommendations([]);
      } finally {
        setRecommendationsLoading(false);
      }
    };

    // Load recommendations after a short delay to avoid blocking
    const recommendationsTimeout = setTimeout(loadRecommendations, 500);
    
    return () => {
      clearTimeout(recommendationsTimeout);
    };
  }, []);

  if (loading) {
    return <HomePageSkeleton />;
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <Hero />

      {/* Continue Watching - Show loading or items */}
      {continueWatchingLoading ? (
        <div className="px-4 sm:px-6 lg:px-8 mb-8">
          <CarouselSkeleton title={true} itemCount={7} />
        </div>
      ) : continueWatching.length > 0 ? (
        <div className="px-4 sm:px-6 lg:px-8 mb-8" data-tour="continue-watching">
          <Carousel title="Continue Watching" items={continueWatching} id="continue-watching" />
        </div>
      ) : null}

      {/* Recommendations - Show loading or items */}
      {recommendationsLoading ? (
        <div className="px-4 sm:px-6 lg:px-8 mb-8">
          <CarouselSkeleton title={true} itemCount={7} />
        </div>
      ) : recommendations.length > 0 ? (
        <div className="px-4 sm:px-6 lg:px-8 mb-8">
          <Carousel title="Recommendations for You" items={recommendations} id="recommendations" />
        </div>
      ) : null}

      {/* Trending Today */}
      {trendingToday.length > 0 && (
        <div className="px-4 sm:px-6 lg:px-8">
          <Carousel title="Trending Today" items={trendingToday} id="trending-today" />
        </div>
      )}

      {/* Latest Releases */}
      <div className="px-4 sm:px-6 lg:px-8">
        <Carousel title="Latest Releases" items={latestReleases} id="latest" />
      </div>

      {/* Upcoming Movies */}
      {upcomingMovies.length > 0 && (
        <div className="px-4 sm:px-6 lg:px-8">
          <Carousel title="Coming Soon" items={upcomingMovies} id="upcoming-movies" />
        </div>
      )}

      {/* Airing Now */}
      <div className="px-4 sm:px-6 lg:px-8">
        <Carousel title="Airing Now" items={onTheAirTV} id="airing-now" />
      </div>

      {/* TV Shows Section */}
      <div className="px-4 sm:px-6 lg:px-8 mt-12 mb-4">
        <h2 className="text-3xl font-bold text-netflix-light flex items-center gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
            <polyline points="17 2 12 7 7 2"/>
          </svg>
          TV Shows
        </h2>
      </div>

      {/* Popular TV */}
      <div className="px-4 sm:px-6 lg:px-8">
        <Carousel title="Popular" items={popularTV} id="popular-tv" />
      </div>

      {/* Top Rated TV */}
      <div className="px-4 sm:px-6 lg:px-8">
        <Carousel title="Top Rated" items={topRatedTV} id="top-rated-tv" />
      </div>

      {/* Movies Section */}
      <div className="px-4 sm:px-6 lg:px-8 mt-12 mb-4">
        <h2 className="text-3xl font-bold text-netflix-light flex items-center gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
            <line x1="7" y1="2" x2="7" y2="22"/>
            <line x1="17" y1="2" x2="17" y2="22"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
          </svg>
          Movies
        </h2>
      </div>

      {/* Popular Movies */}
      <div className="px-4 sm:px-6 lg:px-8">
        <Carousel title="Popular" items={popularMovies} id="popular-movies" />
      </div>

      {/* New Releases Movies */}
      <div className="px-4 sm:px-6 lg:px-8">
        <Carousel title="New Releases" items={nowPlayingMovies} id="new-releases-movies" />
      </div>

      {/* Top Rated Movies */}
      <div className="px-4 sm:px-6 lg:px-8 pb-12">
        <Carousel title="Top Rated" items={topRatedMovies} id="top-rated-movies" />
      </div>
    </div>
  );
}
