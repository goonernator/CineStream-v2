'use client';

import { useState, useEffect, useRef, useCallback, ReactElement } from 'react';
import { useParams } from 'next/navigation';
import MediaGrid from '@/components/MediaGrid';
import { BrowsePageSkeleton } from '@/components/CarouselSkeleton';
import { MediaCardSkeletonGrid } from '@/components/MediaCardSkeleton';
import { tmdb } from '@/lib/tmdb';
import { filterValidMedia } from '@/lib/mediaFilter';
import { logger } from '@/lib/logger';
import type { Movie, TVShow, Genre } from '@/lib/types';

// Genre icons mapping
const genreIcons: Record<string, ReactElement> = {
  '28': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M13 4v2.67l-1 1-1-1V4h2m7 4v2h-2.09c-.05.33-.16.66-.33 1l1.48 1.48 1.42-1.42-1.42-1.42.71-.71L20.17 8H20m-2.59 6.5l-1.42 1.42 1.42 1.42-1.42 1.42-1.42-1.42L13 17.5v2h-2v-2l-1.56-1.56-1.42 1.42-1.42-1.42 1.42-1.42-1.42-1.42 1.42-1.42 1.42 1.42L11 12.5v-2h2v2l1.56 1.56 1.42-1.42 1.42 1.42z"/></svg>,
  '12': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>,
  '16': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zM8.5 8c.83 0 1.5.67 1.5 1.5S9.33 11 8.5 11 7 10.33 7 9.5 7.67 8 8.5 8zm3.5 9.5c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5zm3.5-6.5c-.83 0-1.5-.67-1.5-1.5S14.67 8 15.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>,
  '35': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>,
  '80': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>,
  '99': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>,
  '18': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/></svg>,
  '10751': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58C.48 14.9 0 15.62 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85-.85-.37-1.79-.58-2.78-.58-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/></svg>,
  '14': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>,
  '36': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>,
  '27': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v2h-2zm1.61-9.96c-2.06-.3-3.88.97-4.43 2.79-.18.58.26 1.17.87 1.17h.2c.41 0 .74-.29.88-.67.32-.89 1.27-1.5 2.3-1.28.95.2 1.65 1.13 1.57 2.1-.1 1.34-1.62 1.63-2.45 2.88 0 .01-.01.01-.01.02-.01.02-.02.03-.03.05-.09.15-.18.32-.25.5-.01.03-.03.05-.04.08-.01.02-.01.04-.02.07-.12.34-.2.75-.2 1.25h2c0-.42.11-.77.28-1.07.02-.03.03-.06.05-.09.08-.14.18-.27.28-.39.01-.01.02-.03.03-.04.1-.12.21-.23.33-.34.96-.91 2.26-1.65 1.99-3.56-.24-1.74-1.61-3.21-3.35-3.47z"/></svg>,
  '10402': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>,
  '9648': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>,
  '10749': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>,
  '878': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>,
  '53': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>,
  '10752': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><circle cx="12" cy="12" r="5"/></svg>,
  '37': <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>,
};

// Default icon for genres not in the map
const DefaultGenreIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z" />
  </svg>
);

// Filter items where this genre is their primary genre (first in genre_ids array)
function filterByPrimaryGenre<T extends Movie | TVShow>(items: T[], genreId: number): T[] {
  return items.filter(item => item.genre_ids?.[0] === genreId);
}

export default function GenrePage() {
  const params = useParams();
  const genreId = params.id as string;
  const genreIdNum = parseInt(genreId);
  
  const [genreName, setGenreName] = useState('');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [tvShows, setTVShows] = useState<TVShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<'movies' | 'tv'>('movies');
  
  // Pagination state
  const [moviePage, setMoviePage] = useState(1);
  const [tvPage, setTVPage] = useState(1);
  const [hasMoreMovies, setHasMoreMovies] = useState(true);
  const [hasMoreTV, setHasMoreTV] = useState(true);
  const [totalMovies, setTotalMovies] = useState(0);
  const [totalTV, setTotalTV] = useState(0);
  
  // Intersection observer ref for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    const loadInitialContent = async () => {
      try {
        setLoading(true);
        setMovies([]);
        setTVShows([]);
        setMoviePage(1);
        setTVPage(1);
        setHasMoreMovies(true);
        setHasMoreTV(true);
        
        // Load genre names
        const [movieGenres, tvGenres] = await Promise.all([
          tmdb.getMovieGenres(),
          tmdb.getTVGenres(),
        ]);
        
        const allGenres = [...movieGenres, ...tvGenres];
        const genre = allGenres.find(g => g.id.toString() === genreId);
        setGenreName(genre?.name || 'Genre');
        
        // Load initial pages - fetch multiple pages to ensure we have enough content after filtering
        const [moviesResult, tvResult] = await Promise.all([
          loadMoviesUntilMinimum(genreIdNum, 1, 20),
          loadTVUntilMinimum(genreIdNum, 1, 20),
        ]);
        
        setMovies(moviesResult.items);
        setTVShows(tvResult.items);
        setMoviePage(moviesResult.nextPage);
        setTVPage(tvResult.nextPage);
        setHasMoreMovies(moviesResult.hasMore);
        setHasMoreTV(tvResult.hasMore);
        setTotalMovies(moviesResult.total);
        setTotalTV(tvResult.total);
      } catch (error) {
        console.error('Failed to load genre content:', error);
      } finally {
        setLoading(false);
      }
    };

    if (genreId) {
      loadInitialContent();
    }
  }, [genreId, genreIdNum]);

  // Helper to load movies until we have minimum items (handles sparse primary genre filtering)
  const loadMoviesUntilMinimum = async (
    genreId: number, 
    startPage: number, 
    minItems: number
  ): Promise<{ items: Movie[]; nextPage: number; hasMore: boolean; total: number }> => {
    let items: Movie[] = [];
    let page = startPage;
    let hasMore = true;
    let totalPages = 500; // TMDB max

    while (items.length < minItems && hasMore && page <= totalPages) {
      const result = await tmdb.getMoviesByGenre(genreId, page);
      const filtered = filterByPrimaryGenre(result.results, genreId);
      const validItems = filterValidMedia(filtered);
      items = [...items, ...validItems];
      totalPages = result.total_pages;
      hasMore = page < totalPages;
      page++;
    }

    return { items, nextPage: page, hasMore, total: items.length };
  };

  // Helper to load TV shows until we have minimum items
  const loadTVUntilMinimum = async (
    genreId: number, 
    startPage: number, 
    minItems: number
  ): Promise<{ items: TVShow[]; nextPage: number; hasMore: boolean; total: number }> => {
    let items: TVShow[] = [];
    let page = startPage;
    let hasMore = true;
    let totalPages = 500;

    while (items.length < minItems && hasMore && page <= totalPages) {
      const result = await tmdb.getTVByGenre(genreId, page);
      const filtered = filterByPrimaryGenre(result.results, genreId);
      const validItems = filterValidMedia(filtered);
      items = [...items, ...validItems];
      totalPages = result.total_pages;
      hasMore = page < totalPages;
      page++;
    }

    return { items, nextPage: page, hasMore, total: items.length };
  };

  // Load more content
  const loadMore = useCallback(async () => {
    if (loadingMore) return;

    const isMovies = activeTab === 'movies';
    const hasMore = isMovies ? hasMoreMovies : hasMoreTV;
    const currentPage = isMovies ? moviePage : tvPage;

    if (!hasMore) return;

    setLoadingMore(true);

    try {
      if (isMovies) {
        const result = await loadMoviesUntilMinimum(genreIdNum, currentPage, 20);
        setMovies(prev => [...prev, ...result.items]);
        setMoviePage(result.nextPage);
        setHasMoreMovies(result.hasMore);
        setTotalMovies(prev => prev + result.items.length);
      } else {
        const result = await loadTVUntilMinimum(genreIdNum, currentPage, 20);
        setTVShows(prev => [...prev, ...result.items]);
        setTVPage(result.nextPage);
        setHasMoreTV(result.hasMore);
        setTotalTV(prev => prev + result.items.length);
      }
    } catch (error) {
      logger.error('Failed to load more content:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [activeTab, hasMoreMovies, hasMoreTV, moviePage, tvPage, genreIdNum, loadingMore]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [loadMore, loadingMore]);

  const getGenreIcon = () => {
    const icon = genreIcons[genreId];
    return icon || <DefaultGenreIcon />;
  };

  const hasMore = activeTab === 'movies' ? hasMoreMovies : hasMoreTV;
  const displayItems = activeTab === 'movies' ? movies : tvShows;

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="text-netflix-red">
                {getGenreIcon()}
              </div>
              <h1 className="text-4xl font-bold text-netflix-light">
                {loading ? 'Loading...' : genreName}
              </h1>
            </div>
            <p className="text-netflix-gray">
              Explore the best {genreName.toLowerCase()} {activeTab === 'movies' ? 'movies' : 'TV shows'}
              {!loading && (
                <span className="ml-2 text-sm">
                  ({activeTab === 'movies' ? movies.length : tvShows.length} found)
                </span>
              )}
            </p>
          </div>

          {/* Tab Buttons */}
          <div className="flex gap-2 mb-8">
            <button
              onClick={() => setActiveTab('movies')}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-200 ${
                activeTab === 'movies'
                  ? 'bg-netflix-red text-white'
                  : 'bg-netflix-dark/80 text-netflix-gray hover:text-netflix-light hover:bg-netflix-dark'
              }`}
            >
              Movies {!loading && `(${movies.length})`}
            </button>
            <button
              onClick={() => setActiveTab('tv')}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-200 ${
                activeTab === 'tv'
                  ? 'bg-netflix-red text-white'
                  : 'bg-netflix-dark/80 text-netflix-gray hover:text-netflix-light hover:bg-netflix-dark'
              }`}
            >
              TV Shows {!loading && `(${tvShows.length})`}
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <BrowsePageSkeleton />
          ) : (
            <>
              <MediaGrid
                items={displayItems}
                emptyMessage={`No ${genreName.toLowerCase()} ${activeTab === 'movies' ? 'movies' : 'TV shows'} found with this as their primary genre`}
              />

              {/* Load more trigger / Loading indicator */}
              <div ref={loadMoreRef} className="mt-8 py-8">
                {loadingMore && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <MediaCardSkeletonGrid key={i} />
                    ))}
                  </div>
                )}
                {!hasMore && displayItems.length > 0 && (
                  <p className="text-center text-netflix-gray">
                    You've reached the end • {displayItems.length} {activeTab === 'movies' ? 'movies' : 'shows'} loaded
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
  );
}
