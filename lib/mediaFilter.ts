import type { Movie, TVShow } from './types';

/**
 * Filters out media items that don't have a thumbnail (poster_path) or rating (vote_average)
 * @param items Array of movies or TV shows
 * @returns Filtered array with only items that have both poster_path and vote_average > 0
 */
export function filterValidMedia<T extends Movie | TVShow>(items: T[]): T[] {
  return items.filter(item => {
    // Must have a poster/thumbnail
    if (!item.poster_path) {
      return false;
    }
    
    // Must have a rating (vote_average > 0)
    if (!item.vote_average || item.vote_average === 0) {
      return false;
    }
    
    return true;
  });
}

/**
 * Type guard to check if an item has valid media data
 */
export function isValidMedia(item: Movie | TVShow): boolean {
  return !!(item.poster_path && item.vote_average && item.vote_average > 0);
}

