'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayChildren, setDisplayChildren] = useState(children);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    // Only animate if the path actually changed
    if (previousPathname.current !== pathname) {
      setIsAnimating(true);
      
      // Start fade out, then update content
      const timeout = setTimeout(() => {
        setDisplayChildren(children);
        setIsAnimating(false);
        previousPathname.current = pathname;
      }, 150); // Short delay for exit animation

      return () => clearTimeout(timeout);
    } else {
      // Same path, just update children without animation
      setDisplayChildren(children);
    }
  }, [pathname, children]);

  return (
    <div
      className={`page-transition ${isAnimating ? 'page-exit' : 'page-enter'}`}
    >
      {displayChildren}
    </div>
  );
}

