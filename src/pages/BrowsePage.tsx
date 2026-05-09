/**
 * BrowsePage — the living bookshop
 *
 * Top half: curated horizontal rows — 60% calibrated to the viewer,
 * 40% from "fellow travelers" (constructed taste personas whose books
 * slip onto your shelves). Bottom half: full browse grid with genre
 * tabs + infinite scroll.
 *
 * Fellow traveler rows carry no explanation. They're just there.
 * Sometimes the find is exactly right.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  discoverContent,
  discoverByKeyword,
  getCuratedFeed,
  BROWSE_GENRES,
} from '../lib/discover';
import { searchKeywords } from '../lib/tmdb';
import type { DiscoverItem, CuratedRow, MediaFilter, SourceFilter, ViewerAffinities } from '../lib/discover';
import {
  isTraktAuthenticated,
  getHiddenItems,
  getWatchedMovies,
  getWatchedShows,
  getWatchlist,
} from '../lib/trakt';
import { cacheGet, cacheSet, trackEngagement, getTopGenres, getTopDecade, getMoodContext, pickVibes, hasLanguageSignal } from '../lib/storage';

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';

/** Color for TMDB rating badge */
function ratingColor(score: number): string {
  if (score >= 7) return 'var(--green)';
  if (score >= 5) return 'var(--yellow)';
  if (score >= 3) return 'var(--orange)';
  return 'var(--red)';
}

/** Tiny pill component */
function Badge({ text, bg }: { text: string; bg: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 9,
        fontWeight: 700,
        padding: '2px 5px',
        borderRadius: 4,
        background: bg,
        color: '#fff',
        lineHeight: 1.2,
      }}
    >
      {text}
    </span>
  );
}

type TraktStatus = 'watched' | 'watchlisted' | null;

export default function BrowsePage() {
  const navigate = useNavigate();

  // --- Curated rows state ---
  const [curatedRows, setCuratedRows] = useState<CuratedRow[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(true);

  // --- filter state (for browse grid) ---
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [activeGenre, setActiveGenre] = useState(0); // 0 = Trending

  // --- content state (for browse grid) ---
  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // --- Trakt state ---
  const [hiddenSet, setHiddenSet] = useState<Set<string>>(new Set());
  const [watchedSet, setWatchedSet] = useState<Set<string>>(new Set());
  const [watchlistSet, setWatchlistSet] = useState<Set<string>>(new Set());

  // --- hero skip state ---
  const [heroSkipIndex, setHeroSkipIndex] = useState(0);

  // --- keyword search state ---
  const [keywordQuery, setKeywordQuery] = useState('');
  const [keywordResults, setKeywordResults] = useState<DiscoverItem[]>([]);
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ---- Load Trakt sets (cached 5 min) ----
  useEffect(() => {
    if (!isTraktAuthenticated()) return;

    async function loadTrakt() {
      try {
        // hidden
        const cHidden = cacheGet<string[]>('browse_hidden');
        if (cHidden) {
          setHiddenSet(new Set(cHidden));
        } else {
          const [hm, hs] = await Promise.all([
            getHiddenItems('movies'),
            getHiddenItems('shows'),
          ]);
          const keys = [
            ...hm.map((i) => `movie-${i.ids?.tmdb}`),
            ...hs.map((i) => `tv-${i.ids?.tmdb}`),
          ];
          cacheSet('browse_hidden', keys, 5);
          setHiddenSet(new Set(keys));
        }

        // watched
        const cWatched = cacheGet<string[]>('browse_watched');
        if (cWatched) {
          setWatchedSet(new Set(cWatched));
        } else {
          const [wm, ws] = await Promise.all([
            getWatchedMovies(),
            getWatchedShows(),
          ]);
          const keys = [
            ...wm.map((i) => `movie-${i.ids?.tmdb}`),
            ...ws.map((i) => `tv-${i.ids?.tmdb}`),
          ];
          cacheSet('browse_watched', keys, 5);
          setWatchedSet(new Set(keys));
        }

        // watchlist
        const cWL = cacheGet<string[]>('browse_watchlist');
        if (cWL) {
          setWatchlistSet(new Set(cWL));
        } else {
          const [wlm, wls] = await Promise.all([
            getWatchlist('movies'),
            getWatchlist('shows'),
          ]);
          const keys = [
            ...wlm.map((i) => `movie-${i.ids?.tmdb}`),
            ...wls.map((i) => `tv-${i.ids?.tmdb}`),
          ];
          cacheSet('browse_watchlist', keys, 5);
          setWatchlistSet(new Set(keys));
        }
      } catch (err) {
        console.warn('[Browse] Trakt load error:', err);
      }
    }

    loadTrakt();
  }, []);

  // ---- Load curated feed — always informed by viewer taste ----
  useEffect(() => {
    async function loadCurated() {
      setCuratedLoading(true);
      try {
        const cached = cacheGet<CuratedRow[]>('curated_feed');
        if (cached && cached.length > 0) {
          setCuratedRows(cached);
        } else {
          const affinities: ViewerAffinities = {
            topGenres: getTopGenres(5),
            topDecade: getTopDecade() || undefined,
            vibes: pickVibes(2),
            hasLanguageSignal: hasLanguageSignal(),
          };
          const rows = await getCuratedFeed(affinities, getMoodContext());
          cacheSet('curated_feed', rows, 10);
          setCuratedRows(rows);
        }
      } catch (err) {
        console.warn('[Browse] Curated feed error:', err);
      } finally {
        setCuratedLoading(false);
      }
    }
    loadCurated();
  }, []);

  // ---- Fetch browse grid content when filters change ----
  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      setLoading(true);
      try {
        const res = await discoverContent({
          mediaType: mediaFilter,
          genre: activeGenre,
          sourceFilter,
          page: pageNum,
        });

        // Filter out hidden items, then sort watched to the end
        const filtered = res.results
          .filter((item) => {
            const key = `${item.media_type}-${item.id}`;
            return !hiddenSet.has(key);
          })
          .sort((a, b) => {
            const aWatched = watchedSet.has(`${a.media_type}-${a.id}`) ? 1 : 0;
            const bWatched = watchedSet.has(`${b.media_type}-${b.id}`) ? 1 : 0;
            return aWatched - bWatched; // unwatched first
          });

        setItems((prev) => (append ? [...prev, ...filtered] : filtered));
        setTotalPages(res.total_pages);
        setPage(pageNum);
      } catch (err) {
        console.error('[Browse] Discover error:', err);
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    },
    [mediaFilter, activeGenre, sourceFilter, hiddenSet, watchedSet]
  );

  // Reset + fetch when filters change
  useEffect(() => {
    setItems([]);
    setPage(1);
    setInitialLoad(true);
    fetchPage(1, false);
  }, [mediaFilter, activeGenre, sourceFilter, hiddenSet]);

  // ---- Infinite scroll via IntersectionObserver ----
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && page < totalPages) {
          fetchPage(page + 1, true);
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, page, totalPages, fetchPage]);

  // ---- Helpers ----
  function traktStatus(item: DiscoverItem): TraktStatus {
    const key = `${item.media_type}-${item.id}`;
    if (watchedSet.has(key)) return 'watched';
    if (watchlistSet.has(key)) return 'watchlisted';
    return null;
  }

  // ---- Poster card (shared between curated rows and grid) ----
  function PosterCard({ item, size = 'small', isFellowTraveler = false }: { item: DiscoverItem; size?: 'small' | 'grid'; isFellowTraveler?: boolean }) {
    const status = traktStatus(item);
    const isWatched = status === 'watched';
    const isSmall = size === 'small';

    return (
      <div
        onClick={() => {
          trackEngagement(item.genre_ids, item.year);
          navigate(`/title/${item.id}/${item.media_type}`);
        }}
        className="fade-in"
        style={{
          position: 'relative',
          cursor: 'pointer',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'var(--bg-card)',
          transition: 'transform 0.15s',
          opacity: isWatched ? 0.2 : 1,
          // Fellow traveler posters: subtle warm aging, like a slightly sun-faded cover
          filter: isWatched
            ? 'grayscale(0.85) brightness(0.6)'
            : isFellowTraveler
              ? 'sepia(0.12) brightness(0.97) saturate(0.95)'
              : 'none',
          flexShrink: 0,
          width: isSmall ? (isWatched ? 80 : 120) : undefined,
          transform: isWatched ? 'scale(0.92)' : 'none',
        }}
      >
        <img
          src={`${POSTER_BASE}${item.poster_path}`}
          alt={item.title}
          loading="lazy"
          decoding="async"
          style={{
            width: '100%',
            aspectRatio: '2/3',
            objectFit: 'cover',
            display: 'block',
          }}
        />

        {/* "SEEN" overlay for watched titles — unmistakable visual mark */}
        {isWatched && (
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.5)',
            }}
          >
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--green)',
              background: 'rgba(0,0,0,0.7)', padding: '3px 8px',
              borderRadius: 4, letterSpacing: 1,
            }}>
              SEEN
            </div>
          </div>
        )}

        {/* Rating badge (top-left) — only for unwatched */}
        {!isWatched && (
          <div
            style={{
              position: 'absolute',
              top: 5,
              left: 5,
              background: 'rgba(0,0,0,0.75)',
              borderRadius: 5,
              padding: '1px 5px',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span style={{ fontSize: 9, color: '#fbbf24' }}>★</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: ratingColor(item.vote_average),
              }}
            >
              {item.vote_average.toFixed(1)}
            </span>
          </div>
        )}

        {/* Status badges (top-right) */}
        {!isWatched && (
          <div
            style={{
              position: 'absolute',
              top: 5,
              right: 5,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              alignItems: 'flex-end',
            }}
          >
            {item.media_type === 'tv' && <Badge text="TV" bg="var(--blue)" />}
            {status === 'watchlisted' && <Badge text="+" bg="var(--accent)" />}
          </div>
        )}

        {/* Bottom gradient with title */}
        {!isWatched && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '20px 6px 6px',
              background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
            }}
          >
            <div
              style={{
                fontSize: isSmall ? 10 : 11,
                fontWeight: 600,
                color: '#fff',
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.title}
            </div>
            {item.year && (
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>
                {item.year}
              </div>
            )}
          </div>
        )}

        {/* Bent corner — marks fellow traveler finds. A dog-eared page. */}
        {isFellowTraveler && !isWatched && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 0,
              height: 0,
              borderStyle: 'solid',
              borderWidth: '0 14px 14px 0',
              borderColor: `transparent var(--warm-amber) transparent transparent`,
              opacity: 0.65,
            }}
          />
        )}
      </div>
    );
  }

  // ---- Render ----
  return (
    <div ref={scrollRef} style={{ paddingTop: 12 }}>
      {/* ══════════════════════════════════════════
          CURATED DISCOVERY ROWS
          ══════════════════════════════════════════ */}

      {curatedLoading ? (
        /* ── Loading skeleton ── */
        <>
          {/* Hero skeleton */}
          <div style={{
            width: '100%', aspectRatio: '16/9', borderRadius: 14,
            background: 'var(--bg-card)', marginBottom: 24,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          {[1, 2].map((n) => (
            <div key={n} style={{ marginBottom: 24 }}>
              <div style={{ width: 140, height: 16, borderRadius: 6, background: 'var(--bg-card)', marginBottom: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ display: 'flex', gap: 10, overflow: 'hidden' }}>
                {[1, 2, 3, 4].map((p) => (
                  <div key={p} style={{ width: 120, aspectRatio: '2/3', borderRadius: 10, background: 'var(--bg-card)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          {/* ══ HERO SPOTLIGHT with "Not now" skip ══ */}
          {(() => {
            // Build candidate pool — each carries WHY it was picked (taste + mood)
            // Discovery rows get priority: hidden gems, deep cuts, world cinema,
            // genre mash, and personal picks go first. Safe/generic rows go last.
            const discoveryRowIds = new Set(['hidden', 'deep-cuts', 'world', 'genre-mash', 'for-you',
              ...curatedRows.filter(r => r.id.startsWith('vibe-')).map(r => r.id)]);
            const priorityRows = curatedRows.filter(r => discoveryRowIds.has(r.id));
            const otherRows = curatedRows.filter(r => !discoveryRowIds.has(r.id));
            const orderedRows = [...priorityRows, ...otherRows];

            const heroCandidates: Array<DiscoverItem & { tasteLine: string; moodLine: string }> = [];
            for (const row of orderedRows) {
              for (const item of row.items) {
                if (
                  item.backdrop_path &&
                  !hiddenSet.has(`${item.media_type}-${item.id}`) &&
                  !watchedSet.has(`${item.media_type}-${item.id}`)
                ) {
                  heroCandidates.push({
                    ...item,
                    tasteLine: row.reasonTaste,
                    moodLine: row.reasonMood,
                  });
                }
              }
            }

            const hero = heroCandidates[heroSkipIndex % Math.max(heroCandidates.length, 1)];
            if (!hero) return null;

            return (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16/9',
                  borderRadius: 14,
                  overflow: 'hidden',
                  marginBottom: 24,
                }}
              >
                <div
                  onClick={() => {
                    trackEngagement(hero.genre_ids, hero.year);
                    navigate(`/title/${hero.id}/${hero.media_type}`);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <img
                    src={`${BACKDROP_BASE}${hero.backdrop_path}`}
                    alt={hero.title}
                    loading="eager"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {/* Gradient overlay */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 40%, transparent 70%)',
                    pointerEvents: 'none',
                  }} />
                  {/* Content — two layers: taste identity + emotional read */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '16px 16px 18px',
                    pointerEvents: 'none',
                  }}>
                    {/* Taste line — who you are as a viewer */}
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
                      {hero.tasteLine}
                    </div>
                    {/* Mood line — why this feels right tonight */}
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', marginBottom: 10 }}>
                      {hero.moodLine}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.15, letterSpacing: -0.3, marginBottom: 6 }}>
                      {hero.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                      {hero.year} · {hero.vote_average.toFixed(1)}
                    </div>
                    {hero.overview && (
                      <div style={{
                        fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {hero.overview}
                      </div>
                    )}
                  </div>
                </div>

                {/* "Not now" skip button — top right */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setHeroSkipIndex(prev => prev + 1);
                  }}
                  style={{
                    position: 'absolute', top: 10, right: 10,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 20, padding: '6px 14px',
                    color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    transition: 'background 0.15s',
                  }}
                  title="Show me something else"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="13 17 18 12 13 7" />
                    <polyline points="6 17 11 12 6 7" />
                  </svg>
                  Not now
                </button>
              </div>
            );
          })()}

          {/* ══ CURATED ROWS ══ */}
          {curatedRows.map((row) => {
            const isFT = row.isFellowTraveler;
            return (
            <div
              key={row.id}
              style={{
                marginBottom: 28,
                // Fellow traveler rows: barely perceptible warm paper tint
                ...(isFT ? {
                  background: 'var(--paper-warm)',
                  borderRadius: 10,
                  padding: '10px 0 4px',
                  marginLeft: -2,
                  marginRight: -2,
                } : {}),
              }}
            >
              {/* Row header */}
              <div style={{ marginBottom: 10, paddingLeft: isFT ? 2 : 0 }}>
                {isFT ? (
                  // Fellow traveler row: sentence case, italic, amber accent
                  // No explanation. Just the shelf.
                  <>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--warm-amber)',
                      fontStyle: 'italic',
                      letterSpacing: 0.2,
                    }}>
                      {row.title}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: 'rgba(201,169,110,0.55)',
                      marginTop: 2,
                      fontStyle: 'italic',
                    }}>
                      — {row.subtitle}
                    </div>
                    <div style={{ width: 20, height: 1, background: 'var(--warm-amber)', opacity: 0.4, borderRadius: 1, marginTop: 7 }} />
                  </>
                ) : (
                  // User-calibrated row: uppercase, standard accent
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                      {row.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {row.subtitle}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', marginTop: 3 }}>
                      {row.reasonMood}
                    </div>
                    <div style={{ width: 24, height: 2, background: 'var(--accent)', borderRadius: 1, marginTop: 6 }} />
                  </>
                )}
              </div>

              {/* Horizontal scroll */}
              <div
                style={{
                  display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4,
                  scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
                }}
              >
                {row.items
                  .filter((item) => !hiddenSet.has(`${item.media_type}-${item.id}`))
                  .sort((a, b) => {
                    const aW = watchedSet.has(`${a.media_type}-${a.id}`) ? 1 : 0;
                    const bW = watchedSet.has(`${b.media_type}-${b.id}`) ? 1 : 0;
                    return aW - bW;
                  })
                  .map((item) => (
                    <PosterCard
                      key={`${item.media_type}-${item.id}`}
                      item={item}
                      size="small"
                      isFellowTraveler={isFT}
                    />
                  ))}
              </div>
            </div>
            );
          })}
        </>
      )}

      {/* Action buttons: Open to a Random Page + New Shelves */}
      {!curatedLoading && curatedRows.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <button
            onClick={() => {
              // Open to a random unwatched title — like letting the book fall open
              const pool = curatedRows.flatMap(r => r.items)
                .filter(item => {
                  const key = `${item.media_type}-${item.id}`;
                  return !hiddenSet.has(key) && !watchedSet.has(key);
                });
              if (pool.length > 0) {
                const pick = pool[Math.floor(Math.random() * pool.length)];
                trackEngagement(pick.genre_ids, pick.year);
                navigate(`/title/${pick.id}/${pick.media_type}`);
              }
            }}
            style={{
              flex: 1, padding: '12px', borderRadius: 10,
              border: 'none', background: 'var(--accent)',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Open to a Random Page
          </button>
          <button
            onClick={async () => {
              setCuratedLoading(true);
              setHeroSkipIndex(0);
              try {
                const affinities: ViewerAffinities = {
                  topGenres: getTopGenres(5),
                  topDecade: getTopDecade() || undefined,
                  vibes: pickVibes(2),
                };
                const rows = await getCuratedFeed(affinities, getMoodContext());
                cacheSet('curated_feed', rows, 10);
                setCuratedRows(rows);
              } catch (err) {
                console.warn('Refresh error:', err);
              } finally {
                setCuratedLoading(false);
              }
            }}
            style={{
              flex: 1, padding: '12px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.08)', background: 'var(--bg-card)',
              color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            New Shelves
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════
          KEYWORD DISCOVER — describe the shelf
          ══════════════════════════════════════════ */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
          Describe the shelf
        </div>
        <div style={{ width: 16, height: 2, background: 'var(--accent)', borderRadius: 1, marginBottom: 10 }} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const q = keywordQuery.trim();
            if (!q) return;
            setKeywordLoading(true);
            setActiveKeyword(q);
            try {
              const kws = await searchKeywords(q);
              if (kws.length > 0) {
                const res = await discoverByKeyword(kws.map(k => k.id));
                setKeywordResults(res.results);
              } else {
                setKeywordResults([]);
              }
            } catch {
              setKeywordResults([]);
            } finally {
              setKeywordLoading(false);
            }
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 10 }}
        >
          <input
            type="text"
            value={keywordQuery}
            onChange={(e) => setKeywordQuery(e.target.value)}
            placeholder="heist, time loop, unreliable narrator..."
            style={{
              flex: 1, background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
            }}
          />
          <button type="submit" style={{
            padding: '10px 16px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            Go
          </button>
        </form>

        {keywordLoading && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            <div style={{ width: 18, height: 18, border: '2px solid var(--text-secondary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', margin: '0 auto 8px' }} />
            Searching...
          </div>
        )}

        {!keywordLoading && activeKeyword && keywordResults.length === 0 && (
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Nothing found for "{activeKeyword}" — try another keyword
          </div>
        )}

        {!keywordLoading && keywordResults.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {keywordResults.length} results for "{activeKeyword}"
            </div>
            <div
              style={{
                display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4,
                scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
              }}
            >
              {keywordResults.slice(0, 15).map((item) => (
                <PosterCard key={`kw-${item.media_type}-${item.id}`} item={item} size="small" />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════
          DIVIDER
          ══════════════════════════════════════════ */}
      <div
        style={{
          height: 1,
          background: 'rgba(255,255,255,0.06)',
          margin: '8px 0 20px',
        }}
      />

      {/* ══════════════════════════════════════════
          BROWSE GRID (existing functionality)
          ══════════════════════════════════════════ */}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h2
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          Browse by Mood
        </h2>

        {/* Media type toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'movie', 'tv'] as MediaFilter[]).map((m) => (
            <button
              key={m}
              onClick={() => setMediaFilter(m)}
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background:
                  mediaFilter === m ? 'var(--accent)' : 'var(--bg-card)',
                color:
                  mediaFilter === m ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {m === 'all' ? 'All' : m === 'movie' ? 'Movies' : 'TV'}
            </button>
          ))}
        </div>
      </div>

      {/* Free toggle */}
      <button
        onClick={() =>
          setSourceFilter((s) => (s === 'free' ? 'all' : 'free'))
        }
        style={{
          width: '100%',
          padding: '8px 12px',
          marginBottom: 10,
          borderRadius: 10,
          border:
            sourceFilter === 'free'
              ? '1px solid var(--green)'
              : '1px solid rgba(255,255,255,0.08)',
          background:
            sourceFilter === 'free'
              ? 'rgba(34,197,94,0.12)'
              : 'var(--bg-card)',
          color:
            sourceFilter === 'free'
              ? 'var(--green)'
              : 'var(--text-secondary)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {sourceFilter === 'free'
          ? 'Showing Free / Ad-Supported Only'
          : 'Free Sources Only'}
      </button>

      {/* Genre chips (horizontal scroll) */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 10,
          marginBottom: 8,
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {BROWSE_GENRES.map((g) => {
          const active = activeGenre === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setActiveGenre(g.id)}
              style={{
                flexShrink: 0,
                padding: '6px 14px',
                borderRadius: 6,
                border: active ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {g.name}
            </button>
          );
        })}
      </div>

      {/* Poster grid */}
      {initialLoad ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              style={{
                aspectRatio: '2/3',
                borderRadius: 10,
                background: 'var(--bg-card)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Nothing found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Try a different genre or turn off the free filter
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
          }}
        >
          {items.map((item) => (
            <PosterCard key={`${item.media_type}-${item.id}`} item={item} size="grid" />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} style={{ height: 1 }} />

      {/* Loading indicator */}
      {loading && !initialLoad && (
        <div
          style={{
            textAlign: 'center',
            padding: '20px 0',
            color: 'var(--text-secondary)',
            fontSize: 13,
          }}
        >
          Loading more…
        </div>
      )}

      {/* End of results */}
      {!loading && page >= totalPages && items.length > 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '16px 0 8px',
            color: 'var(--text-secondary)',
            fontSize: 12,
          }}
        >
          End of the shelf — try another mood
        </div>
      )}
    </div>
  );
}
