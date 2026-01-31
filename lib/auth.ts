import { tmdb, getAuthorizationUrl } from './tmdb';
import { profiles, Profile } from './profiles';

const REQUEST_TOKEN_KEY = 'tmdb_request_token';
const PENDING_PROFILE_KEY = 'tmdb_pending_profile_id';

// Legacy keys for backward compatibility
const LEGACY_SESSION_KEY = 'tmdb_session_id';
const LEGACY_ACCOUNT_KEY = 'tmdb_account';

export interface AuthState {
  sessionId: string | null;
  accountId: number | null;
  username: string | null;
  isAuthenticated: boolean;
  profileId: string | null;
}

export const auth = {
  // Get session ID from active profile or legacy storage
  getSessionId(): string | null {
    if (typeof window === 'undefined') return null;
    
    // First try active profile
    const activeProfile = profiles.getActiveProfile();
    if (activeProfile?.sessionId) {
      return activeProfile.sessionId;
    }
    
    // Fallback to legacy storage
    return localStorage.getItem(LEGACY_SESSION_KEY);
  },

  // Get account ID from active profile or legacy storage
  getAccountId(): number | null {
    if (typeof window === 'undefined') return null;
    
    // First try active profile
    const activeProfile = profiles.getActiveProfile();
    if (activeProfile?.accountId) {
      return activeProfile.accountId;
    }
    
    // Fallback to legacy storage
    const account = localStorage.getItem(LEGACY_ACCOUNT_KEY);
    return account ? JSON.parse(account).id : null;
  },

  // Get auth state for current profile
  getAuthState(): AuthState {
    const activeProfile = profiles.getActiveProfile();
    
    if (activeProfile) {
      return {
        sessionId: activeProfile.sessionId,
        accountId: activeProfile.accountId,
        username: activeProfile.username,
        isAuthenticated: !!activeProfile.sessionId && !!activeProfile.accountId,
        profileId: activeProfile.id,
      };
    }

    // Fallback to legacy storage
    const sessionId = typeof window !== 'undefined' ? localStorage.getItem(LEGACY_SESSION_KEY) : null;
    const account = typeof window !== 'undefined' ? localStorage.getItem(LEGACY_ACCOUNT_KEY) : null;
    const accountData = account ? JSON.parse(account) : null;

    return {
      sessionId,
      accountId: accountData?.id || null,
      username: accountData?.username || null,
      isAuthenticated: !!sessionId && !!accountData?.id,
      profileId: null,
    };
  },

  // Get auth state for a specific profile
  getProfileAuthState(profileId: string): AuthState {
    const allProfiles = profiles.getAllProfiles();
    const profile = allProfiles.find(p => p.id === profileId);
    
    if (!profile) {
      return {
        sessionId: null,
        accountId: null,
        username: null,
        isAuthenticated: false,
        profileId,
      };
    }

    return {
      sessionId: profile.sessionId,
      accountId: profile.accountId,
      username: profile.username,
      isAuthenticated: !!profile.sessionId && !!profile.accountId,
      profileId: profile.id,
    };
  },

  // Initiate OAuth flow for a new profile or to link to existing profile
  async initiateLogin(forProfileId?: string): Promise<void> {
    if (typeof window === 'undefined') return;
    
    try {
      const { request_token } = await tmdb.getRequestToken();
      const authUrl = getAuthorizationUrl(request_token);
      
      // Store request token
      sessionStorage.setItem(REQUEST_TOKEN_KEY, request_token);
      localStorage.setItem(REQUEST_TOKEN_KEY, request_token);
      
      // Store profile ID if linking to existing profile
      if (forProfileId) {
        localStorage.setItem(PENDING_PROFILE_KEY, forProfileId);
      } else {
        localStorage.removeItem(PENDING_PROFILE_KEY);
      }
      
      // Open auth URL
      const electron = (window as any).electron;
      if (electron?.openExternal) {
        console.log('Opening browser via Electron:', authUrl);
        electron.openExternal(authUrl);
      } else {
        console.log('Opening browser window:', authUrl);
        const authWindow = window.open(authUrl, '_blank', 'noopener,noreferrer');
        if (!authWindow) {
          console.warn('Popup blocked, falling back to redirect');
          window.location.href = authUrl;
        }
      }
    } catch (error) {
      console.error('Failed to initiate login:', error);
      throw error;
    }
  },

  // Complete OAuth flow - creates new profile or updates existing
  async completeLogin(approvedToken?: string): Promise<Profile> {
    if (typeof window === 'undefined') throw new Error('Cannot complete login on server');
    
    const token =
      approvedToken ||
      sessionStorage.getItem(REQUEST_TOKEN_KEY) ||
      localStorage.getItem(REQUEST_TOKEN_KEY);
    
    if (!token) throw new Error('No request token found');

    // Create session and get account details
    const { session_id } = await tmdb.createSession(token);
    const account = await tmdb.getAccountDetails(session_id);

    // Check if linking to existing profile
    const pendingProfileId = localStorage.getItem(PENDING_PROFILE_KEY);
    
    let profile: Profile;
    
    if (pendingProfileId) {
      // Update existing profile with TMDB credentials
      const updated = profiles.updateProfile(pendingProfileId, {
        sessionId: session_id,
        accountId: account.id,
        username: account.username,
      });
      
      if (!updated) {
        throw new Error('Failed to update profile');
      }
      
      profile = updated;
    } else {
      // Check if this TMDB account already has a profile
      const existingProfiles = profiles.getAllProfiles();
      const existingProfile = existingProfiles.find(p => p.accountId === account.id);
      
      if (existingProfile) {
        // Update existing profile's session
        const updated = profiles.updateProfile(existingProfile.id, {
          sessionId: session_id,
          username: account.username,
        });
        profile = updated || existingProfile;
      } else {
        // Create new profile
        profile = profiles.createProfile({
          name: account.username || `Profile ${existingProfiles.length + 1}`,
          sessionId: session_id,
          accountId: account.id,
          username: account.username,
        });
      }
    }

    // Clean up tokens
    sessionStorage.removeItem(REQUEST_TOKEN_KEY);
    localStorage.removeItem(REQUEST_TOKEN_KEY);
    localStorage.removeItem(PENDING_PROFILE_KEY);

    // Also store in legacy keys for backward compatibility
    localStorage.setItem(LEGACY_SESSION_KEY, session_id);
    localStorage.setItem(LEGACY_ACCOUNT_KEY, JSON.stringify(account));

    // Set as active profile
    profiles.setActiveProfile(profile.id);

    return profile;
  },

  // Logout current profile (clear TMDB credentials but keep profile)
  logout(): void {
    if (typeof window === 'undefined') return;
    
    const activeProfile = profiles.getActiveProfile();
    if (activeProfile) {
      profiles.updateProfile(activeProfile.id, {
        sessionId: null,
        accountId: null,
        username: null,
      });
    }

    // Clear legacy storage
    localStorage.removeItem(LEGACY_SESSION_KEY);
    localStorage.removeItem(LEGACY_ACCOUNT_KEY);
    localStorage.removeItem(REQUEST_TOKEN_KEY);
    sessionStorage.removeItem(REQUEST_TOKEN_KEY);
  },

  // Logout specific profile
  logoutProfile(profileId: string): void {
    if (typeof window === 'undefined') return;
    
    profiles.updateProfile(profileId, {
      sessionId: null,
      accountId: null,
      username: null,
    });

    // If this was the active profile, clear legacy storage too
    if (profiles.getActiveProfileId() === profileId) {
      localStorage.removeItem(LEGACY_SESSION_KEY);
      localStorage.removeItem(LEGACY_ACCOUNT_KEY);
    }
  },

  // Check if there's a pending OAuth flow to complete
  hasPendingAuth(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(sessionStorage.getItem(REQUEST_TOKEN_KEY) || localStorage.getItem(REQUEST_TOKEN_KEY));
  },
};
