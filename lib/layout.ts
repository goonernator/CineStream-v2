'use client';

import { profiles } from './profiles';

export type LayoutStyle = 'classic' | 'noirflix';

export interface LayoutConfig {
  name: string;
  label: string;
  description: string;
  style: LayoutStyle;
}

export const layouts: Record<LayoutStyle, LayoutConfig> = {
  classic: {
    name: 'classic',
    label: 'Cinestream (Classic)',
    description: 'Traditional Netflix-style layout with horizontal carousels',
    style: 'classic',
  },
  noirflix: {
    name: 'noirflix',
    label: 'NoirFlix',
    description: 'Minimalist obsidian monolith design with grid layouts',
    style: 'noirflix',
  },
};

const BASE_LAYOUT_KEY = 'layout';

function getStorageKey(): string {
  return profiles.getStorageKey(BASE_LAYOUT_KEY);
}

export function getStoredLayout(): LayoutStyle {
  if (typeof window === 'undefined') return 'classic';
  
  const stored = localStorage.getItem(getStorageKey());
  if (stored === 'classic' || stored === 'noirflix') {
    return stored as LayoutStyle;
  }
  return 'classic';
}

export function setStoredLayout(layout: LayoutStyle): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getStorageKey(), layout);
  document.documentElement.setAttribute('data-layout', layout);
}

export function initializeLayout(): LayoutStyle {
  const layout = getStoredLayout();
  if (typeof window !== 'undefined') {
    document.documentElement.setAttribute('data-layout', layout);
  }
  return layout;
}

