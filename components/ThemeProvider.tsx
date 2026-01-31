'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Theme, getStoredTheme, setStoredTheme, applyTheme, initializeTheme } from '@/lib/theme';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export default function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  // Initialize theme on mount
  useEffect(() => {
    const initialTheme = initializeTheme();
    setThemeState(initialTheme);
    setMounted(true);
  }, []);

  // Listen for profile changes and reapply theme
  useEffect(() => {
    const handleProfileChange = () => {
      const newTheme = getStoredTheme();
      setThemeState(newTheme);
      applyTheme(newTheme);
    };

    window.addEventListener('cinestream:profile-changed', handleProfileChange);
    return () => {
      window.removeEventListener('cinestream:profile-changed', handleProfileChange);
    };
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    setStoredTheme(newTheme);
    applyTheme(newTheme);
  };

  // Prevent flash of wrong theme
  if (!mounted) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

