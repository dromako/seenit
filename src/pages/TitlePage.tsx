import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNotes, setNotes, addRecentLookup } from '../lib/storage';
import { getMovieDetails, getTVDetails, getWatchProviders } from '../lib/tmdb';
import { getOMDBData } from '../lib/omdb';
import { searchFreeSources } from '../lib/freeSourcesSearch';
import {
  addToHistory, addToHidden, addToWatchlist, removeFromWatchlist,
  addRating, isTraktAuthenticated, getWatchedMovies, getWatchedShows,
  getHiddenItems, getWatchlist as getTraktWatchlist, getRatings,
  removeFromHistory, removeFromHidden
} from '../lib/trakt';

interface TitleData {
  tmdbId: number;
  imdbId?: string;
  title: string;
  mediaType: 'movie' | 'tv';
  year: number | null;
  posterUrl: string | null;
  runtime?: number;
  overview?: string;
  genres?: string[];
  tmdbRating: number;
  backdropUrl?: string;
  traktIds?: { trakt?: number; slug?: string; imdb?: string; tmdb?: number; tvdb?: number };
}

interface RatingsData {
  imdb: number | null;
  metacritic: number | null;
  rottenTomatoes: string | null;
}

interface FreeSource {
  source: string;
  name: string;
  url: string;
  type: 'free' | 'library';
}

interface WatchProviderInfo {
  name: string;
  logo: string;
}

type TitleStatus = 'watched' | 'hidden' | 'watchlisted' | 'new';

export default function TitlePage() {
  const { tmdbId, mediaType } = useParams<{ tmdbId: string; mediaType: string }>();
  const navigate = useNavigate();

  const [titleData, setTitleData] = useState<TitleData | null>(null);
  const [ratings, setRatings] = useState<RatingsData>({ imdb: null, metacritic: null, rottenTomatoes: null });
  const [freeSources, setFreeSources] = useState<FreeSource[]>([]);
  const [streamingProviders, setStreamingProviders] = useState<WatchProviderInfo[]>([]);
  const [notes, setNotesState] = useState('');
  const [userRating, setUserRating] = useState<number | null>(null);
  const [status, setStatus] = useState<TitleStatus>('new');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratingPrompt, setRatingPrompt] = useState(false);
  const [saving, setSaving] = useState(false);

  // Check user's Trakt status for this title
  const checkTraktStatus = useCallback(async (ids: TitleData['traktIds'], type: 'movie' | 'tv') => {
    if (!isTraktAuthenticated() || !ids?.tmdb) return;

    try {
      const tmdbNum = ids.tmdb;
      const section = type === 'movie' ? 'movies' : 'shows';

      // Check watched
      const watched = type === 'movie' ? await getWatchedMovies() : await getWatchedShows();
      const isWatched = watched.some((w: any) => w.ids?.tmdb === tmdbNum);
      if (isWatched) { setStatus('watched'); }

      // Check hidden
      const hidden = await getHiddenItems(section);
      const isHidden = hidden.some((h: any) => h.ids?.tmdb === tmdbNum);
      if (isHidden) { setStatus('hidden'); }

      // Check watchlist
      const watchlist = await getTraktWatchlist(section);
      const isWatchlisted = watchlist.some((w: any) => w.ids?.tmdb === tmdbNum);
      if (isWatchlisted) { setStatus('watchlisted'); }

      // Check rating
      const ratingsData = await getRatings(section);
      const myRating = ratingsData.find((r: any) =>
        (r as any).movie?.ids?.tmdb === tmdbNum || (r as any).show?.ids?.tmdb === tmdbNum
      );
      if (myRating) {
        setUserRating((myRating as any).rating);
        setStatus('watched');
      }
    } catch (err) {
      console.error('Error checking Trakt status:', err);
    }
  }, []);

  useEffect(() => {
    if (!tmdbId || !mediaType) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const id = parseInt(tmdbId);
        let titleInfo: TitleData;

        // Fetch REAL data from TMDB
        if (mediaType === 'movie') {
          const details = await getMovieDetails(id);
          if (!details || !details.id) {
            setError('Movie not found');
            setLoading(false);
            return;
          }
          titleInfo = {
            tmdbId: details.id,
            imdbId: details.imdb_id || undefined,
            title: details.title || 'Unknown',
            mediaType: 'movie',
            year: details.release_date ? parseInt(details.release_date.substring(0, 4)) : null,
            posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
            runtime: details.runtime || undefined,
            overview: details.overview || undefined,
            genres: details.genres?.map((g: any) => g.name) || [],
            tmdbRating: details.vote_average || 0,
            backdropUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}` : undefined,
            traktIds: { tmdb: details.id, imdb: details.imdb_id || undefined },
          };
        } else {
          const details = await getTVDetails(id);
          if (!details || !details.id) {
            setError('TV show not found');
            setLoading(false);
            return;
          }
          // Get IMDB ID from external IDs
          const imdbId = details.external_ids?.imdb_id || undefined;
          titleInfo = {
            tmdbId: details.id,
            imdbId: imdbId,
            title: details.name || 'Unknown',
            mediaType: 'tv',
            year: details.first_air_date ? parseInt(details.first_air_date.substring(0, 4)) : null,
            posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
            runtime: details.episode_run_time?.[0] || undefined,
            overview: details.overview || undefined,
            genres: details.genres?.map((g: any) => g.name) || [],
            tmdbRating: details.vote_average || 0,
            backdropUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}` : undefined,
            traktIds: { tmdb: details.id, imdb: imdbId, tvdb: details.external_ids?.tvdb_id },
          };
        }

        setTitleData(titleInfo);

        // Load notes from localStorage
        const savedNotes = getNotes(id);
        setNotesState(savedNotes);

        // Add to recent lookups
        addRecentLookup({
          tmdbId: id,
          title: titleInfo.title,
          posterPath: titleInfo.posterUrl || undefined,
          mediaType: titleInfo.mediaType,
        });

        // Fetch OMDB ratings if imdbId available
        if (titleInfo.imdbId) {
          try {
            const omdbRatings = await getOMDBData(titleInfo.imdbId);
            if (omdbRatings) setRatings(omdbRatings);
          } catch (err) {
            console.error('OMDB fetch failed:', err);
          }
        }

        // Fetch free sources
        try {
          const sources = await searchFreeSources(
            titleInfo.title,
            titleInfo.year,
            id,
            titleInfo.mediaType,
          );
          setFreeSources(sources);
        } catch (err) {
          console.error('Free sources fetch failed:', err);
        }

        // Fetch streaming providers
        try {
          const providers = await getWatchProviders(id, titleInfo.mediaType);
          if (providers?.results?.US) {
            const us = providers.results.US;
            const allProviders: WatchProviderInfo[] = [];
            const seen = new Set<string>();
            for (const list of [us.flatrate, us.free, us.ads, us.rent, us.buy]) {
              if (list) {
                for (const p of list) {
                  if (!seen.has(p.provider_name)) {
                    seen.add(p.provider_name);
                    allProviders.push({
                      name: p.provider_name,
                      logo: `https://image.tmdb.org/t/p/w92${p.logo_path}`,
                    });
                  }
                }
              }
            }
            setStreamingProviders(allProviders);
          }
        } catch (err) {
          console.error('Watch providers fetch failed:', err);
        }

        // Check Trakt status
        await checkTraktStatus(titleInfo.traktIds, titleInfo.mediaType);
      } catch (err) {
        console.error('Error loading title:', err);
        setError('Failed to load title details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [tmdbId, mediaType, checkTraktStatus]);

  // Build Trakt item shape for API calls
  const buildTraktItem = () => {
    if (!titleData) return null;
    return {
      title: titleData.title,
      year: titleData.year || 0,
      ids: {
        tmdb: titleData.tmdbId,
        imdb: titleData.imdbId || undefined,
        ...(titleData.traktIds || {}),
      },
    };
  };

  const handleMarkWatched = () => {
    if (status === 'watched') {
      // Undo watched
      const item = buildTraktItem();
      if (item && isTraktAuthenticated()) {
        setSaving(true);
        removeFromHistory(item).finally(() => setSaving(false));
      }
      setStatus('new');
      setUserRating(null);
      return;
    }
    setRatingPrompt(true);
  };

  const handleSubmitRating = async (rating: number) => {
    setUserRating(rating);
    setStatus('watched');
    setRatingPrompt(false);

    const item = buildTraktItem();
    if (item && isTraktAuthenticated()) {
      setSaving(true);
      try {
        await addToHistory(item);
        await addRating(item, rating);
      } catch (err) {
        console.error('Error saving to Trakt:', err);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleSkipRating = async () => {
    setStatus('watched');
    setRatingPrompt(false);

    const item = buildTraktItem();
    if (item && isTraktAuthenticated()) {
      setSaving(true);
      try {
        await addToHistory(item);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleMarkHidden = async () => {
    const item = buildTraktItem();
    if (status === 'hidden') {
      // Undo hidden
      if (item && isTraktAuthenticated()) {
        setSaving(true);
        const section = titleData?.mediaType === 'tv' ? 'shows' : 'movies';
        await removeFromHidden(item, section as 'movies' | 'shows');
        setSaving(false);
      }
      setStatus('new');
      return;
    }

    setStatus('hidden');
    if (item && isTraktAuthenticated()) {
      setSaving(true);
      const section = titleData?.mediaType === 'tv' ? 'shows' : 'movies';
      await addToHidden(item, section as 'movies' | 'shows');
      setSaving(false);
    }
  };

  const handleMarkWatchlist = async () => {
    const item = buildTraktItem();
    if (status === 'watchlisted') {
      if (item && isTraktAuthenticated()) {
        setSaving(true);
        await removeFromWatchlist(item);
        setSaving(false);
      }
      setStatus('new');
      return;
    }

    setStatus('watchlisted');
    if (item && isTraktAuthenticated()) {
      setSaving(true);
      await addToWatchlist(item);
      setSaving(false);
    }
  };

  const saveNotes = (newNotes: string) => {
    setNotes(parseInt(tmdbId!), newNotes);
    setNotesState(newNotes);
  };

  const getStatusBanner = () => {
    switch (status) {
      case 'watched':
        return {
          bg: 'rgba(34, 197, 94, 0.1)',
          color: 'var(--green)',
          text: `✅ YOU'VE SEEN THIS${userRating ? ` — Rated ${userRating}/10` : ''}`,
        };
      case 'hidden':
        return {
          bg: 'rgba(239, 68, 68, 0.1)',
          color: 'var(--red)',
          text: '❌ NEVER WATCHING',
        };
      case 'watchlisted':
        return {
          bg: 'rgba(59, 130, 246, 0.1)',
          color: 'var(--blue)',
          text: '📋 ON YOUR WATCHLIST',
        };
      default:
        return {
          bg: 'rgba(152, 152, 176, 0.1)',
          color: 'var(--text-secondary)',
          text: '🆕 NEW TO YOU',
        };
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', maxWidth: '480px', margin: '0 auto', textAlign: 'center', paddingTop: '60px' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading title details...</div>
      </div>
    );
  }

  if (error || !titleData) {
    return (
      <div style={{ padding: '16px', maxWidth: '480px', margin: '0 auto', textAlign: 'center', paddingTop: '60px' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>❌</div>
        <div style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>{error || 'Title not found'}</div>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '12px 24px', backgroundColor: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          Go Home
        </button>
      </div>
    );
  }

  const banner = getStatusBanner();

  return (
    <div style={{ padding: '0', maxWidth: '480px', margin: '0 auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 16px))' }}>
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        style={{
          position: 'sticky', top: '0', left: '16px', background: 'rgba(10, 10, 15, 0.9)',
          border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '20px',
          padding: '12px', zIndex: 10, borderRadius: '8px', margin: '8px 0 0 8px',
        }}
      >
        ←
      </button>

      {/* Status Banner */}
      <div style={{
        backgroundColor: banner.bg, color: banner.color, padding: '16px', margin: '16px',
        borderRadius: '8px', fontSize: '14px', fontWeight: '500', textAlign: 'center',
      }}>
        {banner.text}
        {saving && <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.7 }}>saving...</span>}
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Hero Section */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
          <div style={{
            width: '120px', height: '180px', borderRadius: '8px', overflow: 'hidden',
            backgroundColor: 'var(--bg-card)', flexShrink: 0,
          }}>
            {titleData.posterUrl ? (
              <img
                src={titleData.posterUrl}
                alt={titleData.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '40px', color: 'var(--text-secondary)',
              }}>
                🎬
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
              {titleData.title}
            </h1>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
              {titleData.year} {titleData.runtime ? `• ${titleData.runtime} min` : ''}
            </div>
            <div style={{ marginBottom: '8px', fontSize: '12px' }}>
              <span style={{
                backgroundColor: 'var(--accent)', color: 'white', padding: '4px 8px',
                borderRadius: '4px', marginRight: '4px',
              }}>
                {titleData.mediaType === 'tv' ? 'TV' : 'Movie'}
              </span>
            </div>
            {titleData.genres && titleData.genres.length > 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {titleData.genres.join(', ')}
              </div>
            )}
          </div>
        </div>

        {/* Ratings Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '24px' }}>
          <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '600', color: ratings.imdb ? 'var(--yellow)' : 'var(--text-secondary)' }}>
              {ratings.imdb ? ratings.imdb.toFixed(1) : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>IMDB</div>
          </div>
          <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
            <div style={{
              fontSize: '18px', fontWeight: '600',
              color: ratings.metacritic ? (ratings.metacritic >= 60 ? 'var(--green)' : ratings.metacritic >= 40 ? 'var(--yellow)' : 'var(--red)') : 'var(--text-secondary)',
            }}>
              {ratings.metacritic || '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Metacritic</div>
          </div>
          <div className="card" style={{ padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '600', color: titleData.tmdbRating > 0 ? 'var(--blue)' : 'var(--text-secondary)' }}>
              {titleData.tmdbRating > 0 ? titleData.tmdbRating.toFixed(1) : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>TMDB</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '24px' }}>
          <button
            onClick={handleMarkWatched}
            disabled={saving}
            style={{
              padding: '12px',
              backgroundColor: status === 'watched' ? 'var(--green)' : 'rgba(34, 197, 94, 0.2)',
              color: status === 'watched' ? 'white' : 'var(--green)',
              border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', fontSize: '14px',
              opacity: saving ? 0.6 : 1,
            }}
          >
            ✓ Seen It
          </button>
          <button
            onClick={handleMarkHidden}
            disabled={saving}
            style={{
              padding: '12px',
              backgroundColor: status === 'hidden' ? 'var(--red)' : 'rgba(239, 68, 68, 0.2)',
              color: status === 'hidden' ? 'white' : 'var(--red)',
              border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', fontSize: '14px',
              opacity: saving ? 0.6 : 1,
            }}
          >
            ✕ Never
          </button>
          <button
            onClick={handleMarkWatchlist}
            disabled={saving}
            style={{
              padding: '12px',
              backgroundColor: status === 'watchlisted' ? 'var(--blue)' : 'rgba(59, 130, 246, 0.2)',
              color: status === 'watchlisted' ? 'white' : 'var(--blue)',
              border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer', fontSize: '14px',
              opacity: saving ? 0.6 : 1,
            }}
          >
            + Watchlist
          </button>
        </div>

        {!isTraktAuthenticated() && (
          <div style={{
            padding: '12px', marginBottom: '16px', backgroundColor: 'rgba(251, 191, 36, 0.1)',
            borderRadius: '8px', fontSize: '13px', color: 'var(--yellow)', textAlign: 'center',
          }}>
            Connect Trakt in Settings to sync your watches and ratings
          </div>
        )}

        {/* Rating Prompt Modal */}
        {ratingPrompt && (
          <div style={{
            backgroundColor: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px', padding: '16px', marginBottom: '24px',
          }}>
            <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px', color: 'var(--text-primary)' }}>
              How would you rate this? (1-10)
            </div>
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '12px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  onClick={() => handleSubmitRating(num)}
                  style={{
                    width: '32px', height: '32px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    fontSize: '13px', fontWeight: '600',
                    backgroundColor: num <= (userRating || 0) ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                    color: num <= (userRating || 0) ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  {num}
                </button>
              ))}
            </div>
            <button
              onClick={handleSkipRating}
              style={{
                width: '100%', padding: '10px', backgroundColor: 'transparent',
                border: '1px solid var(--text-secondary)', color: 'var(--text-secondary)',
                borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
              }}
            >
              Mark as watched without rating
            </button>
          </div>
        )}

        {/* Overview */}
        {titleData.overview && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
              Overview
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0' }}>
              {titleData.overview}
            </p>
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Notes
          </h2>
          <textarea
            placeholder="Add a note... (e.g. 'John recommended this', 'Watch with Sarah')"
            value={notes}
            onChange={(e) => saveNotes(e.target.value)}
            style={{
              width: '100%', minHeight: '80px', padding: '12px', backgroundColor: 'var(--bg-card)',
              border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: 'var(--text-primary)',
              resize: 'vertical', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Free Sources */}
        {freeSources.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
              🆓 Where to Watch Free
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {freeSources.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card"
                  style={{
                    padding: '12px', textDecoration: 'none', color: 'var(--text-primary)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{source.name}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {source.type === 'library' ? '🎫 Library' : '📺 Free'}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Streaming Providers */}
        {streamingProviders.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
              📺 Also Available On
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {streamingProviders.slice(0, 8).map((p, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px',
                  backgroundColor: 'var(--bg-card)', borderRadius: '6px', fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}>
                  <img src={p.logo} alt={p.name} style={{ width: '20px', height: '20px', borderRadius: '4px' }} />
                  {p.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Links */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '24px' }}>
          {titleData.imdbId && (
            <>
              <a
                href={`https://imdb.com/title/${titleData.imdbId}`}
                target="_blank" rel="noopener noreferrer"
                className="card"
                style={{ padding: '12px', textAlign: 'center', textDecoration: 'none', color: 'var(--text-primary)', fontSize: '13px' }}
              >
                IMDB ↗
              </a>
              <a
                href={`https://imdb.com/title/${titleData.imdbId}/rate`}
                target="_blank" rel="noopener noreferrer"
                className="card"
                style={{ padding: '12px', textAlign: 'center', textDecoration: 'none', color: 'var(--text-primary)', fontSize: '13px' }}
              >
                Rate on IMDB ↗
              </a>
            </>
          )}
          <a
            href={`https://letterboxd.com/search/${encodeURIComponent(titleData.title)}/`}
            target="_blank" rel="noopener noreferrer"
            className="card"
            style={{ padding: '12px', textAlign: 'center', textDecoration: 'none', color: 'var(--text-primary)', fontSize: '13px' }}
          >
            Letterboxd ↗
          </a>
        </div>
      </div>
    </div>
  );
}
