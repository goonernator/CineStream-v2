// Notification system for CineStream

import { profiles } from './profiles';
import type { Movie, TVShow } from './types';

export interface Notification {
  id: string;
  type: 'new_release' | 'continue_watching' | 'new_episode' | 'recommendation' | 'trending' | 'whats_new';
  title: string;
  message: string;
  imageUrl?: string;
  linkUrl?: string;
  timestamp: number;
  read: boolean;
}

const BASE_NOTIFICATIONS_KEY = 'notifications';
const MAX_NOTIFICATIONS = 20;

// Get profile-scoped storage key
function getStorageKey(): string {
  return profiles.getStorageKey(BASE_NOTIFICATIONS_KEY);
}

// Helper to check if a similar notification exists within time window
function hasRecentNotification(type: Notification['type'], itemId?: number, timeWindowMs: number = 60 * 60 * 1000): boolean {
  const notifications = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(getStorageKey()) || '[]') : [];
  const now = Date.now();
  
  return notifications.some((n: Notification) => {
    if (n.type !== type) return false;
    // Check if notification is within time window
    if (now - n.timestamp > timeWindowMs) return false;
    
    // If itemId is provided, check if notification is for the same item
    if (itemId !== undefined && n.linkUrl) {
      const urlMatch = n.linkUrl.match(/\/details\/(\d+)/);
      if (urlMatch && parseInt(urlMatch[1]) === itemId) {
        return true;
      }
    }
    
    // If no itemId, just check type and time window
    return itemId === undefined;
  });
}

export const notifications = {
  // Get all notifications
  getAll(): Notification[] {
    if (typeof window === 'undefined') return [];
    
    try {
      const stored = localStorage.getItem(getStorageKey());
      if (!stored) return [];
      return JSON.parse(stored);
    } catch {
      return [];
    }
  },

  // Get unread count
  getUnreadCount(): number {
    return this.getAll().filter(n => !n.read).length;
  },

  // Add a notification
  add(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): Notification {
    const newNotification: Notification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      read: false,
    };

    const current = this.getAll();
    const updated = [newNotification, ...current].slice(0, MAX_NOTIFICATIONS);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(getStorageKey(), JSON.stringify(updated));
    }

    // Dispatch event for real-time UI updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cinestream:notification-added', {
        detail: newNotification
      }));
    }

    return newNotification;
  },

  // Mark one as read
  markAsRead(id: string): void {
    const current = this.getAll();
    const updated = current.map(n => 
      n.id === id ? { ...n, read: true } : n
    );
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(getStorageKey(), JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('cinestream:notifications-updated'));
    }
  },

  // Mark all as read
  markAllAsRead(): void {
    const current = this.getAll();
    const updated = current.map(n => ({ ...n, read: true }));
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(getStorageKey(), JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('cinestream:notifications-updated'));
    }
  },

  // Remove one notification
  remove(id: string): void {
    const current = this.getAll();
    const updated = current.filter(n => n.id !== id);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem(getStorageKey(), JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('cinestream:notifications-updated'));
    }
  },

  // Clear all notifications
  clearAll(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(getStorageKey());
      window.dispatchEvent(new CustomEvent('cinestream:notifications-updated'));
    }
  },

  // Generate welcome notifications for new users
  generateWelcomeNotifications(): void {
    const existing = this.getAll();
    if (existing.length > 0) return; // Already has notifications

    // Add welcome notifications
    this.add({
      type: 'recommendation',
      title: 'Welcome to CineStream!',
      message: 'Explore thousands of movies and TV shows. Start by browsing the home page.',
    });

    setTimeout(() => {
      this.add({
        type: 'recommendation',
        title: 'Personalize Your Experience',
        message: 'Visit Settings to customize themes and playback preferences.',
        linkUrl: '/settings',
      });
    }, 100);

    setTimeout(() => {
      this.add({
        type: 'recommendation',
        title: 'Build Your Watchlist',
        message: 'Right-click on any title to quickly add it to your watchlist or favorites.',
      });
    }, 200);
  },

  // Check if we should notify about new recommendations
  checkNewRecommendations(currentRecommendations: (Movie | TVShow)[], previousCount: number): void {
    if (currentRecommendations.length > previousCount && previousCount > 0) {
      const newCount = currentRecommendations.length - previousCount;
      this.add({
        type: 'recommendation',
        title: 'New Recommendations Available',
        message: `We've found ${newCount} new ${newCount === 1 ? 'recommendation' : 'recommendations'} based on your watch history.`,
        linkUrl: '/',
      });
    }
  },

  // Check if we should notify about trending content
  checkTrendingUpdates(currentTrending: (Movie | TVShow)[], previousTrendingIds: Set<number>): Set<number> {
    const currentIds = new Set(currentTrending.map(item => item.id));
    const newTrending = currentTrending.filter(item => !previousTrendingIds.has(item.id));
    
    if (newTrending.length > 0 && previousTrendingIds.size > 0) {
      const topNew = newTrending[0];
      const title = 'title' in topNew ? topNew.title : topNew.name;
      
      // Check for duplicates
      if (!hasRecentNotification('trending', topNew.id, 60 * 60 * 1000)) {
        this.add({
          type: 'trending',
          title: 'New Trending Content',
          message: `${title} is now trending! Check it out on the home page.`,
          imageUrl: topNew.poster_path ? `https://image.tmdb.org/t/p/w200${topNew.poster_path}` : undefined,
          linkUrl: `/details/${topNew.id}?type=${'title' in topNew ? 'movie' : 'tv'}`,
        });
      }
    }
    
    return currentIds;
  },

  // Check if we should notify about what's new (latest releases)
  checkWhatsNew(currentReleases: (Movie | TVShow)[], previousReleaseIds: Set<number>): Set<number> {
    const currentIds = new Set(currentReleases.map(item => item.id));
    const newReleases = currentReleases.filter(item => !previousReleaseIds.has(item.id));
    
    if (newReleases.length > 0 && previousReleaseIds.size > 0) {
      const topNew = newReleases[0];
      const title = 'title' in topNew ? topNew.title : topNew.name;
      
      // Check for duplicates
      if (!hasRecentNotification('whats_new', topNew.id, 60 * 60 * 1000)) {
        this.add({
          type: 'whats_new',
          title: 'New Release Available',
          message: `${title} has just been added! Watch it now.`,
          imageUrl: topNew.poster_path ? `https://image.tmdb.org/t/p/w200${topNew.poster_path}` : undefined,
          linkUrl: `/details/${topNew.id}?type=${'title' in topNew ? 'movie' : 'tv'}`,
        });
      }
    }
    
    return currentIds;
  },

  // Check if we should notify about continue watching items
  // Also checks for new episodes in TV shows from continue watching
  checkContinueWatching(continueWatchingItems: (Movie | TVShow)[], tmdbInstance?: any): Promise<void> {
    return new Promise(async (resolve) => {
      if (continueWatchingItems.length === 0) {
        resolve();
        return;
      }
      
      try {
        // Separate movies and TV shows
        const movies = continueWatchingItems.filter((item): item is Movie => 'title' in item);
        const tvShows = continueWatchingItems.filter((item): item is TVShow => 'name' in item);
        
        // Check for new episodes in TV shows first (to avoid duplicates)
        if (tvShows.length > 0 && typeof window !== 'undefined') {
          let tmdb = tmdbInstance;
          if (!tmdb) {
            try {
              const tmdbModule = await import('./tmdb');
              tmdb = tmdbModule.tmdb;
            } catch (error) {
              // Continue without new episode checking if tmdb is not available
            }
          }
          
          if (tmdb) {
            // Get stored last known episode counts for continue watching shows
            const storageKey = profiles.getStorageKey('last_episode_counts_cw');
            const storedCounts = typeof window !== 'undefined' 
              ? JSON.parse(localStorage.getItem(storageKey) || '{}')
              : {};
            
            const newCounts: Record<string, number> = {};
            
            // Check each TV show for new episodes (limit to 5 to avoid too many API calls)
            for (const show of tvShows.slice(0, 5)) {
              try {
                // Skip if we've already notified about new episodes for this show recently
                if (hasRecentNotification('new_episode', show.id, 24 * 60 * 60 * 1000)) {
                  continue;
                }
                
                const details = await tmdb.getTVDetails(show.id);
                const totalEpisodes = details.seasons?.reduce((sum: number, season: any) => 
                  sum + (season.episode_count || 0), 0
                ) || 0;
                
                newCounts[show.id] = totalEpisodes;
                
                const lastCount = storedCounts[show.id] || 0;
                if (totalEpisodes > lastCount && lastCount > 0) {
                  // New episodes available - notify
                  this.add({
                    type: 'new_episode',
                    title: 'New Episode Available',
                    message: `New episodes of ${show.name} are now available! Continue watching to see them.`,
                    imageUrl: show.poster_path ? `https://image.tmdb.org/t/p/w200${show.poster_path}` : undefined,
                    linkUrl: `/details/${show.id}?type=tv`,
                  });
                }
              } catch (error) {
                // Skip shows that fail to load
                continue;
              }
            }
            
            // Save new counts
            if (typeof window !== 'undefined') {
              localStorage.setItem(storageKey, JSON.stringify(newCounts));
            }
          }
        }
        
        // Find items that haven't been notified about recently (for continue watching reminder)
        // Skip TV shows that we just notified about new episodes
        const unwatchedItems = continueWatchingItems.filter(item => {
          // Check if we've already notified about this item recently (within 24 hours)
          if (hasRecentNotification('continue_watching', item.id, 24 * 60 * 60 * 1000)) {
            return false;
          }
          
          // Skip TV shows if we just notified about new episodes (avoid duplicate)
          if ('name' in item && hasRecentNotification('new_episode', item.id, 60 * 60 * 1000)) {
            return false;
          }
          
          return true;
        });
        
        if (unwatchedItems.length > 0) {
          const item = unwatchedItems[0];
          const title = 'title' in item ? item.title : item.name;
          const isMovie = 'title' in item;
          
          // Import watchProgress dynamically to avoid circular dependencies
          let linkUrl = `/details/${item.id}?type=${isMovie ? 'movie' : 'tv'}`;
          
          if (typeof window !== 'undefined') {
            try {
              const { watchProgress: wp } = require('./watchProgress');
              const progress = wp.getProgress(
                item.id,
                isMovie ? 'movie' : 'tv'
              );
              
              if (progress && !isMovie && progress.season && progress.episode) {
                // Link to specific episode for TV shows
                linkUrl = `/watch/${item.id}?type=tv&season=${progress.season}&episode=${progress.episode}`;
              } else if (progress && isMovie) {
                // Link to movie watch page
                linkUrl = `/watch/${item.id}?type=movie`;
              }
            } catch (error) {
              // If watchProgress is not available, use default link
            }
          }
          
          this.add({
            type: 'continue_watching',
            title: 'Continue Watching',
            message: `Pick up where you left off with ${title}.`,
            imageUrl: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : undefined,
            linkUrl,
          });
        }
        
        resolve();
      } catch (error) {
        // Silently fail - don't break the app
        resolve();
      }
    });
  },

  // Check if we should notify about new episodes
  // Note: This method requires tmdb to be passed or imported by the caller
  checkNewEpisodes(watchlistItems: (Movie | TVShow)[], favoritesItems: (Movie | TVShow)[], tmdbInstance?: any): Promise<void> {
    return new Promise(async (resolve) => {
      if (typeof window === 'undefined') {
        resolve();
        return;
      }
      
      try {
        // Use passed tmdb instance or try to import dynamically
        let tmdb = tmdbInstance;
        if (!tmdb && typeof window !== 'undefined') {
          try {
            const tmdbModule = await import('./tmdb');
            tmdb = tmdbModule.tmdb;
          } catch (error) {
            resolve();
            return;
          }
        }
        
        if (!tmdb) {
          resolve();
          return;
        }
        
        // Combine watchlist and favorites, filter for TV shows only
        const allItems = [...watchlistItems, ...favoritesItems];
        const tvShows = allItems.filter((item): item is TVShow => 'name' in item);
        
        // Remove duplicates by ID
        const uniqueShows = Array.from(new Map(tvShows.map(show => [show.id, show])).values());
        
        // Get stored last known episode counts
        const storageKey = profiles.getStorageKey('last_episode_counts');
        const storedCounts = typeof window !== 'undefined' 
          ? JSON.parse(localStorage.getItem(storageKey) || '{}')
          : {};
        
        const newCounts: Record<string, number> = {};
        const showsWithNewEpisodes: TVShow[] = [];
        
        // Check each show for new episodes (limit to 5 to avoid too many API calls)
        for (const show of uniqueShows.slice(0, 5)) {
          try {
            const details = await tmdb.getTVDetails(show.id);
            const totalEpisodes = details.seasons?.reduce((sum: number, season: any) => 
              sum + (season.episode_count || 0), 0
            ) || 0;
            
            newCounts[show.id] = totalEpisodes;
            
            const lastCount = storedCounts[show.id] || 0;
            if (totalEpisodes > lastCount && lastCount > 0) {
              // New episodes available
              showsWithNewEpisodes.push(show);
            }
          } catch (error) {
            // Skip shows that fail to load
            continue;
          }
        }
        
        // Save new counts
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, JSON.stringify(newCounts));
        }
        
        // Create notifications for shows with new episodes
        for (const show of showsWithNewEpisodes) {
          if (!hasRecentNotification('new_episode', show.id, 24 * 60 * 60 * 1000)) {
            this.add({
              type: 'new_episode',
              title: 'New Episode Available',
              message: `New episodes of ${show.name} are now available!`,
              imageUrl: show.poster_path ? `https://image.tmdb.org/t/p/w200${show.poster_path}` : undefined,
              linkUrl: `/details/${show.id}?type=tv`,
            });
          }
        }
        
        resolve();
      } catch (error) {
        // Silently fail - don't break the app if episode checking fails
        resolve();
      }
    });
  },
};

// Notification type labels and icons
export const notificationTypes = {
  new_release: {
    label: 'New Release',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
  },
  continue_watching: {
    label: 'Continue Watching',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
  },
  new_episode: {
    label: 'New Episode',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
  },
  recommendation: {
    label: 'For You',
    color: 'text-netflix-red',
    bgColor: 'bg-netflix-red/10',
  },
  trending: {
    label: 'Trending',
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
  },
  whats_new: {
    label: "What's New",
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-400/10',
  },
};

// Format timestamp
export function formatNotificationTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return new Date(timestamp).toLocaleDateString();
  }
  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return 'Just now';
}
