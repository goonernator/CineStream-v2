'use client';

import { useState, useEffect } from 'react';
import Carousel from '@/components/Carousel';
import CarouselSkeleton from '@/components/CarouselSkeleton';
import { tmdb } from '@/lib/tmdb';
import { filterValidMedia } from '@/lib/mediaFilter';
import type { Movie, TVShow, DiscoverFilters } from '@/lib/types';

// Helper function to shuffle array (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Helper to get random page (1-5 for variety)
function getRandomPage(): number {
  return Math.floor(Math.random() * 5) + 1;
}

export default function AnimePage() {
  const [carousels, setCarousels] = useState<Array<{ title: string; items: (Movie | TVShow)[]; id: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAnimeData = async () => {
      try {
        setLoading(true);
        
        // Get random pages for variety
        const randomPages = Array.from({ length: 8 }, () => getRandomPage());
        
        // Load all anime carousels in parallel with different sorting/filtering
        const [
          popularTV,
          topRatedTV,
          latestTV,
          popularMovies,
          topRatedMovies,
          latestMovies,
          airingTV,
          upcomingMovies,
        ] = await Promise.all([
          // Popular Anime TV Shows
          tmdb.discoverTV({
            with_genres: '16',
            with_original_language: 'ja',
            sort_by: 'popularity.desc',
            page: randomPages[0],
          } as DiscoverFilters),
          // Top Rated Anime TV Shows
          tmdb.discoverTV({
            with_genres: '16',
            with_original_language: 'ja',
            sort_by: 'vote_average.desc',
            'vote_average.gte': 7,
            page: randomPages[1],
          } as DiscoverFilters),
          // Latest Anime TV Shows
          tmdb.discoverTV({
            with_genres: '16',
            with_original_language: 'ja',
            sort_by: 'first_air_date.desc',
            page: randomPages[2],
          } as DiscoverFilters),
          // Popular Anime Movies
          tmdb.discoverMovies({
            with_genres: '16',
            with_original_language: 'ja',
            sort_by: 'popularity.desc',
            page: randomPages[3],
          } as DiscoverFilters),
          // Top Rated Anime Movies
          tmdb.discoverMovies({
            with_genres: '16',
            with_original_language: 'ja',
            sort_by: 'vote_average.desc',
            'vote_average.gte': 7,
            page: randomPages[4],
          } as DiscoverFilters),
          // Latest Anime Movies
          tmdb.discoverMovies({
            with_genres: '16',
            with_original_language: 'ja',
            sort_by: 'release_date.desc',
            page: randomPages[5],
          } as DiscoverFilters),
          // Airing Now Anime TV
          tmdb.discoverTV({
            with_genres: '16',
            with_original_language: 'ja',
            sort_by: 'first_air_date.desc',
            'first_air_date.gte': new Date().toISOString().split('T')[0],
            page: randomPages[6],
          } as DiscoverFilters),
          // Upcoming Anime Movies
          tmdb.discoverMovies({
            with_genres: '16',
            with_original_language: 'ja',
            sort_by: 'release_date.desc',
            'primary_release_date.gte': new Date().toISOString().split('T')[0],
            page: randomPages[7],
          } as DiscoverFilters),
        ]);

        // Build carousel data with shuffled results for variety, filtered for valid media
        const carouselData = [
          { title: 'Popular TV Shows', items: filterValidMedia(shuffleArray(popularTV.results)).slice(0, 20), id: 'popular-tv' },
          { title: 'Top Rated TV Shows', items: filterValidMedia(shuffleArray(topRatedTV.results)).slice(0, 20), id: 'top-rated-tv' },
          { title: 'Latest TV Shows', items: filterValidMedia(shuffleArray(latestTV.results)).slice(0, 20), id: 'latest-tv' },
          { title: 'Airing Now', items: filterValidMedia(shuffleArray(airingTV.results)).slice(0, 20), id: 'airing-now' },
          { title: 'Popular Movies', items: filterValidMedia(shuffleArray(popularMovies.results)).slice(0, 20), id: 'popular-movies' },
          { title: 'Top Rated Movies', items: filterValidMedia(shuffleArray(topRatedMovies.results)).slice(0, 20), id: 'top-rated-movies' },
          { title: 'Latest Movies', items: filterValidMedia(shuffleArray(latestMovies.results)).slice(0, 20), id: 'latest-movies' },
          { title: 'Coming Soon', items: filterValidMedia(shuffleArray(upcomingMovies.results)).slice(0, 20), id: 'coming-soon' },
        ].filter(carousel => carousel.items.length > 0); // Only include carousels with items

        // Shuffle the order of carousels for variety
        setCarousels(shuffleArray(carouselData));
      } catch (error) {
        console.error('Failed to load anime data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAnimeData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={i > 0 ? 'mt-8' : ''}>
              <CarouselSkeleton title={true} itemCount={7} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {carousels.map((carousel, index) => (
        <div key={carousel.id} className={index > 0 ? '' : ''}>
          <div className="px-4 sm:px-6 lg:px-8">
            <Carousel title={carousel.title} items={carousel.items} id={carousel.id} />
          </div>
        </div>
      ))}
      {carousels.length > 0 && <div className="pb-12" />}
    </div>
  );
}

