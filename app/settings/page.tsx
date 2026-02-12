'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useLayout } from '@/components/LayoutProvider';
import { layouts } from '@/lib/layout';
import { useToast } from '@/lib/toast';
import { Theme, themes } from '@/lib/theme';
import { watchProgress } from '@/lib/watchProgress';

// Setting Section Component
interface SettingSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function SettingSection({ title, description, children }: SettingSectionProps) {
  return (
    <div className="bg-netflix-dark/50 rounded-xl p-6 border border-netflix-gray/20">
      <h2 className="text-xl font-semibold text-netflix-light mb-1">{title}</h2>
      {description && <p className="text-sm text-netflix-gray mb-4">{description}</p>}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

// Toggle Switch Component
interface ToggleSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleSwitch({ label, description, checked, onChange }: ToggleSwitchProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <span className="text-netflix-light font-medium">{label}</span>
        {description && <p className="text-sm text-netflix-gray mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
          checked ? 'bg-netflix-red' : 'bg-netflix-gray/40'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
            checked ? 'translate-x-6' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// Select Dropdown Component
interface SelectOptionProps {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function SelectOption({ label, description, value, options, onChange }: SelectOptionProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <span className="text-netflix-light font-medium">{label}</span>
        {description && <p className="text-sm text-netflix-gray mt-0.5">{description}</p>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-netflix-dark border border-netflix-gray/30 rounded-lg px-4 py-2 text-netflix-light focus:border-netflix-red focus:outline-none focus:ring-1 focus:ring-netflix-red/50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Theme Card Component
interface ThemeCardProps {
  theme: Theme;
  label: string;
  colors: { bg: string; red: string; light: string };
  isActive: boolean;
  onClick: () => void;
}

function ThemeCard({ theme, label, colors, isActive, onClick }: ThemeCardProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-200 ${
        isActive
          ? 'border-netflix-red bg-netflix-red/10'
          : 'border-netflix-gray/30 hover:border-netflix-gray/50 bg-netflix-dark/50'
      }`}
    >
      {/* Theme Preview */}
      <div
        className="w-20 h-14 rounded-lg mb-3 flex items-center justify-center overflow-hidden border border-netflix-gray/20"
        style={{ backgroundColor: colors.bg }}
      >
        <div className="flex gap-1">
          <div className="w-2 h-6 rounded" style={{ backgroundColor: colors.red }} />
          <div className="w-6 h-6 rounded" style={{ backgroundColor: colors.light, opacity: 0.1 }} />
        </div>
      </div>
      <span className={`text-sm font-medium ${isActive ? 'text-netflix-red' : 'text-netflix-light'}`}>
        {label}
      </span>
      {isActive && (
        <div className="absolute top-2 right-2">
          <svg className="w-5 h-5 text-netflix-red" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
        </div>
      )}
    </button>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { layout, setLayout } = useLayout();
  const toast = useToast();

  // Settings state
  const [autoplay, setAutoplay] = useState(true);
  const [autoNextEpisode, setAutoNextEpisode] = useState(true);
  const [defaultQuality, setDefaultQuality] = useState('auto');
  const [defaultSubtitleLang, setDefaultSubtitleLang] = useState('en');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [adultContentEnabled, setAdultContentEnabled] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAutoplay = localStorage.getItem('cinestream_autoplay');
      const savedAutoNext = localStorage.getItem('cinestream_auto_next');
      const savedQuality = localStorage.getItem('cinestream_quality');
      const savedSubLang = localStorage.getItem('cinestream_subtitle_language');
      const savedSubEnabled = localStorage.getItem('cinestream_subtitles_enabled');
      const savedAdultContent = localStorage.getItem('cinestream_adult_content_enabled');

      if (savedAutoplay !== null) setAutoplay(savedAutoplay === 'true');
      if (savedAutoNext !== null) setAutoNextEpisode(savedAutoNext === 'true');
      if (savedQuality) setDefaultQuality(savedQuality);
      if (savedSubLang) setDefaultSubtitleLang(savedSubLang);
      if (savedSubEnabled !== null) setSubtitlesEnabled(savedSubEnabled === 'true');
      if (savedAdultContent !== null) setAdultContentEnabled(savedAdultContent === 'true');
    }
  }, []);

  // Save settings to localStorage
  const saveSetting = (key: string, value: string | boolean) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`cinestream_${key}`, String(value));
    }
  };

  const handleAutoplayChange = (value: boolean) => {
    setAutoplay(value);
    saveSetting('autoplay', value);
    toast.success('Autoplay setting saved');
  };

  const handleAutoNextChange = (value: boolean) => {
    setAutoNextEpisode(value);
    saveSetting('auto_next', value);
    toast.success('Auto-play next episode setting saved');
  };

  const handleQualityChange = (value: string) => {
    setDefaultQuality(value);
    saveSetting('quality', value);
    toast.success('Default quality saved');
  };

  const handleSubtitleLangChange = (value: string) => {
    setDefaultSubtitleLang(value);
    saveSetting('subtitle_language', value);
    toast.success('Subtitle language saved');
  };

  const handleSubtitlesEnabledChange = (value: boolean) => {
    setSubtitlesEnabled(value);
    saveSetting('subtitles_enabled', value);
    toast.success('Subtitle setting saved');
  };

  const handleAdultContentChange = (value: boolean) => {
    setAdultContentEnabled(value);
    saveSetting('adult_content_enabled', value);
    toast.success(value ? 'Adult content enabled' : 'Adult content disabled');
    // Trigger custom event so other components can react
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cinestream:adult-content-changed', { detail: { enabled: value } }));
    }
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    toast.success(`Theme changed to ${newTheme === 'system' ? 'system default' : themes[newTheme as keyof typeof themes].label}`);
  };

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear your watch history? This cannot be undone.')) {
      watchProgress.clearAll();
      toast.success('Watch history cleared');
    }
  };

  const handleClearCache = () => {
    if (typeof window !== 'undefined') {
      // Clear any cached data
      localStorage.removeItem('cinestream_cache');
      sessionStorage.clear();
      toast.success('Cache cleared successfully');
    }
  };

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-netflix-light mb-2 flex items-center gap-3">
            <svg className="w-10 h-10 text-netflix-red" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
            Settings
          </h1>
          <p className="text-netflix-gray">Customize your CineStream experience</p>
        </div>

        <div className="space-y-6">
          {/* Theme Section */}
          <SettingSection title="Appearance" description="Choose your preferred theme">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              <ThemeCard
                theme="system"
                label="System"
                colors={{ bg: '#141414', red: '#E50914', light: '#FFFFFF' }}
                isActive={theme === 'system'}
                onClick={() => handleThemeChange('system')}
              />
              {Object.entries(themes).map(([key, config]) => (
                <ThemeCard
                  key={key}
                  theme={key as Theme}
                  label={config.label}
                  colors={config.colors}
                  isActive={theme === key}
                  onClick={() => handleThemeChange(key as Theme)}
                />
              ))}
            </div>
          </SettingSection>

          {/* Layout Section */}
          <SettingSection title="Layout" description="Choose your preferred layout style">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.values(layouts).map((layoutOption) => (
                <button
                  key={layoutOption.name}
                  onClick={() => {
                    setLayout(layoutOption.style);
                    toast.success(`Layout changed to ${layoutOption.label}`);
                  }}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    layout === layoutOption.style
                      ? 'border-netflix-red bg-netflix-red/10'
                      : 'border-netflix-gray/30 hover:border-netflix-gray/50 bg-netflix-dark/50'
                  }`}
                >
                  <h3 className="text-lg font-semibold mb-2 text-netflix-light">{layoutOption.label}</h3>
                  <p className="text-sm text-netflix-gray">{layoutOption.description}</p>
                </button>
              ))}
            </div>
          </SettingSection>

          {/* Playback Section */}
          <SettingSection title="Playback" description="Control how videos play">
            <ToggleSwitch
              label="Autoplay"
              description="Automatically start playing videos when opening"
              checked={autoplay}
              onChange={handleAutoplayChange}
            />
            <ToggleSwitch
              label="Auto-play next episode"
              description="Automatically play the next episode when one ends"
              checked={autoNextEpisode}
              onChange={handleAutoNextChange}
            />
            <SelectOption
              label="Default Quality"
              description="Preferred video quality when available"
              value={defaultQuality}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: '4k', label: '4K (2160p)' },
                { value: '1080p', label: 'Full HD (1080p)' },
                { value: '720p', label: 'HD (720p)' },
                { value: '480p', label: 'SD (480p)' },
              ]}
              onChange={handleQualityChange}
            />
          </SettingSection>

          {/* Subtitles Section */}
          <SettingSection title="Subtitles" description="Configure subtitle preferences">
            <ToggleSwitch
              label="Enable subtitles by default"
              description="Automatically show subtitles when available"
              checked={subtitlesEnabled}
              onChange={handleSubtitlesEnabledChange}
            />
            <SelectOption
              label="Preferred Language"
              description="Default subtitle language"
              value={defaultSubtitleLang}
              options={[
                { value: 'en', label: 'English' },
                { value: 'es', label: 'Spanish' },
                { value: 'fr', label: 'French' },
                { value: 'de', label: 'German' },
                { value: 'it', label: 'Italian' },
                { value: 'pt', label: 'Portuguese' },
                { value: 'ja', label: 'Japanese' },
                { value: 'ko', label: 'Korean' },
                { value: 'zh', label: 'Chinese' },
              ]}
              onChange={handleSubtitleLangChange}
            />
          </SettingSection>

          {/* Content Section */}
          <SettingSection title="Content" description="Control content visibility">
            <ToggleSwitch
              label="Enable adult content"
              description="Show adult content section in navigation and allow access to mature content. This setting is disabled by default."
              checked={adultContentEnabled}
              onChange={handleAdultContentChange}
            />
            <p className="text-xs text-netflix-gray mt-2">
              Enabling this option will make adult content accessible through the navigation menu. Please use responsibly.
            </p>
          </SettingSection>

          {/* Data Management Section */}
          <SettingSection title="Data Management" description="Manage your local data">
            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleClearHistory}
                className="px-6 py-2.5 bg-netflix-dark border border-netflix-gray/30 hover:border-red-500/50 hover:bg-red-500/10 rounded-lg text-netflix-light hover:text-red-400 transition-colors"
              >
                Clear Watch History
              </button>
              <button
                onClick={handleClearCache}
                className="px-6 py-2.5 bg-netflix-dark border border-netflix-gray/30 hover:border-netflix-red/50 hover:bg-netflix-red/10 rounded-lg text-netflix-light hover:text-netflix-red transition-colors"
              >
                Clear Cache
              </button>
            </div>
            <p className="text-xs text-netflix-gray mt-2">
              Clearing watch history will remove all your continue watching progress.
            </p>
          </SettingSection>

          {/* About Section */}
          <SettingSection title="About">
            <div className="flex items-center gap-4">
              <div className="text-netflix-red">
                <svg className="w-12 h-12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-netflix-light">CineStream</h3>
                <p className="text-netflix-gray text-sm">Version 2.0.0</p>
                <p className="text-netflix-gray text-xs mt-1">Stream movies and TV shows</p>
              </div>
            </div>
          </SettingSection>
        </div>
      </div>
    </div>
  );
}
