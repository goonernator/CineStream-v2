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
      this.add({
        type: 'trending',
        title: 'New Trending Content',
        message: `${title} is now trending! Check it out on the home page.`,
        imageUrl: topNew.poster_path ? `https://image.tmdb.org/t/p/w200${topNew.poster_path}` : undefined,
        linkUrl: `/details/${topNew.id}?type=${'title' in topNew ? 'movie' : 'tv'}`,
      });
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
      this.add({
        type: 'whats_new',
        title: 'New Release Available',
        message: `${title} has just been added! Watch it now.`,
        imageUrl: topNew.poster_path ? `https://image.tmdb.org/t/p/w200${topNew.poster_path}` : undefined,
        linkUrl: `/details/${topNew.id}?type=${'title' in topNew ? 'movie' : 'tv'}`,
      });
    }
    
    return currentIds;
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
