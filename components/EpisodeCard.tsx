'use client';

import Image from 'next/image';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import type { Episode } from '@/lib/types';

interface EpisodeCardProps {
  episode: Episode;
  isSelected?: boolean;
  progress?: number; // 0-100
  onClick: () => void;
}

export default function EpisodeCard({ episode, isSelected, progress, onClick }: EpisodeCardProps) {
  const hasProgress = progress !== undefined && progress > 0 && progress < 100;

  return (
    <div
      onClick={onClick}
      className={`group relative flex-shrink-0 w-72 cursor-pointer transition-all duration-300 hover:scale-105 ${
        isSelected ? 'ring-2 ring-netflix-red' : ''
      }`}
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-netflix-dark mb-3">
        {episode.still_path ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w400${episode.still_path}`}
            alt={episode.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-110"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-netflix-dark to-netflix-bg">
            <svg className="w-12 h-12 text-netflix-gray/50" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
            </svg>
          </div>
        )}

        {/* Episode number badge */}
        <div className="absolute top-2 left-2 bg-netflix-dark/90 backdrop-blur-sm px-2.5 py-1 rounded-lg text-sm font-bold">
          E{episode.episode_number}
        </div>

        {/* Duration badge */}
        {episode.runtime && (
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-lg text-xs">
            {episode.runtime} min
          </div>
        )}

        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
          <div className="w-14 h-14 rounded-full bg-netflix-red flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform shadow-lg shadow-netflix-red/50">
            <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>

        {/* Progress bar */}
        {hasProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-netflix-dark/70">
            <div 
              className="h-full bg-netflix-red transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute inset-0 border-2 border-netflix-red rounded-xl pointer-events-none" />
        )}
      </div>

      {/* Episode info */}
      <div className="px-1">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-netflix-light group-hover:text-white line-clamp-1 transition-colors">
            {episode.name}
          </h3>
          {episode.vote_average > 0 && (
            <div className="flex items-center gap-1 text-xs text-netflix-gray flex-shrink-0">
              <span className="text-yellow-400">★</span>
              <span>{episode.vote_average.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-netflix-gray mb-2">
          {episode.air_date && (
            <span>{new Date(episode.air_date).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: 'numeric' 
            })}</span>
          )}
          {hasProgress && (
            <span className="text-netflix-red">{progress?.toFixed(0)}% watched</span>
          )}
        </div>

        {/* Overview */}
        <p className="text-xs text-netflix-gray/80 line-clamp-2 group-hover:line-clamp-4 transition-all">
          {episode.overview || 'No description available.'}
        </p>
      </div>
    </div>
  );
}

// Compact version for smaller displays
export function EpisodeCardCompact({ episode, isSelected, progress, onClick }: EpisodeCardProps) {
  const hasProgress = progress !== undefined && progress > 0 && progress < 100;

  return (
    <div
      onClick={onClick}
      className={`group flex gap-4 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
        isSelected 
          ? 'bg-netflix-red/20 border-l-4 border-netflix-red' 
          : 'bg-netflix-dark/30 hover:bg-netflix-dark/60'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative w-32 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-netflix-dark">
        {episode.still_path ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w200${episode.still_path}`}
            alt={episode.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl">🎬</span>
          </div>
        )}
        
        {/* Episode number */}
        <div className="absolute top-1 left-1 bg-black/80 px-1.5 py-0.5 rounded text-xs font-bold">
          E{episode.episode_number}
        </div>

        {/* Progress bar */}
        {hasProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-netflix-dark/70">
            <div 
              className="h-full bg-netflix-red"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm text-netflix-light group-hover:text-white line-clamp-1 mb-1">
          {episode.name}
        </h3>
        <div className="flex items-center gap-2 text-xs text-netflix-gray mb-1">
          {episode.runtime && <span>{episode.runtime} min</span>}
          {episode.vote_average > 0 && (
            <span className="flex items-center gap-0.5">
              <span className="text-yellow-400">★</span>
              {episode.vote_average.toFixed(1)}
            </span>
          )}
        </div>
        <p className="text-xs text-netflix-gray/80 line-clamp-2">
          {episode.overview || 'No description available.'}
        </p>
      </div>
    </div>
  );
}

