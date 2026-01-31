'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Profile } from '@/lib/profiles';

interface ProfileDropdownProps {
  currentProfile: Profile | null;
  authState: { isAuthenticated: boolean; username?: string | null } | null;
  onLogin: () => void;
  onLogout: () => void;
}

export default function ProfileDropdown({
  currentProfile,
  authState,
  onLogin,
  onLogout,
}: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 p-1.5 rounded-lg transition-all duration-200 ${
          isOpen ? 'bg-netflix-gray/20' : 'hover:bg-netflix-gray/10'
        }`}
      >
        {currentProfile ? (
          <>
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center text-sm"
              style={{ backgroundColor: currentProfile.color }}
            >
              {currentProfile.avatar}
            </div>
            <svg
              className={`w-4 h-4 text-netflix-gray transition-transform duration-200 ${
                isOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        ) : (
          <div className="w-8 h-8 rounded-md bg-netflix-gray/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-netflix-gray" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-netflix-dark/85 backdrop-blur-xl rounded-xl border border-netflix-gray/20 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          {currentProfile ? (
            <>
              {/* Profile Header */}
              <div className="px-4 py-3 border-b border-netflix-gray/10">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                    style={{ backgroundColor: currentProfile.color }}
                  >
                    {currentProfile.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-netflix-light truncate">
                      {currentProfile.name}
                    </p>
                    {authState?.isAuthenticated ? (
                      <p className="text-xs text-green-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        @{authState.username}
                      </p>
                    ) : (
                      <p className="text-xs text-netflix-gray">
                        Not linked to TMDB
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="p-2">
                {/* Switch Profile */}
                <Link
                  href="/profiles"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-netflix-light/80 hover:text-netflix-light hover:bg-netflix-gray/10 rounded-lg transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.5 12c1.38 0 2.49-1.12 2.49-2.5S17.88 7 16.5 7C15.12 7 14 8.12 14 9.5s1.12 2.5 2.5 2.5zM9 11c1.66 0 2.99-1.34 2.99-3S10.66 5 9 5C7.34 5 6 6.34 6 8s1.34 3 3 3zm7.5 3c-1.83 0-5.5.92-5.5 2.75V19h11v-2.25c0-1.83-3.67-2.75-5.5-2.75zM9 13c-2.33 0-7 1.17-7 3.5V19h7v-2.25c0-.85.33-2.34 2.37-3.47C10.5 13.1 9.66 13 9 13z"/>
                  </svg>
                  Switch Profile
                </Link>

                {/* Manage Profiles */}
                <Link
                  href="/profiles"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-netflix-light/80 hover:text-netflix-light hover:bg-netflix-gray/10 rounded-lg transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Manage Profiles
                </Link>

                <div className="my-2 border-t border-netflix-gray/10" />

                {/* Account Section */}
                {authState?.isAuthenticated ? (
                  <button
                    onClick={() => {
                      onLogout();
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-netflix-light/80 hover:text-netflix-red hover:bg-netflix-red/10 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                    </svg>
                    Sign Out
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onLogin();
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-netflix-light/80 hover:text-netflix-red hover:bg-netflix-red/10 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                    </svg>
                    Link TMDB Account
                  </button>
                )}
              </div>
            </>
          ) : (
            /* No Profile Selected */
            <div className="p-4">
              <div className="text-center mb-4">
                <div className="w-16 h-16 rounded-full bg-netflix-gray/20 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-netflix-gray" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
                <p className="text-sm text-netflix-gray">No profile selected</p>
              </div>
              <Link
                href="/profiles"
                className="block w-full py-2.5 text-center text-sm font-medium text-white bg-netflix-red hover:bg-red-600 rounded-lg transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Select Profile
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

