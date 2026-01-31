'use client';

import { useState, useEffect, useRef } from 'react';
import type { Genre } from '@/lib/types';

export interface FilterState {
  genre: string;
  year: string;
  rating: string;
  sortBy: string;
}

interface FilterBarProps {
  genres: Genre[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  mediaType?: 'movie' | 'tv';
  className?: string;
}

// Dropdown icon
const ChevronDownIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

// Clear/Reset icon
const XIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// Filter icon
const FilterIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

interface SelectDropdownProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
}

function SelectDropdown({ label, value, options, onChange, placeholder = 'All' }: SelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);
  const displayValue = selectedOption?.label || placeholder;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-4 py-2.5 rounded-lg
          bg-netflix-dark/80 border border-netflix-gray/30
          hover:border-netflix-red/50 hover:bg-netflix-dark
          transition-all duration-200
          min-w-[140px] text-left
          ${isOpen ? 'border-netflix-red ring-1 ring-netflix-red/30' : ''}
          ${value ? 'text-white' : 'text-netflix-gray'}
        `}
      >
        <span className="text-xs text-netflix-gray uppercase tracking-wider">{label}</span>
        <span className="flex-1 text-sm font-medium truncate">{displayValue}</span>
        <ChevronDownIcon className={`w-4 h-4 text-netflix-gray transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full min-w-[180px] max-h-[300px] overflow-y-auto rounded-lg bg-netflix-dark border border-netflix-gray/30 shadow-xl animate-scale-up">
          <div className="p-1">
            <button
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm rounded-md transition-colors ${
                !value ? 'bg-netflix-red text-white' : 'text-netflix-light hover:bg-netflix-gray/20'
              }`}
            >
              {placeholder}
            </button>
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm rounded-md transition-colors ${
                  value === option.value ? 'bg-netflix-red text-white' : 'text-netflix-light hover:bg-netflix-gray/20'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Generate year options (current year down to 1950)
const generateYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let year = currentYear; year >= 1950; year--) {
    years.push({ value: year.toString(), label: year.toString() });
  }
  return years;
};

// Rating options
const ratingOptions = [
  { value: '9', label: '9+ Excellent' },
  { value: '8', label: '8+ Great' },
  { value: '7', label: '7+ Good' },
  { value: '6', label: '6+ Fair' },
  { value: '5', label: '5+ Average' },
];

// Sort options
const movieSortOptions = [
  { value: 'popularity.desc', label: 'Most Popular' },
  { value: 'popularity.asc', label: 'Least Popular' },
  { value: 'vote_average.desc', label: 'Highest Rated' },
  { value: 'vote_average.asc', label: 'Lowest Rated' },
  { value: 'release_date.desc', label: 'Newest First' },
  { value: 'release_date.asc', label: 'Oldest First' },
];

const tvSortOptions = [
  { value: 'popularity.desc', label: 'Most Popular' },
  { value: 'popularity.asc', label: 'Least Popular' },
  { value: 'vote_average.desc', label: 'Highest Rated' },
  { value: 'vote_average.asc', label: 'Lowest Rated' },
  { value: 'first_air_date.desc', label: 'Newest First' },
  { value: 'first_air_date.asc', label: 'Oldest First' },
];

export default function FilterBar({ 
  genres, 
  filters, 
  onFilterChange, 
  mediaType = 'movie',
  className = '' 
}: FilterBarProps) {
  const yearOptions = generateYearOptions();
  const sortOptions = mediaType === 'movie' ? movieSortOptions : tvSortOptions;

  const genreOptions = genres.map(g => ({ value: g.id.toString(), label: g.name }));

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const hasActiveFilters = filters.genre || filters.year || filters.rating || (filters.sortBy && filters.sortBy !== 'popularity.desc');

  const clearFilters = () => {
    onFilterChange({
      genre: '',
      year: '',
      rating: '',
      sortBy: 'popularity.desc',
    });
  };

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <div className="flex items-center gap-2 text-netflix-gray mr-2">
        <FilterIcon className="w-5 h-5" />
        <span className="text-sm font-medium hidden sm:inline">Filters</span>
      </div>

      <SelectDropdown
        label="Genre"
        value={filters.genre}
        options={genreOptions}
        onChange={(value) => handleFilterChange('genre', value)}
        placeholder="All Genres"
      />

      <SelectDropdown
        label="Year"
        value={filters.year}
        options={yearOptions}
        onChange={(value) => handleFilterChange('year', value)}
        placeholder="Any Year"
      />

      <SelectDropdown
        label="Rating"
        value={filters.rating}
        options={ratingOptions}
        onChange={(value) => handleFilterChange('rating', value)}
        placeholder="Any Rating"
      />

      <SelectDropdown
        label="Sort"
        value={filters.sortBy}
        options={sortOptions}
        onChange={(value) => handleFilterChange('sortBy', value)}
        placeholder="Most Popular"
      />

      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-netflix-red hover:text-white hover:bg-netflix-red/20 rounded-lg transition-colors"
        >
          <XIcon className="w-4 h-4" />
          <span>Clear</span>
        </button>
      )}
    </div>
  );
}

// Export default filter state
export const defaultFilterState: FilterState = {
  genre: '',
  year: '',
  rating: '',
  sortBy: 'popularity.desc',
};

