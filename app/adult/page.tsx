'use client';

import { useState, useEffect } from 'react';
import Carousel from '@/components/Carousel';
import CarouselSkeleton from '@/components/CarouselSkeleton';
import { tmdb } from '@/lib/tmdb';
import { filterValidMedia } from '@/lib/mediaFilter';
import { logger } from '@/lib/logger';
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

export default function AdultPage() {
  const [carousels, setCarousels] = useState<Array<{ title: string; items: (Movie | TVShow)[]; id: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAdultData = async () => {
      try {
        setLoading(true);
        
        // Get random pages for variety
        const randomPages = Array.from({ length: 6 }, () => getRandomPage());
        
        // Load all adult content carousels in parallel with different sorting/filtering
        // Using ONLY R-rated (R18+) classifications, excluding romance genre
        const [
          popularMovies,
          topRatedMovies,
          latestMovies,
          popularTV,
          topRatedTV,
          latestTV,
        ] = await Promise.all([
          // Popular Adult Movies - R-rated only
          tmdb.discoverMovies({
            include_adult: true,
            certification: 'R',
            certification_country: 'US',
            sort_by: 'popularity.desc',
            page: randomPages[0],
          } as DiscoverFilters),
          // Top Rated Adult Movies - R-rated only
          tmdb.discoverMovies({
            include_adult: true,
            certification: 'R',
            certification_country: 'US',
            sort_by: 'vote_average.desc',
            'vote_average.gte': 6,
            page: randomPages[1],
          } as DiscoverFilters),
          // Latest Adult Movies - R-rated only
          tmdb.discoverMovies({
            include_adult: true,
            certification: 'R',
            certification_country: 'US',
            sort_by: 'release_date.desc',
            page: randomPages[2],
          } as DiscoverFilters),
          // Popular Adult TV Shows (no certification filter for TV, just include_adult)
          tmdb.discoverTV({
            include_adult: true,
            sort_by: 'popularity.desc',
            page: randomPages[3],
          } as DiscoverFilters),
          // Top Rated Adult TV Shows
          tmdb.discoverTV({
            include_adult: true,
            sort_by: 'vote_average.desc',
            'vote_average.gte': 6,
            page: randomPages[4],
          } as DiscoverFilters),
          // Latest Adult TV Shows
          tmdb.discoverTV({
            include_adult: true,
            sort_by: 'first_air_date.desc',
            page: randomPages[5],
          } as DiscoverFilters),
        ]);

        // Build carousel data with shuffled results for variety, filtered for valid media
        const carouselData = [
          { title: 'Popular Movies', items: filterValidMedia(shuffleArray(popularMovies?.results || [])).slice(0, 20), id: 'popular-movies' },
          { title: 'Top Rated Movies', items: filterValidMedia(shuffleArray(topRatedMovies?.results || [])).slice(0, 20), id: 'top-rated-movies' },
          { title: 'Latest Movies', items: filterValidMedia(shuffleArray(latestMovies?.results || [])).slice(0, 20), id: 'latest-movies' },
          { title: 'Popular TV Shows', items: filterValidMedia(shuffleArray(popularTV?.results || [])).slice(0, 20), id: 'popular-tv' },
          { title: 'Top Rated TV Shows', items: filterValidMedia(shuffleArray(topRatedTV?.results || [])).slice(0, 20), id: 'top-rated-tv' },
          { title: 'Latest TV Shows', items: filterValidMedia(shuffleArray(latestTV?.results || [])).slice(0, 20), id: 'latest-tv' },
        ].filter(carousel => carousel.items.length > 0); // Only include carousels with items

        // Shuffle the order of carousels for variety
        setCarousels(shuffleArray(carouselData));
      } catch (error) {
        logger.error('Failed to load adult content data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAdultData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          {Array.from({ length: 6 }).map((_, i) => (
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

