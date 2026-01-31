'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { profiles, Profile } from '@/lib/profiles';
import SearchOverlay from './SearchOverlay';
import LoginModal from './LoginModal';
import ProfileDropdown from './ProfileDropdown';
import NotificationCenter from './NotificationCenter';

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [authState, setAuthState] = useState<{ isAuthenticated: boolean; username?: string | null } | null>(null);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMounted(true);
    setAuthState(auth.getAuthState());
    setCurrentProfile(profiles.getActiveProfile());

    if (typeof window !== 'undefined') {
      setIsElectron(!!(window as any).electron);

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

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
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
    { label: 'Watchlist', href: '/watchlist', icon: '📋' },
    { label: 'Favorites', href: '/favorites', icon: '❤️' },
    { label: 'Watch History', href: '/history', icon: '🕐' },
  ];

  return (
    <>
      <nav
        ref={navRef}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-netflix-dark/95 backdrop-blur-xl shadow-lg'
            : 'bg-gradient-to-b from-netflix-dark/80 to-transparent'
        }`}
        style={{ top: isElectron ? '40px' : '0' }}
      >
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left Section - Logo & Nav */}
            <div className="flex items-center gap-8">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2 group">
                <span className="text-2xl font-bold text-netflix-red transition-transform group-hover:scale-105">
                  Cinestream
                </span>
              </Link>

              {/* Main Navigation */}
              <div className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <div
                    key={item.label}
                    className="relative"
                    onMouseEnter={() => item.hasMenu && setActiveMenu(item.hasMenu)}
                    onMouseLeave={() => setActiveMenu(null)}
                  >
                    {item.hasMenu ? (
                      <button
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-1 ${
                          activeMenu === item.hasMenu
                            ? 'text-netflix-light bg-netflix-gray/20'
                            : 'text-netflix-gray hover:text-netflix-light hover:bg-netflix-gray/10'
                        }`}
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
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                          pathname === item.href
                            ? 'text-netflix-light bg-netflix-red/20'
                            : 'text-netflix-gray hover:text-netflix-light hover:bg-netflix-gray/10'
                        }`}
                      >
                        {item.label}
                      </Link>
                    )}

                    {/* Browse Mega Menu */}
                    {item.hasMenu === 'browse' && activeMenu === 'browse' && (
                      <div className="absolute top-full left-0 mt-2 w-[400px] bg-netflix-dark/98 backdrop-blur-xl rounded-xl border border-netflix-gray/20 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-2 gap-0">
                          {/* Movies Column */}
                          <div className="p-4 border-r border-netflix-gray/10">
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
                                  className="block px-3 py-2 text-sm text-netflix-light/80 hover:text-netflix-light hover:bg-netflix-gray/10 rounded-lg transition-colors"
                                  onClick={() => setActiveMenu(null)}
                                >
                                  {link.label}
                                </Link>
                              ))}
                            </div>
                          </div>

                          {/* TV Shows Column */}
                          <div className="p-4">
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
                                  className="block px-3 py-2 text-sm text-netflix-light/80 hover:text-netflix-light hover:bg-netflix-gray/10 rounded-lg transition-colors"
                                  onClick={() => setActiveMenu(null)}
                                >
                                  {link.label}
                                </Link>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Browse All Button */}
                        <div className="px-4 py-3 bg-netflix-gray/5 border-t border-netflix-gray/10">
                          <Link
                            href="/genres"
                            className="flex items-center justify-center gap-2 text-sm text-netflix-red hover:text-netflix-light transition-colors"
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
                      <div className="absolute top-full left-0 mt-2 w-[320px] bg-netflix-dark/98 backdrop-blur-xl rounded-xl border border-netflix-gray/20 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-4">
                          <div className="grid grid-cols-2 gap-2">
                            {genreItems.map((genre) => (
                              <Link
                                key={genre.href}
                                href={genre.href}
                                className="px-3 py-2 text-sm text-netflix-light/80 hover:text-netflix-light hover:bg-netflix-red/20 rounded-lg transition-colors"
                                onClick={() => setActiveMenu(null)}
                              >
                                {genre.label}
                              </Link>
                            ))}
                          </div>
                        </div>
                        <div className="px-4 py-3 bg-netflix-gray/5 border-t border-netflix-gray/10">
                          <Link
                            href="/genres"
                            className="flex items-center justify-center gap-2 text-sm text-netflix-red hover:text-netflix-light transition-colors"
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
                      <div className="absolute top-full left-0 mt-2 w-[200px] bg-netflix-dark/98 backdrop-blur-xl rounded-xl border border-netflix-gray/20 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2">
                          {listItems.map((list) => (
                            <Link
                              key={list.href}
                              href={list.href}
                              className="flex items-center gap-3 px-4 py-3 text-sm text-netflix-light/80 hover:text-netflix-light hover:bg-netflix-gray/10 rounded-lg transition-colors"
                              onClick={() => setActiveMenu(null)}
                            >
                              <span className="text-lg">{list.icon}</span>
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

            {/* Right Section - Search, Notifications, Profile */}
            <div className="flex items-center gap-2">
              {/* Search Button */}
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2 text-netflix-gray hover:text-netflix-light hover:bg-netflix-gray/10 rounded-lg transition-all duration-200"
                title="Search (Ctrl+K)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {/* Notifications */}
              {mounted && (
                <NotificationCenter isExpanded={false} position="top" />
              )}

              {/* Settings */}
              <Link
                href="/settings"
                className={`p-2 rounded-lg transition-all duration-200 ${
                  pathname === '/settings'
                    ? 'text-netflix-red bg-netflix-red/10'
                    : 'text-netflix-gray hover:text-netflix-light hover:bg-netflix-gray/10'
                }`}
                title="Settings"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                </svg>
              </Link>

              {/* Profile Dropdown */}
              {mounted && (
                <ProfileDropdown
                  currentProfile={currentProfile}
                  authState={authState}
                  onLogin={() => setLoginModalOpen(true)}
                  onLogout={handleLogout}
                />
              )}

              {/* Mobile Menu Button */}
              <button
                className="md:hidden p-2 text-netflix-gray hover:text-netflix-light hover:bg-netflix-gray/10 rounded-lg transition-all duration-200"
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
        </div>

        {/* Mobile Menu */}
        {activeMenu === 'mobile' && (
          <div className="md:hidden bg-netflix-dark/98 backdrop-blur-xl border-t border-netflix-gray/10 animate-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-4 space-y-2">
              <Link
                href="/"
                className="block px-4 py-3 text-netflix-light hover:bg-netflix-gray/10 rounded-lg"
                onClick={() => setActiveMenu(null)}
              >
                Home
              </Link>
              <Link
                href="/browse/movies"
                className="block px-4 py-3 text-netflix-light hover:bg-netflix-gray/10 rounded-lg"
                onClick={() => setActiveMenu(null)}
              >
                Movies
              </Link>
              <Link
                href="/browse/tv"
                className="block px-4 py-3 text-netflix-light hover:bg-netflix-gray/10 rounded-lg"
                onClick={() => setActiveMenu(null)}
              >
                TV Shows
              </Link>
              <Link
                href="/genres"
                className="block px-4 py-3 text-netflix-light hover:bg-netflix-gray/10 rounded-lg"
                onClick={() => setActiveMenu(null)}
              >
                Genres
              </Link>
              <div className="border-t border-netflix-gray/10 pt-2 mt-2">
                <Link
                  href="/watchlist"
                  className="block px-4 py-3 text-netflix-light hover:bg-netflix-gray/10 rounded-lg"
                  onClick={() => setActiveMenu(null)}
                >
                  📋 Watchlist
                </Link>
                <Link
                  href="/favorites"
                  className="block px-4 py-3 text-netflix-light hover:bg-netflix-gray/10 rounded-lg"
                  onClick={() => setActiveMenu(null)}
                >
                  ❤️ Favorites
                </Link>
                <Link
                  href="/history"
                  className="block px-4 py-3 text-netflix-light hover:bg-netflix-gray/10 rounded-lg"
                  onClick={() => setActiveMenu(null)}
                >
                  🕐 History
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

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

