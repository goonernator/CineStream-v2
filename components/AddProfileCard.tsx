'use client';

import { useState } from 'react';

interface AddProfileCardProps {
  onAdd: () => void;
  disabled?: boolean;
}

export default function AddProfileCard({ onAdd, disabled }: AddProfileCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className={`
        group flex flex-col items-center gap-3 
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => !disabled && onAdd()}
    >
      {/* Add Button */}
      <div 
        className={`
          w-28 h-28 sm:w-36 sm:h-36 rounded-lg flex items-center justify-center
          border-2 border-dashed transition-all duration-300 ease-out
          ${isHovered && !disabled 
            ? 'border-white bg-white/10 scale-105' 
            : 'border-netflix-gray/50 bg-netflix-gray/10'
          }
        `}
      >
        <svg 
          className={`
            w-12 h-12 sm:w-16 sm:h-16 transition-all duration-300
            ${isHovered && !disabled ? 'text-white scale-110' : 'text-netflix-gray'}
          `}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={1.5} 
            d="M12 4v16m8-8H4" 
          />
        </svg>
      </div>

      {/* Label */}
      <span 
        className={`
          text-sm sm:text-base font-medium text-center transition-colors duration-200
          ${isHovered && !disabled ? 'text-white' : 'text-netflix-gray'}
        `}
      >
        Add Profile
      </span>

      {/* Spacer for alignment with ProfileCard */}
      <span className="text-xs text-transparent">spacer</span>
    </div>
  );
}

