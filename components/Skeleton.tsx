'use client';

import { ReactNode } from 'react';

interface SkeletonProps {
  className?: string;
  children?: ReactNode;
}

// Base skeleton with shimmer animation
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-netflix-gray/20 via-netflix-gray/30 to-netflix-gray/20 bg-[length:200%_100%] animate-shimmer rounded ${className}`}
    />
  );
}

// Circular skeleton for avatars/icons
export function SkeletonCircle({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-netflix-gray/20 via-netflix-gray/30 to-netflix-gray/20 bg-[length:200%_100%] animate-shimmer rounded-full ${className}`}
    />
  );
}

// Text skeleton with multiple lines
interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 1, className = '' }: SkeletonTextProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

// Card skeleton
export function SkeletonCard({ className = '' }: SkeletonProps) {
  return (
    <div className={`rounded-lg overflow-hidden ${className}`}>
      <Skeleton className="aspect-[2/3] w-full" />
      <div className="p-2 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

// Button skeleton
export function SkeletonButton({ className = '' }: SkeletonProps) {
  return <Skeleton className={`h-10 rounded-lg ${className}`} />;
}

// Image skeleton with aspect ratio
interface SkeletonImageProps {
  aspectRatio?: 'square' | 'video' | 'poster';
  className?: string;
}

export function SkeletonImage({ aspectRatio = 'poster', className = '' }: SkeletonImageProps) {
  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    poster: 'aspect-[2/3]',
  };

  return <Skeleton className={`${aspectClasses[aspectRatio]} w-full ${className}`} />;
}

