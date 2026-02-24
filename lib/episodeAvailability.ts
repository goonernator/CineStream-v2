import { profiles } from './profiles';
import { logger } from './logger';

type EpisodeAvailabilityRecord = Record<string, { available: boolean; checkedAt: number }>;

const BASE_KEY = 'episode_availability';

function getStorageKey(): string {
  return profiles.getStorageKey(BASE_KEY);
}

function makeKey(tvId: number, season: number, episode: number): string {
  return `${tvId}:${season}:${episode}`;
}

function readStore(): EpisodeAvailabilityRecord {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    logger.error('Failed to read episode availability cache:', error);
    return {};
  }
}

function writeStore(store: EpisodeAvailabilityRecord): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(store));
  } catch (error) {
    logger.error('Failed to write episode availability cache:', error);
  }
}

export const episodeAvailabilityCache = {
  set(tvId: number, season: number, episode: number, available: boolean): void {
    const store = readStore();
    store[makeKey(tvId, season, episode)] = { available, checkedAt: Date.now() };
    writeStore(store);
  },

  get(tvId: number, season: number, episode: number): boolean | null {
    const entry = readStore()[makeKey(tvId, season, episode)];
    return typeof entry?.available === 'boolean' ? entry.available : null;
  },

  getSeasonMap(tvId: number, season: number, episodeNumbers: number[]): Map<number, boolean> {
    const store = readStore();
    const map = new Map<number, boolean>();

    for (const ep of episodeNumbers) {
      const entry = store[makeKey(tvId, season, ep)];
      if (typeof entry?.available === 'boolean') {
        map.set(ep, entry.available);
      }
    }

    return map;
  },
};

