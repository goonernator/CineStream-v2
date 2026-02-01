import { profiles } from './profiles';
import { logger } from './logger';

export interface WatchProgress {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  progress: number; // 0-100 percentage
  currentTime: number; // in seconds
  duration: number; // in seconds
  season?: number;
  episode?: number;
  episodeTitle?: string;
  lastWatched: number; // timestamp
}

const BASE_WATCH_PROGRESS_KEY = 'watch_progress';

// Helper to get profile-scoped storage key
function getStorageKey(): string {
  return profiles.getStorageKey(BASE_WATCH_PROGRESS_KEY);
}

export const watchProgress = {
  // Save watch progress
  saveProgress(progress: WatchProgress): void {
    if (typeof window === 'undefined') return;
    
    try {
      const allProgress = this.getAllProgress();
      // Remove existing entry for this item (if TV, match by season/episode too)
      const filtered = allProgress.filter(p => {
        if (p.id !== progress.id || p.type !== progress.type) return true;
        if (progress.type === 'tv') {
          return p.season !== progress.season || p.episode !== progress.episode;
        }
        return false;
      });
      
      // Add new progress with updated timestamp
      const updated = {
        ...progress,
        lastWatched: Date.now(),
      };
      
      // Sort by lastWatched (most recent first) and keep only last 50 items
      const sorted = [...filtered, updated].sort((a, b) => b.lastWatched - a.lastWatched).slice(0, 50);
      
      localStorage.setItem(getStorageKey(), JSON.stringify(sorted));
    } catch (error) {
      logger.error('Failed to save watch progress:', error);
    }
  },

  // Get all watch progress items
  getAllProgress(): WatchProgress[] {
    if (typeof window === 'undefined') return [];
    
    try {
      const stored = localStorage.getItem(getStorageKey());
      if (!stored) return [];
      return JSON.parse(stored);
    } catch (error) {
      logger.error('Failed to load watch progress:', error);
      return [];
    }
  },

  // Get continue watching items (items with progress > 0 and < 90%)
  getContinueWatching(): WatchProgress[] {
    const all = this.getAllProgress();
    return all
      .filter(p => p.progress > 0 && p.progress < 90) // Not finished, has some progress
      .sort((a, b) => b.lastWatched - a.lastWatched) // Most recent first
      .slice(0, 20); // Limit to 20 items
  },

  // Get most recently watched item (for hero)
  getMostRecent(): WatchProgress | null {
    const continueWatching = this.getContinueWatching();
    return continueWatching.length > 0 ? continueWatching[0] : null;
  },

  // Get progress for a specific item
  getProgress(id: number, type: 'movie' | 'tv', season?: number, episode?: number): WatchProgress | null {
    const all = this.getAllProgress();
    return all.find(p => {
      if (p.id !== id || p.type !== type) return false;
      if (type === 'tv') {
        return p.season === season && p.episode === episode;
      }
      return true;
    }) || null;
  },

  // Remove progress for a specific item
  removeProgress(id: number, type: 'movie' | 'tv', season?: number, episode?: number): void {
    if (typeof window === 'undefined') return;
    
    try {
      const all = this.getAllProgress();
      const filtered = all.filter(p => {
        if (p.id !== id || p.type !== type) return true;
        if (type === 'tv') {
          return p.season !== season || p.episode !== episode;
        }
        return false;
      });
      localStorage.setItem(getStorageKey(), JSON.stringify(filtered));
    } catch (error) {
      logger.error('Failed to remove watch progress:', error);
    }
  },

  // Consecutive episode tracking for "Still Watching" feature
  getConsecutiveEpisodeKey(showId: number): string {
    const profileId = profiles.getActiveProfileId();
    const prefix = profileId ? `cinestream_${profileId}_` : 'cinestream_';
    return `${prefix}consecutive_episodes_${showId}`;
  },

  getConsecutiveEpisodeCount(showId: number): number {
    if (typeof window === 'undefined') return 0;
    
    try {
      const key = this.getConsecutiveEpisodeKey(showId);
      const stored = localStorage.getItem(key);
      if (!stored) return 0;
      
      const data = JSON.parse(stored);
      // Check if more than 30 minutes have passed since last episode
      const now = Date.now();
      const timeSinceLastEpisode = now - (data.lastWatchedTime || 0);
      const THIRTY_MINUTES = 30 * 60 * 1000;
      
      if (timeSinceLastEpisode > THIRTY_MINUTES) {
        // Reset if too much time has passed
        this.resetConsecutiveEpisodeCount(showId);
        return 0;
      }
      
      return data.count || 0;
    } catch (error) {
      logger.error('Failed to get consecutive episode count:', error);
      return 0;
    }
  },

  incrementConsecutiveEpisodeCount(showId: number, episodeId: string): number {
    if (typeof window === 'undefined') return 0;
    
    try {
      const key = this.getConsecutiveEpisodeKey(showId);
      const current = this.getConsecutiveEpisodeCount(showId);
      
      // Check if this is a continuation (same show) or a new start (different episode sequence)
      const stored = localStorage.getItem(key);
      let newCount = current;
      
      if (stored) {
        const data = JSON.parse(stored);
        // If same episode, don't increment
        if (data.lastEpisodeId === episodeId) {
          return current;
        }
        // Increment if continuing same show
        newCount = current + 1;
      } else {
        // First episode
        newCount = 1;
      }
      
      const data = {
        showId,
        count: newCount,
        lastEpisodeId: episodeId,
        lastWatchedTime: Date.now(),
      };
      
      localStorage.setItem(key, JSON.stringify(data));
      return newCount;
    } catch (error) {
      logger.error('Failed to increment consecutive episode count:', error);
      return 0;
    }
  },

  resetConsecutiveEpisodeCount(showId: number): void {
    if (typeof window === 'undefined') return;
    
    try {
      const key = this.getConsecutiveEpisodeKey(showId);
      localStorage.removeItem(key);
    } catch (error) {
      logger.error('Failed to reset consecutive episode count:', error);
    }
  },

  shouldShowStillWatching(showId: number): boolean {
    const count = this.getConsecutiveEpisodeCount(showId);
    return count >= 4; // Show modal at start of 5th episode (after watching 4)
  },

  // Clear progress for a specific item (alias for removeProgress)
  clearProgress(id: number, type: 'movie' | 'tv', season?: number, episode?: number): void {
    this.removeProgress(id, type, season, episode);
  },

  // Clear all watch history
  clearAll(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(getStorageKey());
    } catch (error) {
      logger.error('Failed to clear all watch progress:', error);
    }
  },

  // === STATS METHODS ===

  // Get viewing statistics
  getStats(): { totalWatchTime: number; itemsWatched: number; moviesWatched: number; tvEpisodesWatched: number } {
    const all = this.getAllProgress();
    
    const totalWatchTime = all.reduce((sum, item) => sum + item.currentTime, 0);
    const moviesWatched = all.filter(p => p.type === 'movie').length;
    const tvEpisodesWatched = all.filter(p => p.type === 'tv').length;
    
    return {
      totalWatchTime,
      itemsWatched: all.length,
      moviesWatched,
      tvEpisodesWatched,
    };
  },

  // Get watch streak (consecutive days with watch activity)
  getWatchStreak(): number {
    const all = this.getAllProgress();
    if (all.length === 0) return 0;
    
    // Get unique days when something was watched
    const watchDays = new Set<string>();
    all.forEach(item => {
      const date = new Date(item.lastWatched);
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      watchDays.add(dayKey);
    });
    
    // Convert to sorted array of dates
    const sortedDays = Array.from(watchDays)
      .map(key => {
        const [year, month, day] = key.split('-').map(Number);
        return new Date(year, month, day);
      })
      .sort((a, b) => b.getTime() - a.getTime()); // Most recent first
    
    if (sortedDays.length === 0) return 0;
    
    // Check if today or yesterday has activity (streak must be current)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const mostRecentWatch = sortedDays[0];
    mostRecentWatch.setHours(0, 0, 0, 0);
    
    // If most recent watch is older than yesterday, streak is broken
    if (mostRecentWatch.getTime() < yesterday.getTime()) {
      return 0;
    }
    
    // Count consecutive days
    let streak = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      const current = sortedDays[i - 1];
      const prev = sortedDays[i];
      
      // Check if dates are consecutive
      const diffDays = Math.round((current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  },

  // Get history filtered by date range
  getHistoryByDateRange(range: 'today' | 'week' | 'month' | 'all'): WatchProgress[] {
    const all = this.getAllProgress();
    
    if (range === 'all') return all;
    
    const now = Date.now();
    const cutoffs = {
      today: now - (24 * 60 * 60 * 1000),
      week: now - (7 * 24 * 60 * 60 * 1000),
      month: now - (30 * 24 * 60 * 60 * 1000),
    };
    
    const cutoff = cutoffs[range];
    return all.filter(item => item.lastWatched >= cutoff);
  },

  // Group TV episodes by show
  groupTVByShow(items: WatchProgress[]): Map<number, { showId: number; title: string; poster_path: string | null; backdrop_path: string | null; episodes: WatchProgress[]; mostRecent: number }> {
    const tvItems = items.filter(item => item.type === 'tv');
    const groups = new Map<number, { showId: number; title: string; poster_path: string | null; backdrop_path: string | null; episodes: WatchProgress[]; mostRecent: number }>();
    
    tvItems.forEach(item => {
      const existing = groups.get(item.id);
      if (existing) {
        existing.episodes.push(item);
        if (item.lastWatched > existing.mostRecent) {
          existing.mostRecent = item.lastWatched;
        }
      } else {
        // Extract show title (remove episode-specific info if present)
        const showTitle = item.title.split(' - ')[0] || item.title;
        groups.set(item.id, {
          showId: item.id,
          title: showTitle,
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          episodes: [item],
          mostRecent: item.lastWatched,
        });
      }
    });
    
    // Sort episodes within each group by season/episode
    groups.forEach(group => {
      group.episodes.sort((a, b) => {
        if (a.season !== b.season) return (b.season || 0) - (a.season || 0);
        return (b.episode || 0) - (a.episode || 0);
      });
    });
    
    return groups;
  },

  // Get most watched show (by episode count)
  getMostWatchedShow(): { title: string; count: number } | null {
    const all = this.getAllProgress();
    const tvItems = all.filter(item => item.type === 'tv');
    
    if (tvItems.length === 0) return null;
    
    const showCounts = new Map<string, { title: string; count: number }>();
    tvItems.forEach(item => {
      const showTitle = item.title.split(' - ')[0] || item.title;
      const existing = showCounts.get(showTitle);
      if (existing) {
        existing.count++;
      } else {
        showCounts.set(showTitle, { title: showTitle, count: 1 });
      }
    });
    
    let mostWatched: { title: string; count: number } | null = null;
    showCounts.forEach(show => {
      if (!mostWatched || show.count > mostWatched.count) {
        mostWatched = show;
      }
    });
    
    return mostWatched;
  },
};
