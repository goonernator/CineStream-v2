'use client';

import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import MediaCard from './MediaCard';
import { MediaCardSkeletonGrid } from './MediaCardSkeleton';
import { filterValidMedia } from '@/lib/mediaFilter';
import type { MediaItem } from '@/lib/types';

interface MediaGridProps {
  items: MediaItem[];
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  emptyMessage?: string;
  className?: string;
  columns?: {
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
    '2xl'?: number;
  };
}

// Loading spinner icon
const LoadingSpinner = ({ className = '' }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

export default function MediaGrid({
  items,
  loading = false,
  hasMore = false,
  onLoadMore,
  emptyMessage = 'No items found',
  className = '',
  columns = { sm: 2, md: 3, lg: 4, xl: 5, '2xl': 6 },
}: MediaGridProps) {
  // Filter items to only show those with thumbnails and ratings
  const validItems = useMemo(() => filterValidMedia(items), [items]);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMore || !onLoadMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, onLoadMore, loading]);

  // Show/hide scroll to top button
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 500);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Generate grid column classes
  const gridCols = `
    grid-cols-${columns.sm || 2}
    sm:grid-cols-${columns.sm || 2}
    md:grid-cols-${columns.md || 3}
    lg:grid-cols-${columns.lg || 4}
    xl:grid-cols-${columns.xl || 5}
    2xl:grid-cols-${columns['2xl'] || 6}
  `;

  // Show initial loading skeletons
  if (loading && validItems.length === 0) {
    return (
      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 ${className}`}>
        {Array.from({ length: 18 }).map((_, i) => (
          <MediaCardSkeletonGrid key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (!loading && validItems.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-20 ${className}`}>
        <svg className="w-20 h-20 text-netflix-gray/50 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
        </svg>
        <p className="text-netflix-gray text-lg">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
        {validItems.map((item, index) => (
          <div 
            key={`${item.id}-${index}`} 
            className="animate-scale-up"
            style={{ animationDelay: `${Math.min(index * 0.03, 0.3)}s`, animationFillMode: 'both' }}
          >
            <MediaCard item={item} size="default" />
          </div>
        ))}
        
        {/* Loading skeletons at the end */}
        {loading && validItems.length > 0 && (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <MediaCardSkeletonGrid key={`skeleton-${i}`} />
            ))}
          </>
        )}
      </div>

      {/* Infinite scroll trigger */}
      {hasMore && (
        <div ref={observerTarget} className="flex justify-center py-8">
          {loading ? (
            <div className="flex items-center gap-3 text-netflix-gray">
              <LoadingSpinner className="w-6 h-6" />
              <span>Loading more...</span>
            </div>
          ) : (
            <button
              onClick={onLoadMore}
              className="px-6 py-2 bg-netflix-dark border border-netflix-gray/30 hover:border-netflix-red/50 rounded-lg text-netflix-light hover:text-white transition-colors"
            >
              Load More
            </button>
          )}
        </div>
      )}

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 w-12 h-12 bg-netflix-red hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 z-50 animate-scale-up"
          aria-label="Scroll to top"
        >
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}

// Compact grid for smaller sections
export function MediaGridCompact({
  items,
  loading = false,
  className = '',
}: {
  items: MediaItem[];
  loading?: boolean;
  className?: string;
}) {
  const validItems = useMemo(() => filterValidMedia(items), [items]);
  
  if (loading && validItems.length === 0) {
    return (
      <div className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 ${className}`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <MediaCardSkeletonGrid key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 ${className}`}>
      {validItems.map((item, index) => (
        <div 
          key={`${item.id}-${index}`}
          className="animate-scale-up"
          style={{ animationDelay: `${Math.min(index * 0.02, 0.2)}s`, animationFillMode: 'both' }}
        >
          <MediaCard item={item} size="small" showQuickActions={false} />
        </div>
      ))}
    </div>
  );
}

