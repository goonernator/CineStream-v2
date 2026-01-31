'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import type { MediaItem } from '@/lib/types';

interface MagazineCardProps {
  item: MediaItem & { media_type?: 'movie' | 'tv' };
  size?: 'small' | 'medium' | 'large' | 'featured';
  index?: number;
  onRemove?: () => void;
  listType?: 'favorites' | 'watchlist';
}

// Extract dominant color from image using canvas
function useDominantColor(imageUrl: string | null) {
  const [color, setColor] = useState<string>('rgba(229, 9, 20, 0.5)');

  useEffect(() => {
    if (!imageUrl) return;

    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = 50;
        canvas.height = 50;
        ctx.drawImage(img, 0, 0, 50, 50);

        const imageData = ctx.getImageData(0, 0, 50, 50).data;
        let r = 0, g = 0, b = 0, count = 0;

        // Sample pixels to find average color
        for (let i = 0; i < imageData.length; i += 16) {
          const red = imageData[i];
          const green = imageData[i + 1];
          const blue = imageData[i + 2];
          const alpha = imageData[i + 3];

          // Skip transparent or very dark pixels
          if (alpha > 200 && (red + green + blue) > 60) {
            r += red;
            g += green;
            b += blue;
            count++;
          }
        }

        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          
          // Boost saturation for more vibrant glow
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const boost = 1.3;
          
          if (max !== min) {
            r = Math.min(255, Math.round(r * boost));
            g = Math.min(255, Math.round(g * boost));
            b = Math.min(255, Math.round(b * boost));
          }
          
          setColor(`rgba(${r}, ${g}, ${b}, 0.6)`);
        }
      } catch (e) {
        // CORS error, use default color
      }
    };
  }, [imageUrl]);

  return color;
}

export default function MagazineCard({ 
  item, 
  size = 'medium', 
  index = 0,
  onRemove,
  listType = 'favorites'
}: MagazineCardProps) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const isMovie = item.media_type === 'movie' || 'title' in item;
  const title = isMovie ? (item as any).title : (item as any).name;
  const date = isMovie ? (item as any).release_date : (item as any).first_air_date;
  const year = date ? date.split('-')[0] : '';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';

  const posterUrl = item.poster_path
    ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
    : null;
  const backdropUrl = item.backdrop_path
    ? `${TMDB_IMAGE_BASE}/w780${item.backdrop_path}`
    : null;

  const glowColor = useDominantColor(posterUrl);

  // Size configurations
  const sizeConfig = {
    small: { 
      height: 'h-64',
      imageHeight: 'h-40',
      titleSize: 'text-sm',
      showBackdrop: false,
    },
    medium: { 
      height: 'h-80',
      imageHeight: 'h-52',
      titleSize: 'text-base',
      showBackdrop: false,
    },
    large: { 
      height: 'h-96',
      imageHeight: 'h-64',
      titleSize: 'text-lg',
      showBackdrop: true,
    },
    featured: { 
      height: 'h-[28rem]',
      imageHeight: 'h-80',
      titleSize: 'text-xl',
      showBackdrop: true,
    },
  };

  const config = sizeConfig[size];

  // 3D Tilt effect
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -10;
    const rotateY = ((x - centerX) / centerX) * 10;

    setTilt({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  };

  const handleClick = () => {
    router.push(`/details/${item.id}?type=${item.media_type || (isMovie ? 'movie' : 'tv')}`);
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/watch/${item.id}?type=${item.media_type || (isMovie ? 'movie' : 'tv')}`);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.();
  };

  // Stagger animation delay
  const animationDelay = `${index * 0.05}s`;

  return (
    <div
      ref={cardRef}
      className={`relative ${config.height} cursor-pointer overflow-hidden rounded-2xl group`}
      style={{
        perspective: '1000px',
        animationDelay,
        opacity: 0,
        animation: `magazineCardIn 0.5s ease-out ${animationDelay} forwards`,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Card with 3D transform */}
      <div
        className="relative w-full h-full rounded-2xl overflow-hidden transition-all duration-200 ease-out"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${isHovered ? 1.02 : 1})`,
          transformStyle: 'preserve-3d',
          boxShadow: isHovered 
            ? `0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 60px ${glowColor}, 0 0 100px ${glowColor.replace('0.6', '0.3')}`
            : '0 10px 30px -5px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Background Image */}
        <div className="absolute inset-0">
          {(config.showBackdrop && backdropUrl) || posterUrl ? (
            <>
              {!imageLoaded && (
                <div className="absolute inset-0 bg-netflix-dark animate-pulse" />
              )}
              <Image
                src={config.showBackdrop && backdropUrl ? backdropUrl : posterUrl!}
                alt={title}
                fill
                className={`object-cover transition-all duration-500 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                } ${isHovered ? 'scale-110' : 'scale-100'}`}
                sizes={size === 'featured' ? '100vw' : '400px'}
                onLoad={() => setImageLoaded(true)}
                unoptimized
              />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-netflix-dark to-netflix-bg flex items-center justify-center">
              <svg className="w-16 h-16 text-netflix-gray/30" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
              </svg>
            </div>
          )}
        </div>

        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div 
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `linear-gradient(135deg, ${glowColor.replace('0.6', '0.2')} 0%, transparent 50%)`,
          }}
        />

        {/* Type Badge */}
        <div className="absolute top-4 left-4 z-10">
          <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full backdrop-blur-sm ${
            isMovie 
              ? 'bg-netflix-red/80 text-white' 
              : 'bg-blue-500/80 text-white'
          }`}>
            {isMovie ? 'Movie' : 'TV Series'}
          </span>
        </div>

        {/* Rating Badge */}
        {item.vote_average > 0 && (
          <div className="absolute top-4 right-4 z-10">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-black/60 backdrop-blur-sm rounded-full">
              <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="text-sm font-bold text-white">{rating}</span>
            </div>
          </div>
        )}

        {/* Content - positioned at bottom */}
        <div 
          className="absolute bottom-0 left-0 right-0 p-5 z-10"
          style={{ transform: 'translateZ(30px)' }}
        >
          {/* Title */}
          <h3 className={`${config.titleSize} font-bold text-netflix-light mb-2 line-clamp-2 drop-shadow-lg group-hover:text-netflix-red transition-colors`}>
            {title}
          </h3>

          {/* Meta Info */}
          <div className="flex items-center gap-3 text-sm text-netflix-light/80 mb-4">
            {year && <span>{year}</span>}
            {item.vote_count && (
              <>
                <span className="w-1 h-1 rounded-full bg-white/40" />
                <span>{item.vote_count.toLocaleString()} votes</span>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div 
            className="flex gap-3 opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300"
            style={{ transform: 'translateZ(40px)' }}
          >
            <button
              onClick={handlePlay}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-white/90 transition-colors shadow-lg"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              className="px-4 py-2.5 bg-netflix-gray/30 backdrop-blur-sm text-netflix-light rounded-lg hover:bg-netflix-gray/40 transition-colors"
              title="More Info"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </button>
            {onRemove && (
              <button
                onClick={handleRemove}
                className="px-4 py-2.5 bg-red-500/20 backdrop-blur-sm text-red-400 rounded-lg hover:bg-red-500/40 hover:text-red-300 transition-colors"
                title={`Remove from ${listType}`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Shine Effect on Hover */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.1) 45%, transparent 50%)`,
            transform: 'translateX(-100%)',
            animation: isHovered ? 'shine 0.8s ease-out forwards' : 'none',
          }}
        />
      </div>
    </div>
  );
}

