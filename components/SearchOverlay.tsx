'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useLayout } from '@/components/LayoutProvider';
import { tmdb } from '@/lib/tmdb';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { profiles } from '@/lib/profiles';
import { filterValidMedia } from '@/lib/mediaFilter';
import { logger } from '@/lib/logger';
import { useDebounce } from '@/lib/useDebounce';
import type { Movie, TVShow, Person } from '@/lib/types';

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
  const { layout } = useLayout();
  const isNoirFlix = layout === 'noirflix';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>('multi');
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trending, setTrending] = useState<(Movie | TVShow)[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

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
      setTrending(filterValidMedia(results).slice(0, 12));
      } catch (error) {
        logger.error('Failed to load trending:', error);
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

  // Perform search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Set loading state
    setLoading(true);

    const performSearch = async () => {
      try {
        let searchResults: (Movie | TVShow | Person & { media_type?: string })[] = [];
        if (filter === 'multi') {
          searchResults = await tmdb.searchMulti(debouncedQuery);
        } else if (filter === 'movie') {
          searchResults = await tmdb.searchMovies(debouncedQuery);
        } else if (filter === 'tv') {
          searchResults = await tmdb.searchTV(debouncedQuery);
        } else if (filter === 'person') {
          const multiResults = await tmdb.searchMulti(debouncedQuery);
          searchResults = multiResults.filter((item): item is Person & { media_type?: string } => 
            (item as { media_type?: string }).media_type === 'person'
          );
        }

        // Filter out incomplete items - for media items, use filterValidMedia, for people keep profile_path check
        const filtered = searchResults.filter((item) => {
          // For people, check profile_path
          if ('media_type' in item && item.media_type === 'person') {
            return 'profile_path' in item && !!item.profile_path;
          }
          // For movies/TV shows, use the global filter
          return filterValidMedia([item as Movie | TVShow]).length > 0;
        });
        setResults(filtered);
      } catch (error) {
        logger.error('Search error:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    performSearch();
  }, [debouncedQuery, filter]);

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

  const handleItemClick = (item: Movie | TVShow | Person & { media_type?: string }) => {
    const isPerson = ('media_type' in item && item.media_type === 'person') || (!('media_type' in item) && 'profile_path' in item && item.profile_path);
    if (isPerson) return; // Don't navigate for people (for now)
    
    // Save the search
    if (query.trim().length >= 2) {
      saveRecentSearch(query);
    }
    
    const mediaType = ('media_type' in item && item.media_type) || (filter === 'movie' ? 'movie' : filter === 'tv' ? 'tv' : 'movie');
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
    <div
      className={`fixed inset-0 z-[100] backdrop-blur-md flex flex-col ${
        isNoirFlix ? 'bg-[#050505]/95' : 'bg-black/70'
      }`}
    >
      {/* Close button - top right */}
      <button
        onClick={handleClose}
        className={`absolute top-4 right-4 p-3 transition-colors z-20 ${
          isNoirFlix
            ? 'hover:bg-white/10 border border-[#1a1a1a] text-white/80 hover:text-white'
            : 'hover:bg-netflix-gray/20 rounded-xl'
        }`}
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
                className={`absolute left-5 top-1/2 transform -translate-y-1/2 w-6 h-6 ${
                  isNoirFlix ? 'text-[#888]' : 'text-netflix-gray'
                }`}
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
                className={`w-full pl-14 pr-14 py-5 text-xl focus:outline-none transition-all duration-300 ${
                  isNoirFlix
                    ? 'bg-[#0a0a0a] border border-[#1a1a1a] text-white placeholder-[#888] focus:border-white/40 focus:ring-1 focus:ring-white/20'
                    : 'bg-netflix-gray/15 border border-netflix-gray/30 text-black shadow-2xl focus:border-netflix-red focus:shadow-netflix-red/20 focus:ring-2 focus:ring-netflix-red/30 rounded-2xl placeholder:text-netflix-gray'
                }`}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className={`absolute right-5 top-1/2 transform -translate-y-1/2 ${
                    isNoirFlix ? 'text-[#888] hover:text-white' : 'text-netflix-gray hover:text-netflix-light'
                  } transition-colors`}
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
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-200 font-mono uppercase tracking-[1px] ${
                  filter === option.value
                    ? isNoirFlix
                      ? 'bg-white text-black border border-white'
                      : 'bg-netflix-red text-white shadow-lg shadow-netflix-red/30 rounded-lg'
                    : isNoirFlix
                      ? 'bg-[#0a0a0a] border border-[#1a1a1a] text-white/80 hover:bg-white hover:text-black'
                      : 'bg-netflix-gray/15 text-netflix-light/80 hover:bg-netflix-gray/25 hover:text-netflix-light rounded-lg'
                }`}
              >
                {option.icon}
                <span>{option.label}</span>
              </button>
            ))}
          </div>

          {/* Keyboard shortcut hint */}
          <div
            className={`text-center text-sm mb-6 ${
              isNoirFlix ? 'text-[#888] font-mono text-xs uppercase tracking-[2px]' : 'text-netflix-gray'
            }`}
          >
            Press <kbd className={isNoirFlix ? 'px-2 py-0.5 bg-[#1a1a1a] border border-[#2a2a2a] text-xs mx-1' : 'px-2 py-0.5 bg-netflix-gray/20 border border-netflix-gray/30 rounded text-xs mx-1'}>ESC</kbd> to close
            <span className="mx-2">•</span>
            <kbd className={isNoirFlix ? 'px-2 py-0.5 bg-[#1a1a1a] border border-[#2a2a2a] text-xs mx-1' : 'px-2 py-0.5 bg-netflix-gray/20 border border-netflix-gray/30 rounded text-xs mx-1'}>/</kbd> to search anywhere
          </div>

          {/* Results Content - scrollable area */}
          <div className="flex-1 overflow-y-auto max-h-[60vh]">
            <div className="px-1 pb-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className={`flex items-center gap-3 font-mono text-xs uppercase tracking-[2px] ${isNoirFlix ? 'text-[#888]' : 'text-netflix-gray'}`}>
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
                    <h3 className={`text-lg font-semibold flex items-center gap-2 ${isNoirFlix ? 'text-white font-mono text-xs uppercase tracking-[2px]' : 'text-netflix-light'}`}>
                      <svg className={`w-5 h-5 ${isNoirFlix ? 'text-[#888]' : 'text-netflix-gray'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Recent Searches
                    </h3>
                    <button
                      onClick={clearRecentSearches}
                      className={`text-sm transition-colors ${isNoirFlix ? 'text-[#888] hover:text-white font-mono uppercase tracking-[1px]' : 'text-netflix-gray hover:text-netflix-red'}`}
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((search, index) => (
                      <div
                        key={index}
                        className={`group flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors ${
                          isNoirFlix
                            ? 'bg-[#0a0a0a] border border-[#1a1a1a] hover:border-white/40'
                            : 'bg-netflix-gray/15 hover:bg-netflix-gray/25 rounded-full'
                        }`}
                      >
                        <span
                          onClick={() => handleRecentSearchClick(search)}
                          className={`text-sm ${isNoirFlix ? 'text-white/80 hover:text-white' : 'text-netflix-light/80 hover:text-netflix-light'}`}
                        >
                          {search}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentSearch(search);
                          }}
                          className={`opacity-0 group-hover:opacity-100 transition-all ${isNoirFlix ? 'text-[#888] hover:text-white' : 'text-netflix-gray hover:text-netflix-red'}`}
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
                <h3 className={`text-lg font-semibold flex items-center gap-2 mb-4 ${isNoirFlix ? 'text-white font-mono text-xs uppercase tracking-[2px]' : 'text-netflix-light'}`}>
                  <svg className={`w-5 h-5 ${isNoirFlix ? 'text-white' : 'text-netflix-red'}`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
                  </svg>
                  Trending Now
                </h3>
                {trendingLoading ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className={`aspect-[2/3] rounded-lg ${isNoirFlix ? 'bg-[#1a1a1a]' : 'bg-netflix-gray/20'}`} />
                        <div className={`mt-2 h-4 rounded w-3/4 ${isNoirFlix ? 'bg-[#1a1a1a]' : 'bg-netflix-gray/20'}`} />
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
                          <div className={`relative aspect-[2/3] overflow-hidden rounded-lg ${isNoirFlix ? 'bg-[#1a1a1a] border border-[#1a1a1a] group-hover:border-white/40' : 'bg-netflix-gray/20'}`}>
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
                              <div className={`w-full h-full flex items-center justify-center ${isNoirFlix ? 'text-[#888]' : 'text-netflix-gray'}`}>
                                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-2">
                              <span className={`text-xs font-medium ${isNoirFlix ? 'text-white font-mono uppercase' : 'text-netflix-light'}`}>{isMovie ? 'Movie' : 'TV Show'}</span>
                            </div>
                          </div>
                          <p className={`mt-2 text-sm font-medium line-clamp-1 transition-colors ${isNoirFlix ? 'text-white/80 group-hover:text-white' : 'group-hover:text-netflix-red'}`}>
                            {title}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick tips */}
              <div className={`mt-6 p-4 border ${isNoirFlix ? 'bg-[#0a0a0a] border-[#1a1a1a]' : 'bg-white/5 rounded-xl border-white/10'}`}>
                <h4 className={`text-sm font-semibold mb-2 ${isNoirFlix ? 'text-[#888] font-mono uppercase tracking-[1px]' : 'text-netflix-gray'}`}>Quick Tips</h4>
                <ul className={`text-sm space-y-1 ${isNoirFlix ? 'text-[#888] font-mono text-xs' : 'text-netflix-gray/80'}`}>
                  <li>• Type at least 2 characters to search</li>
                  <li>• Use filters to narrow down results</li>
                  <li>• Press <kbd className={isNoirFlix ? 'px-1.5 py-0.5 bg-[#1a1a1a] border border-[#2a2a2a] text-xs' : 'px-1.5 py-0.5 bg-white/10 border border-white/20 rounded text-xs'}>/</kbd> anywhere to open search</li>
                </ul>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <svg
                className={`w-16 h-16 mb-4 ${isNoirFlix ? 'text-[#888]' : 'text-netflix-gray'}`}
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
              <h3 className={`text-2xl font-bold mb-2 ${isNoirFlix ? 'text-white font-black uppercase' : ''}`}>No results found</h3>
              <p className={isNoirFlix ? 'text-[#888] font-mono text-xs uppercase tracking-[2px]' : 'text-netflix-gray'}>Try a different search term or filter</p>
            </div>
          ) : (
            <>
              {/* Results count */}
              <div className={`mb-4 text-sm font-mono uppercase tracking-[1px] ${isNoirFlix ? 'text-[#888]' : 'text-netflix-gray'}`}>
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
                      <div className={`relative aspect-[2/3] overflow-hidden rounded-lg ${isNoirFlix ? 'bg-[#1a1a1a] border border-[#1a1a1a] group-hover:border-white/40' : 'bg-netflix-gray/20'}`}>
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
                          <div className={`w-full h-full flex items-center justify-center ${isNoirFlix ? 'text-[#888]' : 'text-netflix-gray'}`}>
                            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        {/* Type badge */}
                        <div className={`absolute top-2 left-2 px-2 py-0.5 text-xs font-medium ${isNoirFlix ? 'bg-[#0a0a0a]/90 border border-[#1a1a1a] text-white font-mono uppercase' : 'bg-netflix-dark/90 rounded text-netflix-light'}`}>
                          {mediaType}
                        </div>
                        {/* Rating badge */}
                        {!isPerson && item.vote_average > 0 && (
                          <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 text-xs ${isNoirFlix ? 'bg-[#0a0a0a]/90 border border-[#1a1a1a] text-white' : 'bg-netflix-dark/90 rounded text-netflix-light'}`}>
                            <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                            {item.vote_average.toFixed(1)}
                          </div>
                        )}
                        {/* Hover play button */}
                        {!isPerson && (
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isNoirFlix ? 'bg-white' : 'bg-netflix-red shadow-lg shadow-netflix-red/30'}`}>
                              <svg className={`w-6 h-6 ml-0.5 ${isNoirFlix ? 'text-black' : 'text-white'}`} fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                      <p className={`mt-2 text-sm font-semibold line-clamp-2 transition-colors ${isNoirFlix ? 'text-white/80 group-hover:text-white' : 'group-hover:text-netflix-red'}`}>
                        {title}
                      </p>
                      {year && (
                        <p className={`text-xs ${isNoirFlix ? 'text-[#888] font-mono' : 'text-netflix-gray'}`}>{year}</p>
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
