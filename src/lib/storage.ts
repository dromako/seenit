/**
 * Local Storage and Caching
 * Manages localStorage caching, lookups, and OAuth tokens
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMinutes: number;
}

interface LookupData {
  tmdbId: number;
  title: string;
  year?: number;
  posterPath?: string;
  mediaType: 'movie' | 'tv';
  searchedAt: number;
}

// RecentLookup type imported from types
import type { RecentLookup } from '../types';

interface TraktToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

const CACHE_PREFIX = 'seenit_cache_';
const LOOKUP_PREFIX = 'seenit_lookup_';
const RECENT_LOOKUPS_KEY = 'seenit_recent_lookups';
const NOTES_PREFIX = 'seenit_notes_';
const TRAKT_TOKEN_KEY = 'seenit_trakt_token';

/**
 * Get a value from cache (with TTL checking)
 */
export function cacheGet<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!stored) return null;

    const entry = JSON.parse(stored) as CacheEntry<T>;
    const now = Date.now();
    const ageMinutes = (now - entry.timestamp) / 1000 / 60;

    // Check if expired
    if (ageMinutes > entry.ttlMinutes) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error('Error reading cache:', error);
    return null;
  }
}

/**
 * Set a value in cache with TTL
 */
export function cacheSet<T>(key: string, value: T, ttlMinutes = 60): void {
  try {
    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttlMinutes,
    };
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
  } catch (error) {
    console.error('Error writing to cache:', error);
  }
}

/**
 * Get cached lookup data for a TMDB ID
 */
export function getCachedLookup(tmdbId: number): LookupData | null {
  try {
    const stored = localStorage.getItem(`${LOOKUP_PREFIX}${tmdbId}`);
    if (!stored) return null;

    return JSON.parse(stored) as LookupData;
  } catch (error) {
    console.error('Error reading cached lookup:', error);
    return null;
  }
}

/**
 * Cache lookup data for a TMDB ID
 */
export function setCachedLookup(tmdbId: number, data: LookupData): void {
  try {
    localStorage.setItem(`${LOOKUP_PREFIX}${tmdbId}`, JSON.stringify(data));
  } catch (error) {
    console.error('Error writing cached lookup:', error);
  }
}

/**
 * Get list of recent lookups (last 20)
 */
export function getRecentLookups(): RecentLookup[] {
  try {
    const stored = localStorage.getItem(RECENT_LOOKUPS_KEY);
    if (!stored) return [];

    return JSON.parse(stored) as RecentLookup[];
  } catch (error) {
    console.error('Error reading recent lookups:', error);
    return [];
  }
}

/**
 * Add item to recent lookups
 */
export function addRecentLookup(item: {
  tmdbId: number;
  title: string;
  posterPath?: string;
  mediaType: 'movie' | 'tv';
}): void {
  try {
    const recent = getRecentLookups();

    // Remove if already exists (to move to front)
    const filtered = recent.filter((r) => r.tmdbId !== item.tmdbId);

    // Add new item at front
    const updated: RecentLookup[] = [
      {
        ...item,
        lastViewed: Date.now(),
      },
      ...filtered,
    ];

    // Keep only last 20
    const limited = updated.slice(0, 20);

    localStorage.setItem(RECENT_LOOKUPS_KEY, JSON.stringify(limited));
  } catch (error) {
    console.error('Error adding to recent lookups:', error);
  }
}

/**
 * Get personal notes for a title
 */
export function getNotes(tmdbId: number): string {
  try {
    const stored = localStorage.getItem(`${NOTES_PREFIX}${tmdbId}`);
    return stored || '';
  } catch (error) {
    console.error('Error reading notes:', error);
    return '';
  }
}

/**
 * Set personal notes for a title
 */
export function setNotes(tmdbId: number, notes: string): void {
  try {
    if (notes.trim()) {
      localStorage.setItem(`${NOTES_PREFIX}${tmdbId}`, notes);
    } else {
      localStorage.removeItem(`${NOTES_PREFIX}${tmdbId}`);
    }
  } catch (error) {
    console.error('Error writing notes:', error);
  }
}

/**
 * Get Trakt OAuth tokens
 */
export function getTraktToken(): TraktToken | null {
  try {
    const stored = localStorage.getItem(TRAKT_TOKEN_KEY);
    if (!stored) return null;

    return JSON.parse(stored) as TraktToken;
  } catch (error) {
    console.error('Error reading Trakt token:', error);
    return null;
  }
}

/**
 * Set Trakt OAuth tokens
 */
export function setTraktToken(token: TraktToken): void {
  try {
    localStorage.setItem(TRAKT_TOKEN_KEY, JSON.stringify(token));
  } catch (error) {
    console.error('Error writing Trakt token:', error);
  }
}

/**
 * Clear all SeenIt cache
 */
export function clearAllCache(): void {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith('seenit_')) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  cacheEntries: number;
  lookupEntries: number;
  totalSize: number;
} {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    const lookupKeys = keys.filter((k) => k.startsWith(LOOKUP_PREFIX));

    let totalSize = 0;
    keys.forEach((key) => {
      if (key.startsWith('seenit_')) {
        const item = localStorage.getItem(key);
        totalSize += item ? item.length : 0;
      }
    });

    return {
      cacheEntries: cacheKeys.length,
      lookupEntries: lookupKeys.length,
      totalSize,
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return { cacheEntries: 0, lookupEntries: 0, totalSize: 0 };
  }
}
