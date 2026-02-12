'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { MediaItem } from '@/lib/types';
import HoverCard from './HoverCard';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { tmdb } from '@/lib/tmdb';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { watchProgress, type WatchProgress } from '@/lib/watchProgress';
import { useToast } from '@/lib/toast';

interface MediaCardProps {
  item: MediaItem;
  showBadges?: boolean;
  showQuickActions?: boolean;
  size?: 'default' | 'small' | 'large';
  className?: string;
}

// Star rating icon
const StarIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
  </svg>
);

// Play icon for quick action
const PlayIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

// Format rating to one decimal
const formatRating = (rating: number) => rating.toFixed(1);

// Get year from date string
const getYear = (dateString: string | undefined) => {
  if (!dateString) return null;
  return new Date(dateString).getFullYear();
};

// Rating color based on score
const getRatingColor = (rating: number) => {
  if (rating >= 7) return 'bg-emerald-500';
  if (rating >= 5) return 'bg-amber-500';
  return 'bg-red-500';
};

export default function MediaCard({ 
  item, 
  showBadges = true, 
  showQuickActions = true,
  size = 'default',
  className = ''
}: MediaCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [isHovered, setIsHovered] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0, clientX: 0, clientY: 0 });
  const [progress, setProgress] = useState<WatchProgress | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const isMovie = 'title' in item;
  const title = isMovie ? item.title : item.name;
  const releaseDate = isMovie ? item.release_date : item.first_air_date;
  const year = getYear(releaseDate);
  const rating = item.vote_average;
  
  const posterPath = item.poster_path
    ? `${TMDB_IMAGE_BASE}/w342${item.poster_path}`
    : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="342" height="513"%3E%3Crect fill="%231a1a1a" width="342" height="513"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23666" font-family="Arial" font-size="18"%3ENo Image%3C/text%3E%3C/svg%3E';

  // Size configurations
  const sizeConfig = {
    small: { width: 150, height: 225, textSize: 'text-xs' },
    default: { width: 200, height: 300, textSize: 'text-sm' },
    large: { width: 250, height: 375, textSize: 'text-base' },
  };
  
  const { width, height, textSize } = sizeConfig[size];

  // Check for watch progress (client-side only to avoid hydration errors)
  useEffect(() => {
    if (isMovie) {
      const savedProgress = watchProgress.getProgress(item.id, 'movie');
      setProgress(savedProgress);
    } else {
      // For TV shows, get the most recent progress (any episode)
      const allProgress = watchProgress.getAllProgress();
      const tvProgress = allProgress
        .filter(p => p.id === item.id && p.type === 'tv' && p.season && p.episode)
        .sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0))[0];
      setProgress(tvProgress || null);
    }
  }, [item.id, isMovie]);

  // Load watchlist/favorites status only when card is flipped (to reduce API calls)
  useEffect(() => {
    if (!isFlipped) return;
    
    const loadStatus = async () => {
      const authState = auth.getAuthState();
      if (authState.isAuthenticated && authState.accountId && authState.sessionId) {
        try {
          // Sequential calls to avoid rate limiting
          const watchlisted = await tmdb.checkWatchlistStatus(authState.sessionId, authState.accountId, item.id, isMovie ? 'movie' : 'tv');
          setIsWatchlisted(watchlisted);
          const favorited = await tmdb.checkFavoritesStatus(authState.sessionId, authState.accountId, item.id, isMovie ? 'movie' : 'tv');
          setIsFavorited(favorited);
        } catch (error) {
          logger.error('Failed to load status:', error);
        }
      }
    };
    loadStatus();
  }, [isFlipped, item.id, isMovie]);

  const hasProgress = progress && progress.progress > 0 && progress.progress < 90;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (cardRef.current && !isFlipped) {
      const rect = cardRef.current.getBoundingClientRect();
      setMousePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        clientX: e.clientX,
        clientY: e.clientY,
      });
    }
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasProgress && progress) {
      if (progress.type === 'tv' && progress.season && progress.episode) {
        router.push(`/watch/${item.id}?type=tv&season=${progress.season}&episode=${progress.episode}`);
      } else {
        router.push(`/watch/${item.id}?type=${isMovie ? 'movie' : 'tv'}`);
      }
    } else {
      router.push(`/watch/${item.id}?type=${isMovie ? 'movie' : 'tv'}`);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFlipped) {
      // If flipped, clicking goes to details
      router.push(`/details/${item.id}?type=${isMovie ? 'movie' : 'tv'}`);
    } else {
      router.push(`/details/${item.id}?type=${isMovie ? 'movie' : 'tv'}`);
    }
  };

  // Right-click to flip the card
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovered(false); // Hide hover card
    setIsFlipped(!isFlipped);
  };

  // Click anywhere outside to unflip
  useEffect(() => {
    if (isFlipped) {
      const handleClickOutside = (e: MouseEvent) => {
        if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
          setIsFlipped(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isFlipped]);

  const handleAddToWatchlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (isUpdating) return;
    
    const authState = auth.getAuthState();
    if (!authState.isAuthenticated || !authState.accountId || !authState.sessionId) {
      toast.info('Please sign in to add to watchlist');
      await auth.initiateLogin();
      return;
    }

    setIsUpdating(true);
    try {
      const newState = !isWatchlisted;
      await tmdb.addToWatchlist(
        authState.sessionId,
        authState.accountId,
        item.id,
        isMovie ? 'movie' : 'tv',
        newState
      );
      setIsWatchlisted(newState);
      toast.success(
        newState ? `Added "${title}" to watchlist` : `Removed "${title}" from watchlist`
      );
    } catch (error) {
      logger.error('Failed to update watchlist:', error);
      toast.error('Failed to update watchlist. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddToFavorites = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (isUpdating) return;
    
    const authState = auth.getAuthState();
    if (!authState.isAuthenticated || !authState.accountId || !authState.sessionId) {
      toast.info('Please sign in to add to favorites');
      await auth.initiateLogin();
      return;
    }

    setIsUpdating(true);
    try {
      const newState = !isFavorited;
      await tmdb.addToFavorites(
        authState.sessionId,
        authState.accountId,
        item.id,
        isMovie ? 'movie' : 'tv',
        newState
      );
      setIsFavorited(newState);
      toast.success(
        newState ? `Added "${title}" to favorites` : `Removed "${title}" from favorites`
      );
    } catch (error) {
      logger.error('Failed to update favorites:', error);
      toast.error('Failed to update favorites. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const url = `${window.location.origin}/details/${item.id}?type=${isMovie ? 'movie' : 'tv'}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard!');
    } catch (error) {
      logger.error('Failed to copy link:', error);
      toast.error('Failed to copy link');
    }
  };

  return (
    <div
      ref={cardRef}
      className={`relative flex-shrink-0 group/card ${className}`}
      style={{ width: `${width}px`, perspective: '1000px' }}
      onMouseEnter={() => !isFlipped && setIsHovered(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={(e) => {
        const relatedTarget = e.relatedTarget;
        if (cardRef.current && relatedTarget instanceof Node && !cardRef.current.contains(relatedTarget)) {
          setIsHovered(false);
        } else if (!relatedTarget) {
          setIsHovered(false);
        }
      }}
    >
      {/* Card Container with Flip */}
      <div
        className="relative transition-transform duration-500 ease-out"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front Side - Poster */}
        <div
          className="absolute inset-0 overflow-hidden cursor-pointer transition-all duration-300 ease-out shadow-elevation-2 group-hover/card:scale-105 group-hover/card:-translate-y-2 group-hover/card:shadow-2xl group-hover/card:ring-2 group-hover/card:ring-netflix-red/50 rounded-lg"
          style={{
            backfaceVisibility: 'hidden',
            backgroundColor: '#1a1a1a',
          }}
          onClick={handleCardClick}
          onContextMenu={handleContextMenu}
        >
          {/* Loading skeleton */}
          {!imageLoaded && (
            <div className="absolute inset-0 bg-netflix-gray/20 animate-pulse" />
          )}
          
          <Image
            src={posterPath}
            alt={title}
            fill
            className={`object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            sizes={`${width}px`}
            unoptimized
            onLoad={() => setImageLoaded(true)}
          />
          
          {/* Gradient overlay for badges */}
          {showBadges && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300" />
          )}
          
          {/* Rating Badge */}
          {showBadges && rating > 0 && (
            <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full ${getRatingColor(rating)} text-white text-xs font-semibold shadow-lg`}>
              <StarIcon className="w-3 h-3" />
              <span>{formatRating(rating)}</span>
            </div>
          )}
          
          {/* Year Badge */}
          {showBadges && year && (
            <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded text-white text-xs font-medium">
              {year}
            </div>
          )}
          
          {/* Media Type Badge */}
          {showBadges && (
            <div className="absolute bottom-12 left-2 px-2 py-0.5 bg-netflix-red/90 rounded text-white text-xs font-semibold uppercase tracking-wider opacity-0 group-hover/card:opacity-100 transition-opacity duration-300">
              {isMovie ? 'Movie' : 'TV'}
            </div>
          )}
          
          {/* Quick Play Button on Hover */}
          {showQuickActions && !isFlipped && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all duration-300">
              <button
                onClick={handlePlayClick}
                className="w-14 h-14 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transform scale-75 group-hover/card:scale-100 transition-all duration-300 shadow-xl hover:shadow-2xl"
                aria-label={`Play ${title}`}
              >
                <PlayIcon className="w-7 h-7 text-netflix-dark ml-1" />
              </button>
            </div>
          )}
          
          {/* Progress bar for continue watching */}
          {hasProgress && progress && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
              <div 
                className="h-full bg-netflix-red transition-all"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          )}

          {/* Right-click hint */}
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded text-white/60 text-[10px] opacity-0 group-hover/card:opacity-100 transition-opacity duration-300">
            Right-click for more
          </div>
        </div>

        {/* Back Side - Info Card */}
        <div
          className="absolute inset-0 overflow-hidden cursor-pointer rounded-lg bg-netflix-dark border border-netflix-gray/20 shadow-2xl"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
          onClick={handleCardClick}
          onContextMenu={handleContextMenu}
        >
          {/* Mini Poster at top */}
          <div className="relative w-full h-24 overflow-hidden">
            {item.backdrop_path ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/w500${item.backdrop_path}`}
                alt={title}
                fill
                className="object-cover"
                sizes={`${width}px`}
                unoptimized
              />
            ) : item.poster_path ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/w342${item.poster_path}`}
                alt={title}
                fill
                className="object-cover blur-sm scale-110"
                sizes={`${width}px`}
                unoptimized
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-netflix-dark via-netflix-dark/50 to-transparent" />
            
            {/* Close/Flip back button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFlipped(false);
              }}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
              aria-label="Close details"
            >
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-3 flex flex-col h-[calc(100%-6rem)]">
            {/* Title */}
            <h3 className="text-sm font-bold text-netflix-light line-clamp-2 mb-1">{title}</h3>
            
            {/* Meta info */}
            <div className="flex items-center gap-2 text-xs text-netflix-gray mb-2">
              <span className="text-green-500 font-semibold">{Math.round(rating * 10)}% Match</span>
              {year && <span>• {year}</span>}
              <span>• {isMovie ? 'Movie' : 'TV'}</span>
            </div>

            {/* Description */}
            <p className="text-xs text-netflix-gray leading-relaxed line-clamp-4 flex-1 overflow-hidden">
              {item.overview || 'No description available.'}
            </p>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-3 pt-2 border-t border-netflix-gray/20">
              <button
                onClick={handlePlayClick}
                className="flex-1 h-8 bg-netflix-red hover:bg-netflix-red/80 text-white text-xs font-semibold rounded flex items-center justify-center gap-1 transition-colors"
                aria-label={`Play ${title}`}
              >
                <PlayIcon className="w-3.5 h-3.5" />
                Play
              </button>
              <button
                onClick={handleAddToWatchlist}
                disabled={isUpdating}
                className={`w-8 h-8 rounded flex items-center justify-center transition-all ${
                  isWatchlisted 
                    ? 'bg-netflix-red text-white' 
                    : 'bg-netflix-gray/20 text-netflix-light hover:bg-netflix-gray/30'
                } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}
                aria-label={isWatchlisted ? `Remove ${title} from watchlist` : `Add ${title} to watchlist`}
              >
                <svg viewBox="0 0 24 24" fill={isWatchlisted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" className={`w-4 h-4 ${isUpdating ? 'animate-pulse' : ''}`}>
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              <button
                onClick={handleAddToFavorites}
                disabled={isUpdating}
                className={`w-8 h-8 rounded flex items-center justify-center transition-all ${
                  isFavorited 
                    ? 'bg-red-500 text-white' 
                    : 'bg-netflix-gray/20 text-netflix-light hover:bg-netflix-gray/30'
                } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
                aria-label={isFavorited ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
              >
                <svg viewBox="0 0 24 24" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" className={`w-4 h-4 ${isUpdating ? 'animate-pulse' : ''}`}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
              <button
                onClick={handleShare}
                className="w-8 h-8 rounded bg-netflix-gray/20 text-netflix-light hover:bg-netflix-gray/30 flex items-center justify-center transition-all"
                title="Copy Link"
                aria-label={`Copy link for ${title}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <circle cx="18" cy="5" r="3"/>
                  <circle cx="6" cy="12" r="3"/>
                  <circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Title below card */}
      <div className="mt-2 px-1">
        <h3 className={`${textSize} font-medium text-netflix-light truncate group-hover/card:text-netflix-red transition-colors`}>
          {title}
        </h3>
        {showBadges && (
          <p className="text-xs text-netflix-gray mt-0.5 truncate">
            {isMovie ? 'Movie' : 'TV Series'} {year && `• ${year}`}
          </p>
        )}
      </div>

      {/* Hover Card Overlay - only show when not flipped */}
      {isHovered && !isFlipped && (
        <HoverCard
          item={item}
          onClose={() => setIsHovered(false)}
          parentRef={cardRef}
          mouseX={mousePosition.x}
          mouseY={mousePosition.y}
          clientX={mousePosition.clientX}
          clientY={mousePosition.clientY}
        />
      )}
    </div>
  );
}
