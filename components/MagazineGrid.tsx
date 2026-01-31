'use client';

import { useMemo } from 'react';
import MagazineCard from './MagazineCard';
import type { MediaItem } from '@/lib/types';

interface MagazineGridProps {
  items: (MediaItem & { media_type?: 'movie' | 'tv' })[];
  onRemove?: (item: MediaItem) => void;
  listType?: 'favorites' | 'watchlist';
}

export default function MagazineGrid({ items, onRemove, listType = 'favorites' }: MagazineGridProps) {
  // Assign sizes based on position for editorial layout
  const itemsWithSizes = useMemo(() => {
    return items.map((item, index) => {
      let size: 'small' | 'medium' | 'large' | 'featured';
      
      // First item is always featured
      if (index === 0) {
        size = 'featured';
      }
      // Every 5th item (not first) is large
      else if (index % 5 === 0) {
        size = 'large';
      }
      // Every 3rd item is medium-large pattern
      else if (index % 3 === 0) {
        size = 'large';
      }
      // Rest are medium
      else {
        size = 'medium';
      }
      
      return { item, size, index };
    });
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-auto">
      {itemsWithSizes.map(({ item, size, index }) => {
        // Featured items span 2 columns and 2 rows on larger screens
        const gridClass = 
          size === 'featured' 
            ? 'md:col-span-2 md:row-span-2' 
            : size === 'large' 
              ? 'md:col-span-2 lg:col-span-1 xl:col-span-2' 
              : '';

        return (
          <div key={`${item.id}-${item.media_type || ('title' in item ? 'movie' : 'tv')}`} className={gridClass}>
            <MagazineCard
              item={item}
              size={size}
              index={index}
              onRemove={onRemove ? () => onRemove(item) : undefined}
              listType={listType}
            />
          </div>
        );
      })}
    </div>
  );
}

// Skeleton loader for the grid
export function MagazineGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-auto">
      {Array.from({ length: count }).map((_, index) => {
        const isFeatured = index === 0;
        const isLarge = index % 5 === 0 || index % 3 === 0;
        const gridClass = 
          isFeatured 
            ? 'md:col-span-2 md:row-span-2' 
            : isLarge 
              ? 'md:col-span-2 lg:col-span-1 xl:col-span-2' 
              : '';
        const heightClass = isFeatured ? 'h-[28rem]' : isLarge ? 'h-96' : 'h-80';

        return (
          <div 
            key={index} 
            className={`${gridClass} ${heightClass} rounded-2xl bg-netflix-dark/50 overflow-hidden animate-pulse`}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="w-full h-3/4 bg-netflix-gray/20" />
            <div className="p-4 space-y-3">
              <div className="h-5 w-3/4 bg-netflix-gray/20 rounded" />
              <div className="h-4 w-1/2 bg-netflix-gray/20 rounded" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

