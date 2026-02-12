'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useLayout } from '@/components/LayoutProvider';
import MediaListCard from '@/components/MediaListCard';
import { auth } from '@/lib/auth';
import { tmdb, TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { useToast } from '@/lib/toast';
import { logger } from '@/lib/logger';
import type { Movie, TVShow, MediaItem } from '@/lib/types';

type WatchlistItem = (Movie | TVShow) & { media_type?: 'movie' | 'tv' };

export default function WatchlistPage() {
  const router = useRouter();
  const toast = useToast();
  const { layout } = useLayout();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'rating' | 'title' | 'year'>('recent');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadWatchlist();
    
    // Listen for watchlist updates from other components
    const handleWatchlistUpdated = () => {
      loadWatchlist();
    };
    
    // Listen for page visibility changes to refresh when returning to page
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadWatchlist();
      }
    };
    
    window.addEventListener('cinestream:watchlist-updated', handleWatchlistUpdated);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('cinestream:watchlist-updated', handleWatchlistUpdated);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const loadWatchlist = async () => {
    const authState = auth.getAuthState();
    if (!authState.isAuthenticated || !authState.accountId || !authState.sessionId) {
      setLoading(false);
      return;
    }

    try {
      const data = await tmdb.getWatchlist(authState.sessionId!, authState.accountId!);
      setWatchlist(data);
    } catch (error) {
      logger.error('Failed to load watchlist:', error);
      toast.error('Failed to load watchlist');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (item: MediaItem) => {
    const authState = auth.getAuthState();
    if (!authState.isAuthenticated || !authState.accountId || !authState.sessionId) return;

    const isMovie = 'title' in item;
    const title = isMovie ? (item as Movie).title : (item as TVShow).name;

    // Optimistic update - remove immediately from UI
    const previousWatchlist = [...watchlist];
    setWatchlist(prev => prev.filter(f => f.id !== item.id));
    toast.success(`Removed "${title}" from watchlist`);

    try {
      await tmdb.addToWatchlist(
        authState.sessionId!,
        authState.accountId!,
        item.id,
        isMovie ? 'movie' : 'tv',
        false
      );
      // Success - state already updated
    } catch (error) {
      // Revert on error
      logger.error('Failed to remove from watchlist:', error);
      setWatchlist(previousWatchlist);
      toast.error(`Failed to remove "${title}" from watchlist`);
    }
  };

  // Filter and sort watchlist
  const filteredWatchlist = useMemo(() => {
    let items = [...watchlist];

    // Type filter
    if (filter !== 'all') {
      items = items.filter(item => {
        const isMovie = item.media_type === 'movie' || 'title' in item;
        return filter === 'movie' ? isMovie : !isMovie;
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => {
        const title = 'title' in item ? item.title : item.name;
        return title.toLowerCase().includes(query);
      });
    }

    // Sort
    items.sort((a, b) => {
      switch (sortBy) {
        case 'rating':
          return (b.vote_average || 0) - (a.vote_average || 0);
        case 'title':
          const titleA = 'title' in a ? a.title : a.name;
          const titleB = 'title' in b ? b.title : b.name;
          return titleA.localeCompare(titleB);
        case 'year':
          const dateA = 'release_date' in a ? a.release_date : a.first_air_date;
          const dateB = 'release_date' in b ? b.release_date : b.first_air_date;
          return (dateB || '').localeCompare(dateA || '');
        default: // recent - keep original order from API
          return 0;
      }
    });

    return items;
  }, [watchlist, filter, sortBy, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const movies = watchlist.filter(f => f.media_type === 'movie' || 'title' in f);
    const tvShows = watchlist.filter(f => f.media_type === 'tv' || 'name' in f && !('title' in f));
    const avgRating = watchlist.length > 0
      ? (watchlist.reduce((sum, f) => sum + (f.vote_average || 0), 0) / watchlist.length).toFixed(1)
      : '0';
    
    // Estimate runtime (avg 2h per movie, 45min per episode assumed 10 episodes)
    const estimatedHours = movies.length * 2 + tvShows.length * 7.5;

    return {
      total: watchlist.length,
      movies: movies.length,
      tvShows: tvShows.length,
      avgRating,
      estimatedHours: Math.round(estimatedHours),
    };
  }, [watchlist]);

  // Featured item (highest rated or most recent)
  const featuredItem = watchlist.length > 0 
    ? watchlist.reduce((best, item) => 
        (item.vote_average || 0) > (best.vote_average || 0) ? item : best
      , watchlist[0])
    : null;

  const isAuthenticated = auth.getAuthState().isAuthenticated;

  // NoirFlix Layout
  if (layout === 'noirflix') {
    return (
      <div className="min-h-screen bg-[#050505] pt-32" style={{
        backgroundImage: 'radial-gradient(circle at 50% -20%, #111 0%, transparent 60%), linear-gradient(to bottom, transparent 0%, #000 100%)'
      }}>
        <div className="px-16 pb-16">
          {/* Header */}
          <div className="mb-12">
            <button
              onClick={() => router.back()}
              className="mb-8 font-mono text-xs border border-[#1a1a1a] px-5 py-2 transition-all hover:bg-white hover:text-black text-white/80"
            >
              ← BACK
            </button>
            <h1 className="text-5xl font-black uppercase mb-4 text-white">Watchlist</h1>
            <p className="font-mono text-xs text-[#888] uppercase tracking-[2px]">
              {watchlist.length} {watchlist.length === 1 ? 'ITEM' : 'ITEMS'}
            </p>
          </div>

          {/* Controls */}
          {isAuthenticated && watchlist.length > 0 && (
            <div className="flex flex-col lg:flex-row gap-4 mb-12">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="SEARCH..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-4 pr-4 py-3 bg-[#0a0a0a] border border-[#1a1a1a] text-white placeholder-[#888] font-mono text-xs uppercase tracking-[2px] focus:outline-none focus:border-white/40 transition-all"
                />
              </div>
              <div className="flex gap-2">
                {(['all', 'movie', 'tv'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilter(type)}
                    className={`px-6 py-3 font-mono text-xs uppercase tracking-[2px] border transition-all ${
                      filter === type
                        ? 'bg-white text-black border-white'
                        : 'border-[#1a1a1a] text-white/80 hover:bg-white hover:text-black'
                    }`}
                  >
                    {type === 'all' ? 'ALL' : type === 'movie' ? 'MOVIES' : 'TV'}
                  </button>
                ))}
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-6 py-3 bg-[#0a0a0a] border border-[#1a1a1a] text-white font-mono text-xs uppercase tracking-[2px] cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="recent">RECENT</option>
                <option value="rating">RATING</option>
                <option value="title">TITLE</option>
                <option value="year">YEAR</option>
              </select>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="text-[#888] font-mono text-xs uppercase tracking-[2px]">LOADING...</div>
          ) : !isAuthenticated ? (
            <div className="text-center py-24">
              <h2 className="text-3xl font-black uppercase mb-4 text-white">SIGN IN REQUIRED</h2>
              <p className="font-mono text-xs text-[#888] uppercase tracking-[2px] mb-8">CONNECT YOUR ACCOUNT TO VIEW WATCHLIST</p>
              <button
                onClick={() => auth.initiateLogin()}
                className="bg-white hover:bg-white/90 text-black px-8 py-4 font-mono text-xs uppercase tracking-[2px] transition-all border border-white"
              >
                SIGN IN
              </button>
            </div>
          ) : watchlist.length === 0 ? (
            <div className="text-center py-24">
              <h2 className="text-3xl font-black uppercase mb-4 text-white">WATCHLIST EMPTY</h2>
              <p className="font-mono text-xs text-[#888] uppercase tracking-[2px] mb-8">NO ITEMS IN WATCHLIST</p>
              <button
                onClick={() => router.push('/')}
                className="bg-white hover:bg-white/90 text-black px-8 py-4 font-mono text-xs uppercase tracking-[2px] transition-all border border-white"
              >
                BROWSE CONTENT
              </button>
            </div>
          ) : filteredWatchlist.length === 0 ? (
            <div className="text-center py-20">
              <h2 className="text-xl font-black uppercase mb-2 text-white">NO RESULTS</h2>
              <p className="font-mono text-xs text-[#888] uppercase tracking-[2px] mb-4">
                {searchQuery ? `NO ITEMS MATCHING "${searchQuery.toUpperCase()}"` : `NO ${filter === 'movie' ? 'MOVIES' : 'TV SHOWS'}`}
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilter('all');
                }}
                className="font-mono text-xs text-white/80 hover:text-white uppercase tracking-[2px]"
              >
                CLEAR FILTERS
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-6">
              {filteredWatchlist.map((item) => (
                <MediaListCard
                  key={`${item.id}-${item.media_type || ('title' in item ? 'movie' : 'tv')}`}
                  item={item}
                  onRemove={handleRemove}
                  listType="watchlist"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Classic Layout
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
        {featuredItem && !loading && (
          <div className="relative h-[50vh] min-h-[400px] overflow-hidden">
            {/* Background */}
            {featuredItem.backdrop_path && (
              <Image
                src={`${TMDB_IMAGE_BASE}/original${featuredItem.backdrop_path}`}
                alt=""
                fill
                className="object-cover"
                priority
                unoptimized
              />
            )}
            
            {/* Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-netflix-bg via-netflix-bg/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-netflix-bg/80 via-transparent to-transparent" />
            
            {/* Content */}
            <div className="absolute bottom-0 left-0 right-0 p-8 lg:p-12">
              <div className="max-w-7xl mx-auto">
                <div className="flex items-end gap-6">
                  {/* Floating Bookmark Icon */}
                  <div className="hidden md:flex w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 items-center justify-center shadow-2xl animate-float">
                    <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  
                  <div className="flex-1">
                    <h1 className="text-5xl lg:text-6xl font-black text-netflix-light mb-3 drop-shadow-2xl">
                      My Watchlist
                    </h1>
                    <p className="text-xl text-netflix-light/80 mb-4">
                      Movies and shows you're planning to watch
                    </p>
                    
                    {/* Stats Pills */}
                    <div className="flex flex-wrap gap-3">
                      <div className="px-4 py-2 bg-netflix-gray/20 backdrop-blur-md rounded-full text-netflix-light text-sm font-medium">
                        {stats.total} {stats.total === 1 ? 'title' : 'titles'}
                      </div>
                      <div className="px-4 py-2 bg-netflix-gray/20 backdrop-blur-md rounded-full text-netflix-light text-sm font-medium">
                        {stats.movies} movies
                      </div>
                      <div className="px-4 py-2 bg-netflix-gray/20 backdrop-blur-md rounded-full text-netflix-light text-sm font-medium">
                        {stats.tvShows} TV shows
                      </div>
                      <div className="px-4 py-2 bg-yellow-500/20 backdrop-blur-md rounded-full text-yellow-600 text-sm font-medium flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                        {stats.avgRating} avg
                      </div>
                      <div className="px-4 py-2 bg-purple-500/20 backdrop-blur-md rounded-full text-purple-600 text-sm font-medium">
                        ~{stats.estimatedHours}h to watch all
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          {/* Compact Header when no hero */}
          {(!featuredItem || loading) && (
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-netflix-light">My Watchlist</h1>
                  <p className="text-netflix-gray">Movies and shows you're planning to watch</p>
                </div>
              </div>
            </div>
          )}

          {/* Controls Bar */}
          {isAuthenticated && watchlist.length > 0 && (
            <div className="flex flex-col lg:flex-row gap-4 mb-8">
              {/* Search */}
              <div className="relative flex-1">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-netflix-gray" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Search watchlist..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-netflix-dark border border-netflix-gray/30 rounded-xl text-netflix-light placeholder-netflix-gray focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-netflix-gray hover:text-netflix-light transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Type Filter */}
              <div className="flex rounded-xl bg-netflix-dark p-1.5 border border-netflix-gray/30">
                {(['all', 'movie', 'tv'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilter(type)}
                    className={`px-5 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                      filter === type
                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                        : 'text-netflix-gray hover:text-netflix-light'
                    }`}
                  >
                    {type === 'all' ? 'All' : type === 'movie' ? 'Movies' : 'TV Shows'}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="appearance-none px-5 py-3 pr-10 bg-netflix-dark border border-netflix-gray/30 rounded-xl text-netflix-light text-sm font-medium cursor-pointer focus:outline-none focus:border-blue-500/50 transition-all"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="recent" className="bg-netflix-dark text-netflix-light">Recently Added</option>
                  <option value="rating" className="bg-netflix-dark text-netflix-light">Highest Rated</option>
                  <option value="title" className="bg-netflix-dark text-netflix-light">Alphabetical</option>
                  <option value="year" className="bg-netflix-dark text-netflix-light">Release Year</option>
                </select>
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-netflix-gray pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-netflix-dark/50 rounded-xl border border-white/5 overflow-hidden animate-pulse">
                  <div className="h-40 bg-netflix-gray/20" />
                  <div className="p-4 space-y-3">
                    <div className="h-5 w-3/4 bg-netflix-gray/20 rounded" />
                    <div className="h-4 w-1/2 bg-netflix-gray/20 rounded" />
                    <div className="flex gap-2 mt-4">
                      <div className="h-10 flex-1 bg-netflix-gray/20 rounded-lg" />
                      <div className="h-10 w-10 bg-netflix-gray/20 rounded-lg" />
                      <div className="h-10 w-10 bg-netflix-gray/20 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : !isAuthenticated ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="relative mb-8">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-600/20 flex items-center justify-center animate-pulse-glow" style={{ '--glow-color': 'rgba(59, 130, 246, 0.5)' } as React.CSSProperties}>
                  <svg className="w-16 h-16 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                {/* Floating particles */}
                <div className="absolute -top-2 -right-2 w-4 h-4 bg-blue-500 rounded-full animate-float" style={{ animationDelay: '0s' }} />
                <div className="absolute -bottom-1 -left-3 w-3 h-3 bg-purple-500 rounded-full animate-float" style={{ animationDelay: '0.5s' }} />
                <div className="absolute top-1/2 -right-6 w-2 h-2 bg-indigo-500 rounded-full animate-float" style={{ animationDelay: '1s' }} />
              </div>
              <h2 className="text-3xl font-bold text-netflix-light mb-3">Sign in to view watchlist</h2>
              <p className="text-netflix-gray text-center max-w-md mb-8">
                Connect your account to sync your watchlist across all your devices
              </p>
              <button
                onClick={() => auth.initiateLogin()}
                className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-105"
              >
                Sign In with TMDB
              </button>
            </div>
          ) : watchlist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="relative mb-8">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-600/10 flex items-center justify-center">
                  <svg className="w-16 h-16 text-netflix-gray/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
              </div>
              <h2 className="text-3xl font-bold text-netflix-light mb-3">Watchlist is empty</h2>
              <p className="text-netflix-gray text-center max-w-md mb-8">
                Start exploring and add movies and TV shows you want to watch later
              </p>
              <button
                onClick={() => router.push('/')}
                className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-105"
              >
                Browse Content
              </button>
            </div>
          ) : filteredWatchlist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-24 h-24 rounded-full bg-netflix-dark/50 flex items-center justify-center mb-4">
                <svg className="w-12 h-12 text-netflix-gray/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-netflix-light mb-2">No results found</h2>
              <p className="text-netflix-gray text-center">
                {searchQuery
                  ? `No items matching "${searchQuery}"`
                  : `No ${filter === 'movie' ? 'movies' : 'TV shows'} in your watchlist`}
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilter('all');
                }}
                className="mt-4 text-blue-500 hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredWatchlist.map((item) => (
                <MediaListCard
                  key={`${item.id}-${item.media_type || ('title' in item ? 'movie' : 'tv')}`}
                  item={item}
                  onRemove={handleRemove}
                  listType="watchlist"
                />
              ))}
            </div>
          )}
        </div>
      </div>
  );
}
