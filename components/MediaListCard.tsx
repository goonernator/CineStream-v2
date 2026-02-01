'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import type { Movie, TVShow, MediaItem } from '@/lib/types';

interface MediaListCardProps {
  item: MediaItem & { media_type?: 'movie' | 'tv' };
  onRemove?: (item: MediaItem) => void;
  listType?: 'favorites' | 'watchlist';
}

export default function MediaListCard({ item, onRemove, listType = 'watchlist' }: MediaListCardProps) {
  const router = useRouter();
  const isMovie = 'title' in item;
  const title = isMovie ? (item as Movie).title : (item as TVShow).name;
  const backdropPath = item.backdrop_path;
  const posterPath = item.poster_path;
  const imageUrl = backdropPath
    ? `${TMDB_IMAGE_BASE}/w780${backdropPath}`
    : posterPath
    ? `${TMDB_IMAGE_BASE}/w500${posterPath}`
    : null;

  const releaseDate = isMovie 
    ? (item as Movie).release_date 
    : (item as TVShow).first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

  const handleWatch = () => {
    if (isMovie) {
      router.push(`/watch/${item.id}?type=movie`);
    } else {
      router.push(`/details/${item.id}?type=tv`);
    }
  };

  const handleDetails = () => {
    router.push(`/details/${item.id}?type=${isMovie ? 'movie' : 'tv'}`);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(item);
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-xl bg-netflix-dark border border-white/5 hover:border-netflix-red/30 transition-all duration-300 hover:shadow-2xl hover:shadow-netflix-red/10">
      {/* Backdrop Image */}
      <div className="relative h-40 overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="400px"
            unoptimized
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-netflix-gray/20 to-netflix-dark flex items-center justify-center">
            <svg className="w-12 h-12 text-netflix-gray/50" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
            </svg>
          </div>
        )}
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-netflix-dark via-netflix-dark/50 to-transparent" />
        
        {/* Type Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="px-2 py-1 text-xs font-semibold uppercase tracking-wider bg-netflix-red/90 rounded text-white">
            {isMovie ? 'Movie' : 'TV'}
          </span>
          {rating && (
            <span className="px-2 py-1 text-xs font-semibold bg-black/60 backdrop-blur-sm rounded text-white flex items-center gap-1">
              <svg className="w-3 h-3 fill-yellow-500" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {rating}
            </span>
          )}
        </div>
        
        {/* Year badge */}
        {year && (
          <div className="absolute top-3 right-3 px-2 py-1 text-xs bg-black/60 backdrop-blur-sm rounded text-white/80">
            {year}
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-netflix-light truncate mb-1 group-hover:text-netflix-red transition-colors">
          {title}
        </h3>
        
        {/* Metadata */}
        <div className="flex items-center gap-2 text-sm text-netflix-gray mb-4">
          {rating && (
            <>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 fill-yellow-500" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                {rating}
              </span>
              {year && <span className="text-netflix-gray/50">•</span>}
            </>
          )}
          {year && <span>{year}</span>}
          {!isMovie && (item as TVShow).first_air_date && (
            <>
              <span className="text-netflix-gray/50">•</span>
              <span>TV Series</span>
            </>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleWatch}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-netflix-red hover:bg-red-600 rounded-lg text-white text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            {isMovie ? 'Watch' : 'View'}
          </button>
          <button
            onClick={handleDetails}
            className="px-3 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="View Details"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {onRemove && (
            <button
              onClick={handleRemove}
              className="px-3 py-2.5 bg-white/10 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-white/70 transition-colors"
              title={`Remove from ${listType === 'favorites' ? 'Favorites' : 'Watchlist'}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

