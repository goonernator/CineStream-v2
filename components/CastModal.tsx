'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { tmdb, TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { Skeleton } from './Skeleton';
import type { Person, PersonCredit } from '@/lib/types';

interface CastModalProps {
  personId: number;
  personName: string;
  profilePath: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function CastModal({ personId, personName, profilePath, isOpen, onClose }: CastModalProps) {
  const [person, setPerson] = useState<Person | null>(null);
  const [credits, setCredits] = useState<PersonCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'movie' | 'tv'>('all');

  useEffect(() => {
    if (isOpen && personId) {
      loadPersonData();
    }
  }, [isOpen, personId]);

  const loadPersonData = async () => {
    setLoading(true);
    try {
      const [personDetails, personCredits] = await Promise.all([
        tmdb.getPersonDetails(personId),
        tmdb.getPersonCredits(personId),
      ]);

      setPerson(personDetails);

      // Combine and sort credits by popularity/release date
      const allCredits: PersonCredit[] = personCredits.cast
        .map((credit: PersonCredit) => ({
          ...credit,
          media_type: credit.media_type || (credit.title ? 'movie' : 'tv'),
        }))
        .filter((credit: PersonCredit) => credit.poster_path) // Only show items with posters
        .sort((a: PersonCredit, b: PersonCredit) => (b.popularity || 0) - (a.popularity || 0));

      // Remove duplicates (same id + media_type)
      const uniqueCredits = allCredits.filter(
        (credit, index, self) =>
          index === self.findIndex((c) => c.id === credit.id && c.media_type === credit.media_type)
      );

      setCredits(uniqueCredits);
    } catch (error) {
      logger.error('Failed to load person data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCredits = credits.filter((credit) => {
    if (filter === 'all') return true;
    return credit.media_type === filter;
  });

  const movieCount = credits.filter((c) => c.media_type === 'movie').length;
  const tvCount = credits.filter((c) => c.media_type === 'tv').length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-6xl max-h-[90vh] bg-netflix-dark rounded-2xl overflow-hidden shadow-2xl animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-netflix-bg/80 hover:bg-netflix-bg rounded-full flex items-center justify-center text-netflix-light hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex flex-col md:flex-row h-full max-h-[90vh]">
          {/* Person Info Sidebar */}
          <div className="md:w-80 flex-shrink-0 p-6 bg-netflix-bg/50 border-b md:border-b-0 md:border-r border-netflix-gray/20">
            {loading ? (
              <div className="text-center">
                <Skeleton className="w-40 h-40 rounded-full mx-auto mb-4" />
                <Skeleton className="h-8 w-48 mx-auto mb-2 rounded" />
                <Skeleton className="h-4 w-32 mx-auto rounded" />
              </div>
            ) : (
              <div className="text-center">
                {/* Profile Image */}
                <div className="relative w-40 h-40 mx-auto mb-4 rounded-full overflow-hidden bg-netflix-dark ring-4 ring-netflix-red/30">
                  {profilePath ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w300${profilePath}`}
                      alt={personName}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl text-netflix-gray">
                      👤
                    </div>
                  )}
                </div>

                {/* Name */}
                <h2 className="text-2xl font-bold text-white mb-2">{personName}</h2>

                {/* Known for */}
                {person?.known_for_department && (
                  <p className="text-netflix-gray mb-4">{person.known_for_department}</p>
                )}

                {/* Birth info */}
                {person?.birthday && (
                  <p className="text-sm text-netflix-gray mb-1">
                    Born: {new Date(person.birthday).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                )}
                {person?.place_of_birth && (
                  <p className="text-sm text-netflix-gray mb-4">{person.place_of_birth}</p>
                )}

                {/* Biography (truncated) */}
                {person?.biography && (
                  <p className="text-sm text-netflix-gray/80 text-left line-clamp-6 mt-4">
                    {person.biography}
                  </p>
                )}

                {/* Stats */}
                <div className="flex justify-center gap-6 mt-6 pt-4 border-t border-netflix-gray/20">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-netflix-red">{movieCount}</p>
                    <p className="text-xs text-netflix-gray">Movies</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-netflix-red">{tvCount}</p>
                    <p className="text-xs text-netflix-gray">TV Shows</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filmography Grid */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Filter tabs */}
            <div className="flex gap-2 p-4 border-b border-netflix-gray/20">
              {(['all', 'movie', 'tv'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    filter === tab
                      ? 'bg-netflix-red text-white'
                      : 'bg-netflix-bg/50 text-netflix-gray hover:text-white hover:bg-netflix-bg'
                  }`}
                >
                  {tab === 'all' ? `All (${credits.length})` : 
                   tab === 'movie' ? `Movies (${movieCount})` : 
                   `TV Shows (${tvCount})`}
                </button>
              ))}
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {Array.from({ length: 15 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="aspect-[2/3] rounded-lg mb-2" />
                      <Skeleton className="h-4 w-full rounded" />
                    </div>
                  ))}
                </div>
              ) : filteredCredits.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-netflix-gray">
                  <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                  </svg>
                  <p>No {filter === 'all' ? 'credits' : filter === 'movie' ? 'movies' : 'TV shows'} found</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {filteredCredits.map((credit, index) => (
                    <Link
                      key={`${credit.id}-${credit.media_type}-${index}`}
                      href={`/details/${credit.id}?type=${credit.media_type}`}
                      onClick={onClose}
                      className="group"
                    >
                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-netflix-bg mb-2 ring-2 ring-transparent group-hover:ring-netflix-red transition-all duration-300 group-hover:scale-105">
                        {credit.poster_path ? (
                          <Image
                            src={`${TMDB_IMAGE_BASE}/w300${credit.poster_path}`}
                            alt={credit.title || credit.name || ''}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-netflix-gray">
                            🎬
                          </div>
                        )}
                        
                        {/* Media type badge */}
                        <div className={`absolute top-2 left-2 px-2 py-0.5 text-xs font-semibold rounded ${
                          credit.media_type === 'movie' ? 'bg-blue-600' : 'bg-purple-600'
                        }`}>
                          {credit.media_type === 'movie' ? 'Movie' : 'TV'}
                        </div>

                        {/* Rating badge */}
                        {credit.vote_average > 0 && (
                          <div className="absolute top-2 right-2 bg-black/70 px-1.5 py-0.5 text-xs font-semibold rounded flex items-center gap-1">
                            <span className="text-yellow-400">★</span>
                            <span>{credit.vote_average.toFixed(1)}</span>
                          </div>
                        )}

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                          {credit.character && (
                            <p className="text-xs text-netflix-gray">as {credit.character}</p>
                          )}
                        </div>
                      </div>

                      <h3 className="text-sm font-medium text-netflix-light group-hover:text-white line-clamp-2 transition-colors">
                        {credit.title || credit.name}
                      </h3>
                      {(credit.release_date || credit.first_air_date) && (
                        <p className="text-xs text-netflix-gray">
                          {(credit.release_date || credit.first_air_date)?.split('-')[0]}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

