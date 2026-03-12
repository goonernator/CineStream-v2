'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import type { MediaItem } from '@/lib/types';

interface NoirFlixCardProps {
  item: MediaItem;
  /** Optional: defaults to navigating to /details/[id]?type=movie|tv */
  onClick?: () => void;
  className?: string;
}

export default function NoirFlixCard({ item, onClick, className = '' }: NoirFlixCardProps) {
  const router = useRouter();
  const isMovie = 'title' in item;
  const title = isMovie ? item.title : item.name;
  const year = isMovie ? item.release_date?.split('-')[0] : item.first_air_date?.split('-')[0];
  const rating = item.vote_average != null ? item.vote_average.toFixed(1) : null;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      router.push(`/details/${item.id}?type=${isMovie ? 'movie' : 'tv'}`);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`movie-card aspect-[2/3] bg-[#0a0a0a] relative border border-[#1a1a1a] overflow-hidden transition-all duration-500 hover:border-[rgba(255,255,255,0.4)] hover:-translate-y-2.5 cursor-pointer group ${className}`}
    >
      <div className="w-full h-full relative">
        {item.poster_path ? (
          <Image
            src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
            alt={title || 'Media'}
            fill
            className="object-cover brightness-[0.7] transition-all duration-800 group-hover:scale-110 group-hover:brightness-100"
            sizes="(max-width: 1024px) 50vw, 25vw"
            unoptimized
          />
        ) : (
          <div className="w-full h-full bg-[#222]" />
        )}
      </div>
      <div className="card-details absolute bottom-0 left-0 p-6 w-full bg-gradient-to-t from-black/90 to-transparent opacity-0 translate-y-5 transition-all duration-400 group-hover:opacity-100 group-hover:translate-y-0">
        <span className="label font-mono text-[0.5rem] tracking-[2px] text-[#888] block mb-2">
          {year || 'N/A'}
          {rating != null ? ` // ${rating}` : ''}
        </span>
        <h3 className="text-xl uppercase font-bold text-white line-clamp-2">
          {title}
        </h3>
      </div>
    </div>
  );
}
