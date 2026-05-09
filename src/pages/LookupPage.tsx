import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { searchTMDB } from '../lib/tmdb';
import { isTraktAuthenticated, getWatchedMovies, getWatchedShows, getHiddenItems, getWatchlist } from '../lib/trakt';

interface SearchResult {
  id: number;
  title: string;
  media_type: string;
  year: number | null;
  poster_path: string | null;
  traktStatus?: 'watched' | 'hidden' | 'watchlisted';
}

export default function LookupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setError('No search query provided');
      setLoading(false);
      return;
    }

    const performSearch = async () => {
      setLoading(true);
      setError(null);
      try {
        const tmdbResults = await searchTMDB(query, 'multi');

        // Filter to only movie/tv (exclude person results) and normalize media_type
        const formatted: SearchResult[] = tmdbResults
          .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
          .map((item) => ({
            id: item.id,
            title: item.title,
            media_type: item.media_type,
            year: item.year,
            poster_path: item.poster_path,
            traktStatus: undefined,
          }));

        // Fetch Trakt data if authenticated
        if (isTraktAuthenticated()) {
          try {
            const watchedMovies = await getWatchedMovies();
            const watchedShows = await getWatchedShows();
            const hiddenMovies = await getHiddenItems('movies');
            const hiddenShows = await getHiddenItems('shows');
            const watchlistMovies = await getWatchlist('movies');
            const watchlistShows = await getWatchlist('shows');

            const dataMap = new Map<string, 'watched' | 'hidden' | 'watchlisted'>();

            // Build map of TMDB ID -> Trakt status
            watchedMovies.forEach(item => {
              if (item.ids.tmdb) dataMap.set(`movie-${item.ids.tmdb}`, 'watched');
            });
            watchedShows.forEach(item => {
              if (item.ids.tmdb) dataMap.set(`tv-${item.ids.tmdb}`, 'watched');
            });
            hiddenMovies.forEach(item => {
              if (item.ids.tmdb) dataMap.set(`movie-${item.ids.tmdb}`, 'hidden');
            });
            hiddenShows.forEach(item => {
              if (item.ids.tmdb) dataMap.set(`tv-${item.ids.tmdb}`, 'hidden');
            });
            watchlistMovies.forEach(item => {
              if (item.ids.tmdb) dataMap.set(`movie-${item.ids.tmdb}`, 'watchlisted');
            });
            watchlistShows.forEach(item => {
              if (item.ids.tmdb) dataMap.set(`tv-${item.ids.tmdb}`, 'watchlisted');
            });

            // Cross-reference results with Trakt data
            formatted.forEach(result => {
              const key = `${result.media_type}-${result.id}`;
              result.traktStatus = dataMap.get(key);
            });
          } catch (traktErr) {
            console.error('Error fetching Trakt data:', traktErr);
          }
        }

        setResults(formatted);

        // If only one strong match, auto-navigate
        if (formatted.length === 1) {
          setTimeout(() => {
            navigate(`/title/${formatted[0].id}/${formatted[0].media_type}`);
          }, 300);
        }
      } catch (err) {
        console.error('Search error:', err);
        setError('Failed to search. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    performSearch();
  }, [query, navigate]);

  return (
    <div style={{
      padding: '16px',
      maxWidth: '480px',
      margin: '0 auto',
      paddingBottom: 'env(safe-area-inset-bottom, 16px)'
    }}>
      {/* Back button and search query */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '16px',
            marginBottom: '8px'
          }}
        >
          ← Back
        </button>
        <h1 style={{
          fontSize: '20px',
          fontWeight: '600',
          color: 'var(--text-primary)',
          margin: '0'
        }}>
          Results for "{query}"
        </h1>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '40px 16px',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
          <div>Searching...</div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderRadius: '8px',
          padding: '16px',
          color: 'var(--red)',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      {/* No results */}
      {!loading && !error && results.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px 16px',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>🔍</div>
          <div>No results found. Try a different search.</div>
        </div>
      )}

      {/* Results list */}
      {!loading && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {results.map((result) => (
            <button
              key={`${result.id}-${result.media_type}`}
              onClick={() => navigate(`/title/${result.id}/${result.media_type}`)}
              className="card"
              style={{
                display: 'flex',
                gap: '12px',
                padding: '12px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'background 0.15s'
              }}
            >
              {/* Poster thumbnail */}
              {result.poster_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w200${result.poster_path}`}
                  alt={result.title}
                  style={{
                    width: '48px', height: '72px', borderRadius: '6px',
                    objectFit: 'cover', backgroundColor: 'var(--bg-secondary)', flexShrink: 0,
                  }}
                />
              ) : (
                <div style={{
                  width: '48px', height: '72px', borderRadius: '6px',
                  backgroundColor: 'var(--bg-secondary)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', color: 'var(--text-secondary)',
                }}>
                  🎬
                </div>
              )}

              {/* Title and details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '15px',
                  fontWeight: '500',
                  color: 'var(--text-primary)',
                  marginBottom: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {result.title}
                  {result.traktStatus === 'watched' && (
                    <span title="Watched" style={{ fontSize: '16px' }}>✅</span>
                  )}
                  {result.traktStatus === 'hidden' && (
                    <span title="Hidden" style={{ fontSize: '16px', color: 'var(--red)' }}>❌</span>
                  )}
                  {result.traktStatus === 'watchlisted' && (
                    <span title="Watchlisted" style={{ fontSize: '16px' }}>📋</span>
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)'
                }}>
                  {result.year && <span>{result.year}</span>}
                  <span className={`status-${result.media_type === 'tv' ? 'watchlisted' : 'new'}`}
                    style={{ textTransform: 'uppercase', fontSize: '11px' }}>
                    {result.media_type === 'tv' ? 'TV' : 'Movie'}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-secondary)',
                fontSize: '16px'
              }}>
                →
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
