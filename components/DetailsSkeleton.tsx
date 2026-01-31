'use client';

import { Skeleton, SkeletonText } from './Skeleton';

export function DetailsSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Hero Backdrop Skeleton - extends behind header */}
      <div className="relative h-[80vh] w-full overflow-hidden -mt-16 pt-16">
        <div className="absolute inset-0 -top-16 bg-gradient-to-b from-netflix-dark/20 via-netflix-dark/60 to-netflix-bg">
          <Skeleton className="w-full h-full" />
        </div>
        
        {/* Gradient overlay */}
        <div 
          className="absolute inset-0 -top-16"
          style={{
            background: 'linear-gradient(0deg, var(--netflix-bg) 0%, transparent 50%, var(--netflix-bg) 100%)'
          }}
        />
      </div>

      {/* Content positioned over backdrop */}
      <div className="relative -mt-[45vh] px-8 pb-12 z-10">
        {/* Back button skeleton */}
        <Skeleton className="w-24 h-10 mb-6 rounded-lg" />

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Poster skeleton */}
          <div className="flex-shrink-0 mx-auto lg:mx-0">
            <Skeleton className="w-64 h-96 rounded-xl" />
            {/* Trailer button skeleton */}
            <Skeleton className="w-64 h-12 mt-4 rounded-lg" />
          </div>

          {/* Info skeleton */}
          <div className="flex-1 space-y-6">
            {/* Title */}
            <Skeleton className="h-14 w-3/4 rounded-lg" />
            
            {/* Meta info */}
            <div className="flex gap-4">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>

            {/* Action buttons */}
            <div className="flex gap-4">
              <Skeleton className="h-14 w-40 rounded-lg" />
              <Skeleton className="h-14 w-32 rounded-lg" />
              <Skeleton className="h-14 w-14 rounded-full" />
              <Skeleton className="h-14 w-14 rounded-full" />
            </div>

            {/* Overview */}
            <div className="space-y-2">
              <SkeletonText lines={4} />
            </div>

            {/* Cast section */}
            <div className="pt-6">
              <Skeleton className="h-8 w-32 mb-4 rounded-lg" />
              <div className="flex gap-4 overflow-hidden">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-24">
                    <Skeleton className="w-24 h-32 rounded-lg mb-2" />
                    <Skeleton className="h-4 w-20 rounded" />
                    <Skeleton className="h-3 w-16 rounded mt-1" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EpisodeListSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="space-y-3" style={{ maxHeight: 'calc(7 * 100px)' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-4 p-4 rounded-xl bg-netflix-dark/40">
          {/* Thumbnail skeleton */}
          <Skeleton className="w-40 h-24 rounded-lg flex-shrink-0" />
          {/* Content skeleton */}
          <div className="flex-1 py-1">
            <Skeleton className="h-5 w-3/4 rounded mb-2" />
            <Skeleton className="h-3 w-32 rounded mb-2" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-2/3 rounded mt-1" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CastSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex-shrink-0 w-28 text-center">
          <Skeleton className="w-28 h-28 rounded-full mb-3 mx-auto" />
          <Skeleton className="h-4 w-24 rounded mx-auto mb-1" />
          <Skeleton className="h-3 w-20 rounded mx-auto" />
        </div>
      ))}
    </div>
  );
}

export default DetailsSkeleton;

