import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTraktToken } from '../lib/storage';
import { getTraktProfile } from '../lib/trakt';

interface ApiStatus {
  tmdb: boolean;
  omdb: boolean;
  youtube: boolean;
  trakt: boolean;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [traktConnected, setTraktConnected] = useState(false);
  const [traktUsername, setTraktUsername] = useState('');
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    tmdb: false,
    omdb: false,
    youtube: false,
    trakt: false
  });
  const [libraryCard, setLibraryCard] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check Trakt connection
    const token = getTraktToken();
    setTraktConnected(!!token);
    if (token) {
      getTraktProfile().then(profile => {
        if (profile) setTraktUsername(profile.username);
        else setTraktUsername('Connected');
      });
    }

    // Check API keys
    const tmdbKey = import.meta.env.VITE_TMDB_API_KEY;
    const omdbKey = import.meta.env.VITE_OMDB_API_KEY;
    const youtubeKey = import.meta.env.VITE_YOUTUBE_API_KEY;

    setApiStatus({
      tmdb: !!tmdbKey,
      omdb: !!omdbKey,
      youtube: !!youtubeKey,
      trakt: traktConnected
    });

    // Load library card from localStorage
    const saved = localStorage.getItem('seenit_library_card');
    if (saved) {
      setLibraryCard(saved);
    }

    setLoading(false);
  }, [traktConnected]);

  const handleConnectTrakt = () => {
    navigate('/auth/trakt');
  };

  const handleDisconnectTrakt = () => {
    localStorage.removeItem('seenit_trakt_token');
    setTraktConnected(false);
  };

  const handleLibraryCardSave = () => {
    if (libraryCard.trim()) {
      localStorage.setItem('seenit_library_card', libraryCard);
    } else {
      localStorage.removeItem('seenit_library_card');
    }
  };

  const getApiStatusColor = (status: boolean) => {
    return status ? 'var(--green)' : 'var(--text-secondary)';
  };

  const getApiStatusText = (status: boolean) => {
    return status ? 'Connected' : 'Not configured';
  };

  if (loading) {
    return (
      <div style={{
        padding: '16px',
        maxWidth: '480px',
        margin: '0 auto',
        textAlign: 'center',
        paddingTop: '40px'
      }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    );
  }

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
        marginBottom: '24px'
      }}>
        Settings
      </h1>

      {/* Trakt Connection Section */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{
          fontSize: '14px',
          fontWeight: '600',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-secondary)'
        }}>
          Trakt.tv Sync
        </h2>

        {traktConnected ? (
          <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px'
            }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
                  Connected as
                </div>
                <div style={{ fontSize: '13px', color: 'var(--green)', marginTop: '4px' }}>
                  {traktUsername}
                </div>
              </div>
              <div style={{ fontSize: '20px' }}>✅</div>
            </div>
            <button
              onClick={handleDisconnectTrakt}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: 'transparent',
                border: '1px solid var(--red)',
                color: 'var(--red)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500'
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: '16px' }}>
            <div style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginBottom: '12px'
            }}>
              Sync your watched movies, ratings, and watchlist with Trakt.tv
            </div>
            <button
              onClick={handleConnectTrakt}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Connect Trakt
            </button>
          </div>
        )}
      </div>

      {/* API Status Section */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{
          fontSize: '14px',
          fontWeight: '600',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-secondary)'
        }}>
          API Status
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { name: 'TMDB', key: 'tmdb', status: apiStatus.tmdb },
            { name: 'OMDB', key: 'omdb', status: apiStatus.omdb },
            { name: 'YouTube', key: 'youtube', status: apiStatus.youtube }
          ].map((api) => (
            <div
              key={api.key}
              className="card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px'
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)' }}>
                  {api.name}
                </div>
                <div style={{ fontSize: '12px', color: getApiStatusColor(api.status), marginTop: '4px' }}>
                  {getApiStatusText(api.status)}
                </div>
              </div>
              <div style={{
                fontSize: '18px',
                color: getApiStatusColor(api.status)
              }}>
                {api.status ? '●' : '○'}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginTop: '12px',
          padding: '8px',
          backgroundColor: 'rgba(152, 152, 176, 0.05)',
          borderRadius: '6px'
        }}>
          API keys are configured via environment variables. See documentation for setup.
        </div>
      </div>

      {/* Library Card Section */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{
          fontSize: '14px',
          fontWeight: '600',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-secondary)'
        }}>
          Library Card
        </h2>

        <div className="card" style={{ padding: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            marginBottom: '8px'
          }}>
            Library name (for Kanopy & Hoopla)
          </label>
          <input
            type="text"
            placeholder="e.g., San Francisco Public Library"
            value={libraryCard}
            onChange={(e) => setLibraryCard(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              marginBottom: '12px'
            }}
          />
          <button
            onClick={handleLibraryCardSave}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'var(--blue)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            Save
          </button>
        </div>
      </div>

      {/* Import Section */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{
          fontSize: '14px',
          fontWeight: '600',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-secondary)'
        }}>
          Import
        </h2>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '8px' }}>
              IMDB Ratings
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.5' }}>
              Import your IMDB ratings and watchlist via Trakt. Ratings are synced automatically when Trakt is connected.
            </div>
            <a
              href="https://trakt.tv/users/settings/connections"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '10px 16px',
                backgroundColor: 'transparent',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                textDecoration: 'none'
              }}
            >
              Open Trakt Import
            </a>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{
          fontSize: '14px',
          fontWeight: '600',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-secondary)'
        }}>
          About
        </h2>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
              SeenIt
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              v0.1.0
            </div>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            A movie and TV tracking app with Trakt.tv integration. Find free viewing options and manage your watchlist.
          </div>

          <div style={{
            display: 'flex',
            gap: '8px',
            marginTop: '12px'
          }}>
            <a
              href="https://github.com/dromako/seenit"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                fontSize: '12px',
                textDecoration: 'none',
                cursor: 'pointer'
              }}
            >
              GitHub
            </a>
            <a
              href="https://trakt.tv"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                textAlign: 'center',
                fontSize: '12px',
                textDecoration: 'none',
                cursor: 'pointer'
              }}
            >
              Trakt
            </a>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: '24px'
      }}>
        <button
          onClick={() => {
            if (confirm('Clear all local data? This cannot be undone.')) {
              localStorage.clear();
              alert('All data cleared.');
            }
          }}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: 'transparent',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          Clear All Local Data
        </button>
      </div>
    </div>
  );
}
