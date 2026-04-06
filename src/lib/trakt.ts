/**
 * Trakt.tv API Client
 * Handles OAuth device code flow and API requests for movie/TV tracking
 */

import { getTraktToken as getStoredToken, setTraktToken as setStoredToken } from './storage';

const TRAKT_BASE_URL = 'https://api.trakt.tv';
const TRAKT_CLIENT_ID = import.meta.env.VITE_TRAKT_CLIENT_ID;
const TRAKT_CLIENT_SECRET = import.meta.env.VITE_TRAKT_CLIENT_SECRET;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

interface AuthHeaders {
  [key: string]: string;
}

interface SearchResult {
  type: string;
  movie?: any;
  show?: any;
}

interface WatchItem {
  title: string;
  year: number;
  ids: {
    trakt: number;
    slug: string;
    tvdb?: number;
    imdb?: string;
    tmdb?: number;
  };
}

interface RatingData {
  rating: number;
  rated_at?: string;
}

/**
 * Get authentication headers for Trakt API requests
 */
function getTraktHeaders(includeAuth = true): AuthHeaders {
  const headers: AuthHeaders = {
    'trakt-api-version': '2',
    'trakt-api-key': TRAKT_CLIENT_ID,
    'Content-Type': 'application/json',
  };

  if (includeAuth) {
    const token = getTraktToken();
    if (token?.access_token) {
      headers.Authorization = `Bearer ${token.access_token}`;
    }
  }

  return headers;
}

/**
 * Start OAuth device code flow
 * Returns user_code and verification_url for user to authorize
 */
export async function initTraktAuth(): Promise<{
  user_code: string;
  verification_url: string;
  device_code: string;
  interval: number;
} | null> {
  try {
    const response = await fetch(`${TRAKT_BASE_URL}/oauth/device/code`, {
      method: 'POST',
      headers: getTraktHeaders(false),
      body: JSON.stringify({
        client_id: TRAKT_CLIENT_ID,
      }),
    });

    if (!response.ok) {
      console.error('Failed to get device code:', response.statusText);
      return null;
    }

    const data = (await response.json()) as DeviceCodeResponse;
    return {
      user_code: data.user_code,
      verification_url: data.verification_url,
      device_code: data.device_code,
      interval: data.interval,
    };
  } catch (error) {
    console.error('Error initializing Trakt auth:', error);
    return null;
  }
}

/**
 * Poll for token after user authorizes device code
 */
export async function pollForToken(deviceCode: string): Promise<boolean> {
  try {
    const response = await fetch(`${TRAKT_BASE_URL}/oauth/device/token`, {
      method: 'POST',
      headers: getTraktHeaders(false),
      body: JSON.stringify({
        code: deviceCode,
        client_id: TRAKT_CLIENT_ID,
        client_secret: TRAKT_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      if (response.status === 400) {
        // Device code still pending
        return false;
      }
      console.error('Failed to poll for token:', response.statusText);
      return false;
    }

    const data = (await response.json()) as TokenResponse;
    setTraktToken(data);
    return true;
  } catch (error) {
    console.error('Error polling for token:', error);
    return false;
  }
}

/**
 * Search Trakt for movies or shows
 */
export async function searchTrakt(
  query: string,
  type: 'movie' | 'show' | 'both' = 'both'
): Promise<SearchResult[]> {
  try {
    let searchUrl = `${TRAKT_BASE_URL}/search`;
    if (type !== 'both') {
      searchUrl += `/${type}`;
    }

    const response = await fetch(
      `${searchUrl}?query=${encodeURIComponent(query)}&extended=full`,
      {
        headers: getTraktHeaders(false),
      }
    );

    if (!response.ok) {
      console.error('Trakt search failed:', response.statusText);
      return [];
    }

    return (await response.json()) as SearchResult[];
  } catch (error) {
    console.error('Error searching Trakt:', error);
    return [];
  }
}

/**
 * Get user's watched movies
 */
export async function getWatchedMovies(): Promise<WatchItem[]> {
  try {
    const response = await fetch(`${TRAKT_BASE_URL}/sync/watched/movies`, {
      headers: getTraktHeaders(true),
    });

    if (!response.ok) {
      console.error('Failed to get watched movies:', response.statusText);
      return [];
    }

    const data = (await response.json()) as any[];
    return data.map((item) => item.movie);
  } catch (error) {
    console.error('Error getting watched movies:', error);
    return [];
  }
}

/**
 * Get user's watched shows
 */
export async function getWatchedShows(): Promise<WatchItem[]> {
  try {
    const response = await fetch(`${TRAKT_BASE_URL}/sync/watched/shows`, {
      headers: getTraktHeaders(true),
    });

    if (!response.ok) {
      console.error('Failed to get watched shows:', response.statusText);
      return [];
    }

    const data = (await response.json()) as any[];
    return data.map((item) => item.show);
  } catch (error) {
    console.error('Error getting watched shows:', error);
    return [];
  }
}

/**
 * Get hidden/never watching items
 */
export async function getHiddenItems(
  section: 'movies' | 'shows' = 'movies'
): Promise<WatchItem[]> {
  try {
    const response = await fetch(`${TRAKT_BASE_URL}/users/hidden/${section}?limit=100`, {
      headers: getTraktHeaders(true),
    });

    if (!response.ok) {
      console.error('Failed to get hidden items:', response.statusText);
      return [];
    }

    const data = (await response.json()) as any[];
    return data.map((item) => (section === 'movies' ? item.movie : item.show));
  } catch (error) {
    console.error('Error getting hidden items:', error);
    return [];
  }
}

/**
 * Get user's ratings for movies or shows
 */
export async function getRatings(type: 'movies' | 'shows'): Promise<RatingData[]> {
  try {
    const response = await fetch(`${TRAKT_BASE_URL}/sync/ratings/${type}`, {
      headers: getTraktHeaders(true),
    });

    if (!response.ok) {
      console.error('Failed to get ratings:', response.statusText);
      return [];
    }

    return (await response.json()) as RatingData[];
  } catch (error) {
    console.error('Error getting ratings:', error);
    return [];
  }
}

/**
 * Get user's watchlist
 */
export async function getWatchlist(
  type: 'movies' | 'shows'
): Promise<WatchItem[]> {
  try {
    const response = await fetch(`${TRAKT_BASE_URL}/sync/watchlist/${type}`, {
      headers: getTraktHeaders(true),
    });

    if (!response.ok) {
      console.error('Failed to get watchlist:', response.statusText);
      return [];
    }

    const data = (await response.json()) as any[];
    return data.map((item) => (type === 'movies' ? item.movie : item.show));
  } catch (error) {
    console.error('Error getting watchlist:', error);
    return [];
  }
}

/**
 * Mark an item as watched
 */
export async function addToHistory(item: {
  title: string;
  year: number;
  ids: any;
  watched_at?: string;
}): Promise<boolean> {
  try {
    const mediaType = item.ids.tvdb ? 'shows' : 'movies';
    const response = await fetch(`${TRAKT_BASE_URL}/sync/history`, {
      method: 'POST',
      headers: getTraktHeaders(true),
      body: JSON.stringify({
        [mediaType]: [item],
      }),
    });

    if (!response.ok) {
      console.error('Failed to add to history:', response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error adding to history:', error);
    return false;
  }
}

/**
 * Mark as "never watching"
 */
export async function addToHidden(
  item: { title: string; year: number; ids: any },
  section: 'movies' | 'shows' = 'movies'
): Promise<boolean> {
  try {
    const response = await fetch(`${TRAKT_BASE_URL}/users/hidden/${section}`, {
      method: 'POST',
      headers: getTraktHeaders(true),
      body: JSON.stringify({
        [section]: [item],
      }),
    });

    if (!response.ok) {
      console.error('Failed to add to hidden:', response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error adding to hidden:', error);
    return false;
  }
}

/**
 * Add item to watchlist
 */
export async function addToWatchlist(
  item: { title: string; year: number; ids: any }
): Promise<boolean> {
  try {
    const mediaType = item.ids.tvdb ? 'shows' : 'movies';
    const response = await fetch(`${TRAKT_BASE_URL}/sync/watchlist`, {
      method: 'POST',
      headers: getTraktHeaders(true),
      body: JSON.stringify({
        [mediaType]: [item],
      }),
    });

    if (!response.ok) {
      console.error('Failed to add to watchlist:', response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    return false;
  }
}

/**
 * Remove item from watchlist
 */
export async function removeFromWatchlist(
  item: { title: string; year: number; ids: any }
): Promise<boolean> {
  try {
    const mediaType = item.ids.tvdb ? 'shows' : 'movies';
    const response = await fetch(`${TRAKT_BASE_URL}/sync/watchlist/remove`, {
      method: 'POST',
      headers: getTraktHeaders(true),
      body: JSON.stringify({
        [mediaType]: [item],
      }),
    });

    if (!response.ok) {
      console.error('Failed to remove from watchlist:', response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    return false;
  }
}

/**
 * Rate an item (1-10)
 */
export async function addRating(
  item: { title: string; year: number; ids: any },
  rating: number
): Promise<boolean> {
  if (rating < 1 || rating > 10) {
    console.error('Rating must be between 1 and 10');
    return false;
  }

  try {
    const mediaType = item.ids.tvdb ? 'shows' : 'movies';
    const response = await fetch(`${TRAKT_BASE_URL}/sync/ratings`, {
      method: 'POST',
      headers: getTraktHeaders(true),
      body: JSON.stringify({
        [mediaType]: [{ ...item, rating }],
      }),
    });

    if (!response.ok) {
      console.error('Failed to add rating:', response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error adding rating:', error);
    return false;
  }
}

/**
 * Remove item from watched history
 */
export async function removeFromHistory(item: {
  title: string;
  year: number;
  ids: any;
}): Promise<boolean> {
  try {
    const mediaType = item.ids.tvdb ? 'shows' : 'movies';
    const response = await fetch(`${TRAKT_BASE_URL}/sync/history/remove`, {
      method: 'POST',
      headers: getTraktHeaders(true),
      body: JSON.stringify({
        [mediaType]: [item],
      }),
    });

    if (!response.ok) {
      console.error('Failed to remove from history:', response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error removing from history:', error);
    return false;
  }
}

/**
 * Unhide an item
 */
export async function removeFromHidden(
  item: { title: string; year: number; ids: any },
  section: 'movies' | 'shows' = 'movies'
): Promise<boolean> {
  try {
    const response = await fetch(`${TRAKT_BASE_URL}/users/hidden/${section}/remove`, {
      method: 'POST',
      headers: getTraktHeaders(true) as Record<string, string>,
      body: JSON.stringify({
        [section]: [item],
      }),
    });

    if (!response.ok) {
      console.error('Failed to remove from hidden:', response.statusText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error removing from hidden:', error);
    return false;
  }
}

/**
 * Token accessors — delegate to storage.ts for a single localStorage key
 */
function getTraktToken(): TokenResponse | null {
  return getStoredToken() as TokenResponse | null;
}

function setTraktToken(token: TokenResponse): void {
  setStoredToken(token);
}

/**
 * Check if user is authenticated with Trakt
 */
export function isTraktAuthenticated(): boolean {
  return getTraktToken() !== null;
}

/**
 * Get user profile from Trakt
 */
export async function getTraktProfile(): Promise<{ username: string; name: string } | null> {
  try {
    const response = await fetch(`${TRAKT_BASE_URL}/users/me`, {
      headers: getTraktHeaders(true),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return { username: data.username, name: data.name || data.username };
  } catch {
    return null;
  }
}

export { getTraktHeaders };
