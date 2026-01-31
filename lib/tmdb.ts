import axios, { AxiosRequestConfig } from 'axios';
import type { Movie, TVShow, TMDBResponse, Video, AccountDetails, SessionData, RequestToken, Genre, DiscoverFilters, PaginatedResponse } from './types';

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || '111909b8747aeff1169944069465906c';
const TMDB_BASE_URL = process.env.NEXT_PUBLIC_TMDB_BASE_URL || 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE = process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE || 'https://image.tmdb.org/t/p';

// Simple in-memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute cache

// Request queue for rate limiting
const requestQueue: Array<() => Promise<void>> = [];
let isProcessing = false;
const MIN_REQUEST_INTERVAL = 100; // 100ms between requests (10 req/sec max)

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  
  isProcessing = true;
  while (requestQueue.length > 0) {
    const request = requestQueue.shift();
    if (request) {
      await request();
      await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL));
    }
  }
  isProcessing = false;
}

function getCacheKey(url: string, params?: any): string {
  return `${url}:${JSON.stringify(params || {})}`;
}

function getFromCache<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Rate-limited API wrapper
async function rateLimitedGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const cacheKey = getCacheKey(url, config?.params);
  const cached = getFromCache<T>(cacheKey);
  if (cached) return cached;

  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        const response = await api.get<T>(url, config);
        setCache(cacheKey, response.data);
        resolve(response.data);
      } catch (error) {
        reject(error);
      }
    });
    processQueue();
  });
}

async function rateLimitedPost<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        // Merge the api_key with any additional params
        const mergedConfig = {
          ...config,
          params: {
            api_key: TMDB_API_KEY,
            ...config?.params,
          },
        };
        const response = await api.post<T>(url, data, mergedConfig);
        resolve(response.data);
      } catch (error) {
        reject(error);
      }
    });
    processQueue();
  });
}

const api = axios.create({
  baseURL: TMDB_BASE_URL,
  params: {
    api_key: TMDB_API_KEY,
  },
});

// Cache for favorites/watchlist to prevent repeated calls
let favoritesCache: { data: any; timestamp: number; key: string } | null = null;
let watchlistCache: { data: any; timestamp: number; key: string } | null = null;
const USER_CACHE_TTL = 30 * 1000; // 30 seconds for user data

export const tmdb = {
  // Get latest movie releases
  async getLatestReleases(): Promise<Movie[]> {
    const response = await api.get<TMDBResponse<Movie>>('/movie/now_playing');
    return response.data.results;
  },

  // Get popular movies
  async getPopularMovies(): Promise<Movie[]> {
    const response = await api.get<TMDBResponse<Movie>>('/movie/popular');
    return response.data.results;
  },

  // Get popular TV shows
  async getPopularTV(): Promise<TVShow[]> {
    const response = await api.get<TMDBResponse<TVShow>>('/tv/popular');
    return response.data.results;
  },

  // Get top rated movies
  async getTopRatedMovies(): Promise<Movie[]> {
    const response = await api.get<TMDBResponse<Movie>>('/movie/top_rated');
    return response.data.results;
  },

  // Get top rated TV shows
  async getTopRatedTV(): Promise<TVShow[]> {
    const response = await api.get<TMDBResponse<TVShow>>('/tv/top_rated');
    return response.data.results;
  },

  // Get now playing movies (new releases)
  async getNowPlayingMovies(): Promise<Movie[]> {
    const response = await api.get<TMDBResponse<Movie>>('/movie/now_playing');
    return response.data.results;
  },

  // Get on the air TV shows (airing now)
  async getOnTheAirTV(): Promise<TVShow[]> {
    const response = await api.get<TMDBResponse<TVShow>>('/tv/on_the_air');
    return response.data.results;
  },

  // Get trending movies
  async getTrendingMovies(): Promise<Movie[]> {
    const response = await api.get<TMDBResponse<Movie>>('/trending/movie/week');
    return response.data.results;
  },

  // Get movie details
  async getMovieDetails(id: number): Promise<Movie> {
    const response = await api.get<Movie>(`/movie/${id}`);
    return response.data;
  },

  // Get TV show details
  async getTVDetails(id: number): Promise<TVShow> {
    const response = await api.get<TVShow>(`/tv/${id}`);
    return response.data;
  },

  // Get trailers/videos for a movie
  async getMovieTrailers(id: number): Promise<Video[]> {
    const response = await api.get<{ results: Video[] }>(`/movie/${id}/videos`);
    return response.data.results.filter(v => v.type === 'Trailer' && v.site === 'YouTube');
  },

  // Get trailers/videos for a TV show
  async getTVTrailers(id: number): Promise<Video[]> {
    const response = await api.get<{ results: Video[] }>(`/tv/${id}/videos`);
    return response.data.results.filter(v => v.type === 'Trailer' && v.site === 'YouTube');
  },

  // OAuth: Get request token
  async getRequestToken(): Promise<RequestToken> {
    const response = await api.get<RequestToken>('/authentication/token/new');
    return response.data;
  },

  // OAuth: Create session with approved token
  async createSession(requestToken: string): Promise<SessionData> {
    const response = await api.post<SessionData>('/authentication/session/new', {
      request_token: requestToken,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  },

  // Get account details
  async getAccountDetails(sessionId: string): Promise<AccountDetails> {
    const response = await api.get<AccountDetails>('/account', {
      params: { session_id: sessionId },
    });
    return response.data;
  },

  // Add to watchlist
  async addToWatchlist(sessionId: string, accountId: number, mediaId: number, mediaType: 'movie' | 'tv', watchlist: boolean): Promise<void> {
    await rateLimitedPost(`/account/${accountId}/watchlist`, {
      media_type: mediaType,
      media_id: mediaId,
      watchlist,
    }, {
      params: { session_id: sessionId },
    });
    // Invalidate cache
    watchlistCache = null;
    // Dispatch event to notify pages
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cinestream:watchlist-updated'));
    }
  },

  // Add to favorites
  async addToFavorites(sessionId: string, accountId: number, mediaId: number, mediaType: 'movie' | 'tv', favorite: boolean): Promise<void> {
    await rateLimitedPost(`/account/${accountId}/favorite`, {
      media_type: mediaType,
      media_id: mediaId,
      favorite,
    }, {
      params: { session_id: sessionId },
    });
    // Invalidate cache
    favoritesCache = null;
    // Dispatch event to notify pages
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cinestream:favorites-updated'));
    }
  },

  // Get watchlist
  async getWatchlist(sessionId: string, accountId: number, page: number = 1): Promise<Array<Movie & { media_type?: 'movie' } | TVShow & { media_type?: 'tv' }>> {
    const cacheKey = `watchlist:${accountId}:${page}`;
    
    // Check cache
    if (watchlistCache && watchlistCache.key === cacheKey && Date.now() - watchlistCache.timestamp < USER_CACHE_TTL) {
      return watchlistCache.data;
    }

    // Fetch movies and TV shows sequentially to avoid rate limiting
    const moviesData = await rateLimitedGet<TMDBResponse<Movie>>(`/account/${accountId}/watchlist/movies`, {
      params: { session_id: sessionId, page },
    });
    const tvData = await rateLimitedGet<TMDBResponse<TVShow>>(`/account/${accountId}/watchlist/tv`, {
      params: { session_id: sessionId, page },
    });
    
    // Tag each item with its media type
    const movies = (moviesData.results || []).map(m => ({ ...m, media_type: 'movie' as const }));
    const tvShows = (tvData.results || []).map(t => ({ ...t, media_type: 'tv' as const }));
    const result = [...movies, ...tvShows];
    
    // Cache the result
    watchlistCache = { data: result, timestamp: Date.now(), key: cacheKey };
    return result;
  },

  // Get favorites
  async getFavorites(sessionId: string, accountId: number, page: number = 1): Promise<Array<Movie & { media_type?: 'movie' } | TVShow & { media_type?: 'tv' }>> {
    const cacheKey = `favorites:${accountId}:${page}`;
    
    // Check cache
    if (favoritesCache && favoritesCache.key === cacheKey && Date.now() - favoritesCache.timestamp < USER_CACHE_TTL) {
      return favoritesCache.data;
    }

    // Fetch movies and TV shows sequentially to avoid rate limiting
    const moviesData = await rateLimitedGet<TMDBResponse<Movie>>(`/account/${accountId}/favorite/movies`, {
      params: { session_id: sessionId, page },
    });
    const tvData = await rateLimitedGet<TMDBResponse<TVShow>>(`/account/${accountId}/favorite/tv`, {
      params: { session_id: sessionId, page },
    });
    
    // Tag each item with its media type
    const movies = (moviesData.results || []).map(m => ({ ...m, media_type: 'movie' as const }));
    const tvShows = (tvData.results || []).map(t => ({ ...t, media_type: 'tv' as const }));
    const result = [...movies, ...tvShows];
    
    // Cache the result
    favoritesCache = { data: result, timestamp: Date.now(), key: cacheKey };
    return result;
  },

  // Check if item is in watchlist
  async checkWatchlistStatus(sessionId: string, accountId: number, mediaId: number, mediaType: 'movie' | 'tv'): Promise<boolean> {
    try {
      const watchlist = await this.getWatchlist(sessionId, accountId);
      return watchlist.some(item => item.id === mediaId && (item.media_type || ('title' in item ? 'movie' : 'tv')) === mediaType);
    } catch {
      return false;
    }
  },

  // Check if item is in favorites
  async checkFavoritesStatus(sessionId: string, accountId: number, mediaId: number, mediaType: 'movie' | 'tv'): Promise<boolean> {
    try {
      const favorites = await this.getFavorites(sessionId, accountId);
      return favorites.some(item => item.id === mediaId && (item.media_type || ('title' in item ? 'movie' : 'tv')) === mediaType);
    } catch {
      return false;
    }
  },

  // Get cast for movie or TV show
  async getCast(id: number, type: 'movie' | 'tv'): Promise<any[]> {
    const response = await api.get<{ cast: any[] }>(`/${type}/${id}/credits`);
    return response.data.cast;
  },

  // Get season details (episodes)
  async getSeasonDetails(tvId: number, seasonNumber: number): Promise<{ episodes: any[] }> {
    const response = await api.get(`/tv/${tvId}/season/${seasonNumber}`);
    return response.data;
  },

  // Search content
  async searchMulti(query: string): Promise<any[]> {
    const response = await api.get<TMDBResponse<any>>(`/search/multi?query=${encodeURIComponent(query)}`);
    return response.data.results;
  },

  async searchMovies(query: string): Promise<Movie[]> {
    const response = await api.get<TMDBResponse<Movie>>(`/search/movie?query=${encodeURIComponent(query)}`);
    return response.data.results;
  },

  async searchTV(query: string): Promise<TVShow[]> {
    const response = await api.get<TMDBResponse<TVShow>>(`/search/tv?query=${encodeURIComponent(query)}`);
    return response.data.results;
  },

  // ============ GENRES ============
  
  // Get all movie genres
  async getMovieGenres(): Promise<Genre[]> {
    const response = await api.get<{ genres: Genre[] }>('/genre/movie/list');
    return response.data.genres;
  },

  // Get all TV genres
  async getTVGenres(): Promise<Genre[]> {
    const response = await api.get<{ genres: Genre[] }>('/genre/tv/list');
    return response.data.genres;
  },

  // Get movies by genre
  async getMoviesByGenre(genreId: number, page: number = 1): Promise<PaginatedResponse<Movie>> {
    const response = await api.get<PaginatedResponse<Movie>>('/discover/movie', {
      params: {
        with_genres: genreId,
        page,
        sort_by: 'popularity.desc',
      },
    });
    return response.data;
  },

  // Get TV shows by genre
  async getTVByGenre(genreId: number, page: number = 1): Promise<PaginatedResponse<TVShow>> {
    const response = await api.get<PaginatedResponse<TVShow>>('/discover/tv', {
      params: {
        with_genres: genreId,
        page,
        sort_by: 'popularity.desc',
      },
    });
    return response.data;
  },

  // ============ TRENDING ============
  
  // Get trending all (movies + TV)
  async getTrendingAll(timeWindow: 'day' | 'week' = 'week'): Promise<(Movie | TVShow)[]> {
    const response = await api.get<TMDBResponse<Movie | TVShow>>(`/trending/all/${timeWindow}`);
    return response.data.results;
  },

  // Get trending TV shows
  async getTrendingTV(timeWindow: 'day' | 'week' = 'week'): Promise<TVShow[]> {
    const response = await api.get<TMDBResponse<TVShow>>(`/trending/tv/${timeWindow}`);
    return response.data.results;
  },

  // ============ UPCOMING ============
  
  // Get upcoming movies
  async getUpcomingMovies(): Promise<Movie[]> {
    const response = await api.get<TMDBResponse<Movie>>('/movie/upcoming');
    return response.data.results;
  },

  // ============ ANIME ============
  
  // Get anime TV shows (Animation genre = 16, with Japanese origin)
  async getAnimeTV(page: number = 1): Promise<TVShow[]> {
    const response = await api.get<TMDBResponse<TVShow>>('/discover/tv', {
      params: {
        with_genres: 16, // Animation
        with_original_language: 'ja', // Japanese
        sort_by: 'popularity.desc',
        page,
      },
    });
    return response.data.results;
  },

  // Get anime movies
  async getAnimeMovies(page: number = 1): Promise<Movie[]> {
    const response = await api.get<TMDBResponse<Movie>>('/discover/movie', {
      params: {
        with_genres: 16, // Animation
        with_original_language: 'ja', // Japanese
        sort_by: 'popularity.desc',
        page,
      },
    });
    return response.data.results;
  },

  // ============ RECOMMENDATIONS ============
  
  // Get movie recommendations
  async getMovieRecommendations(movieId: number): Promise<Movie[]> {
    const response = await api.get<TMDBResponse<Movie>>(`/movie/${movieId}/recommendations`);
    return response.data.results;
  },

  // Get TV show recommendations
  async getTVRecommendations(tvId: number): Promise<TVShow[]> {
    const response = await api.get<TMDBResponse<TVShow>>(`/tv/${tvId}/recommendations`);
    return response.data.results;
  },

  // Get similar movies
  async getSimilarMovies(movieId: number): Promise<Movie[]> {
    const response = await api.get<TMDBResponse<Movie>>(`/movie/${movieId}/similar`);
    return response.data.results;
  },

  // Get similar TV shows
  async getSimilarTV(tvId: number): Promise<TVShow[]> {
    const response = await api.get<TMDBResponse<TVShow>>(`/tv/${tvId}/similar`);
    return response.data.results;
  },

  // Get personalized recommendations based on watch history
  async getPersonalizedRecommendations(watchHistory: Array<{ id: number; type: 'movie' | 'tv' }>): Promise<(Movie | TVShow)[]> {
    if (watchHistory.length === 0) {
      // If no watch history, return trending items as fallback
      return this.getTrendingAll('day');
    }

    // Create cache key from watch history (use first 3 items for consistency)
    const recentItems = watchHistory.slice(0, 3);
    const cacheKey = `recommendations:${recentItems.map(i => `${i.type}-${i.id}`).join(',')}`;
    
    // Check cache first (5 minute cache for recommendations)
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached.data;
    }

    // Get recommendations from the most recent 3 items to avoid too many API calls
    const recommendationPromises = recentItems.map(async (item) => {
      try {
        if (item.type === 'movie') {
          return await this.getMovieRecommendations(item.id);
        } else {
          return await this.getTVRecommendations(item.id);
        }
      } catch (error) {
        console.error(`Failed to get recommendations for ${item.type} ${item.id}:`, error);
        return [];
      }
    });

    const recommendationArrays = await Promise.all(recommendationPromises);
    
    // Flatten and deduplicate by ID
    const allRecommendations: (Movie | TVShow)[] = [];
    const seenIds = new Set<number>();
    
    for (const recommendations of recommendationArrays) {
      for (const item of recommendations) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          allRecommendations.push(item);
        }
      }
    }

    // Shuffle and return top 20 recommendations
    const shuffled = allRecommendations.sort(() => Math.random() - 0.5);
    const result = shuffled.slice(0, 20);
    
    // Cache the result
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    return result;
  },

  // ============ DISCOVER WITH FILTERS ============
  
  // Discover movies with filters
  async discoverMovies(filters: DiscoverFilters = {}): Promise<PaginatedResponse<Movie>> {
    const response = await api.get<PaginatedResponse<Movie>>('/discover/movie', {
      params: {
        page: filters.page || 1,
        sort_by: filters.sort_by || 'popularity.desc',
        ...filters,
      },
    });
    return response.data;
  },

  // Discover TV shows with filters
  async discoverTV(filters: DiscoverFilters = {}): Promise<PaginatedResponse<TVShow>> {
    const response = await api.get<PaginatedResponse<TVShow>>('/discover/tv', {
      params: {
        page: filters.page || 1,
        sort_by: filters.sort_by || 'popularity.desc',
        ...filters,
      },
    });
    return response.data;
  },

  // ============ DECADES ============
  
  // Get movies from a specific decade
  async getMoviesByDecade(startYear: number, page: number = 1): Promise<PaginatedResponse<Movie>> {
    const endYear = startYear + 9;
    const response = await api.get<PaginatedResponse<Movie>>('/discover/movie', {
      params: {
        'primary_release_date.gte': `${startYear}-01-01`,
        'primary_release_date.lte': `${endYear}-12-31`,
        sort_by: 'popularity.desc',
        page,
      },
    });
    return response.data;
  },

  // Get TV shows from a specific decade
  async getTVByDecade(startYear: number, page: number = 1): Promise<PaginatedResponse<TVShow>> {
    const endYear = startYear + 9;
    const response = await api.get<PaginatedResponse<TVShow>>('/discover/tv', {
      params: {
        'first_air_date.gte': `${startYear}-01-01`,
        'first_air_date.lte': `${endYear}-12-31`,
        sort_by: 'popularity.desc',
        page,
      },
    });
    return response.data;
  },

  // ============ PERSON / CAST ============
  
  // Get person details
  async getPersonDetails(personId: number): Promise<any> {
    const response = await api.get(`/person/${personId}`);
    return response.data;
  },

  // Get person's combined movie and TV credits
  async getPersonCredits(personId: number): Promise<{ cast: any[]; crew: any[] }> {
    const response = await api.get<{ cast: any[]; crew: any[] }>(`/person/${personId}/combined_credits`);
    return response.data;
  },

  // Get person's movie credits
  async getPersonMovieCredits(personId: number): Promise<{ cast: Movie[]; crew: Movie[] }> {
    const response = await api.get<{ cast: Movie[]; crew: Movie[] }>(`/person/${personId}/movie_credits`);
    return response.data;
  },

  // Get person's TV credits
  async getPersonTVCredits(personId: number): Promise<{ cast: TVShow[]; crew: TVShow[] }> {
    const response = await api.get<{ cast: TVShow[]; crew: TVShow[] }>(`/person/${personId}/tv_credits`);
    return response.data;
  },
};

export const getAuthorizationUrl = (requestToken: string): string => {
  if (typeof window === 'undefined') return '';
  return `https://www.themoviedb.org/authenticate/${requestToken}?redirect_to=${encodeURIComponent(window.location.origin + '/auth/callback')}`;
};
