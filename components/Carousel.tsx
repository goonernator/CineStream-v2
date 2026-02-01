'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import type { MediaItem } from '@/lib/types';
import { filterValidMedia } from '@/lib/mediaFilter';
import MediaCard from './MediaCard';

interface CarouselProps {
  title: string;
  items: MediaItem[];
  id?: string;
}

export default function Carousel({ title, items, id }: CarouselProps) {
  // Filter items to only show those with thumbnails and ratings
  const validItems = useMemo(() => filterValidMedia(items), [items]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(0);

  // Calculate page size (how many cards fit in viewport) on mount and resize
  useEffect(() => {
    const calculatePageSize = () => {
      if (!scrollRef.current || !cardRef.current) return;
      
      const container = scrollRef.current;
      const containerWidth = container.clientWidth;
      const firstCard = cardRef.current;
      const cardRect = firstCard.getBoundingClientRect();
      const cardWidth = cardRect.width;
      
      // Get computed gap from container (gap-4 = 1rem = 16px)
      const containerStyles = window.getComputedStyle(container);
      const gapValue = containerStyles.gap || '16px';
      const gap = parseFloat(gapValue) || 16;
      
      // Calculate how many cards are visible
      const cardWithGap = cardWidth + gap;
      const visibleCards = Math.floor(containerWidth / cardWithGap);
      
      // Page size is the scroll amount for one full page of cards
      const calculatedPageSize = visibleCards * cardWithGap;
      setPageSize(calculatedPageSize);
    };

    // Use a small delay to ensure layout is complete
    const timeoutId = setTimeout(calculatePageSize, 100);
    calculatePageSize();
    
    window.addEventListener('resize', calculatePageSize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculatePageSize);
    };
  }, [validItems]);

  // Add native wheel event listener with capture to catch all events from children
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || pageSize === 0) return;

    const handleWheelNative = (e: WheelEvent) => {
      // Check if the event target is within the carousel container
      const target = e.target as HTMLElement;
      if (!container.contains(target)) return;

      // Prevent default vertical scrolling
      e.preventDefault();
      e.stopPropagation();

      // Convert vertical scroll to horizontal
      const delta = e.deltaY;
      const direction = delta > 0 ? 'right' : 'left';
      
      const currentScroll = container.scrollLeft;
      const newScrollLeft = direction === 'right' 
        ? currentScroll + pageSize
        : Math.max(0, currentScroll - pageSize);

      container.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth',
      });
    };

    // Use capture phase to catch events before they reach children
    container.addEventListener('wheel', handleWheelNative, { passive: false, capture: true });
    
    return () => {
      container.removeEventListener('wheel', handleWheelNative, { capture: true });
    };
  }, [pageSize]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 600;
    const newScrollLeft =
      scrollRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
    scrollRef.current.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth',
    });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!scrollRef.current || pageSize === 0) return;
    
    e.preventDefault();
    e.stopPropagation();

    const container = scrollRef.current;
    
    // Determine scroll direction based on wheel delta
    const delta = e.deltaY;
    const direction = delta > 0 ? 'right' : 'left';
    
    const currentScroll = container.scrollLeft;
    const newScrollLeft = direction === 'right' 
      ? currentScroll + pageSize
      : Math.max(0, currentScroll - pageSize);

    container.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth',
    });
  };

  return (
    <div className="mb-12" id={id}>
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <div className="relative group">
        {/* Left Arrow */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-netflix-dark/80 backdrop-blur-sm border border-netflix-gray/30 flex items-center justify-center opacity-40 group-hover:opacity-100 hover:bg-netflix-red hover:border-netflix-red hover:scale-110 transition-all duration-300 shadow-lg"
          aria-label="Scroll left"
        >
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Right Arrow */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-netflix-dark/80 backdrop-blur-sm border border-netflix-gray/30 flex items-center justify-center opacity-40 group-hover:opacity-100 hover:bg-netflix-red hover:border-netflix-red hover:scale-110 transition-all duration-300 shadow-lg"
          aria-label="Scroll right"
        >
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>

        {/* Scrollable Container */}
        <div
          ref={scrollRef}
          className="flex items-start gap-4 overflow-x-auto carousel-container scroll-smooth pb-4"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
          }}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            if (touch) {
              (scrollRef.current as any).touchStartX = touch.clientX;
            }
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {validItems.map((item, index) => (
            <div
              key={item.id}
              ref={index === 0 ? cardRef : undefined}
              className="flex-shrink-0 animate-fade-in"
              style={{
                animation: 'fadeIn 0.3s ease-in',
              }}
            >
              <MediaCard item={item} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
