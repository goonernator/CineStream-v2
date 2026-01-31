'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import type { MediaItem } from '@/lib/types';

interface MediaListProps {
  items: (MediaItem & { media_type?: 'movie' | 'tv' })[];
}

export default function MediaList({ items }: MediaListProps) {
  const router = useRouter();

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {items.map((item) => {
        const isMovie = item.media_type === 'movie' || 'title' in item;
        const title = isMovie ? (item as any).title : (item as any).name;
        const date = isMovie ? (item as any).release_date : (item as any).first_air_date;
        const year = date ? date.split('-')[0] : 'Unknown';
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        const posterPath = item.poster_path
          ? `${TMDB_IMAGE_BASE}/w92${item.poster_path}`
          : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 92 138"%3E%3Crect fill="%231a1a1a" width="92" height="138"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23666" font-family="Arial" font-size="12"%3ENo Image%3C/text%3E%3C/svg%3E';

        return (
          <div
            key={`${item.id}-${item.media_type || (isMovie ? 'movie' : 'tv')}`}
            onClick={() => router.push(`/details/${item.id}?type=${item.media_type || (isMovie ? 'movie' : 'tv')}`)}
            className="flex gap-4 p-4 bg-netflix-dark/50 hover:bg-netflix-dark/80 transition-colors cursor-pointer group"
          >
            <div className="relative w-16 h-24 flex-shrink-0 bg-netflix-bg">
              <Image
                src={posterPath}
                alt={title}
                fill
                className="object-cover"
                sizes="64px"
                unoptimized
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold truncate">{title}</h3>
                <span
                  className={`px-2 py-0.5 text-xs font-semibold flex-shrink-0 ${
                    isMovie
                      ? 'bg-netflix-red text-white'
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  {isMovie ? 'Movie' : 'TV'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-netflix-gray">
                <span>{year}</span>
                <div className="flex items-center gap-1">
                  <svg
                    className="w-4 h-4 text-yellow-400"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <span>{rating}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
