'use client';

import { useEffect, useState } from 'react';
import { useLayout } from './LayoutProvider';

export default function WindowControls() {
  const { layout } = useLayout();
  const [isMaximized, setIsMaximized] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isNoirFlix = layout === 'noirflix';

  useEffect(() => {
    setMounted(true);
    
    if (typeof window !== 'undefined' && (window as any).electron) {
      const electron = (window as any).electron;
      if (electron.onMaximized) {
        electron.onMaximized(() => setIsMaximized(true));
      }
      if (electron.onUnmaximized) {
        electron.onUnmaximized(() => setIsMaximized(false));
      }
    }
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

  if (!mounted) {
    return null;
  }

  const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

  if (!isElectron) {
    return null;
  }

  return (
    <div 
      className={`flex items-center ${isNoirFlix ? 'gap-0' : 'gap-1'} h-full`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button
        onClick={handleMinimize}
        className={`${isNoirFlix 
          ? 'w-12 h-10 hover:bg-[#1a1a1a] text-white/80 hover:text-white font-mono text-xs' 
          : 'w-12 h-10 hover:bg-netflix-gray/20 text-netflix-light hover:text-white'
        } transition-colors flex items-center justify-center`}
        title="Minimize"
      >
        {isNoirFlix ? (
          <span className="text-lg leading-none">−</span>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        )}
      </button>
      <button
        onClick={handleMaximize}
        className={`${isNoirFlix 
          ? 'w-12 h-10 hover:bg-[#1a1a1a] text-white/80 hover:text-white font-mono text-xs' 
          : 'w-12 h-10 hover:bg-netflix-gray/20 text-netflix-light hover:text-white'
        } transition-colors flex items-center justify-center`}
        title={isMaximized ? "Restore" : "Maximize"}
      >
        {isNoirFlix ? (
          <span className="text-lg leading-none">{isMaximized ? '❐' : '□'}</span>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isMaximized ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 8v8h16V8M4 8V4h16v4" />
            )}
          </svg>
        )}
      </button>
      <button
        onClick={handleClose}
        className={`${isNoirFlix 
          ? 'w-12 h-10 hover:bg-red-600 text-white/80 hover:text-white font-mono text-xs' 
          : 'w-12 h-10 hover:bg-red-600 text-netflix-light hover:text-white'
        } transition-colors flex items-center justify-center`}
        title="Close"
      >
        {isNoirFlix ? (
          <span className="text-lg leading-none">×</span>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </button>
    </div>
  );
}

