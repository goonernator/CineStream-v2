'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/Skeleton';
import { tmdb } from '@/lib/tmdb';
import type { Genre } from '@/lib/types';

// Genre card colors
const genreColors: Record<number, string> = {
  28: 'from-red-600 to-orange-600', // Action
  12: 'from-emerald-600 to-teal-600', // Adventure
  16: 'from-pink-500 to-rose-500', // Animation
  35: 'from-yellow-500 to-amber-500', // Comedy
  80: 'from-slate-700 to-zinc-800', // Crime
  99: 'from-blue-600 to-indigo-600', // Documentary
  18: 'from-purple-600 to-violet-600', // Drama
  10751: 'from-sky-500 to-cyan-500', // Family
  14: 'from-indigo-600 to-purple-600', // Fantasy
  36: 'from-amber-700 to-orange-700', // History
  27: 'from-gray-800 to-black', // Horror
  10402: 'from-fuchsia-600 to-pink-600', // Music
  9648: 'from-slate-600 to-gray-700', // Mystery
  10749: 'from-rose-500 to-pink-500', // Romance
  878: 'from-cyan-600 to-blue-600', // Science Fiction
  10770: 'from-orange-500 to-red-500', // TV Movie
  53: 'from-red-700 to-rose-800', // Thriller
  10752: 'from-olive-700 to-green-800', // War
  37: 'from-amber-600 to-yellow-700', // Western
  10759: 'from-red-600 to-orange-600', // Action & Adventure (TV)
  10762: 'from-sky-400 to-blue-500', // Kids (TV)
  10763: 'from-blue-600 to-indigo-600', // News (TV)
  10764: 'from-purple-500 to-fuchsia-500', // Reality (TV)
  10765: 'from-indigo-600 to-violet-600', // Sci-Fi & Fantasy (TV)
  10766: 'from-rose-500 to-pink-500', // Soap (TV)
  10767: 'from-yellow-500 to-orange-500', // Talk (TV)
  10768: 'from-slate-700 to-zinc-800', // War & Politics (TV)
};

const defaultGradient = 'from-netflix-red to-red-700';

interface GenreCardProps {
  genre: Genre;
  type: 'movie' | 'tv';
}

function GenreCard({ genre, type }: GenreCardProps) {
  const gradient = genreColors[genre.id] || defaultGradient;
  
  return (
    <Link
      href={`/genre/${genre.id}?type=${type}`}
      className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${gradient} p-6 h-32 flex items-end group transition-transform duration-300 hover:scale-105 hover:shadow-xl`}
    >
      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
      <h3 className="relative text-white font-bold text-lg z-10">{genre.name}</h3>
    </Link>
  );
}

function GenreCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden">
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export default function GenresPage() {
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTVGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'movies' | 'tv'>('movies');

  useEffect(() => {
    const loadGenres = async () => {
      try {
        setLoading(true);
        const [movies, tv] = await Promise.all([
          tmdb.getMovieGenres(),
          tmdb.getTVGenres(),
        ]);
        setMovieGenres(movies);
        setTVGenres(tv);
      } catch (error) {
        console.error('Failed to load genres:', error);
      } finally {
        setLoading(false);
      }
    };

    loadGenres();
  }, []);

  const genres = activeTab === 'movies' ? movieGenres : tvGenres;

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-netflix-light mb-2 flex items-center gap-3">
            <svg className="w-10 h-10 text-netflix-red" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z"/>
            </svg>
            Browse by Genre
          </h1>
          <p className="text-netflix-gray">
            Explore content by your favorite genres
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab('movies')}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-200 ${
              activeTab === 'movies'
                ? 'bg-netflix-red text-white'
                : 'bg-netflix-dark/80 text-netflix-gray hover:text-white hover:bg-netflix-dark'
            }`}
          >
            Movie Genres
          </button>
          <button
            onClick={() => setActiveTab('tv')}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-200 ${
              activeTab === 'tv'
                ? 'bg-netflix-red text-white'
                : 'bg-netflix-dark/80 text-netflix-gray hover:text-white hover:bg-netflix-dark'
            }`}
          >
            TV Genres
          </button>
        </div>

        {/* Genres Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <GenreCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {genres.map((genre, index) => (
              <div
                key={genre.id}
                className="animate-scale-up"
                style={{ animationDelay: `${index * 0.03}s`, animationFillMode: 'both' }}
              >
                <GenreCard genre={genre} type={activeTab === 'movies' ? 'movie' : 'tv'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
