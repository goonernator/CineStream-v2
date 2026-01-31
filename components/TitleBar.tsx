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

export default function TitleBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMaximized, setIsMaximized] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [authState, setAuthState] = useState<{ isAuthenticated: boolean; username?: string | null } | null>(null);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setAuthState(auth.getAuthState());
    setCurrentProfile(profiles.getActiveProfile());

    if (typeof window !== 'undefined') {
      const isElectron = !!(window as any).electron;
      
      if (isElectron && (window as any).electron) {
        const electron = (window as any).electron;
        if (electron.onMaximized) {
          electron.onMaximized(() => setIsMaximized(true));
        }
        if (electron.onUnmaximized) {
          electron.onUnmaximized(() => setIsMaximized(false));
        }
      }

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

    window.addEventListener('cinestream:open-search', handleOpenSearch);
    window.addEventListener('cinestream:close-modal', handleCloseModal);
    window.addEventListener('cinestream:profile-changed', handleProfileChange);

    return () => {
      window.removeEventListener('cinestream:open-search', handleOpenSearch);
      window.removeEventListener('cinestream:close-modal', handleCloseModal);
      window.removeEventListener('cinestream:profile-changed', handleProfileChange);
    };
  }, []);

  useEffect(() => {
    if (mounted) {
      setAuthState(auth.getAuthState());
    }
  }, [pathname, mounted]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMinimize = () => {
    if (typeof window !== 'undefined' && (window as any).electron?.minimize) {
      (window as any).electron.minimize();
    }
  };

  const handleMaximize = () => {
    if (typeof window !== 'undefined' && (window as any).electron?.maximize) {
      (window as any).electron.maximize();
    }
  };

  const handleClose = () => {
    if (typeof window !== 'undefined' && (window as any).electron?.close) {
      (window as any).electron.close();
    }
  };

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

  // Don't render during SSR
  if (!mounted) {
    return null;
  }

  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

  const navItems = [
    { label: 'Home', href: '/' },
    { label: 'Browse', href: '#', hasMenu: 'browse' },
    { label: 'Genres', href: '#', hasMenu: 'genres' },
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
    { 
      label: 'Watchlist', 
      href: '/watchlist', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      )
    },
    { 
      label: 'Favorites', 
      href: '/favorites', 
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      )
    },
    { 
      label: 'Watch History', 
      href: '/history', 
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
  ];

  return (
    <>
      <div
        ref={navRef}
        className={`title-bar fixed top-0 left-0 right-0 h-10 bg-netflix-dark/95 backdrop-blur-sm z-50 flex items-center justify-between ${
          isElectron ? '' : 'pl-4'
        }`}
        style={{ 
          WebkitAppRegion: isElectron ? 'drag' : 'none',
          paddingLeft: isElectron ? '0' : '1rem'
        } as React.CSSProperties}
      >
        {/* Left Section - App Name & Navigation */}
        <div className="flex items-center h-full flex-1 min-w-0">
          {/* App Name - Top Left Corner with Pulsing Background */}
          <Link 
            href="/" 
            className="flex items-center h-full px-4 relative group"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            data-tour="app-name"
          >
            <div className="absolute inset-0 bg-netflix-red/20 rounded-lg animate-pulse" />
            <h1 className="text-lg font-bold text-netflix-red whitespace-nowrap relative z-10">
              Cinestream
            </h1>
          </Link>

          {/* Main Navigation */}
          <div className="hidden md:flex items-center gap-1 h-full ml-4">
            {navItems.map((item) => (
              <div
                key={item.label}
                className="relative h-full"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                {item.hasMenu ? (
                  <button
                    onClick={() => setActiveMenu(activeMenu === item.hasMenu ? null : item.hasMenu)}
                    className={`h-full px-4 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-1 ${
                      activeMenu === item.hasMenu
                        ? 'text-netflix-light bg-netflix-red/30'
                        : 'text-netflix-gray hover:text-netflix-light hover:bg-netflix-red/20'
                    }`}
                    data-tour={item.hasMenu === 'browse' ? 'browse' : item.hasMenu === 'genres' ? 'genres' : 'lists'}
                  >
                    {item.label}
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${
                        activeMenu === item.hasMenu ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    className={`h-full px-4 text-sm font-medium rounded-lg transition-all duration-200 flex items-center ${
                      pathname === item.href
                        ? 'text-netflix-light bg-netflix-red/30'
                        : 'text-netflix-gray hover:text-netflix-light hover:bg-netflix-red/20'
                    }`}
                  >
                    {item.label}
                  </Link>
                )}

                {/* Browse Mega Menu */}
                {item.hasMenu === 'browse' && activeMenu === 'browse' && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-[400px] backdrop-blur-xl rounded-xl border border-netflix-red/30 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" 
                    style={{ background: 'linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(30, 10, 10, 0.95) 100%)' }}
                  >
                    <div className="grid grid-cols-2 gap-0">
                      <div className="p-4 border-r border-netflix-gray/20 bg-netflix-dark/30">
                        <h3 className="text-xs font-semibold text-netflix-gray uppercase tracking-wider mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                          </svg>
                          Movies
                        </h3>
                        <div className="space-y-1">
                          {browseMenuItems.movies.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              className="block px-3 py-2 text-sm text-netflix-light/80 hover:text-netflix-light hover:bg-netflix-red/25 rounded-lg transition-colors"
                              onClick={() => setActiveMenu(null)}
                            >
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                      <div className="p-4 bg-netflix-dark/30">
                        <h3 className="text-xs font-semibold text-netflix-gray uppercase tracking-wider mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>
                          </svg>
                          TV Shows
                        </h3>
                        <div className="space-y-1">
                          {browseMenuItems.tv.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              className="block px-3 py-2 text-sm text-netflix-light/80 hover:text-netflix-light hover:bg-netflix-red/25 rounded-lg transition-colors"
                              onClick={() => setActiveMenu(null)}
                            >
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="px-4 py-3 bg-netflix-red/10 border-t border-netflix-red/20">
                      <Link
                        href="/genres"
                        className="flex items-center justify-center gap-2 text-sm text-netflix-red hover:text-netflix-light hover:bg-netflix-red/25 rounded-lg px-3 py-2 transition-colors"
                        onClick={() => setActiveMenu(null)}
                      >
                        Browse All Genres
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                )}

                {/* Genres Dropdown */}
                {item.hasMenu === 'genres' && activeMenu === 'genres' && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-[320px] backdrop-blur-xl rounded-xl border border-netflix-red/30 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" 
                    style={{ background: 'linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(30, 10, 10, 0.95) 100%)' }}
                  >
                    <div className="p-4 bg-netflix-dark/30">
                      <div className="grid grid-cols-2 gap-2">
                        {genreItems.map((genre) => (
                          <Link
                            key={genre.href}
                            href={genre.href}
                            className="px-3 py-2 text-sm text-netflix-light/80 hover:text-netflix-light hover:bg-netflix-red/25 rounded-lg transition-colors"
                            onClick={() => setActiveMenu(null)}
                          >
                            {genre.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                    <div className="px-4 py-3 bg-netflix-red/10 border-t border-netflix-red/20">
                      <Link
                        href="/genres"
                        className="flex items-center justify-center gap-2 text-sm text-netflix-red hover:text-netflix-light hover:bg-netflix-red/25 rounded-lg px-3 py-2 transition-colors"
                        onClick={() => setActiveMenu(null)}
                      >
                        View All Genres
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                )}

                {/* My Lists Dropdown */}
                {item.hasMenu === 'lists' && activeMenu === 'lists' && (
                  <div 
                    className="absolute top-full left-0 mt-2 w-[200px] backdrop-blur-xl rounded-xl border border-netflix-red/30 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" 
                    style={{ background: 'linear-gradient(135deg, rgba(20, 20, 20, 0.95) 0%, rgba(30, 10, 10, 0.95) 100%)' }}
                  >
                    <div className="p-2 bg-netflix-dark/30">
                      {listItems.map((list) => (
                        <Link
                          key={list.href}
                          href={list.href}
                          className="flex items-center gap-3 px-4 py-3 text-sm text-netflix-light/80 hover:text-netflix-light hover:bg-netflix-red/25 rounded-lg transition-colors"
                          onClick={() => setActiveMenu(null)}
                        >
                          {list.icon}
                          {list.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Section - Search, Notifications, Settings, Profile, Window Controls */}
        <div className="flex items-center h-full gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Search Button */}
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 text-netflix-gray hover:text-netflix-light hover:bg-netflix-red/20 rounded-lg transition-all duration-200"
            title="Search (Ctrl+K)"
            data-tour="search"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* Notifications */}
          <div data-tour="notifications">
            <NotificationCenter isExpanded={false} position="top" />
          </div>

          {/* Settings */}
          <Link
            href="/settings"
            className={`p-2 rounded-lg transition-all duration-200 ${
              pathname === '/settings'
                ? 'text-netflix-red bg-netflix-red/30'
                : 'text-netflix-gray hover:text-netflix-light hover:bg-netflix-red/20'
            }`}
            title="Settings"
            data-tour="settings"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </Link>

          {/* Profile Dropdown */}
          {mounted && (
            <div data-tour="profile">
              <ProfileDropdown
                currentProfile={currentProfile}
                authState={authState}
                onLogin={() => setLoginModalOpen(true)}
                onLogout={handleLogout}
              />
            </div>
          )}

          {/* Window Controls (Electron only) */}
          {isElectron && (
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={handleMinimize}
                className="title-bar-button w-12 h-10 flex items-center justify-center hover:bg-netflix-bg transition-colors text-netflix-gray hover:text-netflix-light"
                title="Minimize"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="0" y="5" width="12" height="1" fill="currentColor" />
                </svg>
              </button>
              <button
                onClick={handleMaximize}
                className="title-bar-button w-12 h-10 flex items-center justify-center hover:bg-netflix-bg transition-colors text-netflix-gray hover:text-netflix-light"
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                {isMaximized ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2h8v8H2V2z" stroke="currentColor" strokeWidth="1" fill="none" />
                    <path d="M4 4h6v6" stroke="currentColor" strokeWidth="1" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="0" y="0" width="12" height="12" stroke="currentColor" strokeWidth="1" fill="none" />
                  </svg>
                )}
              </button>
              <button
                onClick={handleClose}
                className="title-bar-button w-12 h-10 flex items-center justify-center hover:bg-red-600 transition-colors text-netflix-gray hover:text-white"
                title="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-netflix-gray hover:text-netflix-light hover:bg-netflix-red/20 rounded-lg transition-all duration-200"
            onClick={() => setActiveMenu(activeMenu === 'mobile' ? null : 'mobile')}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {activeMenu === 'mobile' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {activeMenu === 'mobile' && (
        <div className="fixed top-10 left-0 right-0 md:hidden bg-netflix-dark/98 backdrop-blur-xl border-b border-netflix-gray/10 animate-in slide-in-from-top-2 duration-200 z-40">
          <div className="px-4 py-4 space-y-2">
            <Link
              href="/"
              className="block px-4 py-3 text-netflix-light hover:bg-netflix-red/25 rounded-lg transition-colors"
              onClick={() => setActiveMenu(null)}
            >
              Home
            </Link>
            <Link
              href="/browse/movies"
              className="block px-4 py-3 text-netflix-light hover:bg-netflix-red/25 rounded-lg transition-colors"
              onClick={() => setActiveMenu(null)}
            >
              Movies
            </Link>
            <Link
              href="/browse/tv"
              className="block px-4 py-3 text-netflix-light hover:bg-netflix-red/25 rounded-lg transition-colors"
              onClick={() => setActiveMenu(null)}
            >
              TV Shows
            </Link>
            <Link
              href="/genres"
              className="block px-4 py-3 text-netflix-light hover:bg-netflix-red/25 rounded-lg transition-colors"
              onClick={() => setActiveMenu(null)}
            >
              Genres
            </Link>
            <div className="border-t border-netflix-gray/10 pt-2 mt-2">
              <Link
                href="/watchlist"
                className="flex items-center gap-3 px-4 py-3 text-netflix-light hover:bg-netflix-red/25 rounded-lg transition-colors"
                onClick={() => setActiveMenu(null)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Watchlist
              </Link>
              <Link
                href="/favorites"
                className="flex items-center gap-3 px-4 py-3 text-netflix-light hover:bg-netflix-red/25 rounded-lg transition-colors"
                onClick={() => setActiveMenu(null)}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
                Favorites
              </Link>
              <Link
                href="/history"
                className="flex items-center gap-3 px-4 py-3 text-netflix-light hover:bg-netflix-red/25 rounded-lg transition-colors"
                onClick={() => setActiveMenu(null)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                History
                🕐 History
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Search Overlay */}
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Login Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </>
  );
}
