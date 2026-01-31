// Keyboard shortcuts configuration

export interface Shortcut {
  key: string;
  description: string;
  category: 'navigation' | 'playback' | 'general';
  modifiers?: ('ctrl' | 'meta' | 'shift' | 'alt')[];
}

export const shortcuts: Shortcut[] = [
  // Navigation
  { key: '/', description: 'Open search', category: 'navigation' },
  { key: 'k', description: 'Open search', category: 'navigation', modifiers: ['ctrl'] },
  { key: 'h', description: 'Go to home', category: 'navigation' },
  { key: 'g', description: 'Go to genres', category: 'navigation' },
  { key: 'm', description: 'Browse movies', category: 'navigation' },
  { key: 't', description: 'Browse TV shows', category: 'navigation' },
  
  // Playback
  { key: ' ', description: 'Play / Pause', category: 'playback' },
  { key: 'f', description: 'Toggle fullscreen', category: 'playback' },
  { key: 'ArrowLeft', description: 'Rewind 10 seconds', category: 'playback' },
  { key: 'ArrowRight', description: 'Forward 10 seconds', category: 'playback' },
  { key: 'ArrowUp', description: 'Volume up', category: 'playback' },
  { key: 'ArrowDown', description: 'Volume down', category: 'playback' },
  { key: 'c', description: 'Toggle captions', category: 'playback' },
  
  // General
  { key: 'Escape', description: 'Close modal / overlay', category: 'general' },
  { key: '?', description: 'Show keyboard shortcuts', category: 'general' },
];

export const categoryLabels: Record<Shortcut['category'], string> = {
  navigation: 'Navigation',
  playback: 'Playback',
  general: 'General',
};

export function formatShortcut(shortcut: Shortcut): string {
  const parts: string[] = [];
  
  if (shortcut.modifiers?.includes('ctrl')) {
    parts.push('Ctrl');
  }
  if (shortcut.modifiers?.includes('meta')) {
    parts.push('⌘');
  }
  if (shortcut.modifiers?.includes('shift')) {
    parts.push('Shift');
  }
  if (shortcut.modifiers?.includes('alt')) {
    parts.push('Alt');
  }
  
  // Format special keys
  let keyDisplay = shortcut.key;
  switch (shortcut.key) {
    case ' ':
      keyDisplay = 'Space';
      break;
    case 'ArrowLeft':
      keyDisplay = '←';
      break;
    case 'ArrowRight':
      keyDisplay = '→';
      break;
    case 'ArrowUp':
      keyDisplay = '↑';
      break;
    case 'ArrowDown':
      keyDisplay = '↓';
      break;
    case 'Escape':
      keyDisplay = 'Esc';
      break;
    default:
      keyDisplay = shortcut.key.toUpperCase();
  }
  
  parts.push(keyDisplay);
  return parts.join(' + ');
}

