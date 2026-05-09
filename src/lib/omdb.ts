/**
 * OMDB API Client
 * Handles IMDB ratings and Metacritic scores
 */

const OMDB_BASE_URL = 'https://www.omdbapi.com';
const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY;

interface OMDBResponse {
  Title: string;
  imdbID: string;
  imdbRating: string;
  Metascore: string;
  Ratings: Array<{
    Source: string;
    Value: string;
  }>;
  Response: string;
  Error?: string;
}

export interface RatingsObject {
  imdb: number | null;
  metacritic: number | null;
  rottenTomatoes: string | null;
}

/**
 * Fetch with timeout — OMDB sometimes hangs, which blocks the ratings row.
 */
async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get OMDB data by IMDB ID — with 1 automatic retry on failure.
 * Returns parsed ratings object with IMDB and Metacritic scores.
 */
export async function getOMDBData(imdbId: string): Promise<RatingsObject> {
  const emptyRatings: RatingsObject = {
    imdb: null,
    metacritic: null,
    rottenTomatoes: null,
  };

  if (!imdbId || !OMDB_API_KEY) {
    return emptyRatings;
  }

  const url = `${OMDB_BASE_URL}/?apikey=${OMDB_API_KEY}&i=${encodeURIComponent(imdbId)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchWithTimeout(url);

      if (!response.ok) {
        console.warn(`[OMDB] request failed (attempt ${attempt + 1}):`, response.status);
        if (attempt === 0) { await new Promise(r => setTimeout(r, 800)); continue; }
        return emptyRatings;
      }

      const data = (await response.json()) as OMDBResponse;

      if (data.Response === 'False') {
        console.warn('[OMDB] not found:', imdbId);
        return emptyRatings;
      }

      return {
        imdb: data.imdbRating && data.imdbRating !== 'N/A'
          ? parseFloat(data.imdbRating)
          : null,
        metacritic:
          data.Metascore && data.Metascore !== 'N/A'
            ? parseInt(data.Metascore)
            : null,
        rottenTomatoes: null,
      };
    } catch (error) {
      console.warn(`[OMDB] fetch error (attempt ${attempt + 1}):`, error);
      if (attempt === 0) { await new Promise(r => setTimeout(r, 800)); continue; }
      return emptyRatings;
    }
  }

  return emptyRatings;
}

/**
 * Search OMDB by title and optional year
 * Returns parsed ratings object for the first result
 */
export async function searchOMDB(title: string, year?: number): Promise<RatingsObject> {
  const emptyRatings: RatingsObject = {
    imdb: null,
    metacritic: null,
    rottenTomatoes: null,
  };

  if (!title) {
    return emptyRatings;
  }

  try {
    let url = `${OMDB_BASE_URL}/?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(title)}`;
    if (year) {
      url += `&y=${year}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      console.error('OMDB search failed:', response.statusText);
      return emptyRatings;
    }

    const data = (await response.json()) as {
      Search?: Array<{ imdbID: string }>;
      Response: string;
      Error?: string;
    };

    if (data.Response === 'False' || !data.Search || data.Search.length === 0) {
      console.warn('OMDB search no results:', title);
      return emptyRatings;
    }

    // Get details for first result
    const firstResult = data.Search[0];
    return getOMDBData(firstResult.imdbID);
  } catch (error) {
    console.error('Error searching OMDB:', error);
    return emptyRatings;
  }
}
