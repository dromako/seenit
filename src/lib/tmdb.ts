/**
 * TMDB API Client
 * Handles movie and TV show data, details, and watch providers
 */

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';

interface TMDBSearchResult {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  media_type?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  overview?: string;
}

interface TMDBSearchResponse {
  results: TMDBSearchResult[];
  total_results: number;
  total_pages: number;
}

interface MovieDetails {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number;
  overview: string;
  genres: Array<{ id: number; name: string }>;
  imdb_id: string;
  vote_average: number;
}

interface TVDetails {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time?: number[];
  overview: string;
  genres: Array<{ id: number; name: string }>;
  vote_average: number;
  external_ids?: { imdb_id?: string; tvdb_id?: number };
}

interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

interface WatchProviderData {
  results: {
    [key: string]: {
      link?: string;
      flatrate?: WatchProvider[];
      free?: WatchProvider[];
      ads?: WatchProvider[];
      buy?: WatchProvider[];
      rent?: WatchProvider[];
    };
  };
}

interface FindByIMDBResponse {
  movie_results: MovieDetails[];
  tv_results: TVDetails[];
}

/**
 * Get TMDB API headers
 */
function getTMDBHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Search TMDB for movies, TV shows, or both
 */
export async function searchTMDB(
  query: string,
  type: 'multi' | 'movie' | 'tv' = 'multi'
): Promise<Array<{
  id: number;
  title: string;
  poster_path: string | null;
  year: number | null;
  media_type: string;
}>> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
        query
      )}&page=1`,
      {
        headers: getTMDBHeaders(),
      }
    );

    if (!response.ok) {
      console.error('TMDB search failed:', response.statusText);
      return [];
    }

    const data = (await response.json()) as TMDBSearchResponse;

    return data.results.map((item) => ({
      id: item.id,
      title: item.title || item.name || '',
      poster_path: item.poster_path,
      year: item.release_date
        ? parseInt(item.release_date.substring(0, 4))
        : item.first_air_date
          ? parseInt(item.first_air_date.substring(0, 4))
          : null,
      media_type: item.media_type || type,
    }));
  } catch (error) {
    console.error('Error searching TMDB:', error);
    return [];
  }
}

/**
 * Get full movie details from TMDB
 */
export async function getMovieDetails(id: number): Promise<MovieDetails | null> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}`,
      {
        headers: getTMDBHeaders(),
      }
    );

    if (!response.ok) {
      console.error('Failed to get movie details:', response.statusText);
      return null;
    }

    return (await response.json()) as MovieDetails;
  } catch (error) {
    console.error('Error getting movie details:', error);
    return null;
  }
}

/**
 * Get full TV show details from TMDB
 */
export async function getTVDetails(id: number): Promise<TVDetails | null> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`,
      {
        headers: getTMDBHeaders(),
      }
    );

    if (!response.ok) {
      console.error('Failed to get TV details:', response.statusText);
      return null;
    }

    return (await response.json()) as TVDetails;
  } catch (error) {
    console.error('Error getting TV details:', error);
    return null;
  }
}

/**
 * Get watch providers for US region
 */
export async function getWatchProviders(
  id: number,
  type: 'movie' | 'tv'
): Promise<WatchProviderData | null> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/${type}/${id}/watch/providers?api_key=${TMDB_API_KEY}`,
      {
        headers: getTMDBHeaders(),
      }
    );

    if (!response.ok) {
      console.error('Failed to get watch providers:', response.statusText);
      return null;
    }

    return (await response.json()) as WatchProviderData;
  } catch (error) {
    console.error('Error getting watch providers:', error);
    return null;
  }
}

/**
 * Find movie or TV by IMDB ID
 */
export async function findByIMDB(
  imdbId: string
): Promise<{ movie: MovieDetails | null; tv: TVDetails | null }> {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
      {
        headers: getTMDBHeaders(),
      }
    );

    if (!response.ok) {
      console.error('Failed to find by IMDB ID:', response.statusText);
      return { movie: null, tv: null };
    }

    const data = (await response.json()) as FindByIMDBResponse;

    return {
      movie: data.movie_results?.[0] || null,
      tv: data.tv_results?.[0] || null,
    };
  } catch (error) {
    console.error('Error finding by IMDB ID:', error);
    return { movie: null, tv: null };
  }
}

/**
 * Rate a movie or TV show on TMDB
 * Requires a session ID from TMDB user authentication
 */
export async function rateTMDB(
  id: number,
  type: 'movie' | 'tv',
  rating: number,
  sessionId: string
): Promise<boolean> {
  if (rating < 0.5 || rating > 10) {
    console.error('Rating must be between 0.5 and 10');
    return false;
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/${type}/${id}/rating?api_key=${TMDB_API_KEY}&session_id=${sessionId}`,
      {
        method: 'POST',
        headers: {
          ...getTMDBHeaders(),
          'Content-Type': 'application/json;charset=utf-8',
        },
        body: JSON.stringify({
          value: rating,
        }),
      }
    );

    if (!response.ok) {
      console.error('Failed to rate on TMDB:', response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error rating on TMDB:', error);
    return false;
  }
}

/**
 * Helper: Get poster URL for a path
 */
export function getPosterUrl(posterPath: string | null): string | null {
  if (!posterPath) return null;
  return `${TMDB_POSTER_BASE}${posterPath}`;
}

/**
 * Search TMDB keywords by name — used by the "describe the shelf" feature.
 * Returns keyword objects with id and name.
 */
export async function searchKeywords(query: string): Promise<Array<{ id: number; name: string }>> {
  const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
  const params = new URLSearchParams({ api_key: API_KEY, query });
  const url = `https://api.themoviedb.org/3/search/keyword?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, 5);
  } catch {
    return [];
  }
}
