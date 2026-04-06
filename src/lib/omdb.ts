/**
 * OMDB API Client
 * Handles IMDB ratings, Metacritic, and Rotten Tomatoes scores
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
 * Get OMDB data by IMDB ID
 * Returns parsed ratings object with IMDB, Metacritic, and Rotten Tomatoes scores
 */
export async function getOMDBData(imdbId: string): Promise<RatingsObject> {
  const emptyRatings: RatingsObject = {
    imdb: null,
    metacritic: null,
    rottenTomatoes: null,
  };

  if (!imdbId) {
    return emptyRatings;
  }

  try {
    const response = await fetch(
      `${OMDB_BASE_URL}/?apikey=${OMDB_API_KEY}&i=${encodeURIComponent(imdbId)}&type=movie,series`
    );

    if (!response.ok) {
      console.error('OMDB request failed:', response.statusText);
      return emptyRatings;
    }

    const data = (await response.json()) as OMDBResponse;

    if (data.Response === 'False') {
      console.warn('OMDB not found:', imdbId);
      return emptyRatings;
    }

    const ratings: RatingsObject = {
      imdb: data.imdbRating && data.imdbRating !== 'N/A'
        ? parseFloat(data.imdbRating)
        : null,
      metacritic:
        data.Metascore && data.Metascore !== 'N/A'
          ? parseInt(data.Metascore)
          : null,
      rottenTomatoes: null,
    };

    // Extract Rotten Tomatoes from Ratings array
    if (data.Ratings && Array.isArray(data.Ratings)) {
      const rtRating = data.Ratings.find((r) => r.Source === 'Rotten Tomatoes');
      if (rtRating) {
        ratings.rottenTomatoes = rtRating.Value;
      }
    }

    return ratings;
  } catch (error) {
    console.error('Error fetching OMDB data:', error);
    return emptyRatings;
  }
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
