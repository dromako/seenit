import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRecentLookups } from '../lib/storage';
import { isTraktAuthenticated, getWatchedMovies, getWatchedShows, getHiddenItems, getWatchlist } from '../lib/trakt';
import { cacheGet, cacheSet } from '../lib/storage';
import type { RecentLookup } from '../types';

export default function HomePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [recentLookups, setRecentLookups] = useState<RecentLookup[]>([]);
  const [stats, setStats] = useState({ watched: 0, hidden: 0, watchlisted: 0 });
  const [listening, setListening] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    const recent = getRecentLookups();
    setRecentLookups(recent);

    // Load stats from Trakt (with cache)
    if (isTraktAuthenticated()) {
      const cached = cacheGet<{ watched: number; hidden: number; watchlisted: number }>('home_stats');
      if (cached) {
        setStats(cached);
      }

      setStatsLoading(true);
      Promise.all([
        getWatchedMovies(),
        getWatchedShows(),
        getHiddenItems('movies'),
        getWatchlist('movies'),
        getWatchlist('shows'),
      ]).then(([watchedMovies, watchedShows, hidden, watchlistMovies, watchlistShows]) => {
        const newStats = {
          watched: watchedMovies.length + watchedShows.length,
          hidden: hidden.length,
          watchlisted: watchlistMovies.length + watchlistShows.length,
        };
        setStats(newStats);
        cacheSet('home_stats', newStats, 5); // cache 5 minutes
      }).catch(err => {
        console.error('Error loading stats:', err);
      }).finally(() => {
        setStatsLoading(false);
      });
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/lookup?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Graceful fallback instead of alert
      const el = document.querySelector('input[type="text"]') as HTMLInputElement;
      if (el) el.focus();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      navigate(`/lookup?q=${encodeURIComponent(transcript)}`);
    };
    recognition.onerror = () => setListening(false);
    recognition.start();
  };

  return (
    <div style={{
      padding: '16px', maxWidth: '480px', margin: '0 auto',
      paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 16px))',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '8px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', margin: '0' }}>
          SeenIt
        </h1>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Point. Identify. Know.
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex', gap: '8px', backgroundColor: 'var(--bg-card)',
          borderRadius: '12px', padding: '12px', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <input
            type="text"
            placeholder="Search movies & TV..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: 'var(--text-primary)', fontSize: '16px', outline: 'none',
            }}
          />
          <button type="submit" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-secondary)' }} title="Search">
            🔍
          </button>
          <button
            type="button" onClick={handleVoiceSearch} disabled={listening}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px',
              color: listening ? 'var(--red)' : 'var(--text-secondary)', opacity: listening ? 1 : 0.7,
            }}
            title="Voice search"
          >
            🎤
          </button>
        </div>
      </form>

      {/* Free Tonight Button */}
      <button
        onClick={() => navigate('/history?tab=watchlist&filter=free')}
        style={{
          width: '100%', padding: '16px', backgroundColor: 'var(--bg-card)',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px',
          color: 'var(--text-primary)', fontSize: '16px', fontWeight: '500',
          cursor: 'pointer', marginBottom: '20px',
        }}
      >
        🍿 Free Tonight
      </button>

      {/* Stats Row */}
      {isTraktAuthenticated() && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          <div className="card" style={{ padding: '16px', textAlign: 'center', cursor: 'pointer' }} onClick={() => navigate('/history?tab=watched')}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--green)', opacity: statsLoading ? 0.5 : 1 }}>
              {stats.watched}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Watched</div>
          </div>
          <div className="card" style={{ padding: '16px', textAlign: 'center', cursor: 'pointer' }} onClick={() => navigate('/history?tab=hidden')}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--red)', opacity: statsLoading ? 0.5 : 1 }}>
              {stats.hidden}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Hidden</div>
          </div>
          <div className="card" style={{ padding: '16px', textAlign: 'center', cursor: 'pointer' }} onClick={() => navigate('/history?tab=watchlist')}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--blue)', opacity: statsLoading ? 0.5 : 1 }}>
              {stats.watchlisted}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Watchlist</div>
          </div>
        </div>
      )}

      {!isTraktAuthenticated() && (
        <button
          onClick={() => navigate('/settings')}
          className="card"
          style={{
            width: '100%', padding: '16px', textAlign: 'center', marginBottom: '24px',
            border: '1px dashed rgba(99, 102, 241, 0.4)', cursor: 'pointer',
            color: 'var(--accent)', fontSize: '14px', backgroundColor: 'rgba(99, 102, 241, 0.05)',
            borderRadius: '12px',
          }}
        >
          Connect Trakt to track your watches →
        </button>
      )}

      {/* Recent Lookups Grid */}
      {recentLookups.length > 0 && (
        <>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>
            Recent Lookups
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {recentLookups.map((item) => (
              <button
                key={`${item.tmdbId}-${item.mediaType}`}
                onClick={() => navigate(`/title/${item.tmdbId}/${item.mediaType}`)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', textAlign: 'left' }}
              >
                <div style={{ position: 'relative' }}>
                  {item.posterPath ? (
                    <img
                      src={item.posterPath}
                      alt={item.title}
                      style={{
                        width: '100%', borderRadius: '8px', aspectRatio: '2/3',
                        objectFit: 'cover', backgroundColor: 'var(--bg-card)',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '100%', aspectRatio: '2/3', borderRadius: '8px',
                      backgroundColor: 'var(--bg-card)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '28px', color: 'var(--text-secondary)',
                    }}>
                      🎬
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: '12px', marginTop: '6px', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)',
                }}>
                  {item.title}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {recentLookups.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 16px', fontSize: '14px' }}>
          Search for movies and TV shows to get started!
        </div>
      )}
    </div>
  );
}
