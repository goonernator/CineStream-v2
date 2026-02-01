'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'electron-redirect'>('loading');

  useEffect(() => {
    const completeAuth = async () => {
      try {
        const approved = searchParams.get('approved');
        const requestToken = searchParams.get('request_token');
        
        // Try to get from URL params first, then from sessionStorage
        const token = requestToken || (typeof window !== 'undefined' ? sessionStorage.getItem('tmdb_request_token') : null);

        if (approved === 'true' && token) {
          // Check if we're in Electron or system browser
          const isElectron = typeof window !== 'undefined' && (window as any).electron;
          
          if (isElectron) {
            // In Electron: complete auth normally
            await auth.completeLogin(token);
            setStatus('success');
            setTimeout(() => {
              router.push('/');
            }, 1500);
          } else {
            // In system browser: DO NOT complete auth here.
            // Request tokens are effectively single-use for session creation; completing here
            // would consume the token and make Electron fail.
            setStatus('electron-redirect');
          }
        } else {
          setStatus('error');
        }
      } catch (error) {
        logger.error('Auth completion failed:', error);
        setStatus('error');
      }
    };

    completeAuth();
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-netflix-bg">
      <div className="text-center max-w-md mx-4">
        {status === 'loading' && <p className="text-xl">Completing authentication...</p>}
        {status === 'success' && <p className="text-xl text-green-500">Success! Redirecting...</p>}
        {status === 'electron-redirect' && (
          <>
            <div className="mb-6">
              <svg className="w-16 h-16 mx-auto mb-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xl text-green-500 mb-2">Authentication approved!</p>
              <p className="text-netflix-light">
                Please return to the CineStream app and click <strong>"I've approved the request"</strong> button.
              </p>
            </div>
            <p className="text-sm text-netflix-gray">
              You can close this browser window now.
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-xl text-red-500 mb-4">Authentication failed</p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-2 bg-netflix-red hover:bg-red-600 transition-colors"
            >
              Return Home
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-netflix-bg">
        <div className="text-center">
          <p className="text-xl">Loading...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
