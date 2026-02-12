'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { profiles } from '@/lib/profiles';

interface ProfileGuardProps {
  children: React.ReactNode;
}

// Pages that don't require a profile
const PUBLIC_PATHS = ['/profiles', '/auth/callback'];

export default function ProfileGuard({ children }: ProfileGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [shouldRender, setShouldRender] = useState(false);
  const hasRedirectedRef = useRef(false);
  const lastPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    // Prevent re-running if pathname hasn't actually changed
    if (lastPathnameRef.current === pathname) {
      return;
    }
    lastPathnameRef.current = pathname;
    hasRedirectedRef.current = false;

    // Skip check on public paths
    if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
      setIsChecking(false);
      setShouldRender(true);
      return;
    }

    // Try migration first (for existing users)
    profiles.migrateFromLegacy();

    // Check if there's an active profile
    const activeProfile = profiles.getActiveProfile();
    const hasProfiles = profiles.hasProfiles();

    if (!activeProfile) {
      // No active profile - redirect to profile selection
      // Only redirect if we haven't already redirected and we're not already on /profiles
      if (!hasRedirectedRef.current && pathname !== '/profiles') {
        hasRedirectedRef.current = true;
        router.replace('/profiles');
      }
      setShouldRender(false);
    } else {
      // Has active profile - allow access
      setShouldRender(true);
    }

    setIsChecking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]); // Removed router from dependencies - it's stable

  // Listen for profile changes
  useEffect(() => {
    const handleProfileChange = () => {
      const activeProfile = profiles.getActiveProfile();
      const currentPath = window.location.pathname;
      if (!activeProfile && !PUBLIC_PATHS.some(path => currentPath.startsWith(path))) {
        if (!hasRedirectedRef.current) {
          hasRedirectedRef.current = true;
          router.replace('/profiles');
        }
      }
    };

    window.addEventListener('cinestream:profile-changed', handleProfileChange);
    return () => {
      window.removeEventListener('cinestream:profile-changed', handleProfileChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Show loading state while checking
  if (isChecking) {
    return (
      <div className="min-h-screen bg-netflix-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-netflix-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Don't render if redirecting
  if (!shouldRender) {
    return (
      <div className="min-h-screen bg-netflix-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-netflix-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

