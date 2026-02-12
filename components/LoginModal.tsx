'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [status, setStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const handleStartAuth = () => {
    setStatus('waiting');
    setErrorMessage('');
    
    // Clear any existing polling
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    
    // Start auth immediately (synchronously from user click to avoid popup blockers)
    auth.initiateLogin().catch((error) => {
      logger.error('Auth error:', error);
      setErrorMessage('Authentication failed. Please try again.');
      setStatus('error');
    });

    // Start polling for auth completion
    // After user approves in browser, they return to Electron and we check auth state
    const interval = setInterval(async () => {
      try {
        // Check if auth was completed
        const sessionId = auth.getSessionId();
        if (sessionId) {
          const authState = auth.getAuthState();
          if (authState.isAuthenticated) {
            clearInterval(interval);
            setPollingInterval(null);
            setStatus('success');
            setTimeout(() => {
              onSuccess?.();
              handleClose();
            }, 1000);
          }
        }
      } catch (error) {
        // Auth not completed yet, continue polling
      }
    }, 2000); // Poll every 2 seconds

    setPollingInterval(interval);
    
    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(interval);
      setPollingInterval(null);
    }, 5 * 60 * 1000);
  };

  const handleCompleteAuth = async () => {
    try {
      // Get the request token from sessionStorage (stored during initiateLogin)
      const requestToken = typeof window !== 'undefined' ? sessionStorage.getItem('tmdb_request_token') : null;
      
      if (!requestToken) {
        setErrorMessage('No pending authentication found. Please start the login process again.');
        setStatus('error');
        return;
      }

      // Complete auth inside Electron ONLY (prevents the browser callback from consuming the token)
      await auth.completeLogin(requestToken);

      // Stop polling once we succeed
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }

      setStatus('success');
      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 1000);
    } catch (error) {
      logger.error('Error completing auth:', error);
      setErrorMessage('Authentication failed. Make sure you approved the request in the browser, then try again.');
      setStatus('error');
    }
  };

  const handleClose = () => {
    // Clear polling when closing
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setStatus('idle');
    setErrorMessage('');
    onClose();
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-netflix-dark border border-netflix-gray w-full max-w-md mx-4 relative shadow-2xl ring-1 ring-white/10 animate-slide-in rounded-xl">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-netflix-light hover:text-netflix-red transition-colors"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="p-8">
          <h2 className="text-2xl font-bold mb-6">Sign in with TMDB</h2>
          <p className="text-netflix-gray mb-6">
            Connect your TMDB account to access favorites, watchlist, and ratings.
          </p>

          {status === 'idle' && (
            <button
              onClick={handleStartAuth}
              className="w-full bg-netflix-red hover:bg-red-600 text-white px-6 py-3 font-semibold transition-all duration-300 shadow-lg shadow-netflix-red/50 hover:shadow-xl hover:shadow-netflix-red/70 hover:-translate-y-1"
            >
              Sign in with TMDB
            </button>
          )}

          {status === 'waiting' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-netflix-light">
                <div className="w-5 h-5 border-2 border-netflix-red border-t-transparent rounded-full animate-spin"></div>
                <span>Waiting for authentication...</span>
              </div>
              <p className="text-sm text-netflix-gray mb-4">
                A browser window should open. After approving the request:
              </p>
              <ol className="text-sm text-netflix-light mb-4 list-decimal list-inside space-y-2">
                <li>Approve the request in the browser window</li>
                <li>Wait for the success message in the browser</li>
                <li>Return to this window and click "I've approved the request"</li>
              </ol>
              <p className="text-xs text-netflix-gray mb-4">
                The browser may try to redirect back to this app - if so, authentication will complete automatically.
              </p>
              <button
                onClick={handleCompleteAuth}
                className="w-full mt-4 bg-netflix-dark border border-netflix-gray hover:border-netflix-light text-netflix-light px-6 py-3 font-semibold transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5"
              >
                I've approved the request
              </button>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-green-500 font-semibold">Success! Redirecting...</p>
            </div>
          )}

          {status === 'error' && errorMessage && (
            <div className="text-red-500 text-sm mb-4">{errorMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
}
