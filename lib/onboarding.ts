// Onboarding tour configuration

import { profiles } from './profiles';

const BASE_ONBOARDING_KEY = 'onboarding_complete';
const BASE_ONBOARDING_STEP_KEY = 'onboarding_step';

// Get profile-scoped storage keys
function getOnboardingKey(): string {
  return profiles.getStorageKey(BASE_ONBOARDING_KEY);
}

function getStepKey(): string {
  return profiles.getStorageKey(BASE_ONBOARDING_STEP_KEY);
}

export interface TourStep {
  id: string;
  title: string;
  description: string;
  target: string; // CSS selector
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  highlightPadding?: number;
}

export const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to CineStream! 🎬',
    description: 'Your personal streaming hub for movies and TV shows. Let\'s take a quick tour to help you get started.',
    target: '',
    position: 'center',
  },
  {
    id: 'app-name',
    title: 'App Name & Navigation',
    description: 'The CineStream logo is always in the top-left corner. Click it to return home. The top navigation bar gives you quick access to all sections.',
    target: '[data-tour="app-name"]',
    position: 'bottom',
    highlightPadding: 8,
  },
  {
    id: 'browse',
    title: 'Browse Content',
    description: 'Click "Browse" to explore movies and TV shows by popularity, ratings, or what\'s currently playing. Use the "Genres" menu to filter by category.',
    target: '[data-tour="browse"]',
    position: 'bottom',
  },
  {
    id: 'lists',
    title: 'Your Personal Lists',
    description: 'Access your Watchlist, Favorites, and Watch History from the "My Lists" menu. Right-click any title for quick actions!',
    target: '[data-tour="lists"]',
    position: 'bottom',
  },
  {
    id: 'search',
    title: 'Quick Search',
    description: 'Find any movie or TV show instantly. Pro tip: Press "/" or Ctrl+K to open search from anywhere!',
    target: '[data-tour="search"]',
    position: 'bottom',
  },
  {
    id: 'notifications',
    title: 'Stay Updated',
    description: 'Get notified about new recommendations, trending content, and what\'s new. Click the bell icon to view all notifications.',
    target: '[data-tour="notifications"]',
    position: 'bottom',
  },
  {
    id: 'profile',
    title: 'Your Profile',
    description: 'Switch between profiles, manage your account, and access your personal lists. Sign in with TMDB to sync your watchlist and favorites.',
    target: '[data-tour="profile"]',
    position: 'bottom',
  },
  {
    id: 'hero',
    title: 'Featured Content',
    description: 'The hero section showcases featured movies and TV shows. Click "Play" to start watching or "More Info" to see details.',
    target: '[data-tour="hero"]',
    position: 'bottom',
    highlightPadding: 16,
  },
  {
    id: 'continue-watching',
    title: 'Continue Watching',
    description: 'Pick up where you left off! Your recently watched content appears here. Click any item to resume playback from your last position.',
    target: '[data-tour="continue-watching"]',
    position: 'top',
  },
  {
    id: 'settings',
    title: 'Personalize Your Experience',
    description: 'Customize themes, playback settings, and subtitle preferences in Settings. Make CineStream your own!',
    target: '[data-tour="settings"]',
    position: 'bottom',
  },
  {
    id: 'finish',
    title: 'You\'re All Set! 🎉',
    description: 'Start exploring! Press "?" anytime to see keyboard shortcuts. Enjoy your streaming experience!',
    target: '',
    position: 'center',
  },
];

export const onboarding = {
  isComplete(): boolean {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(getOnboardingKey()) === 'true';
  },

  markComplete(): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(getOnboardingKey(), 'true');
    }
  },

  reset(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(getOnboardingKey());
      localStorage.removeItem(getStepKey());
    }
  },

  getCurrentStep(): number {
    if (typeof window === 'undefined') return 0;
    const step = localStorage.getItem(getStepKey());
    return step ? parseInt(step, 10) : 0;
  },

  setCurrentStep(step: number): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(getStepKey(), String(step));
    }
  },
};
