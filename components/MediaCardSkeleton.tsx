'use client';

import { Skeleton } from './Skeleton';

interface MediaCardSkeletonProps {
  showBadges?: boolean;
  className?: string;
}

export default function MediaCardSkeleton({ showBadges = true, className = '' }: MediaCardSkeletonProps) {
  return (
    <div className={`relative group flex-shrink-0 w-[180px] ${className}`}>
      {/* Poster skeleton */}
      <div className="relative overflow-hidden rounded-lg">
        <Skeleton className="aspect-[2/3] w-full" />
        
        {/* Badge skeletons */}
        {showBadges && (
          <>
            {/* Rating badge */}
            <div className="absolute top-2 left-2">
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
            
            {/* Year badge */}
            <div className="absolute top-2 right-2">
              <Skeleton className="h-5 w-10 rounded" />
            </div>
          </>
        )}
      </div>
      
      {/* Title skeleton */}
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

// Compact version for smaller displays
export function MediaCardSkeletonCompact({ className = '' }: { className?: string }) {
  return (
    <div className={`relative flex-shrink-0 w-[140px] ${className}`}>
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <div className="mt-1.5">
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

// Grid version for browse pages
export function MediaCardSkeletonGrid({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="relative overflow-hidden rounded-lg">
        <Skeleton className="aspect-[2/3] w-full" />
        <div className="absolute top-2 left-2">
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

