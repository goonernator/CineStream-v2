'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Profile } from '@/lib/profiles';

interface ProfileDropdownProps {
  currentProfile: Profile | null;
  authState: { isAuthenticated: boolean; username?: string | null } | null;
}

export default function ProfileDropdown({
  currentProfile,
  authState,
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
                <Link
                  href="/settings?tab=account"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-netflix-light/80 hover:text-netflix-light hover:bg-netflix-gray/10 rounded-lg transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c1.98 0 3.6-1.62 3.6-3.6s-1.62-3.6-3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                  </svg>
                  Account settings
                </Link>
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

