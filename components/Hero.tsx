'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { tmdb } from '@/lib/tmdb';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { watchProgress, type WatchProgress } from '@/lib/watchProgress';
import { filterValidMedia } from '@/lib/mediaFilter';
import type { Movie, TVShow } from '@/lib/types';

const ROTATION_INTERVAL = 8000; // 8 seconds

interface HeroItem {
  item: Movie | TVShow;
  isFromContinueWatching: boolean;
  watchProgressData?: WatchProgress;
}

export default function Hero() {
  const router = useRouter();
  const [heroItems, setHeroItems] = useState<HeroItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadHero = async () => {
      try {
        const items: HeroItem[] = [];

        // First check for continue watching
        const recentProgress = watchProgress.getMostRecent();
        
        if (recentProgress) {
          try {
            let item: Movie | TVShow;
            if (recentProgress.type === 'movie') {
              item = await tmdb.getMovieDetails(recentProgress.id);
            } else {
              item = await tmdb.getTVDetails(recentProgress.id);
            }
            
            // Check if item has thumbnail and rating
            if (item.backdrop_path && item.poster_path && item.vote_average && item.vote_average > 0) {
              items.push({
                item,
                isFromContinueWatching: true,
                watchProgressData: recentProgress,
              });
            }
          } catch (error) {
            console.error('Failed to load continue watching item:', error);
          }
        }

        // Load trending for rotation
        try {
          const trending = await tmdb.getTrendingAll('day');
          const validTrending = filterValidMedia(trending)
            .filter(item => item.backdrop_path) // Hero needs backdrop
            .slice(0, items.length > 0 ? 5 : 6); // 5 trending + 1 continue watching, or 6 trending
          
          validTrending.forEach(item => {
            // Don't duplicate if it's the continue watching item
            if (!items.some(h => h.item.id === item.id)) {
              items.push({
                item,
                isFromContinueWatching: false,
              });
            }
          });
        } catch (error) {
          console.error('Failed to load trending:', error);
        }

        if (items.length > 0) {
          setHeroItems(items);
        }
      } catch (error) {
        console.error('Failed to load hero:', error);
      } finally {
        setLoading(false);
      }
    };

    loadHero();
  }, []);

  // Auto-rotation effect
  useEffect(() => {
    if (heroItems.length <= 1 || isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      goToNext();
    }, ROTATION_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [heroItems.length, isPaused, currentIndex]);

  const goToNext = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % heroItems.length);
      setIsTransitioning(false);
    }, 400);
  }, [heroItems.length]);

  const goToPrev = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex(prev => (prev - 1 + heroItems.length) % heroItems.length);
      setIsTransitioning(false);
    }, 400);
  }, [heroItems.length]);

  const goToIndex = useCallback((index: number) => {
    if (index === currentIndex) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex(index);
      setIsTransitioning(false);
    }, 400);
  }, [currentIndex]);

  if (loading || heroItems.length === 0) {
    return (
      <div className="relative w-full h-[70vh] min-h-[500px] pb-48 bg-netflix-bg">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-netflix-gray/20 to-netflix-gray/10" />
      </div>
    );
  }

  const currentHero = heroItems[currentIndex];
  const featuredItem = currentHero.item;
  const watchProgressData = currentHero.watchProgressData;

  const isMovie = 'title' in featuredItem;
  const title = isMovie ? featuredItem.title : featuredItem.name;
  const backdropPath = featuredItem.backdrop_path
    ? `${TMDB_IMAGE_BASE}/original${featuredItem.backdrop_path}`
    : null;
  const releaseYear = isMovie
    ? featuredItem.release_date?.split('-')[0]
    : featuredItem.first_air_date?.split('-')[0];

  const handlePlay = () => {
    if (watchProgressData && watchProgressData.type === 'tv' && watchProgressData.season && watchProgressData.episode) {
      router.push(`/watch/${featuredItem.id}?type=tv&season=${watchProgressData.season}&episode=${watchProgressData.episode}`);
    } else {
      router.push(`/watch/${featuredItem.id}?type=${isMovie ? 'movie' : 'tv'}`);
    }
  };

  const handleMoreInfo = () => {
    router.push(`/details/${featuredItem.id}?type=${isMovie ? 'movie' : 'tv'}`);
  };

  return (
    <div 
      className="relative w-full h-[70vh] min-h-[500px] pb-48 overflow-hidden bg-netflix-bg"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      data-tour="hero"
    >
      {/* Backdrop */}
      {backdropPath && (
        <>
          <div className={`absolute inset-0 transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
            <Image
              src={backdropPath}
              alt={title}
              fill
              className="object-cover"
              sizes="100vw"
              unoptimized
              priority
            />
          </div>
          {/* Top gradient - fades from titlebar down into hero */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, var(--netflix-bg) 0%, var(--netflix-bg) 0px, rgba(20, 20, 20, 0.3) 120px, rgba(20, 20, 20, 0.15) 200px, transparent 75%)'
            }}
          />
          {/* Bottom gradient - fades bottom to background */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to top, var(--netflix-bg) 0%, rgba(20, 20, 20, 0.2) 50%, transparent 100%)'
            }}
          />
          {/* Side gradient - fades left to background */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to right, var(--netflix-bg) 0%, rgba(20, 20, 20, 0.1) 50%, transparent 100%)'
            }}
          />
        </>
      )}

      {/* Navigation Arrows (show on hover when multiple items) */}
      {heroItems.length > 1 && (
        <>
          {/* Left Arrow */}
          <button
            onClick={goToPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white opacity-0 hover:opacity-100 transition-all duration-300 group-hover:opacity-100 backdrop-blur-sm"
            aria-label="Previous"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Right Arrow */}
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white opacity-0 hover:opacity-100 transition-all duration-300 group-hover:opacity-100 backdrop-blur-sm"
            aria-label="Next"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Content */}
      <div className={`absolute bottom-0 left-0 right-0 z-10 transition-all duration-500 ${isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
        <div className="w-full px-8 pb-6 max-w-6xl">
          {/* Continue Watching Badge */}
          {currentHero.isFromContinueWatching && (
            <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 bg-netflix-red/90 rounded-lg text-sm font-semibold">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Continue Watching
            </div>
          )}

          {/* Badges */}
          <div className="flex items-center gap-4 mb-4">
            {featuredItem.vote_average > 0 && (
              <div className="flex items-center gap-1 bg-netflix-dark/80 px-3 py-1 shadow-sm transition-all duration-300 hover:scale-105 rounded-md">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-yellow-400">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span className="text-sm font-semibold">{featuredItem.vote_average.toFixed(1)}</span>
              </div>
            )}
            {releaseYear && (
              <span className="bg-netflix-dark/80 px-3 py-1 text-sm shadow-sm transition-all duration-300 hover:scale-105 rounded-md">{releaseYear}</span>
            )}
            <span className="bg-netflix-dark/80 px-3 py-1 text-sm shadow-sm transition-all duration-300 hover:scale-105 rounded-md uppercase">
              {isMovie ? 'Movie' : 'TV Series'}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-6xl font-bold mb-4 max-w-3xl">{title}</h1>

          {/* Description */}
          <p className="text-lg mb-6 max-w-2xl line-clamp-3">{featuredItem.overview}</p>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={handlePlay}
              className="bg-netflix-red hover:bg-red-600 text-white px-8 py-3 font-semibold transition-all duration-300 flex items-center gap-2 shadow-lg shadow-netflix-red/50 hover:shadow-xl hover:shadow-netflix-red/70 hover:-translate-y-1 glow-red-hover rounded-lg"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              <span>{watchProgressData ? 'Continue Watching' : 'Watch Now'}</span>
            </button>
            <button
              onClick={handleMoreInfo}
              className="bg-netflix-dark/80 hover:bg-netflix-dark border border-netflix-gray hover:border-netflix-light text-netflix-light px-8 py-3 font-semibold transition-all duration-300 flex items-center gap-2 shadow-md hover:shadow-lg hover:-translate-y-0.5 rounded-lg"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span>More Info</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dot Indicators */}
      {heroItems.length > 1 && (
        <div className="absolute bottom-4 right-8 z-20 flex items-center gap-2">
          {heroItems.map((_, index) => (
            <button
              key={index}
              onClick={() => goToIndex(index)}
              className={`relative h-1 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'w-8 bg-netflix-red'
                  : 'w-4 bg-white/40 hover:bg-white/60'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            >
              {/* Progress indicator for current slide */}
              {index === currentIndex && !isPaused && (
                <div 
                  className="absolute inset-y-0 left-0 bg-white/50 rounded-full"
                  style={{
                    animation: `heroProgress ${ROTATION_INTERVAL}ms linear forwards`,
                  }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Progress animation keyframe */}
      <style jsx>{`
        @keyframes heroProgress {
          from {
            width: 0%;
          }
          to {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
