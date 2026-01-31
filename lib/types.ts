export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  runtime?: number;
  genre_ids?: number[]; // Array of genre IDs, first one is primary genre
}

export interface TVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  number_of_seasons?: number;
  seasons?: Season[];
  genre_ids?: number[]; // Array of genre IDs, first one is primary genre
}

export interface Season {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  overview: string;
  poster_path: string | null;
  air_date: string;
}

export interface Episode {
  id: number;
  name: string;
  episode_number: number;
  overview: string;
  still_path: string | null;
  air_date: string;
  runtime: number;
  vote_average: number;
}

export type MediaItem = Movie | TVShow;

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
}

export interface TMDBResponse<T> {
  results: T[];
  page: number;
  total_pages: number;
  total_results: number;
}

export interface AccountDetails {
  id: number;
  username: string;
  name: string;
}

export interface SessionData {
  session_id: string;
}

export interface RequestToken {
  request_token: string;
  expires_at: string;
}

export interface Genre {
  id: number;
  name: string;
}

export interface DiscoverFilters {
  page?: number;
  with_genres?: string; // comma-separated genre IDs
  primary_release_year?: number;
  first_air_date_year?: number;
  'vote_average.gte'?: number;
  'vote_average.lte'?: number;
  sort_by?: 'popularity.desc' | 'popularity.asc' | 'vote_average.desc' | 'vote_average.asc' | 'release_date.desc' | 'release_date.asc' | 'first_air_date.desc' | 'first_air_date.asc';
  with_original_language?: string;
  'primary_release_date.gte'?: string;
  'primary_release_date.lte'?: string;
  'first_air_date.gte'?: string;
  'first_air_date.lte'?: string;
}

export interface PaginatedResponse<T> {
  results: T[];
  page: number;
  total_pages: number;
  total_results: number;
}

// Person / Cast types
export interface Person {
  id: number;
  name: string;
  profile_path: string | null;
  biography?: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  known_for_department?: string;
  popularity?: number;
  also_known_as?: string[];
  gender?: number;
  homepage?: string | null;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order?: number;
  known_for_department?: string;
}

export interface PersonCredit {
  id: number;
  title?: string; // For movies
  name?: string; // For TV shows
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  release_date?: string; // For movies
  first_air_date?: string; // For TV shows
  character?: string;
  media_type: 'movie' | 'tv';
  popularity?: number;
}

export interface PersonCredits {
  cast: PersonCredit[];
  crew: PersonCredit[];
}

