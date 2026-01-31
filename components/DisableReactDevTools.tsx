'use client';

import { useEffect } from 'react';

export default function DisableReactDevTools() {
  useEffect(() => {
    // Disable React DevTools
    if (typeof window !== 'undefined') {
      // Remove React DevTools global hook
      if ((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        delete (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      }

      // Prevent React DevTools from attaching
      Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
        value: undefined,
        writable: false,
        configurable: false,
      });

      // Also disable in production builds
      if (process.env.NODE_ENV === 'production') {
        // Remove any existing DevTools references
        const devtools = {
          open: () => {},
          close: () => {},
        };
        Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
          get: () => undefined,
          set: () => {},
          configurable: false,
        });
      }
    }
  }, []);

  return null;
}


