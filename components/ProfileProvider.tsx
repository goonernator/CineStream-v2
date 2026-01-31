'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { profiles, Profile, ProfilesState, PROFILE_AVATARS, PROFILE_COLORS } from '@/lib/profiles';

interface ProfileContextType {
  // State
  currentProfile: Profile | null;
  allProfiles: Profile[];
  isLoading: boolean;
  
  // Actions
  selectProfile: (profileId: string) => void;
  createProfile: (data: { name: string; avatar?: string; color?: string; isKidsProfile?: boolean }) => Profile;
  updateProfile: (profileId: string, updates: Partial<Profile>) => Profile | null;
  deleteProfile: (profileId: string) => boolean;
  switchProfile: () => void; // Navigate to profile selection
  logout: (profileId?: string) => void; // Logout specific or current profile
  
  // Helpers
  getStorageKey: (baseKey: string) => string;
  hasProfiles: boolean;
  
  // Available options
  avatarOptions: string[];
  colorOptions: string[];
}

const ProfileContext = createContext<ProfileContextType | null>(null);

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}

// Optional hook that doesn't throw if outside provider
export function useProfileOptional() {
  return useContext(ProfileContext);
}

interface ProfileProviderProps {
  children: ReactNode;
}

export default function ProfileProvider({ children }: ProfileProviderProps) {
  const [state, setState] = useState<ProfilesState>({
    profiles: [],
    activeProfileId: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Initialize state from localStorage
  useEffect(() => {
    // Try migration first
    profiles.migrateFromLegacy();
    
    // Load current state
    const currentState = profiles.getState();
    setState(currentState);
    setIsLoading(false);
  }, []);

  // Listen for profile changes from other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cinestream_profiles' || e.key === 'cinestream_active_profile') {
        setState(profiles.getState());
      }
    };

    const handleProfileChange = () => {
      setState(profiles.getState());
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('cinestream:profile-changed', handleProfileChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('cinestream:profile-changed', handleProfileChange);
    };
  }, []);

  const currentProfile = state.activeProfileId
    ? state.profiles.find(p => p.id === state.activeProfileId) || null
    : null;

  const selectProfile = useCallback((profileId: string) => {
    profiles.setActiveProfile(profileId);
    setState(profiles.getState());
  }, []);

  const createProfile = useCallback((data: { name: string; avatar?: string; color?: string; isKidsProfile?: boolean }) => {
    const newProfile = profiles.createProfile(data);
    setState(profiles.getState());
    return newProfile;
  }, []);

  const updateProfile = useCallback((profileId: string, updates: Partial<Profile>) => {
    const updated = profiles.updateProfile(profileId, updates);
    if (updated) {
      setState(profiles.getState());
    }
    return updated;
  }, []);

  const deleteProfile = useCallback((profileId: string) => {
    const success = profiles.deleteProfile(profileId);
    if (success) {
      setState(profiles.getState());
    }
    return success;
  }, []);

  const switchProfile = useCallback(() => {
    // Clear active profile and trigger navigation
    profiles.setActiveProfile(null);
    setState(profiles.getState());
    // Navigation will be handled by the layout guard
    window.location.href = '/profiles';
  }, []);

  const logout = useCallback((profileId?: string) => {
    const targetId = profileId || state.activeProfileId;
    if (!targetId) return;

    // Clear auth data for this profile
    profiles.updateProfile(targetId, {
      sessionId: null,
      accountId: null,
      username: null,
    });

    setState(profiles.getState());
  }, [state.activeProfileId]);

  const getStorageKey = useCallback((baseKey: string) => {
    return profiles.getStorageKey(baseKey, state.activeProfileId || undefined);
  }, [state.activeProfileId]);

  const value: ProfileContextType = {
    currentProfile,
    allProfiles: state.profiles,
    isLoading,
    selectProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    switchProfile,
    logout,
    getStorageKey,
    hasProfiles: state.profiles.length > 0,
    avatarOptions: PROFILE_AVATARS,
    colorOptions: PROFILE_COLORS,
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

