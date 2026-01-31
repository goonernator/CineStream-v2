'use client';

import { useEffect, useRef, useState, ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

interface ContextMenuProps {
  x: number;
  y: number;
  item: {
    id: number;
    title?: string;
    name?: string;
    media_type?: 'movie' | 'tv';
  };
  mediaType: 'movie' | 'tv';
  onClose: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: ReactElement;
  action: () => void;
  divider?: boolean;
  requiresAuth?: boolean;
}

export default function ContextMenu({ x, y, item, mediaType, onClose }: ContextMenuProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const { success, error } = useToast();
  const [position, setPosition] = useState({ x, y });
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setIsAuthenticated(auth.getAuthState().isAuthenticated);
  }, []);

  // Adjust position if menu would overflow viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = x;
      let newY = y;

      if (x + rect.width > viewportWidth - 16) {
        newX = viewportWidth - rect.width - 16;
      }
      if (y + rect.height > viewportHeight - 16) {
        newY = viewportHeight - rect.height - 16;
      }

      setPosition({ x: newX, y: newY });
    }
  }, [x, y]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Small delay to prevent immediate close
    const timeout = setTimeout(() => {
      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleKeyDown);
    }, 10);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const title = item.title || item.name || 'Unknown';

  const handlePlay = () => {
    router.push(`/watch/${item.id}?type=${mediaType}`);
    onClose();
  };

  const handleMoreInfo = () => {
    router.push(`/details/${item.id}?type=${mediaType}`);
    onClose();
  };

  const handleAddToWatchlist = async () => {
    if (!isAuthenticated) {
      error('Please sign in to use watchlist');
      onClose();
      return;
    }

    try {
      const sessionId = auth.getSessionId();
      const accountId = auth.getAccountId();
      
      if (!sessionId || !accountId) {
        error('Please sign in to use watchlist');
        onClose();
        return;
      }

      const response = await fetch(
        `https://api.themoviedb.org/3/account/${accountId}/watchlist?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&session_id=${sessionId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: mediaType,
            media_id: item.id,
            watchlist: true,
          }),
        }
      );

      if (response.ok) {
        success(`Added "${title}" to watchlist`);
      } else {
        error('Failed to add to watchlist');
      }
    } catch (err) {
      error('Failed to add to watchlist');
    }
    onClose();
  };

  const handleAddToFavorites = async () => {
    if (!isAuthenticated) {
      error('Please sign in to use favorites');
      onClose();
      return;
    }

    try {
      const sessionId = auth.getSessionId();
      const accountId = auth.getAccountId();
      
      if (!sessionId || !accountId) {
        error('Please sign in to use favorites');
        onClose();
        return;
      }

      const response = await fetch(
        `https://api.themoviedb.org/3/account/${accountId}/favorite?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&session_id=${sessionId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: mediaType,
            media_id: item.id,
            favorite: true,
          }),
        }
      );

      if (response.ok) {
        success(`Added "${title}" to favorites`);
      } else {
        error('Failed to add to favorites');
      }
    } catch (err) {
      error('Failed to add to favorites');
    }
    onClose();
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/details/${item.id}?type=${mediaType}`;
    
    try {
      await navigator.clipboard.writeText(url);
      success('Link copied to clipboard!');
    } catch {
      error('Failed to copy link');
    }
    onClose();
  };

  const menuItems: MenuItem[] = [
    {
      id: 'play',
      label: 'Play',
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      ),
      action: handlePlay,
    },
    {
      id: 'info',
      label: 'More Info',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      action: handleMoreInfo,
      divider: true,
    },
    {
      id: 'watchlist',
      label: 'Add to Watchlist',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
      action: handleAddToWatchlist,
      requiresAuth: true,
    },
    {
      id: 'favorites',
      label: 'Add to Favorites',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
      action: handleAddToFavorites,
      requiresAuth: true,
      divider: true,
    },
    {
      id: 'share',
      label: 'Copy Link',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      ),
      action: handleShare,
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] min-w-[180px] bg-netflix-dark/95 backdrop-blur-md border border-netflix-gray/30 rounded-xl shadow-2xl overflow-hidden context-menu-enter"
      style={{ top: position.y, left: position.x }}
    >
      {/* Title */}
      <div className="px-4 py-3 border-b border-netflix-gray/20 bg-netflix-bg/50">
        <p className="text-sm font-semibold text-netflix-light line-clamp-1">{title}</p>
        <p className="text-xs text-netflix-gray capitalize">{mediaType}</p>
      </div>

      {/* Menu items */}
      <div className="py-1">
        {menuItems.map((menuItem) => (
          <div key={menuItem.id}>
            <button
              onClick={menuItem.action}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-netflix-light/90 hover:bg-netflix-red/20 hover:text-netflix-light transition-colors ${
                menuItem.requiresAuth && !isAuthenticated ? 'opacity-50' : ''
              }`}
            >
              <span className="text-netflix-gray group-hover:text-netflix-red">
                {menuItem.icon}
              </span>
              <span>{menuItem.label}</span>
              {menuItem.requiresAuth && !isAuthenticated && (
                <svg className="w-3 h-3 ml-auto text-netflix-gray" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
              )}
            </button>
            {menuItem.divider && (
              <div className="my-1 border-t border-netflix-gray/20" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

