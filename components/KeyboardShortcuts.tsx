'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { shortcuts, categoryLabels, formatShortcut, type Shortcut } from '@/lib/shortcuts';

export default function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const [showHelp, setShowHelp] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if we're on the watch page
  const isWatchPage = pathname?.startsWith('/watch');

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Only allow Escape in inputs
      if (e.key !== 'Escape') return;
    }

    const hasCtrl = e.ctrlKey || e.metaKey;
    const hasShift = e.shiftKey;

    // Handle shortcuts
    switch (e.key) {
      case '/':
        if (!hasCtrl && !hasShift) {
          e.preventDefault();
          // Trigger search - dispatch custom event
          window.dispatchEvent(new CustomEvent('cinestream:open-search'));
        }
        break;

      case 'k':
        if (hasCtrl) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('cinestream:open-search'));
        }
        break;

      case '?':
        if (hasShift) {
          e.preventDefault();
          setShowHelp(prev => !prev);
        }
        break;

      case 'Escape':
        e.preventDefault();
        if (showHelp) {
          setShowHelp(false);
        } else {
          // Dispatch close event for modals
          window.dispatchEvent(new CustomEvent('cinestream:close-modal'));
        }
        break;

      case 'h':
        if (!hasCtrl && !hasShift && !isWatchPage) {
          e.preventDefault();
          router.push('/');
        }
        break;

      case 'g':
        if (!hasCtrl && !hasShift && !isWatchPage) {
          e.preventDefault();
          router.push('/genres');
        }
        break;

      case 'm':
        if (!hasCtrl && !hasShift && !isWatchPage) {
          e.preventDefault();
          router.push('/browse/movies');
        }
        break;

      case 't':
        if (!hasCtrl && !hasShift && !isWatchPage) {
          e.preventDefault();
          router.push('/browse/tv');
        }
        break;

      // Playback controls are handled by VideoPlayer component
      // These are just for documentation in the help modal
    }
  }, [router, showHelp, isWatchPage]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!mounted) return null;

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<Shortcut['category'], Shortcut[]>);

  return (
    <>
      {/* Help Modal */}
      {showHelp && (
        <div
          className="fixed inset-0 bg-netflix-dark/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-netflix-dark border border-netflix-gray/30 rounded-xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-2xl animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-netflix-gray/20">
              <h2 className="text-xl font-bold text-netflix-light">Keyboard Shortcuts</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="p-2 hover:bg-netflix-gray/20 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
                <div key={category} className="mb-6 last:mb-0">
                  <h3 className="text-sm font-semibold text-netflix-red uppercase tracking-wider mb-3">
                    {categoryLabels[category as Shortcut['category']]}
                  </h3>
                  <div className="space-y-2">
                    {categoryShortcuts.map((shortcut, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-netflix-gray/10 transition-colors"
                      >
                        <span className="text-netflix-light/80">{shortcut.description}</span>
                        <kbd className="px-3 py-1.5 bg-netflix-bg border border-netflix-gray/30 rounded-md text-sm font-mono text-netflix-light min-w-[60px] text-center">
                          {formatShortcut(shortcut)}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-netflix-gray/20 bg-netflix-bg/50">
              <p className="text-center text-sm text-netflix-gray">
                Press <kbd className="px-2 py-0.5 bg-netflix-dark border border-netflix-gray/30 rounded text-xs mx-1">?</kbd> to toggle this help
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

