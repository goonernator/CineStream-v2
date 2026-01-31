'use client';

import { useState, useEffect, useCallback } from 'react';
import FilterBar, { FilterState, defaultFilterState } from '@/components/FilterBar';
import MediaGrid from '@/components/MediaGrid';
import { BrowsePageSkeleton } from '@/components/CarouselSkeleton';
import { tmdb } from '@/lib/tmdb';
import type { Movie, Genre, DiscoverFilters } from '@/lib/types';

export default function BrowseMoviesPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [filters, setFilters] = useState<FilterState>(defaultFilterState);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [initialLoad, setInitialLoad] = useState(true);

  // Load genres on mount
  useEffect(() => {
    const loadGenres = async () => {
      try {
        const genreList = await tmdb.getMovieGenres();
        setGenres(genreList);
      } catch (error) {
        console.error('Failed to load genres:', error);
      }
    };
    loadGenres();
  }, []);

  // Build TMDB discover filters from our filter state
  const buildDiscoverFilters = useCallback((currentFilters: FilterState, currentPage: number): DiscoverFilters => {
    const discoverFilters: DiscoverFilters = {
      page: currentPage,
      sort_by: (currentFilters.sortBy || 'popularity.desc') as DiscoverFilters['sort_by'],
    };

    if (currentFilters.genre) {
      discoverFilters.with_genres = currentFilters.genre;
    }

    if (currentFilters.year) {
      discoverFilters.primary_release_year = parseInt(currentFilters.year);
    }

    if (currentFilters.rating) {
      discoverFilters['vote_average.gte'] = parseInt(currentFilters.rating);
    }

    return discoverFilters;
  }, []);

  // Load movies based on filters
  const loadMovies = useCallback(async (currentFilters: FilterState, currentPage: number, append: boolean = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const discoverFilters = buildDiscoverFilters(currentFilters, currentPage);
      const result = await tmdb.discoverMovies(discoverFilters);

      if (append) {
        setMovies(prev => [...prev, ...result.results]);
      } else {
        setMovies(result.results);
      }
      setTotalPages(result.total_pages);
      setPage(currentPage);
    } catch (error) {
      console.error('Failed to load movies:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setInitialLoad(false);
    }
  }, [buildDiscoverFilters]);

  // Initial load
  useEffect(() => {
    loadMovies(filters, 1, false);
  }, []);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setPage(1);
    loadMovies(newFilters, 1, false);
  }, [loadMovies]);

  // Load more for infinite scroll
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && page < totalPages) {
      loadMovies(filters, page + 1, true);
    }
  }, [loadingMore, page, totalPages, filters, loadMovies]);

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-netflix-light mb-2 flex items-center gap-3">
            <svg className="w-10 h-10 text-netflix-red" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
            </svg>
            Browse Movies
          </h1>
          <p className="text-netflix-gray">
            Discover movies from every genre, era, and rating
          </p>
        </div>

        {/* Filters */}
        <FilterBar
          genres={genres}
          filters={filters}
          onFilterChange={handleFilterChange}
          mediaType="movie"
          className="mb-8"
        />

        {/* Results count */}
        {!initialLoad && (
          <div className="mb-6 text-sm text-netflix-gray">
            Showing {movies.length} movies
            {page < totalPages && ` (page ${page} of ${totalPages})`}
          </div>
        )}

        {/* Movies Grid */}
        {initialLoad ? (
          <BrowsePageSkeleton />
        ) : (
          <MediaGrid
            items={movies}
            loading={loadingMore}
            hasMore={page < totalPages}
            onLoadMore={handleLoadMore}
            emptyMessage="No movies found matching your filters"
          />
        )}
      </div>
    </div>
  );
}
