'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useToast } from '@/lib/toast';
import { watchProgress, type WatchProgress } from '@/lib/watchProgress';
import { TMDB_IMAGE_BASE, tmdb } from '@/lib/tmdb';

// Extended watch progress with fetched images
interface HistoryItemWithImages extends WatchProgress {
  fetchedPosterPath?: string | null;
  fetchedBackdropPath?: string | null;
}

// Format relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

// Format duration
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

// Format total watch time for stats
function formatTotalTime(seconds: number): { value: string; unit: string } {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return { value: days.toString(), unit: days === 1 ? 'day' : 'days' };
  }
  if (hours > 0) {
    return { value: hours.toString(), unit: hours === 1 ? 'hour' : 'hours' };
  }
  return { value: minutes.toString(), unit: minutes === 1 ? 'min' : 'mins' };
}

// Progress Ring Component
function ProgressRing({ progress, size = 48, strokeWidth = 4 }: { progress: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="transparent"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={strokeWidth}
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="transparent"
        stroke="var(--netflix-red)"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
}

// Stats Card Component
function StatCard({ icon, value, label, subLabel }: { icon: React.ReactNode; value: string; label: string; subLabel?: string }) {
  return (
    <div className="bg-gradient-to-br from-netflix-dark/80 to-netflix-dark/40 backdrop-blur-sm rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-all duration-300 group">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-netflix-red/10 text-netflix-red group-hover:bg-netflix-red/20 transition-colors">
          {icon}
        </div>
        <div>
          <div className="text-3xl font-bold text-netflix-light">{value}</div>
          <div className="text-sm text-netflix-gray">{label}</div>
          {subLabel && <div className="text-xs text-netflix-gray/60 mt-0.5">{subLabel}</div>}
        </div>
      </div>
    </div>
  );
}

// Enhanced History Card Component
function HistoryCard({ item, onResume, onRemove, onDetails }: { 
  item: HistoryItemWithImages; 
  onResume: () => void; 
  onRemove: () => void;
  onDetails: () => void;
}) {
  const backdropPath = item.fetchedBackdropPath || item.backdrop_path;
  const posterPath = item.fetchedPosterPath || item.poster_path;
  const imageUrl = backdropPath
    ? `${TMDB_IMAGE_BASE}/w780${backdropPath}`
    : posterPath
    ? `${TMDB_IMAGE_BASE}/w500${posterPath}`
    : null;

  return (
    <div className="group relative overflow-hidden rounded-xl bg-netflix-dark border border-white/5 hover:border-netflix-red/30 transition-all duration-300 hover:shadow-2xl hover:shadow-netflix-red/10">
      {/* Backdrop Image */}
      <div className="relative h-40 overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="400px"
            unoptimized
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-netflix-gray/20 to-netflix-dark flex items-center justify-center">
            <svg className="w-12 h-12 text-netflix-gray/50" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
            </svg>
          </div>
        )}
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-netflix-dark via-netflix-dark/50 to-transparent" />
        
        {/* Progress Ring - positioned at bottom right */}
        <div className="absolute bottom-3 right-3 flex items-center justify-center">
          <ProgressRing progress={Math.min(item.progress, 100)} size={52} strokeWidth={3} />
          <span className="absolute text-xs font-bold text-white">{Math.round(item.progress)}%</span>
        </div>
        
        {/* Type & Episode Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="px-2 py-1 text-xs font-semibold uppercase tracking-wider bg-netflix-red/90 rounded text-white">
            {item.type === 'movie' ? 'Movie' : 'TV'}
          </span>
          {item.type === 'tv' && item.season && item.episode && (
            <span className="px-2 py-1 text-xs font-semibold bg-black/60 backdrop-blur-sm rounded text-white">
              S{item.season} E{item.episode}
            </span>
          )}
        </div>
        
        {/* Time badge */}
        <div className="absolute top-3 right-3 px-2 py-1 text-xs bg-black/60 backdrop-blur-sm rounded text-white/80">
          {formatRelativeTime(item.lastWatched)}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-netflix-light truncate mb-1 group-hover:text-netflix-red transition-colors">
          {item.title}
        </h3>
        
        {item.episodeTitle && (
          <p className="text-sm text-netflix-gray truncate mb-2">{item.episodeTitle}</p>
        )}
        
        <div className="flex items-center gap-2 text-sm text-netflix-gray mb-4">
          <span>{formatDuration(item.currentTime)}</span>
          <span className="text-netflix-gray/50">/</span>
          <span>{formatDuration(item.duration)}</span>
          <span className="text-netflix-gray/50">•</span>
          <span>{Math.round((item.duration - item.currentTime) / 60)}m left</span>
        </div>
        
        {/* Progress bar */}
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-netflix-red rounded-full transition-all duration-300"
            style={{ width: `${Math.min(item.progress, 100)}%` }}
          />
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onResume}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-netflix-red hover:bg-red-600 rounded-lg text-white text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Resume
          </button>
          <button
            onClick={onDetails}
            className="px-3 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="View Details"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="px-3 py-2.5 bg-white/10 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-white/70 transition-colors"
            title="Remove from History"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Collapsible TV Show Group Component
function TVShowGroup({ 
  showId,
  title, 
  poster_path,
  backdrop_path,
  episodes, 
  mostRecent,
  onResume, 
  onRemove,
  onDetails 
}: { 
  showId: number;
  title: string; 
  poster_path: string | null;
  backdrop_path: string | null;
  episodes: HistoryItemWithImages[];
  mostRecent: number;
  onResume: (item: WatchProgress) => void;
  onRemove: (item: WatchProgress) => void;
  onDetails: (item: WatchProgress) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const backdropUrl = backdrop_path ? `${TMDB_IMAGE_BASE}/w780${backdrop_path}` : null;
  const posterUrl = poster_path ? `${TMDB_IMAGE_BASE}/w185${poster_path}` : null;
  
  // Get the most recent episode for the "Resume" button
  const latestEpisode = episodes.reduce((latest, ep) => 
    ep.lastWatched > latest.lastWatched ? ep : latest
  , episodes[0]);

  return (
    <div className="bg-netflix-dark/50 rounded-xl border border-white/5 overflow-hidden">
      {/* Header */}
      <div 
        className="relative cursor-pointer group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Background */}
        <div className="relative h-28 overflow-hidden">
          {backdropUrl ? (
            <Image
              src={backdropUrl}
              alt={title}
              fill
              className="object-cover opacity-60 group-hover:opacity-80 transition-opacity"
              sizes="100%"
              unoptimized
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-netflix-dark to-netflix-gray/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-netflix-dark via-netflix-dark/80 to-transparent" />
        </div>
        
        {/* Content */}
        <div className="absolute inset-0 flex items-center p-4 gap-4">
          {/* Poster */}
          {posterUrl && (
            <div className="relative w-16 h-24 flex-shrink-0 rounded-lg overflow-hidden shadow-lg">
              <Image
                src={posterUrl}
                alt={title}
                fill
                className="object-cover"
                sizes="64px"
                unoptimized
              />
            </div>
          )}
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-netflix-light truncate group-hover:text-netflix-red transition-colors">
              {title}
            </h3>
            <div className="flex items-center gap-3 mt-1 text-sm text-netflix-gray">
              <span>{episodes.length} {episodes.length === 1 ? 'episode' : 'episodes'} watched</span>
              <span>•</span>
              <span>{formatRelativeTime(mostRecent)}</span>
            </div>
          </div>
          
          {/* Quick Resume & Expand */}
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResume(latestEpisode);
              }}
              className="px-4 py-2 bg-netflix-red hover:bg-red-600 rounded-lg text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Resume
            </button>
            <button className="p-2 text-netflix-light/60 hover:text-netflix-light transition-colors">
              <svg 
                className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Episodes List */}
      {isExpanded && (
        <div className="border-t border-white/5">
          {episodes.map((episode, idx) => (
            <div 
              key={`${episode.id}-${episode.season}-${episode.episode}-${idx}`}
              className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
            >
              {/* Episode number */}
              <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-netflix-red/10 flex items-center justify-center">
                <span className="text-sm font-bold text-netflix-red">
                  {episode.season && episode.episode ? `S${episode.season}:E${episode.episode}` : '#'}
                </span>
              </div>
              
              {/* Episode info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-netflix-light truncate">
                  {episode.episodeTitle || `Episode ${episode.episode}`}
                </p>
                <div className="flex items-center gap-2 text-xs text-netflix-gray mt-0.5">
                  <span>{formatDuration(episode.currentTime)} / {formatDuration(episode.duration)}</span>
                  <span>•</span>
                  <span>{Math.round(episode.progress)}%</span>
                  <span>•</span>
                  <span>{formatRelativeTime(episode.lastWatched)}</span>
                </div>
              </div>
              
              {/* Progress bar */}
              <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-netflix-red rounded-full"
                  style={{ width: `${Math.min(episode.progress, 100)}%` }}
                />
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onResume(episode)}
                  className="p-2 text-netflix-light/60 hover:text-netflix-light hover:bg-netflix-gray/20 rounded-lg transition-colors"
                  title="Resume"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
                <button
                  onClick={() => onRemove(episode)}
                  className="p-2 text-white/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Remove"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItemWithImages[]>([]);
  const [filter, setFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  // Load history on mount and fetch images
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const items = watchProgress.getAllProgress();
      
      // Fetch images for all items in parallel
      const itemsWithImages = await Promise.all(
        items.map(async (item) => {
          try {
            if (item.type === 'movie') {
              const details = await tmdb.getMovieDetails(item.id);
              return { 
                ...item, 
                fetchedPosterPath: details.poster_path,
                fetchedBackdropPath: details.backdrop_path 
              };
            } else {
              const details = await tmdb.getTVDetails(item.id);
              return { 
                ...item, 
                fetchedPosterPath: details.poster_path,
                fetchedBackdropPath: details.backdrop_path 
              };
            }
          } catch (error) {
            console.error(`Failed to fetch images for ${item.id}:`, error);
            return item;
          }
        })
      );
      
      setHistory(itemsWithImages);
    } catch (error) {
      console.error('Failed to load history:', error);
      setHistory(watchProgress.getAllProgress());
    } finally {
      setLoading(false);
    }
  };

  // Calculate stats
  const stats = useMemo(() => {
    const baseStats = watchProgress.getStats();
    const streak = watchProgress.getWatchStreak();
    const mostWatched = watchProgress.getMostWatchedShow();
    
    return {
      ...baseStats,
      streak,
      mostWatched,
    };
  }, [history]);

  // Filter and search history
  const filteredHistory = useMemo(() => {
    let items = watchProgress.getHistoryByDateRange(dateRange);
    
    // Type filter
    if (filter !== 'all') {
      items = items.filter(item => item.type === filter);
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.title.toLowerCase().includes(query) ||
        (item.episodeTitle && item.episodeTitle.toLowerCase().includes(query))
      );
    }
    
    // Match with fetched images
    return items.map(item => {
      const withImages = history.find(h => 
        h.id === item.id && 
        h.type === item.type && 
        h.season === item.season && 
        h.episode === item.episode
      );
      return withImages || item;
    });
  }, [history, filter, dateRange, searchQuery]);

  // Group TV shows
  const tvGroups = useMemo(() => {
    if (filter === 'movie') return new Map();
    return watchProgress.groupTVByShow(filteredHistory);
  }, [filteredHistory, filter]);

  const handleResume = (item: WatchProgress) => {
    if (item.type === 'tv' && item.season && item.episode) {
      router.push(`/watch/${item.id}?type=tv&season=${item.season}&episode=${item.episode}`);
    } else {
      router.push(`/watch/${item.id}?type=${item.type}`);
    }
  };

  const handleRemove = (item: WatchProgress) => {
    watchProgress.clearProgress(item.id, item.type, item.season, item.episode);
    loadHistory();
    toast.success(`Removed "${item.title}" from history`);
  };

  const handleDetails = (item: WatchProgress) => {
    router.push(`/details/${item.id}?type=${item.type}`);
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all watch history? This cannot be undone.')) {
      watchProgress.clearAll();
      setHistory([]);
      toast.success('Watch history cleared');
    }
  };

  // Separate movies and TV for list view
  const moviesOnly = filteredHistory.filter(item => item.type === 'movie');
  const tvOnly = filteredHistory.filter(item => item.type === 'tv');

  const { value: timeValue, unit: timeUnit } = formatTotalTime(stats.totalWatchTime);

  return (
    <div className="min-h-screen">

        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-netflix-light mb-2 flex items-center gap-3">
                <svg className="w-10 h-10 text-netflix-red" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
                </svg>
                Watch History
              </h1>
              <p className="text-netflix-gray">
                Track your viewing activity and pick up where you left off
              </p>
            </div>

            {history.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-4 py-2 bg-netflix-dark border border-netflix-gray/30 hover:border-red-500/50 hover:bg-red-500/10 rounded-lg text-netflix-gray hover:text-red-400 text-sm transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Stats Section */}
          {history.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                }
                value={timeValue}
                label={`${timeUnit} watched`}
                subLabel={`${Math.floor(stats.totalWatchTime / 60)} minutes total`}
              />
              <StatCard
                icon={
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <path d="M22 6l-10 7L2 6" />
                  </svg>
                }
                value={stats.itemsWatched.toString()}
                label="items watched"
                subLabel={`${stats.moviesWatched} movies, ${stats.tvEpisodesWatched} episodes`}
              />
              <StatCard
                icon={
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                }
                value={stats.streak.toString()}
                label={`day ${stats.streak === 1 ? 'streak' : 'streak'}`}
                subLabel={stats.streak > 0 ? "Keep it going!" : "Start watching today!"}
              />
              <StatCard
                icon={
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                }
                value={stats.mostWatched?.count.toString() || '0'}
                label={stats.mostWatched ? `${stats.mostWatched.title.substring(0, 15)}${stats.mostWatched.title.length > 15 ? '...' : ''}` : 'No shows yet'}
                subLabel={stats.mostWatched ? 'episodes watched' : 'Start a TV series!'}
              />
            </div>
          )}

          {/* Controls Bar */}
          {history.length > 0 && (
            <div className="flex flex-col lg:flex-row gap-4 mb-6">
              {/* Search */}
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-netflix-gray" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Search your history..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-netflix-dark border border-netflix-gray/30 rounded-lg text-netflix-light placeholder-netflix-gray focus:outline-none focus:border-netflix-red/50 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-netflix-gray hover:text-netflix-light"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              
              {/* Date Range Tabs */}
              <div className="flex rounded-lg bg-netflix-dark/80 p-1 border border-white/10">
                {(['today', 'week', 'month', 'all'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                      dateRange === range
                        ? 'bg-netflix-red text-white'
                        : 'text-netflix-gray hover:text-netflix-light'
                    }`}
                  >
                    {range === 'today' ? 'Today' : range === 'week' ? 'Week' : range === 'month' ? 'Month' : 'All'}
                  </button>
                ))}
              </div>
              
              {/* Type Filter */}
              <div className="flex rounded-lg bg-netflix-dark/80 p-1 border border-white/10">
                {(['all', 'movie', 'tv'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilter(type)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                      filter === type
                        ? 'bg-netflix-gray/30 text-netflix-light'
                        : 'text-netflix-gray hover:text-netflix-light'
                    }`}
                  >
                    {type === 'all' ? 'All' : type === 'movie' ? 'Movies' : 'TV'}
                  </button>
                ))}
              </div>
              
              {/* View Toggle (only for TV) */}
              {filter !== 'movie' && (
                <div className="flex rounded-lg bg-netflix-dark/80 p-1 border border-white/10">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      viewMode === 'list' ? 'bg-netflix-gray/30 text-netflix-light' : 'text-netflix-gray hover:text-netflix-light'
                    }`}
                    title="List View"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode('grouped')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      viewMode === 'grouped' ? 'bg-netflix-gray/30 text-netflix-light' : 'text-netflix-gray hover:text-netflix-light'
                    }`}
                    title="Grouped View"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                </div>
              )}
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
                    <div className="h-1 w-full bg-netflix-gray/20 rounded-full" />
                    <div className="flex gap-2 mt-4">
                      <div className="h-10 flex-1 bg-netflix-gray/20 rounded-lg" />
                      <div className="h-10 w-10 bg-netflix-gray/20 rounded-lg" />
                      <div className="h-10 w-10 bg-netflix-gray/20 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-32 h-32 rounded-full bg-netflix-dark/50 flex items-center justify-center mb-6">
                <svg className="w-16 h-16 text-netflix-gray/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-netflix-light mb-2">No watch history yet</h2>
              <p className="text-netflix-gray text-center max-w-md mb-6">
                Start watching movies and TV shows to build your history. You can resume watching from where you left off anytime.
              </p>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-3 bg-netflix-red hover:bg-red-600 rounded-lg text-white font-medium transition-colors"
              >
                Browse Content
              </button>
            </div>
          ) : filteredHistory.length === 0 ? (
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
                  : `No ${filter === 'movie' ? 'movies' : filter === 'tv' ? 'TV shows' : 'items'} in ${dateRange === 'today' ? 'today\'s' : dateRange === 'week' ? 'this week\'s' : dateRange === 'month' ? 'this month\'s' : 'your'} history`
                }
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilter('all');
                  setDateRange('all');
                }}
                className="mt-4 text-netflix-red hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : viewMode === 'grouped' && filter !== 'movie' ? (
            // Grouped View
            <div className="space-y-6">
              {/* Movies Section (if showing all) */}
              {filter === 'all' && moviesOnly.length > 0 && (
                <div>
                  <h2 className="text-xl font-bold text-netflix-light mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-netflix-red" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
                    </svg>
                    Movies
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {moviesOnly.map((item, idx) => (
                      <HistoryCard
                        key={`${item.id}-${item.type}-${idx}`}
                        item={item as HistoryItemWithImages}
                        onResume={() => handleResume(item)}
                        onRemove={() => handleRemove(item)}
                        onDetails={() => handleDetails(item)}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {/* TV Shows Section */}
              {tvGroups.size > 0 && (
                <div>
                  <h2 className="text-xl font-bold text-netflix-light mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-netflix-red" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
                    </svg>
                    TV Shows
                  </h2>
                  <div className="space-y-4">
                    {Array.from(tvGroups.entries())
                      .sort((a, b) => b[1].mostRecent - a[1].mostRecent)
                      .map(([showId, group]) => (
                        <TVShowGroup
                          key={showId}
                          showId={showId}
                          title={group.title}
                          poster_path={group.poster_path}
                          backdrop_path={group.backdrop_path}
                          episodes={group.episodes as HistoryItemWithImages[]}
                          mostRecent={group.mostRecent}
                          onResume={handleResume}
                          onRemove={handleRemove}
                          onDetails={handleDetails}
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // List View (Cards)
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredHistory.map((item, idx) => (
                <HistoryCard
                  key={`${item.id}-${item.type}-${item.season || ''}-${item.episode || ''}-${idx}`}
                  item={item as HistoryItemWithImages}
                  onResume={() => handleResume(item)}
                  onRemove={() => handleRemove(item)}
                  onDetails={() => handleDetails(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
  );
}
