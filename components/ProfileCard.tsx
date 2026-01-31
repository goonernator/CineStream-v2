'use client';

import { useState } from 'react';
import { Profile } from '@/lib/profiles';

interface ProfileCardProps {
  profile: Profile;
  isManageMode: boolean;
  onSelect: (profile: Profile) => void;
  onEdit: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
}

export default function ProfileCard({ 
  profile, 
  isManageMode, 
  onSelect, 
  onEdit, 
  onDelete 
}: ProfileCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    if (isManageMode) {
      onEdit(profile);
    } else {
      onSelect(profile);
    }
  };

  return (
    <div 
      className="group flex flex-col items-center gap-3 cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Avatar Container */}
      <div 
        className="relative"
        onClick={handleClick}
      >
        {/* Avatar */}
        <div 
          className={`
            w-28 h-28 sm:w-36 sm:h-36 rounded-lg flex items-center justify-center text-5xl sm:text-6xl
            transition-all duration-300 ease-out
            ${isHovered && !isManageMode ? 'scale-105 ring-4 ring-white' : ''}
            ${isManageMode ? 'opacity-50' : ''}
          `}
          style={{ 
            backgroundColor: profile.color,
            boxShadow: isHovered ? `0 0 30px ${profile.color}40` : 'none'
          }}
        >
          {profile.avatar.startsWith('http') ? (
            <img 
              src={profile.avatar} 
              alt={profile.name}
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <span className="select-none">{profile.avatar}</span>
          )}
        </div>

        {/* Manage Mode Overlay */}
        {isManageMode && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-netflix-dark/80 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
          </div>
        )}

        {/* Delete Button (visible in manage mode on hover) */}
        {isManageMode && isHovered && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(profile);
            }}
            className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-netflix-red flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Kids Badge */}
        {profile.isKidsProfile && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-yellow-500 text-black text-xs font-bold rounded">
            KIDS
          </div>
        )}
      </div>

      {/* Name */}
      <span 
        className={`
          text-sm sm:text-base font-medium text-center transition-colors duration-200
          ${isHovered && !isManageMode ? 'text-white' : 'text-netflix-gray'}
        `}
      >
        {profile.name}
      </span>

      {/* Auth Status */}
      {profile.sessionId ? (
        <span className="text-xs text-green-500 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Connected
        </span>
      ) : (
        <span className="text-xs text-netflix-gray flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-netflix-gray" />
          Not linked
        </span>
      )}
    </div>
  );
}

