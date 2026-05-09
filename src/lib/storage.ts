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
 * Prune expired cache entries to free localStorage space.
 * Call this on app startup to prevent unbounded growth.
 */
export function pruneExpiredCache(): number {
  let removed = 0;
  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();
    for (const key of keys) {
      if (!key.startsWith(CACHE_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const entry = JSON.parse(raw) as CacheEntry<unknown>;
        const ageMin = (now - entry.timestamp) / 60000;
        if (ageMin > entry.ttlMinutes) {
          localStorage.removeItem(key);
          removed++;
        }
      } catch {
        // Corrupted entry — remove it
        localStorage.removeItem(key);
        removed++;
      }
    }
  } catch { /* ignore */ }
  return removed;
}

// ── Personal vibe keywords ──
// Thematic clusters of TMDB keyword IDs that reflect the viewer's specific
// interests beyond genre. Each load picks 1-2 clusters for a "Your Vibes" row.

const VIBES_KEY = 'seenit_vibes';

export interface VibeCluster {
  label: string;           // human-readable name for the cluster
  subtitle: string;        // what shows under the row title
  keywordIds: number[];    // TMDB keyword IDs (OR-combined in discover)
}

/**
 * Each vibe has an optional `group` — pickVibes won't select two vibes
 * from the same group in the same feed load (e.g. no "Queer Cinema" AND
 * "Queer History" on the same screen).
 */
interface VibeWithGroup extends VibeCluster { group?: string }

const DEFAULT_VIBES: VibeWithGroup[] = [
  { label: 'Queer Cinema', subtitle: 'Stories that see you', keywordIds: [158718, 264384, 300642, 824, 1886], group: 'queer' },
  { label: 'Camp & Kink', subtitle: 'Over the top and proud of it', keywordIds: [155493, 158713, 199817], group: 'queer' },
  { label: 'Road Trip', subtitle: 'Windows down, nowhere to be', keywordIds: [7312] },
  { label: 'DC & Politics', subtitle: 'Power, scandal, and sharp suits', keywordIds: [521, 169086] },
  { label: 'Indie & Physical', subtitle: 'Small studios, big presence', keywordIds: [281237, 14666, 208135] },
  { label: 'Queer History', subtitle: 'The relationships they tried to erase', keywordIds: [158718, 300642, 1886], group: 'queer' },
];

/**
 * Get the viewer's personal vibe clusters.
 * Returns stored vibes or defaults.
 */
export function getVibes(): VibeCluster[] {
  try {
    const raw = localStorage.getItem(VIBES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VibeCluster[];
      if (parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_VIBES;
}

/**
 * Save custom vibe clusters (for future UI where users can edit).
 */
export function setVibes(vibes: VibeCluster[]): void {
  try {
    localStorage.setItem(VIBES_KEY, JSON.stringify(vibes));
  } catch { /* ignore */ }
}

/**
 * Pick 1-2 random vibe clusters, never two from the same group.
 * E.g. you'll get "Queer Cinema" OR "Queer History" — never both.
 */
export function pickVibes(count = 2): VibeCluster[] {
  const all: VibeWithGroup[] = getVibes() as VibeWithGroup[];
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  const picked: VibeCluster[] = [];
  const usedGroups = new Set<string>();

  for (const v of shuffled) {
    if (picked.length >= count) break;
    if (v.group && usedGroups.has(v.group)) continue; // skip same-group dupe
    picked.push(v);
    if (v.group) usedGroups.add(v.group);
  }
  return picked;
}

// ── Viewer engagement tracking (powers smart shuffle) ──

const ENGAGEMENT_KEY = 'seenit_genre_engagement';

interface EngagementData {
  genres: Record<number, number>;  // genre_id → tap count
  decades: Record<string, number>; // "80s" → tap count
  updated: number;
}

function getEngagementData(): EngagementData {
  try {
    const raw = localStorage.getItem(ENGAGEMENT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { genres: {}, decades: {}, updated: Date.now() };
}

const RECENT_TAPS_KEY = 'seenit_recent_taps';
const MAX_RECENT_TAPS = 8;

interface RecentTap {
  genreIds: number[];
  ts: number;
}

/**
 * Track which genres/decades the viewer engages with.
 * Call on every poster tap — lightweight, no API calls.
 * Also records the last few taps with timestamps for mood detection.
 */
export function trackEngagement(genreIds: number[], year: number | null): void {
  try {
    // Lifetime tallies
    const data = getEngagementData();
    for (const g of genreIds) {
      data.genres[g] = (data.genres[g] || 0) + 1;
    }
    if (year) {
      const dec = year < 1970 ? '60s'
        : year < 1980 ? '70s'
        : year < 1990 ? '80s'
        : year < 2000 ? '90s'
        : year < 2010 ? '2000s'
        : year < 2020 ? '2010s' : '2020s';
      data.decades[dec] = (data.decades[dec] || 0) + 1;
    }
    data.updated = Date.now();
    localStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(data));

    // Recent taps (rolling window for mood detection)
    let recent: RecentTap[] = [];
    try {
      const raw = localStorage.getItem(RECENT_TAPS_KEY);
      if (raw) recent = JSON.parse(raw);
    } catch { /* ignore */ }
    recent.unshift({ genreIds, ts: Date.now() });
    if (recent.length > MAX_RECENT_TAPS) recent = recent.slice(0, MAX_RECENT_TAPS);
    localStorage.setItem(RECENT_TAPS_KEY, JSON.stringify(recent));
  } catch { /* ignore */ }
}

/**
 * Get the viewer's top genre IDs by engagement count.
 * Returns up to `limit` genre IDs sorted by frequency.
 */
export function getTopGenres(limit = 5): number[] {
  const data = getEngagementData();
  return Object.entries(data.genres)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([id]) => Number(id));
}

/**
 * Returns true if the viewer has explicitly engaged with foreign-language content.
 * Uses the 'world' row engagement as a proxy signal — if the world cinema row
 * was shown and tapped, we surface it more often.
 */
export function hasLanguageSignal(): boolean {
  try {
    const raw = localStorage.getItem('seenit_lang_signal');
    return raw === '1';
  } catch { return false; }
}

/**
 * Mark that the viewer has engaged with a foreign-language title.
 * Call this when they tap through from a world cinema row.
 */
export function setLanguageSignal(): void {
  try {
    localStorage.setItem('seenit_lang_signal', '1');
  } catch { /* ignore */ }
}

/**
 * Get the viewer's most-engaged decade label (e.g. "80s").
 */
export function getTopDecade(): string | null {
  const data = getEngagementData();
  const entries = Object.entries(data.decades);
  if (entries.length === 0) return null;
  entries.sort(([, a], [, b]) => b - a);
  return entries[0][0];
}

// ── Mood context engine ──
// Reads the clock, the calendar, and the viewer's recent emotional trajectory
// to generate a sense of *what kind of night this is*.

/** Genre IDs that carry emotional weight / intensity */
const HEAVY_GENRES = new Set([18, 10752, 80, 36, 99]); // Drama, War, Crime, History, Documentary
const LIGHT_GENRES = new Set([35, 16, 10751, 10402]);    // Comedy, Animation, Family, Music
const INTENSE_GENRES = new Set([27, 53, 878]);            // Horror, Thriller, Sci-Fi

export interface MoodContext {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'latenight';
  dayName: string;
  isWeekend: boolean;
  recentTone: 'heavy' | 'light' | 'intense' | 'mixed' | 'unknown';
  hasHistory: boolean; // have they used the app enough for us to read them
}

export function getMoodContext(): MoodContext {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 6=Sat

  const timeOfDay: MoodContext['timeOfDay'] =
    hour < 12 ? 'morning'
    : hour < 17 ? 'afternoon'
    : hour < 21 ? 'evening'
    : 'latenight';

  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
  const isWeekend = day === 0 || day === 5 || day === 6; // Fri-Sun

  // Read recent taps to detect emotional trajectory
  let recentTone: MoodContext['recentTone'] = 'unknown';
  let hasHistory = false;
  try {
    const raw = localStorage.getItem(RECENT_TAPS_KEY);
    if (raw) {
      const taps: RecentTap[] = JSON.parse(raw);
      // Only consider taps from the last 7 days
      const recent = taps.filter(t => Date.now() - t.ts < 7 * 24 * 60 * 60 * 1000);
      if (recent.length >= 3) {
        hasHistory = true;
        const allGenres = recent.flatMap(t => t.genreIds);
        const heavyCount = allGenres.filter(g => HEAVY_GENRES.has(g)).length;
        const lightCount = allGenres.filter(g => LIGHT_GENRES.has(g)).length;
        const intenseCount = allGenres.filter(g => INTENSE_GENRES.has(g)).length;
        const total = allGenres.length || 1;

        if (heavyCount / total > 0.4) recentTone = 'heavy';
        else if (lightCount / total > 0.4) recentTone = 'light';
        else if (intenseCount / total > 0.4) recentTone = 'intense';
        else recentTone = 'mixed';
      }
    }
  } catch { /* ignore */ }

  return { timeOfDay, dayName, isWeekend, recentTone, hasHistory };
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
