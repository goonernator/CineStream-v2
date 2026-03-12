/**
 * App-level settings (API keys, base URLs) stored in localStorage.
 * Used instead of .env so users can configure everything from the Settings page.
 * On the server (SSR/API routes) we fall back to process.env when present.
 */

const STORAGE_PREFIX = 'cinestream_settings_';

const KEYS = {
  TMDB_API_KEY: `${STORAGE_PREFIX}tmdb_api_key`,
  TLO_V3_BASE_URL: `${STORAGE_PREFIX}tlo_v3_base_url`,
} as const;

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function get(key: string, envFallback: string | undefined, defaultVal: string): string {
  const storage = getStorage();
  if (storage) {
    const v = storage.getItem(key);
    if (v != null && v.trim() !== '') return v.trim();
  }
  if (envFallback != null && envFallback.trim() !== '') return envFallback.trim();
  return defaultVal;
}

function set(key: string, value: string): void {
  const storage = getStorage();
  if (storage) storage.setItem(key, value.trim());
}

export const appSettings = {
  getTmdbApiKey(): string {
    return get(
      KEYS.TMDB_API_KEY,
      process.env.NEXT_PUBLIC_TMDB_API_KEY,
      ''
    );
  },
  setTmdbApiKey(value: string): void {
    set(KEYS.TMDB_API_KEY, value);
  },

  getTloV3BaseUrl(): string {
    return get(
      KEYS.TLO_V3_BASE_URL,
      process.env.TLO_V3_BASE_URL,
      ''
    );
  },
  setTloV3BaseUrl(value: string): void {
    set(KEYS.TLO_V3_BASE_URL, value);
  },
};
