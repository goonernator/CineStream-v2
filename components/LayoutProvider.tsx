'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LayoutStyle, getStoredLayout, setStoredLayout, initializeLayout } from '@/lib/layout';

interface LayoutContextType {
  layout: LayoutStyle;
  setLayout: (layout: LayoutStyle) => void;
}

const LayoutContext = createContext<LayoutContextType | null>(null);

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}

interface LayoutProviderProps {
  children: ReactNode;
}

export default function LayoutProvider({ children }: LayoutProviderProps) {
  const [layout, setLayoutState] = useState<LayoutStyle>('classic');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initialLayout = initializeLayout();
    setLayoutState(initialLayout);
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleProfileChange = () => {
      const newLayout = getStoredLayout();
      setLayoutState(newLayout);
      setStoredLayout(newLayout);
    };

    window.addEventListener('cinestream:profile-changed', handleProfileChange);
    return () => {
      window.removeEventListener('cinestream:profile-changed', handleProfileChange);
    };
  }, []);

  const setLayout = (newLayout: LayoutStyle) => {
    setLayoutState(newLayout);
    setStoredLayout(newLayout);
  };

  if (!mounted) {
    return null;
  }

  return (
    <LayoutContext.Provider value={{ layout, setLayout }}>
      {children}
    </LayoutContext.Provider>
  );
}

