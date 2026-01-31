'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { tmdb } from '@/lib/tmdb';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { profiles } from '@/lib/profiles';
import type { Movie, TVShow } from '@/lib/types';

const BASE_RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 10;

// Get profile-scoped storage key
function getRecentSearchesKey(): string {
  return profiles.getStorageKey(BASE_RECENT_SEARCHES_KEY);
}

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterType = 'multi' | 'movie' | 'tv' | 'person';

const filterOptions: { value: FilterType; label: string; icon: React.ReactElement }[] = [
  {
    value: 'multi',
    label: 'All',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    value: 'movie',
    label: 'Movies',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
      </svg>
    ),
  },
  {
    value: 'tv',
    label: 'TV Shows',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>
      </svg>
    ),
  },
  {
    value: 'person',
    label: 'People',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
    ),
  },
];

export default function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>('multi');
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trending, setTrending] = useState<(Movie | TVShow)[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load recent searches and trending on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(getRecentSearchesKey());
      if (stored) {
        try {
          setRecentSearches(JSON.parse(stored));
        } catch {
          setRecentSearches([]);
        }
      }
    }
  }, []);

  // Load trending when overlay opens
  useEffect(() => {
    if (isOpen && trending.length === 0) {
      loadTrending();
    }
  }, [isOpen]);

  const loadTrending = async () => {
    setTrendingLoading(true);
    try {
      const results = await tmdb.getTrendingAll('day');
      setTrending(results.slice(0, 12));
    } catch (error) {
      console.error('Failed to load trending:', error);
    } finally {
      setTrendingLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        let searchResults: any[] = [];
        if (filter === 'multi') {
          searchResults = await tmdb.searchMulti(query);
        } else if (filter === 'movie') {
          searchResults = await tmdb.searchMovies(query);
        } else if (filter === 'tv') {
          searchResults = await tmdb.searchTV(query);
        } else if (filter === 'person') {
          searchResults = await tmdb.searchMulti(query);
          searchResults = searchResults.filter(item => item.media_type === 'person');
        }

        // Filter out incomplete items
        const filtered = searchResults.filter(
          (item) => item.poster_path || item.profile_path
        );
        setResults(filtered);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, filter]);

  const saveRecentSearch = (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return;

    const updated = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, MAX_RECENT_SEARCHES);
    setRecentSearches(updated);
    localStorage.setItem(getRecentSearchesKey(), JSON.stringify(updated));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem(getRecentSearchesKey());
  };

  const removeRecentSearch = (search: string) => {
    const updated = recentSearches.filter(s => s !== search);
    setRecentSearches(updated);
    localStorage.setItem(getRecentSearchesKey(), JSON.stringify(updated));
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    onClose();
  };

  const handleItemClick = (item: any) => {
    const isPerson = item.media_type === 'person' || (!item.media_type && item.profile_path);
    if (isPerson) return; // Don't navigate for people (for now)
    
    // Save the search
    if (query.trim().length >= 2) {
      saveRecentSearch(query);
    }
    
    const mediaType = item.media_type || (filter === 'movie' ? 'movie' : filter === 'tv' ? 'tv' : 'movie');
    router.push(`/details/${item.id}?type=${mediaType}`);
    handleClose();
  };

  const handleRecentSearchClick = (search: string) => {
    setQuery(search);
  };

  const handleTrendingClick = (item: Movie | TVShow) => {
    const isMovie = 'title' in item;
    router.push(`/details/${item.id}?type=${isMovie ? 'movie' : 'tv'}`);
    handleClose();
  };

  if (!isOpen) return null;

  const showEmptyState = query.trim().length < 2;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex flex-col">
      {/* Close button - top right */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 p-3 hover:bg-netflix-gray/20 rounded-xl transition-colors z-20"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Centered Search Container */}
      <div className="flex-1 flex flex-col justify-center px-4 pt-16 pb-8 max-h-screen overflow-hidden">
        <div className="max-w-3xl mx-auto w-full">
          {/* Search Input */}
          <div className="mb-6">
            <div className="relative">
              <svg
                className="absolute left-5 top-1/2 transform -translate-y-1/2 w-6 h-6 text-netflix-gray"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search movies, TV shows, people..."
                className="w-full pl-14 pr-14 py-5 bg-netflix-gray/15 border border-netflix-gray/30 text-netflix-light text-xl focus:outline-none focus:border-netflix-red transition-all duration-300 shadow-2xl focus:shadow-netflix-red/20 focus:ring-2 focus:ring-netflix-red/30 rounded-2xl placeholder:text-netflix-gray"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-5 top-1/2 transform -translate-y-1/2 text-netflix-gray hover:text-netflix-light transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg ${
                  filter === option.value
                    ? 'bg-netflix-red text-white shadow-lg shadow-netflix-red/30'
                    : 'bg-netflix-gray/15 text-netflix-light/80 hover:bg-netflix-gray/25 hover:text-netflix-light'
                }`}
              >
                {option.icon}
                <span>{option.label}</span>
              </button>
            ))}
          </div>

          {/* Keyboard shortcut hint */}
          <div className="text-center text-sm text-netflix-gray mb-6">
            Press <kbd className="px-2 py-0.5 bg-netflix-gray/20 border border-netflix-gray/30 rounded text-xs mx-1">ESC</kbd> to close
            <span className="mx-2">•</span>
            <kbd className="px-2 py-0.5 bg-netflix-gray/20 border border-netflix-gray/30 rounded text-xs mx-1">/</kbd> to search anywhere
          </div>

          {/* Results Content - scrollable area */}
          <div className="flex-1 overflow-y-auto max-h-[60vh]">
            <div className="px-1 pb-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center gap-3 text-netflix-gray">
                <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Searching...</span>
              </div>
            </div>
          ) : showEmptyState ? (
            <div className="space-y-8">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-netflix-light flex items-center gap-2">
                      <svg className="w-5 h-5 text-netflix-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Recent Searches
                    </h3>
                    <button
                      onClick={clearRecentSearches}
                      className="text-sm text-netflix-gray hover:text-netflix-red transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((search, index) => (
                      <div
                        key={index}
                        className="group flex items-center gap-2 px-4 py-2 bg-netflix-gray/15 hover:bg-netflix-gray/25 rounded-full cursor-pointer transition-colors"
                      >
                        <span
                          onClick={() => handleRecentSearchClick(search)}
                          className="text-sm text-netflix-light/80 hover:text-netflix-light"
                        >
                          {search}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentSearch(search);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-netflix-gray hover:text-netflix-red transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending */}
              <div>
                <h3 className="text-lg font-semibold text-netflix-light flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-netflix-red" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
                  </svg>
                  Trending Now
                </h3>
                {trendingLoading ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="aspect-[2/3] bg-netflix-gray/20 rounded-lg" />
                        <div className="mt-2 h-4 bg-netflix-gray/20 rounded w-3/4" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                    {trending.map((item) => {
                      const isMovie = 'title' in item;
                      const title = isMovie ? item.title : item.name;
                      const imageUrl = item.poster_path
                        ? `${TMDB_IMAGE_BASE}/w342${item.poster_path}`
                        : null;

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleTrendingClick(item)}
                          className="cursor-pointer group"
                        >
                          <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-netflix-gray/20">
                            {imageUrl ? (
                              <Image
                                src={imageUrl}
                                alt={title}
                                fill
                                className="object-cover transition-transform duration-300 group-hover:scale-105"
                                sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
                                unoptimized
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-netflix-gray">
                                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-netflix-dark/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-2">
                              <span className="text-xs font-medium text-netflix-light">{isMovie ? 'Movie' : 'TV Show'}</span>
                            </div>
                          </div>
                          <p className="mt-2 text-sm font-medium line-clamp-1 group-hover:text-netflix-red transition-colors">
                            {title}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick tips */}
              <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
                <h4 className="text-sm font-semibold text-netflix-gray mb-2">Quick Tips</h4>
                <ul className="text-sm text-netflix-gray/80 space-y-1">
                  <li>• Type at least 2 characters to search</li>
                  <li>• Use filters to narrow down results</li>
                  <li>• Press <kbd className="px-1.5 py-0.5 bg-white/10 border border-white/20 rounded text-xs">/</kbd> anywhere to open search</li>
                </ul>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <svg
                className="w-16 h-16 text-netflix-gray mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="text-2xl font-bold mb-2">No results found</h3>
              <p className="text-netflix-gray">Try a different search term or filter</p>
            </div>
          ) : (
            <>
              {/* Results count */}
              <div className="mb-4 text-sm text-netflix-gray">
                Found {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
              </div>
              
              {/* Results grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {results.map((item) => {
                  const isPerson = item.media_type === 'person' || (!item.media_type && item.profile_path);
                  const imagePath = isPerson ? item.profile_path : item.poster_path;
                  const imageUrl = imagePath
                    ? `${TMDB_IMAGE_BASE}/w342${imagePath}`
                    : null;
                  const title = isPerson ? item.name : item.title || item.name;
                  const year = !isPerson && (item.release_date || item.first_air_date)?.split('-')[0];
                  const mediaType = isPerson ? 'Person' : item.media_type === 'movie' || filter === 'movie' ? 'Movie' : 'TV Show';

                  return (
                    <div
                      key={`${item.id}-${item.media_type || filter}`}
                      onClick={() => handleItemClick(item)}
                      className={`group cursor-pointer ${isPerson ? 'cursor-default opacity-75' : ''}`}
                    >
                      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-netflix-gray/20">
                        {imageUrl ? (
                          <Image
                            src={imageUrl}
                            alt={title}
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-netflix-gray">
                            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {/* Type badge */}
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-netflix-dark/90 rounded text-xs font-medium text-netflix-light">
                          {mediaType}
                        </div>
                        {/* Rating badge */}
                        {!isPerson && item.vote_average > 0 && (
                          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-netflix-dark/90 rounded text-xs text-netflix-light">
                            <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                            {item.vote_average.toFixed(1)}
                          </div>
                        )}
                        {/* Hover play button */}
                        {!isPerson && (
                          <div className="absolute inset-0 bg-netflix-dark/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-netflix-red flex items-center justify-center shadow-lg shadow-netflix-red/30">
                              <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-semibold line-clamp-2 group-hover:text-netflix-red transition-colors">
                        {title}
                      </p>
                      {year && (
                        <p className="text-xs text-netflix-gray">{year}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
