'use client';

import { useState, useEffect, useRef } from 'react';
import Carousel from '@/components/Carousel';
import Hero from '@/components/Hero';
import CarouselSkeleton, { HomePageSkeleton } from '@/components/CarouselSkeleton';
import { tmdb } from '@/lib/tmdb';
import { watchProgress } from '@/lib/watchProgress';
import { notifications } from '@/lib/notifications';
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
  const [animeTV, setAnimeTV] = useState<TVShow[]>([]);
  const [recommendations, setRecommendations] = useState<(Movie | TVShow)[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Track previous state for notifications
  const prevRecommendationsCountRef = useRef(0);
  const prevTrendingIdsRef = useRef<Set<number>>(new Set());
  const prevLatestReleaseIdsRef = useRef<Set<number>>(new Set());

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
                  console.error(`Failed to load continue watching item ${item.id}:`, error);
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
              
              setContinueWatching(uniqueDetails);
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
        const [latest, movies, tv, topRatedM, topRatedT, nowPlaying, onTheAir, trending, upcoming, anime] = await Promise.all([
          tmdb.getLatestReleases(),
          tmdb.getPopularMovies(),
          tmdb.getPopularTV(),
          tmdb.getTopRatedMovies(),
          tmdb.getTopRatedTV(),
          tmdb.getNowPlayingMovies(),
          tmdb.getOnTheAirTV(),
          tmdb.getTrendingAll('day'),
          tmdb.getUpcomingMovies(),
          tmdb.getAnimeTV(),
        ]);
        setLatestReleases(latest);
        setPopularMovies(movies);
        setPopularTV(tv);
        setTopRatedMovies(topRatedM);
        setTopRatedTV(topRatedT);
        setNowPlayingMovies(nowPlaying);
        setOnTheAirTV(onTheAir);
        setTrendingToday(trending);
        setUpcomingMovies(upcoming);
        setAnimeTV(anime);
        
        // Check for trending updates
        if (trending.length > 0) {
          prevTrendingIdsRef.current = notifications.checkTrendingUpdates(trending, prevTrendingIdsRef.current);
        }
        
        // Check for what's new (latest releases)
        if (latest.length > 0) {
          prevLatestReleaseIdsRef.current = notifications.checkWhatsNew(latest, prevLatestReleaseIdsRef.current);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
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
        
        const personalizedRecs = await tmdb.getPersonalizedRecommendations(uniqueHistoryItems);
        setRecommendations(personalizedRecs);
        
        // Check for new recommendations
        if (personalizedRecs.length > prevRecommendationsCountRef.current && prevRecommendationsCountRef.current > 0) {
          notifications.checkNewRecommendations(personalizedRecs, prevRecommendationsCountRef.current);
        }
        prevRecommendationsCountRef.current = personalizedRecs.length;
      } catch (error) {
        console.error('Failed to load recommendations:', error);
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

      {/* Anime Section */}
      {animeTV.length > 0 && (
        <div className="px-4 sm:px-6 lg:px-8">
          <Carousel title="Anime" items={animeTV} id="anime" />
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
