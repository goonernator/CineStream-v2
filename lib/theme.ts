'use client';

import { profiles } from './profiles';

export type Theme = 'dark' | 'light' | 'midnight' | 'crimson' | 'noirflix' | 'system';

export interface ThemeConfig {
  name: string;
  label: string;
  colors: {
    bg: string;
    dark: string;
    red: string;
    light: string;
    gray: string;
  };
}

// Default accent color for system theme
const DEFAULT_ACCENT = '#E50914';

export const themes: Record<Exclude<Theme, 'system'>, ThemeConfig> = {
  dark: {
    name: 'dark',
    label: 'Dark',
    colors: {
      bg: '#141414',
      dark: '#000000',
      red: '#22C55E', // Green accent
      light: '#FFFFFF',
      gray: '#808080',
    },
  },
  light: {
    name: 'light',
    label: 'Light',
    colors: {
      bg: '#F5F5F5',
      dark: '#FFFFFF',
      red: '#000000', // Black accent
      light: '#141414',
      gray: '#666666',
    },
  },
  midnight: {
    name: 'midnight',
    label: 'Midnight Blue',
    colors: {
      bg: '#0D1B2A',
      dark: '#051923',
      red: '#00B4D8', // Cyan accent (unchanged)
      light: '#E0E1DD',
      gray: '#778DA9',
    },
  },
  crimson: {
    name: 'crimson',
    label: 'Crimson Night',
    colors: {
      bg: '#1A0A0A',
      dark: '#0D0505',
      red: '#F43F7A', // Red-pink accent
      light: '#F5E6E6',
      gray: '#8B4F4F',
    },
  },
  noirflix: {
    name: 'noirflix',
    label: 'NoirFlix',
    colors: {
      bg: '#050505',      // Obsidian deep
      dark: '#0a0a0a',     // Obsidian surface
      red: '#ffffff',      // White accent (for NoirFlix style)
      light: '#ffffff',    // Primary text
      gray: '#888888',     // Secondary text
    },
  },
};

// System theme base configs (uses default red accent)
const systemThemes: Record<'dark' | 'light', ThemeConfig> = {
  dark: {
    name: 'system-dark',
    label: 'System (Dark)',
    colors: {
      bg: '#141414',
      dark: '#000000',
      red: DEFAULT_ACCENT, // Default Netflix red
      light: '#FFFFFF',
      gray: '#808080',
    },
  },
  light: {
    name: 'system-light',
    label: 'System (Light)',
    colors: {
      bg: '#F5F5F5',
      dark: '#FFFFFF',
      red: DEFAULT_ACCENT, // Default Netflix red
      light: '#141414',
      gray: '#666666',
    },
  },
};

const BASE_THEME_KEY = 'theme';
const LEGACY_THEME_KEY = 'cinestream_theme';

// Get profile-scoped storage key
function getStorageKey(): string {
  return profiles.getStorageKey(BASE_THEME_KEY);
}

// Get the current theme from localStorage
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  
  // Try profile-scoped key first
  let stored = localStorage.getItem(getStorageKey());
  
  // Fallback to legacy key if no profile-scoped theme
  if (!stored) {
    stored = localStorage.getItem(LEGACY_THEME_KEY);
  }
  
  if (stored && (stored === 'dark' || stored === 'light' || stored === 'midnight' || stored === 'crimson' || stored === 'noirflix' || stored === 'system')) {
    return stored as Theme;
  }
  return 'dark';
}

// Save theme to localStorage
export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getStorageKey(), theme);
}

// Get the system preference
export function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Apply theme to document
export function applyTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;

  let config: ThemeConfig;
  let resolvedThemeName: string;

  if (theme === 'system') {
    // System theme uses default red accent with system-preferred color scheme
    const systemPreference = getSystemTheme();
    config = systemThemes[systemPreference];
    resolvedThemeName = `system-${systemPreference}`;
  } else {
    config = themes[theme];
    resolvedThemeName = theme;
  }

  // Apply CSS variables
  const root = document.documentElement;
  root.style.setProperty('--netflix-bg', config.colors.bg);
  root.style.setProperty('--netflix-dark', config.colors.dark);
  root.style.setProperty('--netflix-red', config.colors.red);
  root.style.setProperty('--netflix-light', config.colors.light);
  root.style.setProperty('--netflix-gray', config.colors.gray);

  // Update body classes
  document.body.style.backgroundColor = config.colors.bg;
  document.body.style.color = config.colors.light;

  // Set data attribute for CSS selectors
  document.documentElement.setAttribute('data-theme', resolvedThemeName);
}

// Initialize theme on page load
export function initializeTheme(): Theme {
  const theme = getStoredTheme();
  applyTheme(theme);
  
  // Listen for system theme changes
  if (theme === 'system' && typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      if (getStoredTheme() === 'system') {
        applyTheme('system');
      }
    });
  }
  
  return theme;
}
