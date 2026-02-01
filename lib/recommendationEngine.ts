/**
 * Personalized Recommendation Engine
 * Analyzes user behavior and preferences to generate highly personalized recommendations
 */

import type { Movie, TVShow, MediaItem } from './types';
import type { WatchProgress } from './watchProgress';

export interface UserPreferences {
  favoriteGenres: Array<{ genreId: number; weight: number }>;
  preferredType: 'movie' | 'tv' | 'both';
  minRating: number;
  preferredYears?: { min?: number; max?: number };
  watchedItemIds: Set<number>;
  favoriteGenreIds: Set<number>; // From favorites/watchlist
}

export interface ScoredRecommendation {
  item: MediaItem;
  score: number;
  genreMatchScore: number;
  similarityScore: number;
  discoverScore: number;
  ratingBonus: number;
  recencyBonus: number;
  watchedPenalty: number;
}

/**
 * Analyze user preferences from watch history
 */
export function analyzeUserPreferences(
  watchHistory: WatchProgress[],
  watchedItemsDetails: (Movie | TVShow)[],
  favorites: (Movie | TVShow)[] = [],
  watchlist: (Movie | TVShow)[] = []
): UserPreferences {
  const watchedItemIds = new Set<number>();
  const genreWeights = new Map<number, number>();
  const typeCounts = { movie: 0, tv: 0 };
  const ratings: number[] = [];
  const years: number[] = [];
  const favoriteGenreIds = new Set<number>();

  // Analyze watch history
  watchHistory.forEach((progress, index) => {
    watchedItemIds.add(progress.id);
    
    // Find corresponding details
    const details = watchedItemsDetails.find(d => d.id === progress.id);
    if (!details) return;

    // Calculate weight based on completion, recency, and rating
    const completionWeight = progress.progress / 100; // 0-1
    const recencyWeight = Math.max(0, 1 - (index / watchHistory.length)); // More recent = higher weight
    const ratingWeight = details.vote_average ? details.vote_average / 10 : 0.5; // Normalize to 0-1
    const totalWeight = completionWeight * 0.4 + recencyWeight * 0.3 + ratingWeight * 0.3;

    // Count content types
    if (progress.type === 'movie') typeCounts.movie++;
    else typeCounts.tv++;

    // Extract genres
    if (details.genre_ids && details.genre_ids.length > 0) {
      details.genre_ids.forEach(genreId => {
        const currentWeight = genreWeights.get(genreId) || 0;
        genreWeights.set(genreId, currentWeight + totalWeight);
      });
    }

    // Collect ratings
    if (details.vote_average > 0) {
      ratings.push(details.vote_average);
    }

    // Collect years
    const year = progress.type === 'movie' 
      ? (details as Movie).release_date?.substring(0, 4)
      : (details as TVShow).first_air_date?.substring(0, 4);
    if (year) {
      const yearNum = parseInt(year);
      if (!isNaN(yearNum)) years.push(yearNum);
    }
  });

  // Analyze favorites and watchlist for genre preferences
  [...favorites, ...watchlist].forEach(item => {
    if (item.genre_ids && item.genre_ids.length > 0) {
      item.genre_ids.forEach(genreId => {
        favoriteGenreIds.add(genreId);
        // Boost genre weight if in favorites/watchlist
        const currentWeight = genreWeights.get(genreId) || 0;
        genreWeights.set(genreId, currentWeight + 0.5);
      });
    }
  });

  // Convert genre weights to sorted array
  const favoriteGenres = Array.from(genreWeights.entries())
    .map(([genreId, weight]) => ({ genreId, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5); // Top 5 genres

  // Determine preferred type
  const totalItems = typeCounts.movie + typeCounts.tv;
  let preferredType: 'movie' | 'tv' | 'both' = 'both';
  if (totalItems > 0) {
    const movieRatio = typeCounts.movie / totalItems;
    if (movieRatio > 0.7) preferredType = 'movie';
    else if (movieRatio < 0.3) preferredType = 'tv';
  }

  // Calculate minimum rating (average of watched content, but not too strict)
  const avgRating = ratings.length > 0
    ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
    : 6.0;
  const minRating = Math.max(5.0, Math.min(avgRating - 1, 7.0)); // Between 5.0 and 7.0

  // Calculate preferred years (if enough data)
  let preferredYears: { min?: number; max?: number } | undefined;
  if (years.length >= 3) {
    const sortedYears = [...years].sort((a, b) => a - b);
    const minYear = sortedYears[0];
    const maxYear = sortedYears[sortedYears.length - 1];
    const yearRange = maxYear - minYear;
    
    // If user watches content from a wide range, don't restrict
    if (yearRange < 20) {
      preferredYears = {
        min: Math.max(1970, minYear - 5),
        max: Math.min(new Date().getFullYear() + 1, maxYear + 5),
      };
    }
  }

  return {
    favoriteGenres,
    preferredType,
    minRating,
    preferredYears,
    watchedItemIds,
    favoriteGenreIds,
  };
}

/**
 * Score a recommendation based on user preferences
 */
export function scoreRecommendation(
  item: MediaItem,
  preferences: UserPreferences,
  source: 'genre' | 'similarity' | 'discover'
): ScoredRecommendation {
  // Genre match score (0-1)
  let genreMatchScore = 0;
  if (item.genre_ids && item.genre_ids.length > 0 && preferences.favoriteGenres.length > 0) {
    const matchingGenres = item.genre_ids.filter(genreId =>
      preferences.favoriteGenres.some(fg => fg.genreId === genreId)
    );
    
    if (matchingGenres.length > 0) {
      // Calculate weighted match
      const totalWeight = preferences.favoriteGenres.reduce((sum, fg) => sum + fg.weight, 0);
      const matchedWeight = matchingGenres.reduce((sum, genreId) => {
        const genrePref = preferences.favoriteGenres.find(fg => fg.genreId === genreId);
        return sum + (genrePref?.weight || 0);
      }, 0);
      
      genreMatchScore = Math.min(1, matchedWeight / totalWeight);
      
      // Bonus if genre is in favorites/watchlist
      if (matchingGenres.some(g => preferences.favoriteGenreIds.has(g))) {
        genreMatchScore = Math.min(1, genreMatchScore * 1.2);
      }
    }
  }

  // Similarity score (based on source)
  let similarityScore = 0;
  if (source === 'similarity') {
    similarityScore = 0.8; // High score for similarity-based
  } else if (source === 'genre') {
    similarityScore = genreMatchScore * 0.6; // Medium score for genre-based
  } else {
    similarityScore = genreMatchScore * 0.4; // Lower score for discover-based
  }

  // Discover score (based on source and popularity)
  let discoverScore = 0;
  if (source === 'discover') {
    discoverScore = 0.7; // High score for discover-based
  } else if (source === 'genre') {
    discoverScore = 0.5;
  } else {
    discoverScore = 0.3;
  }

  // Rating bonus (0-0.3)
  const ratingBonus = item.vote_average > 0
    ? Math.min(0.3, (item.vote_average - preferences.minRating) / 10)
    : 0;

  // Recency bonus (0-0.2)
  let recencyBonus = 0;
  const currentYear = new Date().getFullYear();
  const itemYear = 'release_date' in item
    ? parseInt(item.release_date?.substring(0, 4) || '0')
    : parseInt((item as TVShow).first_air_date?.substring(0, 4) || '0');
  
  if (itemYear >= currentYear - 2) {
    recencyBonus = 0.2; // Recent content gets bonus
  } else if (itemYear >= currentYear - 5) {
    recencyBonus = 0.1;
  }

  // Watched penalty (-1 if watched, 0 otherwise)
  const watchedPenalty = preferences.watchedItemIds.has(item.id) ? -1 : 0;

  // Calculate final score
  const score = (
    genreMatchScore * 0.4 +
    similarityScore * 0.35 +
    discoverScore * 0.25 +
    ratingBonus +
    recencyBonus +
    watchedPenalty
  );

  return {
    item,
    score: Math.max(0, score), // Ensure non-negative
    genreMatchScore,
    similarityScore,
    discoverScore,
    ratingBonus,
    recencyBonus,
    watchedPenalty,
  };
}

/**
 * Filter and sort recommendations by score
 */
export function filterAndSortRecommendations(
  recommendations: ScoredRecommendation[],
  maxResults: number = 30
): MediaItem[] {
  // Filter out items with negative scores (heavily penalized)
  const filtered = recommendations.filter(rec => rec.score > 0);

  // Sort by score (descending)
  const sorted = filtered.sort((a, b) => b.score - a.score);

  // Remove duplicates by ID
  const seen = new Set<number>();
  const unique: MediaItem[] = [];
  for (const rec of sorted) {
    if (!seen.has(rec.item.id)) {
      seen.add(rec.item.id);
      unique.push(rec.item);
    }
  }

  return unique.slice(0, maxResults);
}

