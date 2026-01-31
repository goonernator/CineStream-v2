'use client';

import { Skeleton } from './Skeleton';
import MediaCardSkeleton from './MediaCardSkeleton';

interface CarouselSkeletonProps {
  title?: boolean;
  itemCount?: number;
  className?: string;
}

export default function CarouselSkeleton({ 
  title = true, 
  itemCount = 7,
  className = '' 
}: CarouselSkeletonProps) {
  return (
    <div className={`py-4 ${className}`}>
      {/* Title skeleton */}
      {title && (
        <div className="mb-4">
          <Skeleton className="h-7 w-48" />
        </div>
      )}
      
      {/* Cards row */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: itemCount }).map((_, i) => (
          <MediaCardSkeleton key={i} showBadges={false} />
        ))}
      </div>
    </div>
  );
}

// Hero skeleton for the main banner
export function HeroSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`relative w-full h-[70vh] min-h-[500px] ${className}`}>
      {/* Background */}
      <Skeleton className="absolute inset-0" />
      
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-netflix-bg via-netflix-bg/50 to-transparent" />
      
      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-8 pb-16">
        <div className="max-w-2xl space-y-4">
          {/* Title */}
          <Skeleton className="h-12 w-3/4" />
          
          {/* Rating & year */}
          <div className="flex items-center gap-4">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-6 w-20" />
          </div>
          
          {/* Description */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          
          {/* Buttons */}
          <div className="flex gap-4 pt-4">
            <Skeleton className="h-12 w-32 rounded-lg" />
            <Skeleton className="h-12 w-40 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Page skeleton with hero and multiple carousels
export function HomePageSkeleton() {
  return (
    <div className="min-h-screen">
      <HeroSkeleton />
      <div className="px-8 space-y-8 -mt-16 relative z-10">
        <CarouselSkeleton />
        <CarouselSkeleton />
        <CarouselSkeleton />
      </div>
    </div>
  );
}

// Browse page skeleton with grid
export function BrowsePageSkeleton({ itemCount = 20 }: { itemCount?: number }) {
  return (
    <div className="p-8">
      {/* Filter bar skeleton */}
      <div className="flex gap-4 mb-8">
        <Skeleton className="h-10 w-40 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      
      {/* Grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {Array.from({ length: itemCount }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

