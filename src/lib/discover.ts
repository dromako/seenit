/**
 * TMDB Discover API Client
 * Powers the Browse Mode — continuous movie/TV discovery feed
 *
 * Recommendation model: "The Living Bookshop"
 * ─────────────────────────────────────────────
 * 60% of shelves are calibrated to the viewer's signals.
 * 40% come from "fellow travelers" — constructed taste personas
 * with coherent, interesting aesthetic identities. They're not
 * real users. They're the bookshop's regulars: the person who
 * loves Brazilian crime thrillers and 70s Italian horror and
 * also adores Paddington 2. You don't see them. You just find
 * their books on your shelf sometimes, and they're exactly right.
 */

const TMDB_BASE = 'https://api.themoviedb.org/3';
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

export interface DiscoverItem {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  media_type: 'movie' | 'tv';
  year: number | null;
  vote_average: number;
  vote_count: number;
  overview: string;
  genre_ids: number[];
}

export interface DiscoverResponse {
  results: DiscoverItem[];
  page: number;
  total_pages: number;
  total_results: number;
}

/** Genre maps for quick lookup */
export const MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
  53: 'Thriller', 10752: 'War', 37: 'Western',
};

export const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  10762: 'Kids', 9648: 'Mystery', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk',
  10768: 'War & Politics', 37: 'Western',
};

/** Mood-based browse tabs — cinephile picks by feeling, not genre label */
export const BROWSE_GENRES = [
  { id: 0, name: 'Trending' },
  { id: 27, name: 'Get Scared' },
  { id: 35, name: 'Make Me Laugh' },
  { id: 18, name: 'Feel Something' },
  { id: 878, name: 'Mind-Bending' },
  { id: 99, name: 'Learn Something' },
  { id: 28, name: 'Adrenaline' },
  { id: 53, name: 'On the Edge' },
  { id: 10749, name: 'Fall in Love' },
  { id: -1, name: 'So Bad It\'s Good' },
];

// US free/ad-supported provider IDs (TMDB watch_provider IDs)
// Tubi=73, Pluto=300, Peacock(free)=386, Plex=538, Kanopy=191
const FREE_PROVIDER_IDS = '73|300|386|538|191';

/**
 * Content bias guards — genres to exclude from user-calibrated rows
 * unless the viewer has explicitly shown signal for them.
 * 10762=Kids, 10751=Family, 10402=Music (concerts/videos), 10770=TV Movie
 */
const USER_EXCLUDE_GENRES = '10762,10751,10402,10770';

/**
 * Default year floor for user rows — avoids over-weighting pre-1960 catalog
 * which tends to surface obscure non-English films with few votes.
 */
const DEFAULT_YEAR_FLOOR = '1960-01-01';

export type MediaFilter = 'all' | 'movie' | 'tv';
export type SourceFilter = 'all' | 'free';

interface DiscoverParams {
  mediaType: MediaFilter;
  genre: number;         // 0 = trending, -1 = bad movies
  sourceFilter: SourceFilter;
  page: number;
}

/**
 * Fetch trending content from TMDB
 */
async function fetchTrending(
  mediaType: 'movie' | 'tv' | 'all',
  page: number,
): Promise<DiscoverResponse> {
  const type = mediaType === 'all' ? 'all' : mediaType;
  const url = `${TMDB_BASE}/trending/${type}/week?api_key=${API_KEY}&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Trending fetch failed: ${res.status}`);
  const data = await res.json();

  const results: DiscoverItem[] = data.results.map((r: any) => ({
    id: r.id,
    title: r.title || r.name || '',
    poster_path: r.poster_path,
    backdrop_path: r.backdrop_path,
    media_type: r.media_type || mediaType,
    year: r.release_date
      ? parseInt(r.release_date.substring(0, 4))
      : r.first_air_date
        ? parseInt(r.first_air_date.substring(0, 4))
        : null,
    vote_average: r.vote_average || 0,
    vote_count: r.vote_count || 0,
    overview: r.overview || '',
    genre_ids: r.genre_ids || [],
  }));

  return {
    results,
    page: data.page,
    total_pages: Math.min(data.total_pages, 500),
    total_results: data.total_results,
  };
}

/**
 * Fetch from TMDB Discover endpoint (movies or TV)
 */
async function fetchDiscover(
  type: 'movie' | 'tv',
  page: number,
  genreId: number | null,
  badMovies: boolean,
  freeOnly: boolean
): Promise<DiscoverResponse> {
  const defaultSort = genreId ? 'vote_average.desc' : 'popularity.desc';

  const params = new URLSearchParams({
    api_key: API_KEY,
    language: 'en-US',
    watch_region: 'US',
    page: String(page),
    sort_by: badMovies ? 'vote_average.asc' : defaultSort,
    include_adult: 'false',
  });

  if (genreId && genreId > 0) {
    params.set('with_genres', String(genreId));
    params.set('vote_count.gte', '150');
    params.set('vote_average.gte', '6.0');
  }

  if (badMovies) {
    params.set('vote_average.lte', '4.5');
    params.set('vote_count.gte', '50');
    params.set('sort_by', 'vote_count.desc');
  }

  if (freeOnly) {
    params.set('with_watch_monetization_types', 'free|ads');
    params.set('with_watch_providers', FREE_PROVIDER_IDS);
  }

  params.set('with_poster', 'true');

  const url = `${TMDB_BASE}/discover/${type}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Discover fetch failed: ${res.status}`);
  const data = await res.json();

  const results: DiscoverItem[] = data.results.map((r: any) => ({
    id: r.id,
    title: r.title || r.name || '',
    poster_path: r.poster_path,
    backdrop_path: r.backdrop_path,
    media_type: type,
    year: r.release_date
      ? parseInt(r.release_date.substring(0, 4))
      : r.first_air_date
        ? parseInt(r.first_air_date.substring(0, 4))
        : null,
    vote_average: r.vote_average || 0,
    vote_count: r.vote_count || 0,
    overview: r.overview || '',
    genre_ids: r.genre_ids || [],
  }));

  return {
    results: results.filter(r => r.poster_path),
    page: data.page,
    total_pages: Math.min(data.total_pages, 500),
    total_results: data.total_results,
  };
}

// ── Curated feed helpers for the homepage rows ──

/** Pick a random element from an array */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface CuratedRow {
  id: string;
  title: string;
  subtitle: string;
  reasonTaste: string;
  reasonMood: string;
  items: DiscoverItem[];
  /**
   * True for rows sourced from the fellow traveler persona system.
   * These are not from the user's own taste profile — they're from
   * the "other regulars" in the bookshop. Rows are shown as-is,
   * with no explanation of origin. The user just finds them there.
   */
  isFellowTraveler?: boolean;
}

const DECADES = [
  { label: '60s', start: '1960-01-01', end: '1969-12-31' },
  { label: '70s', start: '1970-01-01', end: '1979-12-31' },
  { label: '80s', start: '1980-01-01', end: '1989-12-31' },
  { label: '90s', start: '1990-01-01', end: '1999-12-31' },
  { label: '2000s', start: '2000-01-01', end: '2009-12-31' },
  { label: '2010s', start: '2010-01-01', end: '2019-12-31' },
];

const SPOTLIGHT_GENRES = [
  { id: 99, name: 'Documentary' },
  { id: 878, name: 'Sci-Fi' },
  { id: 27, name: 'Horror' },
  { id: 80, name: 'Crime' },
  { id: 10752, name: 'War' },
  { id: 36, name: 'History' },
  { id: 16, name: 'Animation' },
  { id: 37, name: 'Western' },
  { id: 9648, name: 'Mystery' },
  { id: 14, name: 'Fantasy' },
  { id: 10749, name: 'Romance' },
  { id: 53, name: 'Thriller' },
];

/** Language codes for "world cinema" row — non-English standouts */
const WORLD_LANGUAGES = ['ko', 'ja', 'fr', 'es', 'de', 'it', 'pt', 'zh', 'hi', 'sv', 'da', 'pl', 'tr', 'th'];

/**
 * Fetch a single curated discover row for user-calibrated shelves.
 * Applies content bias guards by default:
 *   • No Kids / Family / Music / TV Movie genres
 *   • Year floor of 1960 (pre-1960 tends to over-surface obscure foreign catalog)
 * Individual callers can override these by passing their own values in extraParams.
 */
async function fetchCuratedRow(
  sortBy: string,
  extraParams: Record<string, string>,
  limit = 12,
): Promise<DiscoverItem[]> {
  const params = new URLSearchParams({
    api_key: API_KEY,
    language: 'en-US',
    watch_region: 'US',
    page: String(1 + Math.floor(Math.random() * 5)),
    sort_by: sortBy,
    include_adult: 'false',
    with_poster: 'true',
    // ── Content bias guards (overridable by extraParams) ──
    without_genres: USER_EXCLUDE_GENRES,
    'primary_release_date.gte': DEFAULT_YEAR_FLOOR,
    ...extraParams,
  });

  const url = `${TMDB_BASE}/discover/movie?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();

  return (data.results || [])
    .filter((r: any) => r.poster_path)
    .slice(0, limit)
    .map((r: any): DiscoverItem => ({
      id: r.id,
      title: r.title || r.name || '',
      poster_path: r.poster_path,
      backdrop_path: r.backdrop_path,
      media_type: 'movie',
      year: r.release_date ? parseInt(r.release_date.substring(0, 4)) : null,
      vote_average: r.vote_average || 0,
      vote_count: r.vote_count || 0,
      overview: r.overview || '',
      genre_ids: r.genre_ids || [],
    }));
}

export interface VibeClusterInput {
  label: string;
  subtitle: string;
  keywordIds: number[];
}

export interface ViewerAffinities {
  topGenres?: number[];
  topDecade?: string;
  vibes?: VibeClusterInput[];
  hasLanguageSignal?: boolean;  // true if user has tapped foreign-language content
}

export interface MoodInput {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'latenight';
  dayName: string;
  isWeekend: boolean;
  recentTone: 'heavy' | 'light' | 'intense' | 'mixed' | 'unknown';
  hasHistory: boolean;
}


// ══════════════════════════════════════════════════════════════════════════════
// FELLOW TRAVELER PERSONA SYSTEM
// ══════════════════════════════════════════════════════════════════════════════
//
// Each persona is a coherent aesthetic sensibility — not a demographic or
// a user segment. Think of them as the bookshop's regulars: someone who
// has very specific taste and whose recommendations, when you encounter them,
// feel surprising and exactly right.
//
// Personas rotate daily (seeded by date) so the shop feels like it has
// returning customers. On any given day, 3 are "in the shop." Their books
// slip onto your shelves naturally — you don't see the person, just the find.

interface FellowTravelerPersona {
  id: string;
  rowTitle: string;       // How the shelf is labeled — evocative, not explanatory
  rowSubtitle: string;    // One-line flavor text
  withGenres?: string;    // AND-combined genre IDs for TMDB query
  language?: string;      // original_language filter
  decadeStart?: string;
  decadeEnd?: string;
  keywords?: number[];    // TMDB keyword IDs (OR-combined)
  sortBy?: string;
  minVotes?: number;
  maxVotes?: number;
  minRating?: number;
}

/**
 * The nine regulars. Each represents a distinct aesthetic identity —
 * specific enough to be interesting, coherent enough to trust.
 */
const FELLOW_TRAVELERS: FellowTravelerPersona[] = [
  {
    id: 'grindhouse-archivist',
    rowTitle: 'Grindhouse & Surviving It',
    rowSubtitle: 'The films that broke the rules on purpose',
    withGenres: '27',
    decadeStart: '1968-01-01',
    decadeEnd: '1989-12-31',
    minVotes: 50,
    maxVotes: 3500,
    minRating: 5.5,
  },
  {
    id: 'paddington-2-person',
    rowTitle: 'Unexpectedly Tender',
    rowSubtitle: 'Darkness with something warm underneath',
    withGenres: '80',
    language: 'pt',
    minVotes: 100,
    minRating: 6.8,
    maxVotes: 10000,
  },
  {
    id: 'french-new-wave-late-adopter',
    rowTitle: 'Restless & Human',
    rowSubtitle: 'Stories that move like real time passes',
    language: 'fr',
    decadeStart: '1958-01-01',
    decadeEnd: '1988-12-31',
    minVotes: 80,
    minRating: 6.8,
  },
  {
    id: 'midnight-programmer',
    rowTitle: 'Made for 2 AM',
    rowSubtitle: 'The shelf in the back corner with no labels',
    withGenres: '27,35',
    minVotes: 40,
    maxVotes: 2500,
    minRating: 5.8,
    decadeStart: '1975-01-01',
    decadeEnd: '2006-12-31',
  },
  {
    id: 'festival-circuit-regular',
    rowTitle: 'Seen at Sundance, Actually Good',
    rowSubtitle: 'The ones that made it through the noise',
    minVotes: 200,
    maxVotes: 6000,
    minRating: 7.2,
    decadeStart: '2008-01-01',
    sortBy: 'vote_average.desc',
  },
  {
    id: 'criterion-completist',
    rowTitle: 'The Canon, Quietly',
    rowSubtitle: 'Films that changed what cinema thought it was',
    decadeStart: '1945-01-01',
    decadeEnd: '1988-12-31',
    minVotes: 300,
    minRating: 7.5,
    withGenres: '18',
    sortBy: 'vote_average.desc',
  },
  {
    id: 'true-crime-spiral',
    rowTitle: 'One More Episode',
    rowSubtitle: 'You said you\'d stop',
    withGenres: '80,99',
    minVotes: 100,
    minRating: 6.8,
    sortBy: 'vote_average.desc',
  },
  {
    id: 'italian-genre-obsessive',
    rowTitle: 'Italian Genre Cinema',
    rowSubtitle: 'Style, violence, and operatic excess — in that order',
    language: 'it',
    decadeStart: '1963-01-01',
    decadeEnd: '1992-12-31',
    minVotes: 50,
    minRating: 6.2,
  },
  {
    id: 'prestige-tv-mourner',
    rowTitle: 'Television That Means It',
    rowSubtitle: 'The shows that rewrote what the form could do',
    withGenres: '18',
    minVotes: 500,
    minRating: 7.6,
    maxVotes: 35000,
    sortBy: 'vote_average.desc',
    decadeStart: '1999-01-01',
  },
];

/**
 * Deterministic daily seed — same day = same persona rotation.
 * The regulars come back. They don't appear and disappear at random.
 */
function dateSeed(): number {
  const d = new Date().toDateString(); // e.g. "Wed Apr 15 2026"
  let h = 0;
  for (let i = 0; i < d.length; i++) {
    h = (Math.imul(31, h) + d.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Pick today's 3 active personas from the pool.
 * Uses the date seed for deterministic selection — the same three
 * "customers" are in the shop all day, then the door changes tomorrow.
 */
function selectPersonasForToday(count = 3): FellowTravelerPersona[] {
  const seed = dateSeed();
  const shuffled = [...FELLOW_TRAVELERS];
  // Seeded Fisher-Yates
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Combine seed with position to get a stable but varied shuffle
    const j = Math.abs((seed * (i + 7) ^ (seed >> 3)) % (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * Fetch a persona's shelf of recommendations.
 * Uses a date-stable page number so the same books are on the same
 * shelf all day — the persona "left their recommendations there."
 */
async function fetchPersonaRow(persona: FellowTravelerPersona): Promise<DiscoverItem[]> {
  // Stable page within the day, different across days
  const stablePage = 1 + (dateSeed() % 5);

  const params = new URLSearchParams({
    api_key: API_KEY,
    language: 'en-US',
    watch_region: 'US',
    page: String(stablePage),
    sort_by: persona.sortBy || 'vote_average.desc',
    include_adult: 'false',
    with_poster: 'true',
    'vote_count.gte': String(persona.minVotes ?? 50),
    'vote_average.gte': String(persona.minRating ?? 6.5),
    // Persona rows DO NOT apply family/music/kids bias guards
    // — personas may legitimately surface animation, etc.
    // But we still exclude pure TV Movie filler.
    without_genres: '10770',
  });

  if (persona.maxVotes) params.set('vote_count.lte', String(persona.maxVotes));
  if (persona.withGenres) params.set('with_genres', persona.withGenres);
  if (persona.language) params.set('with_original_language', persona.language);
  if (persona.decadeStart) params.set('primary_release_date.gte', persona.decadeStart);
  if (persona.decadeEnd) params.set('primary_release_date.lte', persona.decadeEnd);
  if (persona.keywords?.length) params.set('with_keywords', persona.keywords.join('|'));

  const url = `${TMDB_BASE}/discover/movie?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();

  return (data.results || [])
    .filter((r: any) => r.poster_path)
    .slice(0, 12)
    .map((r: any): DiscoverItem => ({
      id: r.id,
      title: r.title || r.name || '',
      poster_path: r.poster_path,
      backdrop_path: r.backdrop_path,
      media_type: 'movie',
      year: r.release_date ? parseInt(r.release_date.substring(0, 4)) : null,
      vote_average: r.vote_average || 0,
      vote_count: r.vote_count || 0,
      overview: r.overview || '',
      genre_ids: r.genre_ids || [],
    }));
}

// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build the full curated homepage feed.
 *
 * Architecture: 60/40 split between user-calibrated and fellow-traveler rows.
 * - 60%: Rows built from the viewer's actual engagement history
 * - 40%: Rows from today's 3 active personas (interspersed naturally)
 *
 * Content bias guards applied to ALL user rows:
 * - No Kids, Family, or Music genre content (unless user has explicit signal)
 * - Year floor of 1960 (avoids over-surfacing obscure pre-1960 foreign catalog)
 * - World Cinema only shown when viewer has language engagement signal (or 25% chance)
 */
export async function getCuratedFeed(affinities?: ViewerAffinities, mood?: MoodInput): Promise<CuratedRow[]> {
  const hasAffinities = affinities && (affinities.topGenres?.length || affinities.topDecade);

  let decade: typeof DECADES[number];
  let genre: typeof SPOTLIGHT_GENRES[number];
  let genreIsPersonal = false;
  let decadeIsPersonal = false;

  if (hasAffinities && affinities?.topDecade) {
    const match = DECADES.find(d => d.label === affinities.topDecade);
    decade = match && Math.random() < 0.6 ? match : pickRandom(DECADES);
    decadeIsPersonal = decade === match;
  } else {
    decade = pickRandom(DECADES);
  }

  if (hasAffinities && affinities?.topGenres?.length) {
    const match = SPOTLIGHT_GENRES.find(g => affinities.topGenres!.includes(g.id));
    genre = match && Math.random() < 0.6 ? match : pickRandom(SPOTLIGHT_GENRES);
    genreIsPersonal = genre === match;
  } else {
    genre = pickRandom(SPOTLIGHT_GENRES);
  }

  const worldLang = pickRandom(WORLD_LANGUAGES);

  // Second genre for mash — must be from a different thematic family
  const GENRE_FAMILIES: Record<number, string> = {
    27: 'tension', 53: 'tension', 9648: 'tension',
    878: 'speculative', 14: 'speculative',
    80: 'crime', 10752: 'conflict', 36: 'history',
    99: 'nonfiction', 16: 'animation',
    37: 'western', 10749: 'romance',
  };
  const genreFamily = GENRE_FAMILIES[genre.id];
  const genre2candidates = SPOTLIGHT_GENRES.filter(g =>
    g.id !== genre.id && GENRE_FAMILIES[g.id] !== genreFamily
  );
  const unexplored = hasAffinities && affinities?.topGenres?.length
    ? genre2candidates.filter(g => !affinities.topGenres!.includes(g.id))
    : genre2candidates;
  const genre2 = unexplored.length > 0
    ? pickRandom(unexplored)
    : pickRandom(genre2candidates.length > 0 ? genre2candidates : SPOTLIGHT_GENRES.filter(g => g.id !== genre.id));

  const tasteGenres = hasAffinities && affinities?.topGenres?.length
    ? affinities.topGenres.slice(0, 3).join(',')
    : null;

  const vibes = affinities?.vibes || [];

  // World Cinema: only show if viewer has shown language engagement signal,
  // OR as a 25% random chance to introduce it. Avoids over-weighting
  // foreign language titles relative to user signals.
  const showWorldCinema = affinities?.hasLanguageSignal || Math.random() < 0.25;

  // ── Fetch all user-calibrated rows in parallel ──
  // All calls apply content bias guards (no Kids/Family/Music, year floor of 1960)
  const results = await Promise.allSettled([

    // Viewers Like You / Acclaimed & Overlooked
    tasteGenres
      ? fetchCuratedRow('vote_average.desc', {
          with_genres: tasteGenres,
          'vote_count.gte': '50',
          'vote_count.lte': '1500',
          'vote_average.gte': '7.0',
        })
      : fetchCuratedRow('vote_average.desc', {
          'vote_count.gte': '300',
          'vote_count.lte': '2000',
          'vote_average.gte': '7.5',
        }),

    // Hidden Gems — genuinely obscure, high quality
    fetchCuratedRow('vote_average.desc', {
      'vote_count.gte': '30',
      'vote_count.lte': '400',
      'vote_average.gte': '7.0',
    }),

    // Decade Classics — respect viewer's era preference
    fetchCuratedRow('vote_average.desc', {
      'primary_release_date.gte': decade.start,
      'primary_release_date.lte': decade.end,
      'vote_count.gte': '200',
      'vote_average.gte': '6.8',
      // Override year floor for decade rows — that IS the point
      'without_genres': USER_EXCLUDE_GENRES,
    }),

    // Genre Essentials
    fetchCuratedRow('vote_average.desc', {
      with_genres: String(genre.id),
      'vote_count.gte': '200',
      'vote_average.gte': '6.8',
    }),

    // Free Right Now
    fetchCuratedRow('vote_average.desc', {
      with_watch_monetization_types: 'free|ads',
      with_watch_providers: FREE_PROVIDER_IDS,
      'vote_count.gte': '50',
    }),

    // Recent Critical Darlings — last 3 years
    fetchCuratedRow('vote_average.desc', {
      'primary_release_date.gte': `${new Date().getFullYear() - 3}-01-01`,
      'vote_count.gte': '200',
      'vote_average.gte': '7.0',
    }),

    // World Cinema — conditional on user signal (not always shown)
    showWorldCinema
      ? fetchCuratedRow('vote_average.desc', {
          with_original_language: worldLang,
          'vote_count.gte': '100',
          'vote_average.gte': '7.0',
          // Override year floor for world cinema
          'primary_release_date.gte': '1970-01-01',
          'without_genres': USER_EXCLUDE_GENRES,
        })
      : Promise.resolve([]),

    // Deep Cuts — critically excellent, barely known
    fetchCuratedRow('vote_average.desc', {
      'vote_count.gte': '20',
      'vote_count.lte': '150',
      'vote_average.gte': '7.5',
    }),

    // Genre Mash — two genres combined for unexpected discoveries
    fetchCuratedRow('vote_average.desc', {
      with_genres: `${genre.id},${genre2.id}`,
      'vote_count.gte': '100',
      'vote_average.gte': '6.5',
    }),

    // Personal vibe keyword rows
    ...vibes.map(vibe =>
      fetchCuratedRow('vote_average.desc', {
        with_keywords: vibe.keywordIds.join('|'),
        'vote_count.gte': '10',
      })
    ),
  ]);

  const unwrap = (r: PromiseSettledResult<DiscoverItem[]>): DiscoverItem[] =>
    r.status === 'fulfilled' ? r.value : [];
  const allResults = results.map(unwrap);
  const [certified, hidden, decadeRow, genreRow, freeRow, recentCritical, worldCinema, deepCuts, genreMash] =
    allResults.slice(0, 9);
  const vibeResults = allResults.slice(9);

  const langNames: Record<string, string> = {
    ko: 'Korean', ja: 'Japanese', fr: 'French', es: 'Spanish',
    de: 'German', it: 'Italian', pt: 'Portuguese', zh: 'Chinese',
    hi: 'Hindi', sv: 'Swedish', da: 'Danish', pl: 'Polish',
    tr: 'Turkish', th: 'Thai',
  };

  // ── Build mood-aware reason text ──
  const t = mood?.timeOfDay || 'evening';
  const tone = mood?.recentTone || 'unknown';
  const dayN = mood?.dayName || '';
  const wknd = mood?.isWeekend ?? false;
  const knows = mood?.hasHistory ?? false;

  function timeFeel(evening: string, late: string, afternoon: string, fallback: string): string {
    if (t === 'latenight') return late;
    if (t === 'evening') return evening;
    if (t === 'afternoon') return afternoon;
    return fallback;
  }

  function toneAware(
    afterHeavy: string,
    afterIntense: string,
    afterLight: string,
    neutral: string,
  ): string {
    if (!knows) return neutral;
    if (tone === 'heavy') return afterHeavy;
    if (tone === 'intense') return afterIntense;
    if (tone === 'light') return afterLight;
    return neutral;
  }

  // ── Build user pool ──
  const userPool: CuratedRow[] = [];

  if (recentCritical.length > 0) {
    userPool.push({
      id: 'recent-critical',
      title: 'Recent Critical Darlings',
      subtitle: 'The films critics can\'t stop talking about',
      reasonTaste: 'New and acclaimed',
      reasonMood: timeFeel(
        'Something fresh for tonight',
        'Still buzzing from this year',
        'Catch up on what everyone\'s talking about',
        'The best of right now',
      ),
      items: recentCritical,
    });
  }
  if (certified.length > 0) {
    userPool.push({
      id: 'for-you',
      title: tasteGenres ? 'Picked for You' : 'Acclaimed & Overlooked',
      subtitle: tasteGenres
        ? 'Based on everything you\'ve been watching'
        : 'Great films that slipped through the cracks',
      reasonTaste: tasteGenres ? 'Matched to your actual taste profile' : 'Acclaimed but not obvious',
      reasonMood: tasteGenres
        ? toneAware(
            'Something that gets you — after a heavy stretch',
            'Tuned to your wavelength',
            'More of the energy you\'ve been chasing',
            'Films that feel like they were chosen for you',
          )
        : timeFeel(
            'A film worth discovering tonight',
            'The ones that reward late-night attention',
            'Something you haven\'t heard of — yet',
            'Quietly brilliant',
          ),
      items: certified,
    });
  }
  if (hidden.length > 0) {
    userPool.push({
      id: 'hidden',
      title: 'Hidden Gems',
      subtitle: 'Films most people haven\'t found yet',
      reasonTaste: 'Almost nobody knows these',
      reasonMood: timeFeel(
        'Perfect for a quiet night — discover something new',
        'A rabbit hole for the night owl in you',
        wknd ? 'A lazy weekend find' : 'Something to look forward to tonight',
        'For the curious',
      ),
      items: hidden,
    });
  }
  if (freeRow.length > 0) {
    userPool.push({
      id: 'free',
      title: 'Free Right Now',
      subtitle: 'No subscription needed',
      reasonTaste: 'Free to watch tonight',
      reasonMood: timeFeel(
        'Zero commitment — just press play',
        'Free and ready when you are',
        'Browse now, watch later — all free',
        'No account needed, no strings',
      ),
      items: freeRow,
    });
  }
  if (decadeRow.length > 0) {
    userPool.push({
      id: 'decade',
      title: `Best of the ${decade.label}`,
      subtitle: decadeIsPersonal
        ? `We noticed you love the ${decade.label}`
        : `A time capsule of the decade's best`,
      reasonTaste: decadeIsPersonal
        ? `You keep gravitating toward the ${decade.label}`
        : `Great films from the ${decade.label}`,
      reasonMood: decadeIsPersonal
        ? timeFeel(
            `A ${decade.label} film feels right tonight`,
            `Late-night ${decade.label} — your comfort zone`,
            `Revisit the ${decade.label} this ${dayN}`,
            `Back to the ${decade.label}`,
          )
        : timeFeel(
            `Travel back to the ${decade.label} tonight`,
            `The ${decade.label} hit different late at night`,
            `Time-travel for a ${dayN} afternoon`,
            `A different era, a different feel`,
          ),
      items: decadeRow,
    });
  }
  if (genreRow.length > 0) {
    const gn = genre.name.toLowerCase();
    userPool.push({
      id: 'genre',
      title: genreIsPersonal ? `More ${genre.name}` : `${genre.name} Essentials`,
      subtitle: genreIsPersonal
        ? `Because you keep coming back to ${gn}`
        : 'The definitive collection',
      reasonTaste: genreIsPersonal ? `You love ${gn}` : `Exploring ${gn}`,
      reasonMood: genreIsPersonal
        ? toneAware(
            `You've been in a heavy place — ${gn} might be the shift you need`,
            `After all that intensity, more ${gn} could hit right`,
            `You're in a ${gn} mood — lean into it`,
            `More of what you love`,
          )
        : timeFeel(
            `A ${gn} night`,
            `Late-night ${gn}`,
            `${genre.name} for a ${dayN}`,
            `Try some ${gn}`,
          ),
      items: genreRow,
    });
  }
  if (worldCinema.length > 0) {
    const ln = langNames[worldLang] || 'world';
    userPool.push({
      id: 'world',
      title: `${langNames[worldLang] || 'World'} Cinema`,
      subtitle: 'Subtitles on, phones down',
      reasonTaste: `Something different — ${ln} storytelling`,
      reasonMood: toneAware(
        `After all that drama, a change of perspective`,
        `Step outside the familiar for a bit`,
        `Keep exploring — ${ln} cinema has range`,
        timeFeel(
          `Give your evening to a ${ln} film`,
          `The world looks different after midnight`,
          `A ${dayN} afternoon trip — no passport needed`,
          `Broaden the view`,
        ),
      ),
      items: worldCinema,
    });
  }
  if (deepCuts.length > 0) {
    userPool.push({
      id: 'deep-cuts',
      title: 'Deep Cuts',
      subtitle: 'Films only cinephiles know',
      reasonTaste: 'The rabbit hole',
      reasonMood: timeFeel(
        'The kind of film you tell people about tomorrow',
        'Deep cuts hit hardest late at night',
        wknd ? 'Weekend discovery mode' : 'Save one for tonight',
        'For when you want to find something nobody else has seen',
      ),
      items: deepCuts,
    });
  }
  if (genreMash.length > 0) {
    userPool.push({
      id: 'genre-mash',
      title: `${genre.name} × ${genre2.name}`,
      subtitle: 'When two worlds collide',
      reasonTaste: `What happens when ${genre.name.toLowerCase()} meets ${genre2.name.toLowerCase()}`,
      reasonMood: timeFeel(
        'Something you wouldn\'t think to search for',
        'The weird stuff finds you late at night',
        'Feeling adventurous?',
        'Trust the unexpected',
      ),
      items: genreMash,
    });
  }

  // Personal vibe rows
  vibes.forEach((vibe, i) => {
    const items = vibeResults[i] || [];
    if (items.length > 0) {
      userPool.push({
        id: `vibe-${i}`,
        title: vibe.label,
        subtitle: vibe.subtitle,
        reasonTaste: `Part of who you are`,
        reasonMood: timeFeel(
          `A ${vibe.label.toLowerCase()} night`,
          `Late-night ${vibe.label.toLowerCase()}`,
          `${vibe.label} for a ${dayN}`,
          vibe.subtitle,
        ),
        items,
      });
    }
  });

  // ── Fetch today's fellow traveler persona rows (40% of feed) ──
  const todaysPersonas = selectPersonasForToday(3);
  const personaResults = await Promise.allSettled(
    todaysPersonas.map(p => fetchPersonaRow(p))
  );

  const personaPool: CuratedRow[] = [];
  todaysPersonas.forEach((persona, i) => {
    const r = personaResults[i];
    const items = r.status === 'fulfilled' ? r.value : [];
    if (items.length >= 4) {  // only include if we got meaningful results
      personaPool.push({
        id: `persona-${persona.id}`,
        title: persona.rowTitle,
        subtitle: persona.rowSubtitle,
        reasonTaste: '',
        reasonMood: '',
        items,
        isFellowTraveler: true,
      });
    }
  });

  // ── Deduplicate across ALL rows (user + persona) ──
  const seen = new Set<number>();
  const dedup = (row: CuratedRow): CuratedRow => ({
    ...row,
    items: row.items.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  });

  const cleanUserPool = userPool.map(dedup).filter(r => r.items.length > 0);
  const cleanPersonaPool = personaPool.map(dedup).filter(r => r.items.length > 0);

  // ── Interleave: 60% user, 40% fellow traveler ──
  // Pin the first row (user, always recent darlings or picked-for-you).
  // Then interleave: 2 user rows, 1 persona row.
  // Result: ~33% persona in remaining rows ≈ 40% of total (since pinned first is user).
  const pinnedRow = cleanUserPool[0];
  const remainingUser = cleanUserPool.slice(1);

  const mixed: CuratedRow[] = [];
  let ui = 0, pi = 0;
  while (ui < remainingUser.length || pi < cleanPersonaPool.length) {
    // 2 user rows
    if (ui < remainingUser.length) mixed.push(remainingUser[ui++]);
    if (ui < remainingUser.length) mixed.push(remainingUser[ui++]);
    // 1 persona row
    if (pi < cleanPersonaPool.length) mixed.push(cleanPersonaPool[pi++]);
  }

  // Shuffle the middle (not pinned first, not the very last) for freshness
  const first = pinnedRow ? [pinnedRow] : [];
  const middle = mixed.slice(0, -1);
  const last = mixed.slice(-1);
  for (let i = middle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [middle[i], middle[j]] = [middle[j], middle[i]];
  }

  return [...first, ...middle, ...last].filter(Boolean);
}

/**
 * Keyword-based discover — lets users type unusual terms and find matching films
 */
export async function discoverByKeyword(
  keywordIds: number[],
  page = 1,
): Promise<DiscoverResponse> {
  if (keywordIds.length === 0) return { results: [], page: 1, total_pages: 0, total_results: 0 };

  const params = new URLSearchParams({
    api_key: API_KEY,
    language: 'en-US',
    watch_region: 'US',
    page: String(page),
    sort_by: 'vote_average.desc',
    include_adult: 'false',
    with_poster: 'true',
    with_keywords: keywordIds.join('|'),
    'vote_count.gte': '30',
  });

  const url = `${TMDB_BASE}/discover/movie?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return { results: [], page: 1, total_pages: 0, total_results: 0 };
  const data = await res.json();

  const results: DiscoverItem[] = (data.results || [])
    .filter((r: any) => r.poster_path)
    .map((r: any): DiscoverItem => ({
      id: r.id,
      title: r.title || r.name || '',
      poster_path: r.poster_path,
      backdrop_path: r.backdrop_path,
      media_type: 'movie',
      year: r.release_date ? parseInt(r.release_date.substring(0, 4)) : null,
      vote_average: r.vote_average || 0,
      vote_count: r.vote_count || 0,
      overview: r.overview || '',
      genre_ids: r.genre_ids || [],
    }));

  return {
    results,
    page: data.page,
    total_pages: Math.min(data.total_pages || 0, 500),
    total_results: data.total_results || 0,
  };
}

/**
 * Main discover function — routes to trending or discover based on params
 */
export async function discoverContent(params: DiscoverParams): Promise<DiscoverResponse> {
  const { mediaType, genre, sourceFilter, page } = params;
  const freeOnly = sourceFilter === 'free';
  const isBadMovies = genre === -1;
  const isTrending = genre === 0;

  if (isTrending) {
    const effectivePage = page === 1 && Math.random() < 0.3
      ? 1 + Math.floor(Math.random() * 3)
      : page;
    return fetchTrending(mediaType === 'all' ? 'all' : mediaType, effectivePage);
  }

  if (mediaType === 'all') {
    const [movies, tv] = await Promise.all([
      fetchDiscover('movie', page, isBadMovies ? null : genre, isBadMovies, freeOnly),
      fetchDiscover('tv', page, isBadMovies ? null : genre, isBadMovies, freeOnly),
    ]);

    const merged = [...movies.results, ...tv.results]
      .sort((a, b) => {
        if (isBadMovies) return a.vote_average - b.vote_average;
        return b.vote_average - a.vote_average;
      })
      .slice(0, 20);

    return {
      results: merged,
      page,
      total_pages: Math.min(movies.total_pages, tv.total_pages, 500),
      total_results: movies.total_results + tv.total_results,
    };
  }

  return fetchDiscover(mediaType, page, isBadMovies ? null : genre, isBadMovies, freeOnly);
}
