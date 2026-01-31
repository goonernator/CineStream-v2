'use client';

import { usePathname } from 'next/navigation';

// Pages where content should NOT have top padding (fullscreen pages)
const NO_PADDING_PATHS = ['/watch/', '/profiles'];

interface NavigationWrapperProps {
  children?: React.ReactNode;
}

export default function NavigationWrapper({ children }: NavigationWrapperProps) {
  const pathname = usePathname();
  
  // Add top padding (40px for title bar) for pages that need it
  const needsPadding = !NO_PADDING_PATHS.some(path => pathname.startsWith(path));
  
  return (
    <div className={needsPadding ? 'pt-10' : ''}>
      {children}
    </div>
  );
}
