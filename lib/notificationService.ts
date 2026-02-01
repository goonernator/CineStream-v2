/**
 * Periodic notification checking service
 * Runs checks at intervals to notify users about updates
 */

import { notifications } from './notifications';
import { watchProgress } from './watchProgress';
import { tmdb } from './tmdb';
import { logger } from './logger';

interface NotificationServiceConfig {
  trendingInterval: number; // milliseconds
  recommendationsInterval: number;
  continueWatchingInterval: number;
  newEpisodesInterval: number;
  whatsNewInterval: number;
}

const DEFAULT_CONFIG: NotificationServiceConfig = {
  trendingInterval: 10 * 60 * 1000, // 10 minutes
  recommendationsInterval: 15 * 60 * 1000, // 15 minutes
  continueWatchingInterval: 30 * 60 * 1000, // 30 minutes
  newEpisodesInterval: 30 * 60 * 1000, // 30 minutes
  whatsNewInterval: 10 * 60 * 1000, // 10 minutes
};

class NotificationService {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private isWindowFocused = true;
  private config: NotificationServiceConfig;
  
  // Track previous state
  private prevTrendingIds: Set<number> = new Set();
  private prevLatestReleaseIds: Set<number> = new Set();
  private prevRecommendationsCount = 0;
  
  // Cooldown tracking to prevent spam
  private lastCheckTimes: Map<string, number> = new Map();
  private readonly MIN_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes minimum between checks

  constructor(config: Partial<NotificationServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupWindowListeners();
  }

  private setupWindowListeners(): void {
    if (typeof window === 'undefined') return;

    const handleFocus = () => {
      this.isWindowFocused = true;
      // Resume checking when window regains focus
      if (!this.isRunning) {
        this.start();
      }
    };

    const handleBlur = () => {
      this.isWindowFocused = false;
      // Pause checking when window loses focus (but don't stop completely)
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
  }

  private async checkTrending(): Promise<void> {
    if (!this.isWindowFocused) return;
    
    // Cooldown check
    const lastCheck = this.lastCheckTimes.get('trending') || 0;
    const now = Date.now();
    if (now - lastCheck < this.MIN_CHECK_INTERVAL) {
      return; // Too soon since last check
    }
    this.lastCheckTimes.set('trending', now);

    try {
      const trending = await tmdb.getTrendingAll('day');
      if (trending.length > 0) {
        this.prevTrendingIds = notifications.checkTrendingUpdates(trending, this.prevTrendingIds);
      }
    } catch (error) {
      logger.error('Failed to check trending for notifications:', error);
    }
  }

  private async checkWhatsNew(): Promise<void> {
    if (!this.isWindowFocused) return;
    
    // Cooldown check
    const lastCheck = this.lastCheckTimes.get('whatsNew') || 0;
    const now = Date.now();
    if (now - lastCheck < this.MIN_CHECK_INTERVAL) {
      return; // Too soon since last check
    }
    this.lastCheckTimes.set('whatsNew', now);

    try {
      const latest = await tmdb.getLatestReleases();
      if (latest.length > 0) {
        this.prevLatestReleaseIds = notifications.checkWhatsNew(latest, this.prevLatestReleaseIds);
      }
    } catch (error) {
      logger.error('Failed to check what\'s new for notifications:', error);
    }
  }

  private async checkRecommendations(): Promise<void> {
    if (!this.isWindowFocused) return;
    
    // Cooldown check
    const lastCheck = this.lastCheckTimes.get('recommendations') || 0;
    const now = Date.now();
    if (now - lastCheck < this.MIN_CHECK_INTERVAL) {
      return; // Too soon since last check
    }
    this.lastCheckTimes.set('recommendations', now);

    try {
      const watchHistory = watchProgress.getAllProgress();
      if (watchHistory.length === 0) {
        this.prevRecommendationsCount = 0;
        return;
      }

      const watchHistoryItems = watchHistory
        .slice(0, 10)
        .map(item => ({ id: item.id, type: item.type }));

      const uniqueHistoryItems = watchHistoryItems.filter((item, index, self) =>
        index === self.findIndex(t => t.id === item.id && t.type === item.type)
      );

      if (uniqueHistoryItems.length === 0) {
        this.prevRecommendationsCount = 0;
        return;
      }

      // Load watch history details for better recommendations
      const watchHistoryDetailsPromises = uniqueHistoryItems.slice(0, 5).map(async (item) => {
        try {
          if (item.type === 'movie') {
            return await tmdb.getMovieDetails(item.id);
          } else {
            return await tmdb.getTVDetails(item.id);
          }
        } catch (error) {
          logger.error(`Failed to load details for ${item.type} ${item.id}:`, error);
          return null;
        }
      });

      const watchHistoryDetails = (await Promise.all(watchHistoryDetailsPromises))
        .filter((item): item is any => item !== null);

      // Get auth state for favorites/watchlist
      const { auth } = await import('./auth');
      const authState = auth.getAuthState();
      let favorites: any[] = [];
      let watchlist: any[] = [];

      if (authState.isAuthenticated && authState.sessionId && authState.accountId) {
        try {
          [favorites, watchlist] = await Promise.all([
            tmdb.getFavorites(authState.sessionId, authState.accountId).catch(() => []),
            tmdb.getWatchlist(authState.sessionId, authState.accountId).catch(() => []),
          ]);
        } catch (error) {
          logger.error('Failed to load favorites/watchlist for recommendations:', error);
        }
      }

      const personalizedRecs = await tmdb.getPersonalizedRecommendations(uniqueHistoryItems, {
        watchHistoryDetails,
        favorites,
        watchlist,
        sessionId: authState.sessionId || undefined,
        accountId: authState.accountId || undefined,
      });
      
      if (personalizedRecs.length > this.prevRecommendationsCount && this.prevRecommendationsCount > 0) {
        notifications.checkNewRecommendations(personalizedRecs, this.prevRecommendationsCount);
      }
      
      this.prevRecommendationsCount = personalizedRecs.length;
    } catch (error) {
      logger.error('Failed to check recommendations for notifications:', error);
    }
  }

  private async checkContinueWatching(): Promise<void> {
    if (!this.isWindowFocused) return;
    
    // Cooldown check
    const lastCheck = this.lastCheckTimes.get('continueWatching') || 0;
    const now = Date.now();
    if (now - lastCheck < this.MIN_CHECK_INTERVAL) {
      return; // Too soon since last check
    }
    this.lastCheckTimes.set('continueWatching', now);

    try {
      const continueItems = watchProgress.getContinueWatching();
      
      if (continueItems.length > 0) {
        // Load details for continue watching items (limit to first 5 to avoid too many API calls)
        const detailsPromises = continueItems.slice(0, 5).map(async (item) => {
          try {
            if (item.type === 'movie') {
              return await tmdb.getMovieDetails(item.id);
            } else {
              return await tmdb.getTVDetails(item.id);
            }
          } catch (error) {
            logger.error(`Failed to load continue watching item ${item.id}:`, error);
            return null;
          }
        });

        const details = await Promise.all(detailsPromises);
        const validDetails = details.filter((detail): detail is any => detail !== null);
        
        if (validDetails.length > 0) {
          await notifications.checkContinueWatching(validDetails, tmdb);
        }
      }
    } catch (error) {
      logger.error('Failed to check continue watching for notifications:', error);
    }
  }

  private async checkNewEpisodes(): Promise<void> {
    if (!this.isWindowFocused) return;
    
    // Cooldown check
    const lastCheck = this.lastCheckTimes.get('newEpisodes') || 0;
    const now = Date.now();
    if (now - lastCheck < this.MIN_CHECK_INTERVAL) {
      return; // Too soon since last check
    }
    this.lastCheckTimes.set('newEpisodes', now);

    try {
      // This requires auth state, so we'll skip if not available
      // In a full implementation, we'd get watchlist/favorites from auth state
      // For now, we'll just check shows in watch history that are TV shows
      const watchHistory = watchProgress.getAllProgress();
      const tvShows = watchHistory
        .filter(item => item.type === 'tv')
        .map(item => ({ id: item.id, name: item.title, poster_path: item.poster_path } as any))
        .filter((item, index, self) => 
          index === self.findIndex(t => t.id === item.id)
        );

      if (tvShows.length > 0) {
        await notifications.checkNewEpisodes(tvShows, [], tmdb);
      }
    } catch (error) {
      logger.error('Failed to check new episodes for notifications:', error);
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initial checks
    this.checkTrending();
    this.checkWhatsNew();
    this.checkRecommendations();
    this.checkContinueWatching();
    this.checkNewEpisodes();

    // Set up intervals
    this.intervals.set('trending', setInterval(() => this.checkTrending(), this.config.trendingInterval));
    this.intervals.set('whatsNew', setInterval(() => this.checkWhatsNew(), this.config.whatsNewInterval));
    this.intervals.set('recommendations', setInterval(() => this.checkRecommendations(), this.config.recommendationsInterval));
    this.intervals.set('continueWatching', setInterval(() => this.checkContinueWatching(), this.config.continueWatchingInterval));
    this.intervals.set('newEpisodes', setInterval(() => this.checkNewEpisodes(), this.config.newEpisodesInterval));
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    // Clear all intervals
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals.clear();
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
let serviceInstance: NotificationService | null = null;

export function getNotificationService(config?: Partial<NotificationServiceConfig>): NotificationService {
  if (!serviceInstance) {
    serviceInstance = new NotificationService(config);
  }
  return serviceInstance;
}

export function startNotificationService(config?: Partial<NotificationServiceConfig>): NotificationService {
  const service = getNotificationService(config);
  if (!service.isActive()) {
    service.start();
  }
  return service;
}

export function stopNotificationService(): void {
  if (serviceInstance) {
    serviceInstance.stop();
  }
}

