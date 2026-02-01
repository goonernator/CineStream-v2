// Profile management for multi-account support
import { logger } from './logger';

export interface Profile {
  id: string;
  name: string;
  avatar: string; // URL or emoji/icon identifier
  color: string; // Hex color for profile accent
  sessionId: string | null;
  accountId: number | null;
  username: string | null;
  isKidsProfile: boolean;
  createdAt: number;
}

export interface ProfilesState {
  profiles: Profile[];
  activeProfileId: string | null;
}

const PROFILES_STORAGE_KEY = 'cinestream_profiles';
const ACTIVE_PROFILE_KEY = 'cinestream_active_profile';

// Default avatars/colors for new profiles
export const PROFILE_AVATARS = [
  '👤', '😀', '😎', '🎬', '🎭', '🎮', '🎵', '🎨',
  '🦊', '🐱', '🐶', '🦁', '🐼', '🦄', '🐉', '🦋',
  '🌟', '🔥', '💎', '🎯', '🚀', '⚡', '🌈', '🎪'
];

export const PROFILE_COLORS = [
  '#E50914', // Netflix Red
  '#0077B5', // Blue
  '#00A67E', // Green
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

// Generate unique ID
function generateId(): string {
  return `profile_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export const profiles = {
  // Get all profiles
  getAllProfiles(): Profile[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      logger.error('Failed to get profiles:', error);
    }
    return [];
  },

  // Save all profiles
  saveProfiles(profileList: Profile[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profileList));
    } catch (error) {
      logger.error('Failed to save profiles:', error);
    }
  },

  // Get active profile ID
  getActiveProfileId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_PROFILE_KEY);
  },

  // Set active profile
  setActiveProfile(profileId: string | null): void {
    if (typeof window === 'undefined') return;
    if (profileId) {
      localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
    } else {
      localStorage.removeItem(ACTIVE_PROFILE_KEY);
    }
    // Dispatch event for other components to react
    window.dispatchEvent(new CustomEvent('cinestream:profile-changed', { detail: { profileId } }));
  },

  // Get active profile
  getActiveProfile(): Profile | null {
    const profileId = this.getActiveProfileId();
    if (!profileId) return null;
    const allProfiles = this.getAllProfiles();
    return allProfiles.find(p => p.id === profileId) || null;
  },

  // Create a new profile
  createProfile(data: {
    name: string;
    avatar?: string;
    color?: string;
    sessionId?: string | null;
    accountId?: number | null;
    username?: string | null;
    isKidsProfile?: boolean;
  }): Profile {
    const allProfiles = this.getAllProfiles();
    
    const newProfile: Profile = {
      id: generateId(),
      name: data.name,
      avatar: data.avatar || PROFILE_AVATARS[Math.floor(Math.random() * PROFILE_AVATARS.length)],
      color: data.color || PROFILE_COLORS[allProfiles.length % PROFILE_COLORS.length],
      sessionId: data.sessionId || null,
      accountId: data.accountId || null,
      username: data.username || null,
      isKidsProfile: data.isKidsProfile || false,
      createdAt: Date.now(),
    };

    allProfiles.push(newProfile);
    this.saveProfiles(allProfiles);

    return newProfile;
  },

  // Update a profile
  updateProfile(profileId: string, updates: Partial<Omit<Profile, 'id' | 'createdAt'>>): Profile | null {
    const allProfiles = this.getAllProfiles();
    const index = allProfiles.findIndex(p => p.id === profileId);
    
    if (index === -1) return null;

    allProfiles[index] = {
      ...allProfiles[index],
      ...updates,
    };

    this.saveProfiles(allProfiles);
    return allProfiles[index];
  },

  // Delete a profile
  deleteProfile(profileId: string): boolean {
    const allProfiles = this.getAllProfiles();
    const filtered = allProfiles.filter(p => p.id !== profileId);
    
    if (filtered.length === allProfiles.length) return false;

    this.saveProfiles(filtered);

    // If deleted profile was active, clear active profile
    if (this.getActiveProfileId() === profileId) {
      this.setActiveProfile(null);
    }

    // Clean up profile-specific data
    this.cleanupProfileData(profileId);

    return true;
  },

  // Clean up profile-specific localStorage data
  cleanupProfileData(profileId: string): void {
    if (typeof window === 'undefined') return;
    
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes(`_${profileId}_`)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  },

  // Migrate existing single-account data to profile system
  migrateFromLegacy(): Profile | null {
    if (typeof window === 'undefined') return null;

    // Check if already migrated
    const existingProfiles = this.getAllProfiles();
    if (existingProfiles.length > 0) return null;

    // Check for legacy auth data
    const legacySessionId = localStorage.getItem('tmdb_session_id');
    const legacyAccount = localStorage.getItem('tmdb_account');

    if (!legacySessionId || !legacyAccount) return null;

    try {
      const account = JSON.parse(legacyAccount);
      
      // Create profile from legacy data
      const profile = this.createProfile({
        name: account.username || 'Profile 1',
        sessionId: legacySessionId,
        accountId: account.id,
        username: account.username,
      });

      // Migrate legacy watch progress, theme, etc.
      this.migrateLegacyData(profile.id);

      // Set as active profile
      this.setActiveProfile(profile.id);

      // Clean up legacy keys (optional - keep for backward compat)
      // localStorage.removeItem('tmdb_session_id');
      // localStorage.removeItem('tmdb_account');

      logger.debug('Migrated legacy account to profile system');
      return profile;
    } catch (error) {
      logger.error('Failed to migrate legacy account:', error);
      return null;
    }
  },

  // Migrate legacy data to profile-specific keys
  migrateLegacyData(profileId: string): void {
    if (typeof window === 'undefined') return;

    const migrations = [
      { from: 'cinestream_watch_progress', to: `cinestream_${profileId}_watch_progress` },
      { from: 'cinestream_theme', to: `cinestream_${profileId}_theme` },
      { from: 'cinestream_notifications', to: `cinestream_${profileId}_notifications` },
      { from: 'cinestream_onboarding_complete', to: `cinestream_${profileId}_onboarding_complete` },
      { from: 'cinestream_recent_searches', to: `cinestream_${profileId}_recent_searches` },
    ];

    migrations.forEach(({ from, to }) => {
      const data = localStorage.getItem(from);
      if (data && !localStorage.getItem(to)) {
        localStorage.setItem(to, data);
      }
    });
  },

  // Get profile-scoped storage key
  getStorageKey(baseKey: string, profileId?: string): string {
    const id = profileId || this.getActiveProfileId();
    if (!id) return baseKey; // Fallback to base key if no profile
    return `cinestream_${id}_${baseKey}`;
  },

  // Check if profiles exist
  hasProfiles(): boolean {
    return this.getAllProfiles().length > 0;
  },

  // Get profiles state
  getState(): ProfilesState {
    return {
      profiles: this.getAllProfiles(),
      activeProfileId: this.getActiveProfileId(),
    };
  },
};

