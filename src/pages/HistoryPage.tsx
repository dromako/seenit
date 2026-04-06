import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cacheGet, cacheSet } from '../lib/storage';
import { getWatchedMovies, getWatchedShows, getHiddenItems, getWatchlist, isTraktAuthenticated } from '../lib/trakt';

type FilterTab = 'all' | 'watched' | 'hidden' | 'watchlist';

interface TitleItem {
  id: number;
  title: string;
  year: number;
  mediaType: 'movie' | 'tv';
  posterUrl?: string;
  status: 'watched' | 'hidden' | 'watchlisted';
  rating?: number;
  tmdbId?: number;
}

const TMDB_POSTER_SMALL = 'https://image.tmdb.org/t/p/w200';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;

// Batch fetch poster URLs for items that have tmdbIds
async function fetchPosters(items: TitleItem[]): Promise<Map<number, string>> {
  const posterMap = new Map<number, string>();
  const needPosters = items.filter(i => i.tmdbId && !i.posterUrl);

  // Fetch in parallel batches of 10
  for (let i = 0; i < needPosters.length; i += 10) {
    const batch = needPosters.slice(i, i + 10);
    await Promise.allSettled(
      batch.map(async (item) => {
        const type = item.mediaType === 'tv' ? 'tv' : 'movie';
        const res = await fetch(
          `https://api.themoviedb.org/3/${type}/${item.tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (data.poster_path) {
          posterMap.set(item.tmdbId!, data.poster_path);
        }
        return data.poster_path;
      })
    );
  }

  return posterMap;
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as FilterTab) || 'all';
  const [filter, setFilter] = useState<FilterTab>(initialTab);
  const [items, setItems] = useState<TitleItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<TitleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTraktAuthenticated()) {
      setLoading(false);
      setError('Connect Trakt in Settings to see your history.');
      return;
    }

    const loadHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try to get from cache first
        const cacheKey = 'history_all';
        const cached = cacheGet<TitleItem[]>(cacheKey);
        if (cached) {
          setItems(cached);
        } else {
          // Fetch from Trakt
          const watched = await getWatchedMovies();
          const watchedTV = await getWatchedShows();
          const hidden = await getHiddenItems('movies');
          const hiddenTV = await getHiddenItems('shows');
          const watchlist = await getWatchlist('movies');
          const watchlistTV = await getWatchlist('shows');

          const allItems: TitleItem[] = [];

          // Add watched items
          watched.forEach((item) => {
            allItems.push({
              id: item.ids.trakt,
              title: item.title,
              year: item.year,
              mediaType: 'movie',
              status: 'watched',
              tmdbId: item.ids.tmdb
            });
          });

          watchedTV.forEach((item) => {
            allItems.push({
              id: item.ids.trakt,
              title: item.title,
              year: item.year,
              mediaType: 'tv',
              status: 'watched',
              tmdbId: item.ids.tmdb
            });
          });

          // Add hidden items
          hidden.forEach((item) => {
            allItems.push({
              id: item.ids.trakt,
              title: item.title,
              year: item.year,
              mediaType: 'movie',
              status: 'hidden',
              tmdbId: item.ids.tmdb
            });
          });

          hiddenTV.forEach((item) => {
            allItems.push({
              id: item.ids.trakt,
              title: item.title,
              year: item.year,
              mediaType: 'tv',
              status: 'hidden',
              tmdbId: item.ids.tmdb
            });
          });

          // Add watchlist items
          watchlist.forEach((item) => {
            allItems.push({
              id: item.ids.trakt,
              title: item.title,
              year: item.year,
              mediaType: 'movie',
              status: 'watchlisted',
              tmdbId: item.ids.tmdb
            });
          });

          watchlistTV.forEach((item) => {
            allItems.push({
              id: item.ids.trakt,
              title: item.title,
              year: item.year,
              mediaType: 'tv',
              status: 'watchlisted',
              tmdbId: item.ids.tmdb
            });
          });

          // Fetch posters for the items
          if (TMDB_API_KEY) {
            const posterMap = await fetchPosters(allItems);
            allItems.forEach(item => {
              if (item.tmdbId && posterMap.has(item.tmdbId)) {
                item.posterUrl = posterMap.get(item.tmdbId)!;
              }
            });
          }

          setItems(allItems);
          cacheSet(cacheKey, allItems, 60); // Cache for 1 hour
        }
      } catch (err) {
        console.error('Error loading history:', err);
        setError('Failed to load history. Check your Trakt connection.');
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, []);

  // Filter items based on tab and search
  useEffect(() => {
    let result = items;

    // Apply tab filter
    if (filter !== 'all') {
      result = result.filter((item) => {
        if (filter === 'watched') return item.status === 'watched';
        if (filter === 'hidden') return item.status === 'hidden';
        if (filter === 'watchlist') return item.status === 'watchlisted';
        return true;
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      result = result.filter((item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredItems(result);
  }, [items, filter, searchQuery]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'watched':
        return 'var(--green)';
      case 'hidden':
        return 'var(--red)';
      case 'watchlisted':
        return 'var(--blue)';
      default:
        return 'var(--text-secondary)';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'watched':
        return '✓';
      case 'hidden':
        return '✕';
      case 'watchlisted':
        return '+';
      default:
        return '?';
    }
  };

  return (
    <div style={{
      padding: '16px',
      maxWidth: '480px',
      margin: '0 auto',
      paddingBottom: 'env(safe-area-inset-bottom, 16px)'
    }}>
      {/* Header */}
      <h1 style={{
        fontSize: '24px',
        fontWeight: '600',
        color: 'var(--text-primary)',
        marginBottom: '16px'
      }}>
        History
      </h1>

      {/* Search bar */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '8px',
        padding: '10px 12px',
        marginBottom: '16px',
        display: 'flex',
        gap: '8px',
        border: '1px solid rgba(255,255,255,0.06)'
      }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>🔍</span>
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none'
          }}
        />
      </div>

      {/* Filter tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        overflowX: 'auto',
        paddingBottom: '4px'
      }}>
        {(['all', 'watched', 'hidden', 'watchlist'] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              padding: '8px 16px',
              backgroundColor: filter === tab ? 'var(--accent)' : 'var(--bg-card)',
              color: filter === tab ? 'white' : 'var(--text-secondary)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              transition: 'background 0.15s'
            }}
          >
            {tab === 'all' && 'All'}
            {tab === 'watched' && '✓ Watched'}
            {tab === 'hidden' && '✕ Hidden'}
            {tab === 'watchlist' && '+ Watchlist'}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '40px 16px',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
          <div>Loading...</div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚠️</div>
          <div style={{ marginBottom: '16px' }}>{error}</div>
          <button
            onClick={() => navigate('/settings')}
            style={{
              padding: '12px 24px', backgroundColor: 'var(--accent)', color: 'white',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
            }}
          >
            Go to Settings
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredItems.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px 16px',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>
            {filter === 'watched' && '📽️'}
            {filter === 'hidden' && '🚫'}
            {filter === 'watchlist' && '📋'}
            {filter === 'all' && '🔍'}
          </div>
          <div>
            {searchQuery ? 'No titles match your search.' : 'No titles yet. Start watching!'}
          </div>
        </div>
      )}

      {/* Items grid */}
      {!loading && filteredItems.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px'
        }}>
          {filteredItems.map((item) => (
            <button
              key={`${item.id}-${item.mediaType}`}
              onClick={() => {
                if (item.tmdbId) {
                  navigate(`/title/${item.tmdbId}/${item.mediaType}`);
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0',
                textAlign: 'left'
              }}
            >
              <div style={{ position: 'relative', marginBottom: '8px' }}>
                {item.posterUrl ? (
                  <img
                    src={`${TMDB_POSTER_SMALL}${item.posterUrl}`}
                    alt={item.title}
                    loading="lazy"
                    style={{
                      width: '100%',
                      aspectRatio: '2/3',
                      borderRadius: '8px',
                      objectFit: 'cover',
                      backgroundColor: 'var(--bg-card)',
                      display: 'block'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '2/3',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-card)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '32px',
                      fontWeight: '300',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {item.title.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Status badge */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    right: '4px',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: getStatusColor(item.status),
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '16px'
                  }}
                >
                  {getStatusBadge(item.status)}
                </div>

                {/* Rating overlay */}
                {item.rating && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      color: 'var(--yellow)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}
                  >
                    {item.rating}/10
                  </div>
                )}
              </div>

              {/* Title */}
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: '4px'
                }}
              >
                {item.title}
              </div>

              {/* Year and type */}
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {item.year} • {item.mediaType === 'tv' ? 'TV' : 'Movie'}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Count */}
      {!loading && filteredItems.length > 0 && (
        <div
          style={{
            textAlign: 'center',
            marginTop: '24px',
            fontSize: '13px',
            color: 'var(--text-secondary)'
          }}
        >
          Showing {filteredItems.length} of {items.length} titles
        </div>
      )}
    </div>
  );
}
