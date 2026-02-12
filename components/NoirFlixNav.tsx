'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { profiles, Profile } from '@/lib/profiles';
import SearchOverlay from './SearchOverlay';
import LoginModal from './LoginModal';
import ProfileDropdown from './ProfileDropdown';
import NotificationCenter from './NotificationCenter';
import WindowControls from './WindowControls';

export default function NoirFlixNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [authState, setAuthState] = useState<{ isAuthenticated: boolean; username?: string | null } | null>(null);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [adultContentEnabled, setAdultContentEnabled] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setAuthState(auth.getAuthState());
    setCurrentProfile(profiles.getActiveProfile());
    
    if (typeof window !== 'undefined') {
      const savedAdultContent = localStorage.getItem('cinestream_adult_content_enabled');
      setAdultContentEnabled(savedAdultContent === 'true');

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('approved') === 'true') {
        setLoginModalOpen(true);
      }
    }

    const handleOpenSearch = () => setSearchOpen(true);
    const handleCloseModal = () => {
      setSearchOpen(false);
      setLoginModalOpen(false);
    };
    const handleProfileChange = () => {
      setCurrentProfile(profiles.getActiveProfile());
      setAuthState(auth.getAuthState());
    };
    
    const handleStorageChange = () => {
      if (typeof window !== 'undefined') {
        const savedAdultContent = localStorage.getItem('cinestream_adult_content_enabled');
        setAdultContentEnabled(savedAdultContent === 'true');
      }
    };
    
    const handleAdultContentChange = (e: CustomEvent) => {
      setAdultContentEnabled(e.detail.enabled);
    };

    window.addEventListener('cinestream:open-search', handleOpenSearch);
    window.addEventListener('cinestream:close-modal', handleCloseModal);
    window.addEventListener('cinestream:profile-changed', handleProfileChange);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('cinestream:adult-content-changed', handleAdultContentChange as EventListener);

    return () => {
      window.removeEventListener('cinestream:open-search', handleOpenSearch);
      window.removeEventListener('cinestream:close-modal', handleCloseModal);
      window.removeEventListener('cinestream:profile-changed', handleProfileChange);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('cinestream:adult-content-changed', handleAdultContentChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (mounted) {
      setAuthState(auth.getAuthState());
    }
  }, [pathname, mounted]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLoginSuccess = () => {
    if (mounted) {
      setAuthState(auth.getAuthState());
      router.refresh();
    }
  };

  const handleLogout = () => {
    auth.logout();
    if (mounted) {
      setAuthState(auth.getAuthState());
      router.refresh();
    }
  };

  if (!mounted) {
    return null;
  }

  const navItems = [
    { label: 'Home', href: '/' },
    { label: 'Browse', href: '#', hasMenu: 'browse' },
    { label: 'Genres', href: '#', hasMenu: 'genres' },
    { label: 'Anime', href: '/anime' },
    ...(adultContentEnabled ? [{ label: 'Adult', href: '/adult' }] : []),
    { label: 'My Lists', href: '#', hasMenu: 'lists' },
  ];

  const browseMenuItems = {
    movies: [
      { label: 'Popular Movies', href: '/browse/movies' },
      { label: 'Top Rated', href: '/browse/movies?sort=top_rated' },
      { label: 'Now Playing', href: '/browse/movies?sort=now_playing' },
      { label: 'Upcoming', href: '/browse/movies?sort=upcoming' },
    ],
    tv: [
      { label: 'Popular TV Shows', href: '/browse/tv' },
      { label: 'Top Rated', href: '/browse/tv?sort=top_rated' },
      { label: 'Airing Today', href: '/browse/tv?sort=airing_today' },
      { label: 'On The Air', href: '/browse/tv?sort=on_the_air' },
    ],
  };

  const genreItems = [
    { label: 'Action', href: '/genre/28' },
    { label: 'Adventure', href: '/genre/12' },
    { label: 'Animation', href: '/genre/16' },
    { label: 'Comedy', href: '/genre/35' },
    { label: 'Crime', href: '/genre/80' },
    { label: 'Documentary', href: '/genre/99' },
    { label: 'Drama', href: '/genre/18' },
    { label: 'Fantasy', href: '/genre/14' },
    { label: 'Horror', href: '/genre/27' },
    { label: 'Romance', href: '/genre/10749' },
    { label: 'Sci-Fi', href: '/genre/878' },
    { label: 'Thriller', href: '/genre/53' },
  ];

  const listItems = [
    { label: 'Watchlist', href: '/watchlist' },
    { label: 'Favorites', href: '/favorites' },
    { label: 'Watch History', href: '/history' },
  ];

  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

  return (
    <>
      <nav
        ref={navRef}
        className="fixed top-0 left-0 right-0 z-[1000] flex justify-between items-center px-16 backdrop-blur-[10px] border-b border-[#1a1a1a]"
        style={{
          background: 'rgba(5, 5, 5, 0.8)',
          WebkitAppRegion: isElectron ? 'drag' : 'none',
          paddingTop: isElectron ? '0.5rem' : '0.5rem',
          paddingBottom: '0.5rem',
        } as React.CSSProperties}
      >
        {/* Window Controls - Top Right */}
        {isElectron && (
          <div className="absolute top-0 right-0 flex items-center z-10">
            <WindowControls />
          </div>
        )}
        
        <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="logo font-black text-lg tracking-[-2px] uppercase">
            <Link href="/" className="text-white hover:opacity-80 transition-opacity inline-block">
              {pathname === '/anime' ? 'Animestream' : 'Cinestream'}
            </Link>
          </div>

          <div className="dropdown-container relative cursor-pointer">
            <span 
              className="dropdown-trigger font-mono text-xs uppercase tracking-[2px] flex items-center gap-2 text-white/80 hover:text-white transition-colors"
              onClick={() => setActiveMenu(activeMenu === 'categories' ? null : 'categories')}
            >
              Categories
              <span className="w-1.5 h-1.5 border-r border-b border-white transform rotate-45 -mt-1"></span>
            </span>
            {activeMenu === 'categories' && (
              <div className="dropdown-menu absolute top-[200%] left-0 bg-[#0a0a0a] border border-[#1a1a1a] w-[220px] py-4 opacity-100 visible translate-y-0 transition-all duration-400 shadow-[0_20px_40px_rgba(0,0,0,0.8)]">
                {navItems.filter(item => !item.hasMenu && item.label !== 'Home').map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="dropdown-item block px-6 py-3 text-xs uppercase tracking-[1px] text-[#888] hover:text-white hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                    onClick={() => setActiveMenu(null)}
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="border-t border-[rgba(255,255,255,0.03)] mt-2 pt-2">
                  <Link
                    href="/browse/movies"
                    className="dropdown-item block px-6 py-3 text-xs uppercase tracking-[1px] text-[#888] hover:text-white hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                    onClick={() => setActiveMenu(null)}
                  >
                    Movies
                  </Link>
                  <Link
                    href="/browse/tv"
                    className="dropdown-item block px-6 py-3 text-xs uppercase tracking-[1px] text-[#888] hover:text-white hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                    onClick={() => setActiveMenu(null)}
                  >
                    TV Shows
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="nav-controls flex gap-6 items-center mr-40" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setSearchOpen(true)}
            className="font-mono text-xs border border-[#1a1a1a] px-3 py-1.5 transition-all hover:bg-white hover:text-black text-white/80 hover:text-black"
            title="Search"
          >
            SEARCH
          </button>

          <div className="flex items-center gap-4">
            <NotificationCenter isExpanded={false} position="top" />
            <Link
              href="/settings"
              className={`font-mono text-xs border px-3 py-1.5 transition-all ${
                pathname === '/settings'
                  ? 'bg-white text-black border-white'
                  : 'border-[#1a1a1a] text-white/80 hover:bg-white hover:text-black'
              }`}
            >
              SETTINGS
            </Link>
            {mounted && (
              <ProfileDropdown
                currentProfile={currentProfile}
                authState={authState}
                onLogin={() => setLoginModalOpen(true)}
                onLogout={handleLogout}
              />
            )}
          </div>
        </div>
      </nav>

      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </>
  );
}

