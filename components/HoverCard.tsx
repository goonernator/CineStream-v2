'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import type { MediaItem, Video } from '@/lib/types';
import { tmdb } from '@/lib/tmdb';
import { streaming } from '@/lib/streaming';
import { auth } from '@/lib/auth';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { useToast } from '@/lib/toast';

interface HoverCardProps {
  item: MediaItem;
  onClose: () => void;
  parentRef: React.RefObject<HTMLDivElement | null>;
  mouseX: number;
  mouseY: number;
  clientX: number;
  clientY: number;
}

export default function HoverCard({ item, onClose, parentRef, mouseX, mouseY, clientX, clientY }: HoverCardProps) {
  const router = useRouter();
  const toast = useToast();
  const [trailer, setTrailer] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const isMovie = 'title' in item;
  const title = isMovie ? item.title : item.name;
  const backdropPath = item.backdrop_path
    ? `${TMDB_IMAGE_BASE}/w780${item.backdrop_path}`
    : null;

  useEffect(() => {
    let cancelled = false;
    
    const loadData = async () => {
      try {
        // Load trailer first (lightweight)
        const videos = isMovie
          ? await tmdb.getMovieTrailers(item.id)
          : await tmdb.getTVTrailers(item.id);
        if (!cancelled && videos.length > 0) {
          setTrailer(videos[0]);
        }
      } catch (error) {
        console.error('Failed to load trailer:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Load watchlist/favorites status with a delay to reduce API calls
    const loadStatus = async () => {
      const authState = auth.getAuthState();
      if (!authState.isAuthenticated || !authState.accountId || !authState.sessionId) return;
      
      try {
        // Sequential calls to avoid rate limiting
        const watchlisted = await tmdb.checkWatchlistStatus(authState.sessionId, authState.accountId, item.id, isMovie ? 'movie' : 'tv');
        if (!cancelled) setIsWatchlisted(watchlisted);
        
        const favorited = await tmdb.checkFavoritesStatus(authState.sessionId, authState.accountId, item.id, isMovie ? 'movie' : 'tv');
        if (!cancelled) setIsFavorited(favorited);
      } catch (error) {
        console.error('Failed to load status:', error);
      }
    };

    loadData();
    
    // Delay status check by 500ms - only load if user keeps hovering
    const statusTimeout = setTimeout(loadStatus, 500);
    
    return () => {
      cancelled = true;
      clearTimeout(statusTimeout);
    };
  }, [item.id, isMovie]);

  const handlePlay = () => {
    router.push(`/watch/${item.id}?type=${isMovie ? 'movie' : 'tv'}`);
  };

  const handleAddToWatchlist = async () => {
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
      console.error('Failed to update watchlist:', error);
      toast.error('Failed to update watchlist. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddToFavorites = async () => {
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
      console.error('Failed to update favorites:', error);
      toast.error('Failed to update favorites. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const hoverCardRef = useRef<HTMLDivElement>(null);
  const [trailerLoaded, setTrailerLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load trailer after delay (like reference)
    const trailerTimer = setTimeout(() => {
      setTrailerLoaded(true);
    }, 800);

    return () => clearTimeout(trailerTimer);
  }, []);

  // Position hover card near mouse cursor (Netflix style) - using fixed positioning
  const cardWidth = 320;
  const cardHeight = 380;
  const offset = 15; // Distance from cursor
  
  // Calculate position - prefer right and below cursor (like reference)
  let left = clientX + offset;
  let top = clientY + offset;
  
  // Adjust if hovercard would go off screen right
  if (left + cardWidth > window.innerWidth - 20) {
    left = clientX - cardWidth - offset;
  }
  
  // Adjust if hovercard would go off screen bottom
  if (top + cardHeight > window.innerHeight - 20) {
    top = clientY - cardHeight - offset;
  }
  
  // Ensure not off left edge
  if (left < 20) {
    left = 20;
  }
  
  // Ensure not off top edge
  if (top < 20) {
    top = 20;
  }

  const handleMouseEnter = () => {
    // Keep hovercard open when hovering over it
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    // Close when leaving the hover card
    const relatedTarget = e.relatedTarget;
    const parentElement = parentRef.current;
    if (parentElement && relatedTarget instanceof Node && !parentElement.contains(relatedTarget)) {
      onClose();
    } else if (!relatedTarget) {
      // If relatedTarget is null, mouse left the window
      onClose();
    }
  };

  if (!mounted) return null;

  const hoverCardContent = (
    <div
      ref={hoverCardRef}
      className="fixed bg-netflix-dark border border-netflix-gray/20 backdrop-blur-sm overflow-hidden pointer-events-auto transition-all duration-200 animate-slide-in rounded-lg"
      style={{
        width: `${cardWidth}px`,
        boxShadow: '0 20px 60px rgba(128, 128, 128, 0.3), 0 10px 20px rgba(0, 0, 0, 0.2)',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 99999,
        opacity: 1,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Poster with Trailer Overlay */}
      <div className="relative w-full bg-netflix-dark" style={{ height: '180px' }}>
        {/* Static Poster */}
        {item.poster_path && (
          <Image
            src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
            alt={title}
            fill
            className="object-cover"
            sizes="320px"
            unoptimized
          />
        )}
        
        {/* Trailer Overlay (shows after delay) */}
        {trailerLoaded && trailer && !loading && (
          <div className="absolute inset-0 opacity-100 transition-opacity duration-300">
            <iframe
              src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailer.key}&modestbranding=1&rel=0`}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              style={{ border: 'none' }}
            />
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="p-4 bg-netflix-dark">
        {/* Action Buttons */}
        <div className="flex gap-2 items-center mb-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePlay();
            }}
            className="w-9 h-9 bg-netflix-red text-white rounded-full flex items-center justify-center hover:bg-netflix-red/80 hover:scale-105 transition-all"
            title="Play"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '18px', height: '18px', marginLeft: '2px' }}>
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAddToWatchlist();
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-200 hover:scale-110 ${
              isWatchlisted 
                ? 'bg-netflix-red border-netflix-red text-white' 
                : 'border-netflix-gray text-netflix-light hover:border-netflix-red hover:text-netflix-red'
            }`}
            title="Add to Watchlist"
          >
            <svg viewBox="0 0 24 24" fill={isWatchlisted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAddToFavorites();
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-200 hover:scale-110 ${
              isFavorited 
                ? 'bg-red-500 border-red-500 text-white' 
                : 'border-netflix-gray text-netflix-light hover:border-red-500 hover:text-red-500'
            }`}
            title="Add to Favorites"
          >
            <svg viewBox="0 0 24 24" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>

        {/* Info Section */}
        <div className="flex flex-col gap-2">
          {/* Rating */}
          <div className="text-green-500 text-xs font-semibold">
            {Math.round(item.vote_average * 10)}% Match
          </div>

          {/* Description */}
          <p className="text-xs text-netflix-gray leading-tight line-clamp-3">
            {item.overview || 'No description available.'}
          </p>
        </div>
      </div>
    </div>
  );

  // Render to document.body to escape stacking context (like reference)
  return createPortal(hoverCardContent, document.body);
}
