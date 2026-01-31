'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { profiles, Profile, PROFILE_AVATARS, PROFILE_COLORS } from '@/lib/profiles';
import { auth } from '@/lib/auth';
import ProfileCard from '@/components/ProfileCard';
import AddProfileCard from '@/components/AddProfileCard';

const MAX_PROFILES = 5;

export default function ProfilesPage() {
  const router = useRouter();
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [isManageMode, setIsManageMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [modalData, setModalData] = useState({
    name: '',
    avatar: PROFILE_AVATARS[0],
    color: PROFILE_COLORS[0],
    isKidsProfile: false,
  });
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Load profiles
  useEffect(() => {
    // Check for pending auth completion
    const checkPendingAuth = async () => {
      if (auth.hasPendingAuth()) {
        setIsAuthenticating(true);
        try {
          await auth.completeLogin();
          // Redirect to home after successful login
          router.push('/');
          return;
        } catch (error) {
          console.error('Failed to complete login:', error);
        }
        setIsAuthenticating(false);
      }
    };

    checkPendingAuth();

    // Try migration from legacy
    profiles.migrateFromLegacy();
    
    setAllProfiles(profiles.getAllProfiles());
    setIsLoading(false);
  }, [router]);

  // Handle profile selection
  const handleSelectProfile = (profile: Profile) => {
    profiles.setActiveProfile(profile.id);
    router.push('/');
  };

  // Handle add profile
  const handleAddProfile = () => {
    setEditingProfile(null);
    setModalData({
      name: '',
      avatar: PROFILE_AVATARS[Math.floor(Math.random() * PROFILE_AVATARS.length)],
      color: PROFILE_COLORS[allProfiles.length % PROFILE_COLORS.length],
      isKidsProfile: false,
    });
    setShowModal(true);
  };

  // Handle edit profile
  const handleEditProfile = (profile: Profile) => {
    setEditingProfile(profile);
    setModalData({
      name: profile.name,
      avatar: profile.avatar,
      color: profile.color,
      isKidsProfile: profile.isKidsProfile,
    });
    setShowModal(true);
  };

  // Handle delete profile
  const handleDeleteProfile = (profile: Profile) => {
    if (confirm(`Are you sure you want to delete "${profile.name}"? This will remove all their watch history and preferences.`)) {
      profiles.deleteProfile(profile.id);
      setAllProfiles(profiles.getAllProfiles());
    }
  };

  // Handle save profile
  const handleSaveProfile = () => {
    if (!modalData.name.trim()) return;

    if (editingProfile) {
      profiles.updateProfile(editingProfile.id, modalData);
    } else {
      profiles.createProfile(modalData);
    }

    setAllProfiles(profiles.getAllProfiles());
    setShowModal(false);
  };

  // Handle link TMDB account
  const handleLinkTMDB = async () => {
    if (editingProfile) {
      await auth.initiateLogin(editingProfile.id);
    } else {
      // Create profile first, then link
      const newProfile = profiles.createProfile(modalData);
      setAllProfiles(profiles.getAllProfiles());
      await auth.initiateLogin(newProfile.id);
    }
    setShowModal(false);
  };

  if (isLoading || isAuthenticating) {
    return (
      <div className="min-h-screen bg-netflix-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-netflix-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-netflix-gray">
            {isAuthenticating ? 'Completing login...' : 'Loading profiles...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-netflix-bg flex flex-col items-center justify-center px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-5xl font-bold text-white mb-2">
          Who's watching?
        </h1>
        {isManageMode && (
          <p className="text-netflix-gray mt-2">
            Click a profile to edit or delete it
          </p>
        )}
      </div>

      {/* Profiles Grid */}
      <div className="flex flex-wrap justify-center gap-6 sm:gap-8 max-w-4xl mb-12">
        {allProfiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            isManageMode={isManageMode}
            onSelect={handleSelectProfile}
            onEdit={handleEditProfile}
            onDelete={handleDeleteProfile}
          />
        ))}
        
        {/* Add Profile Button */}
        {!isManageMode && allProfiles.length < MAX_PROFILES && (
          <AddProfileCard 
            onAdd={handleAddProfile}
            disabled={allProfiles.length >= MAX_PROFILES}
          />
        )}
      </div>

      {/* Manage Profiles Button */}
      <button
        onClick={() => setIsManageMode(!isManageMode)}
        className={`
          px-8 py-2 border text-sm sm:text-base font-medium tracking-wide
          transition-all duration-200
          ${isManageMode 
            ? 'bg-white text-netflix-dark border-white hover:bg-netflix-red hover:text-white hover:border-netflix-red' 
            : 'bg-transparent text-netflix-gray border-netflix-gray hover:text-white hover:border-white'
          }
        `}
      >
        {isManageMode ? 'Done' : 'Manage Profiles'}
      </button>

      {/* Add/Edit Profile Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-netflix-dark border border-netflix-gray/30 rounded-lg w-full max-w-md p-6">
            <h2 className="text-2xl font-bold text-white mb-6">
              {editingProfile ? 'Edit Profile' : 'Add Profile'}
            </h2>

            {/* Profile Preview */}
            <div className="flex justify-center mb-6">
              <div 
                className="w-24 h-24 rounded-lg flex items-center justify-center text-4xl"
                style={{ backgroundColor: modalData.color }}
              >
                {modalData.avatar}
              </div>
            </div>

            {/* Name Input */}
            <div className="mb-4">
              <label className="block text-sm text-netflix-gray mb-2">Name</label>
              <input
                type="text"
                value={modalData.name}
                onChange={(e) => setModalData({ ...modalData, name: e.target.value })}
                placeholder="Profile name"
                className="w-full px-4 py-3 bg-netflix-bg border border-netflix-gray/30 rounded text-white placeholder-netflix-gray focus:outline-none focus:border-netflix-red"
                maxLength={20}
                autoFocus
              />
            </div>

            {/* Avatar Selection */}
            <div className="mb-4">
              <label className="block text-sm text-netflix-gray mb-2">Avatar</label>
              <div className="flex flex-wrap gap-2">
                {PROFILE_AVATARS.slice(0, 16).map((avatar) => (
                  <button
                    key={avatar}
                    onClick={() => setModalData({ ...modalData, avatar })}
                    className={`
                      w-10 h-10 rounded flex items-center justify-center text-xl
                      transition-all duration-150
                      ${modalData.avatar === avatar 
                        ? 'bg-white/20 ring-2 ring-white scale-110' 
                        : 'bg-netflix-bg hover:bg-white/10'
                      }
                    `}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Selection */}
            <div className="mb-4">
              <label className="block text-sm text-netflix-gray mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {PROFILE_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setModalData({ ...modalData, color })}
                    className={`
                      w-10 h-10 rounded transition-all duration-150
                      ${modalData.color === color 
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-netflix-dark scale-110' 
                        : 'hover:scale-105'
                      }
                    `}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Kids Profile Toggle */}
            <div className="mb-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={modalData.isKidsProfile}
                  onChange={(e) => setModalData({ ...modalData, isKidsProfile: e.target.checked })}
                  className="w-5 h-5 rounded border-netflix-gray/30 bg-netflix-bg text-netflix-red focus:ring-netflix-red"
                />
                <span className="text-netflix-light">Kids profile</span>
              </label>
              <p className="text-xs text-netflix-gray mt-1 ml-8">
                Content will be filtered for younger viewers
              </p>
            </div>

            {/* TMDB Link Status */}
            {editingProfile && (
              <div className="mb-6 p-3 bg-netflix-bg rounded border border-netflix-gray/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-netflix-light">TMDB Account</p>
                    {editingProfile.username ? (
                      <p className="text-xs text-green-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Connected as {editingProfile.username}
                      </p>
                    ) : (
                      <p className="text-xs text-netflix-gray">Not connected</p>
                    )}
                  </div>
                  <button
                    onClick={handleLinkTMDB}
                    className="px-3 py-1 text-sm bg-netflix-red hover:bg-red-600 rounded transition-colors"
                  >
                    {editingProfile.username ? 'Relink' : 'Link Account'}
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-3 bg-transparent border border-netflix-gray/50 text-netflix-gray hover:text-white hover:border-white rounded transition-colors"
              >
                Cancel
              </button>
              {!editingProfile && (
                <button
                  onClick={handleLinkTMDB}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Create & Link TMDB
                </button>
              )}
              <button
                onClick={handleSaveProfile}
                disabled={!modalData.name.trim()}
                className="flex-1 px-4 py-3 bg-netflix-red hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingProfile ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

