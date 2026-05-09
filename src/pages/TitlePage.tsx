import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNotes, setNotes, addRecentLookup } from '../lib/storage';
import { getMovieDetails, getTVDetails, getWatchProviders } from '../lib/tmdb';
import { getOMDBData } from '../lib/omdb';

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

interface WatchProviderInfo {
  name: string;
  logo: string;
  type: 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';
  url: string;
}

/**
 * Provider URL map — uses iOS universal links where possible.
 * When the app is installed on iPhone, iOS intercepts these URLs
 * and opens the native app instead of Safari. Native apps have
 * built-in AirPlay, Roku cast, and Chromecast support.
 */
const PROVIDER_URLS: Record<string, (title: string) => string> = {
  'Netflix': (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  'Amazon Prime Video': (t) => `https://app.primevideo.com/search?phrase=${encodeURIComponent(t)}`,
  'Disney Plus': (t) => `https://www.disneyplus.com/search/${encodeURIComponent(t)}`,
  'Hulu': (t) => `https://www.hulu.com/search?q=${encodeURIComponent(t)}`,
  'Max': (t) => `https://play.max.com/search?q=${encodeURIComponent(t)}`,
  'HBO Max': (t) => `https://play.max.com/search?q=${encodeURIComponent(t)}`,
  'Apple TV Plus': (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
  'Apple TV': (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
  'Peacock': (t) => `https://www.peacocktv.com/watch/search?q=${encodeURIComponent(t)}`,
  'Peacock Premium': (t) => `https://www.peacocktv.com/watch/search?q=${encodeURIComponent(t)}`,
  'Paramount Plus': (t) => `https://www.paramountplus.com/search/?q=${encodeURIComponent(t)}`,
  'Paramount+ with Showtime': (t) => `https://www.paramountplus.com/search/?q=${encodeURIComponent(t)}`,
  'Tubi TV': (t) => `https://tubitv.com/search/${encodeURIComponent(t)}`,
  'Pluto TV': (t) => `https://pluto.tv/search/details/${encodeURIComponent(t)}`,
  'Crunchyroll': (t) => `https://www.crunchyroll.com/search?q=${encodeURIComponent(t)}`,
  'YouTube': (t) => `https://www.youtube.com/results?search_query=${encodeURIComponent(t + ' full movie')}`,
  'YouTube TV': (t) => `https://tv.youtube.com/search?q=${encodeURIComponent(t)}`,
  'YouTube Premium': (t) => `https://www.youtube.com/results?search_query=${encodeURIComponent(t + ' full movie')}`,
  'Vudu': (t) => `https://www.vudu.com/content/movies/search?searchString=${encodeURIComponent(t)}`,
  'Fandango At Home': (t) => `https://www.vudu.com/content/movies/search?searchString=${encodeURIComponent(t)}`,
  'Google Play Movies': (t) => `https://play.google.com/store/search?q=${encodeURIComponent(t)}&c=movies`,
  'Microsoft Store': (t) => `https://www.microsoft.com/en-us/search/shop/movies-tv?q=${encodeURIComponent(t)}`,
  'Amazon Video': (t) => `https://app.primevideo.com/search?phrase=${encodeURIComponent(t)}`,
  'Starz': (t) => `https://www.starz.com/search?q=${encodeURIComponent(t)}`,
  'Showtime': (t) => `https://www.sho.com/search?q=${encodeURIComponent(t)}`,
  'Mubi': (t) => `https://mubi.com/en/search?query=${encodeURIComponent(t)}`,
  'The Roku Channel': (t) => `https://therokuchannel.roku.com/search?q=${encodeURIComponent(t)}`,
  'Plex': (t) => `https://watch.plex.tv/search?query=${encodeURIComponent(t)}`,
  'Kanopy': (t) => `https://www.kanopy.com/search?query=${encodeURIComponent(t)}`,
  'Hoopla': (t) => `https://www.hoopladigital.com/search?q=${encodeURIComponent(t)}&type=movie`,
};

function getProviderUrl(providerName: string, title: string, justWatchLink?: string): string {
  const mapper = PROVIDER_URLS[providerName];
  if (mapper) return mapper(title);
  if (justWatchLink) return justWatchLink;
  return `https://www.google.com/search?q=${encodeURIComponent(`watch ${title} on ${providerName}`)}`;
}

/**
 * Open a streaming provider — navigates via location.href so iOS
 * can intercept the URL and open the native app (universal link).
 * target="_blank" anchors bypass this and always open Safari.
 */
function openProvider(url: string) {
  window.location.href = url;
}

type TitleStatus = 'watched' | 'hidden' | 'watchlisted' | 'new';

export default function TitlePage() {
  const { tmdbId, mediaType } = useParams<{ tmdbId: string; mediaType: string }>();
  const navigate = useNavigate();

  const [titleData, setTitleData] = useState<TitleData | null>(null);
  const [ratings, setRatings] = useState<RatingsData>({ imdb: null, metacritic: null, rottenTomatoes: null });
  const [streamingProviders, setStreamingProviders] = useState<WatchProviderInfo[]>([]);
  const [justWatchLink, setJustWatchLink] = useState<string | null>(null);
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

        // Fetch OMDB ratings — retry-enabled, with TMDB fallback
        if (titleInfo.imdbId) {
          try {
            const omdbRatings = await getOMDBData(titleInfo.imdbId);
            // If OMDB returned nothing useful, fall back to TMDB's score
            if (omdbRatings && (omdbRatings.imdb || omdbRatings.metacritic)) {
              setRatings(omdbRatings);
            } else if (titleInfo.tmdbRating > 0) {
              setRatings({ imdb: Math.round(titleInfo.tmdbRating * 10) / 10, metacritic: null, rottenTomatoes: null });
            }
          } catch (err) {
            console.warn('[Ratings] OMDB failed, using TMDB fallback:', err);
            if (titleInfo.tmdbRating > 0) {
              setRatings({ imdb: Math.round(titleInfo.tmdbRating * 10) / 10, metacritic: null, rottenTomatoes: null });
            }
          }
        } else if (titleInfo.tmdbRating > 0) {
          // No IMDB ID at all — use TMDB rating directly
          setRatings({ imdb: Math.round(titleInfo.tmdbRating * 10) / 10, metacritic: null, rottenTomatoes: null });
        }

        // Fetch streaming providers
        try {
          const providers = await getWatchProviders(id, titleInfo.mediaType);
          if (providers?.results?.US) {
            const us = providers.results.US;
            if (us.link) setJustWatchLink(us.link);
            const allProviders: WatchProviderInfo[] = [];
            const seen = new Set<string>();
            const categories: Array<{ list: typeof us.flatrate; type: WatchProviderInfo['type'] }> = [
              { list: us.free, type: 'free' },
              { list: us.flatrate, type: 'flatrate' },
              { list: us.ads, type: 'ads' },
              { list: us.rent, type: 'rent' },
              { list: us.buy, type: 'buy' },
            ];
            for (const { list, type } of categories) {
              if (list) {
                for (const p of list) {
                  if (!seen.has(p.provider_name)) {
                    seen.add(p.provider_name);
                    allProviders.push({
                      name: p.provider_name,
                      logo: `https://image.tmdb.org/t/p/w92${p.logo_path}`,
                      type,
                      url: getProviderUrl(p.provider_name, titleInfo.title, us.link),
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
          text: `SEEN${userRating ? ` · ${userRating}/10` : ''}`,
        };
      case 'hidden':
        return {
          bg: 'rgba(239, 68, 68, 0.1)',
          color: 'var(--red)',
          text: 'HIDDEN',
        };
      case 'watchlisted':
        return {
          bg: 'rgba(59, 130, 246, 0.1)',
          color: 'var(--blue)',
          text: 'WATCHLIST',
        };
      default:
        return {
          bg: 'rgba(152, 152, 176, 0.1)',
          color: 'var(--text-secondary)',
          text: 'NEW TO YOU',
        };
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', maxWidth: '480px', margin: '0 auto', textAlign: 'center', paddingTop: '60px' }}>
        <div style={{ width: 24, height: 24, border: '2px solid var(--text-secondary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', margin: '0 auto 16px' }} />
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading...</div>
      </div>
    );
  }

  if (error || !titleData) {
    return (
      <div style={{ padding: '16px', maxWidth: '480px', margin: '0 auto', textAlign: 'center', paddingTop: '60px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--red)', marginBottom: '16px' }}>Error</div>
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
      {/* ── Cinematic Backdrop Header ── */}
      {titleData.backdropUrl ? (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden' }}>
          <img
            src={titleData.backdropUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, var(--bg-primary) 0%, rgba(10,10,15,0.5) 50%, rgba(10,10,15,0.3) 100%)',
          }} />
          {/* Back button over backdrop */}
          <button
            onClick={() => navigate(-1)}
            style={{
              position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.5)',
              border: 'none', color: '#fff', cursor: 'pointer', fontSize: '18px',
              padding: '8px 12px', zIndex: 10, borderRadius: '8px', backdropFilter: 'blur(8px)',
            }}
          >
            ←
          </button>
          {/* Status pill over backdrop */}
          <div style={{
            position: 'absolute', top: 12, right: 12,
            backgroundColor: banner.bg, color: banner.color,
            padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
            backdropFilter: 'blur(8px)',
          }}>
            {banner.text}
            {saving && <span style={{ marginLeft: '6px', fontSize: '10px', opacity: 0.7 }}>saving...</span>}
          </div>
        </div>
      ) : (
        <>
          {/* Fallback: no backdrop */}
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'rgba(10, 10, 15, 0.9)',
              border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '20px',
              padding: '12px', zIndex: 10, borderRadius: '8px', margin: '8px 0 0 8px',
            }}
          >
            ←
          </button>
          <div style={{
            backgroundColor: banner.bg, color: banner.color, padding: '12px', margin: '12px 16px',
            borderRadius: '8px', fontSize: '13px', fontWeight: '500', textAlign: 'center',
          }}>
            {banner.text}
            {saving && <span style={{ marginLeft: '8px', fontSize: '12px', opacity: 0.7 }}>saving...</span>}
          </div>
        </>
      )}

      {/* SMART WATCH — adapts to what's available, always leads to video */}
      {(() => {
        const streamable = streamingProviders.filter(p => p.type === 'flatrate' || p.type === 'free' || p.type === 'ads');
        const rentBuy = streamingProviders.filter(p => p.type === 'rent' || p.type === 'buy');
        const hasStreaming = streamable.length > 0;
        const hasRentBuy = rentBuy.length > 0;
        const hasEmbed = !!titleData.imdbId;
        // Smart priority:
        // - Has streaming? → streamer buttons are primary, embed is "Other sources"
        // - No streaming but has embed? → embed is primary (new releases, obscure titles)
        // - Neither? → Google fallback
        return (
          <div style={{ padding: '0 16px', marginBottom: '8px' }}>

            {/* === CASE 1: Streaming available — opens native app via universal link === */}
            {hasStreaming && (
              <div style={{ marginBottom: '8px' }}>
                {streamable.slice(0, 3).map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => openProvider(p.url)}
                    style={{
                      width: '100%', padding: idx === 0 ? '16px' : '12px 16px',
                      fontSize: idx === 0 ? '16px' : '14px', fontWeight: idx === 0 ? '700' : '500',
                      background: idx === 0
                        ? 'var(--accent)'
                        : 'var(--bg-card)',
                      color: idx === 0 ? 'white' : 'var(--text-primary)',
                      border: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '10px',
                      textDecoration: 'none', marginBottom: '6px', boxSizing: 'border-box',
                    }}
                  >
                    <img src={p.logo} alt={p.name} style={{ width: idx === 0 ? '26px' : '22px', height: idx === 0 ? '26px' : '22px', borderRadius: '4px' }} />
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      {idx === 0 ? '▶ ' : ''}Watch on {p.name}
                    </span>
                    <span style={{ fontSize: '10px', opacity: 0.6 }}>
                      {p.type === 'free' ? 'FREE' : p.type === 'ads' ? 'FREE w/ ADS' : 'STREAM'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* === CASE 2: No streaming — embed is primary === */}
            {!hasStreaming && hasEmbed && (
              <button
                onClick={() => navigate(`/watch/${titleData.mediaType}/${titleData.imdbId}`)}
                style={{
                  width: '100%', padding: '16px', fontSize: '16px', fontWeight: '700',
                  background: 'var(--accent)',
                  color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  marginBottom: '8px',
                }}
              >
                ▶ Watch Now
              </button>
            )}

            {/* === Embed as secondary when streaming exists === */}
            {hasStreaming && hasEmbed && (
              <button
                onClick={() => navigate(`/watch/${titleData.mediaType}/${titleData.imdbId}`)}
                style={{
                  width: '100%', padding: '12px', fontSize: '14px', fontWeight: '500',
                  background: 'var(--bg-card)', color: 'var(--text-primary)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  marginBottom: '8px',
                }}
              >
                ▶ Other Sources
              </button>
            )}

            {/* === Rent / Buy pills — also open app via universal link === */}
            {hasRentBuy && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {rentBuy.slice(0, 4).map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => openProvider(p.url)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px',
                      backgroundColor: 'var(--bg-card)', borderRadius: '8px', fontSize: '12px',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <img src={p.logo} alt={p.name} style={{ width: '16px', height: '16px', borderRadius: '3px' }} />
                    {p.type === 'rent' ? 'Rent' : 'Buy'} on {p.name}
                  </button>
                ))}
              </div>
            )}

            {/* === JustWatch === */}
            {justWatchLink && (
              <a
                href={justWatchLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block', textAlign: 'center', marginTop: '4px',
                  fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'none',
                }}
              >
                All streaming options on JustWatch ↗
              </a>
            )}

            {/* === Nothing at all — Google fallback === */}
            {!hasEmbed && !hasStreaming && !hasRentBuy && (
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(`watch ${titleData.title} ${titleData.year || ''} full movie online`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: '100%', padding: '16px', fontSize: '16px', fontWeight: '700',
                  background: 'var(--accent)',
                  color: 'white', border: 'none', borderRadius: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  textDecoration: 'none',
                }}
              >
                ▶ Find Where to Watch
              </a>
            )}
          </div>
        );
      })()}

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
                —
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

        {/* Overview — right under the title, like a logline */}
        {titleData.overview && (
          <p style={{
            fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6',
            margin: '0 0 20px 0', borderLeft: '3px solid var(--accent)',
            paddingLeft: '12px',
          }}>
            {titleData.overview}
          </p>
        )}

        {/* Ratings Row — Letterboxd & Metacritic are primary, IMDB secondary */}
        {(() => {
          const lbUrl = titleData.imdbId
            ? `https://letterboxd.com/imdb/${titleData.imdbId}/`
            : `https://letterboxd.com/search/${encodeURIComponent(titleData.title)}/`;

          const cells: React.ReactNode[] = [];

          // Letterboxd — always first, always shown, prominent
          cells.push(
            <a
              key="lb"
              href={lbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="card"
              style={{
                padding: '10px 6px', textAlign: 'center', textDecoration: 'none',
                cursor: 'pointer', border: '1px solid rgba(0,224,84,0.2)',
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#00e054' }}>
                ★
              </div>
              <div style={{ fontSize: '10px', color: '#00e054', marginTop: '3px', fontWeight: 600 }}>Letterboxd</div>
            </a>
          );

          // Metacritic — second priority
          if (ratings.metacritic) {
            cells.push(
              <a
                key="mc"
                href={`https://www.metacritic.com/search/${encodeURIComponent(titleData.title)}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="card"
                style={{ padding: '10px 6px', textAlign: 'center', textDecoration: 'none', cursor: 'pointer' }}
              >
                <div style={{
                  fontSize: '16px', fontWeight: '600',
                  color: ratings.metacritic >= 60 ? 'var(--green)' : ratings.metacritic >= 40 ? 'var(--yellow)' : 'var(--red)',
                }}>
                  {ratings.metacritic}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>Metacritic</div>
              </a>
            );
          }

          // IMDB — tertiary
          if (ratings.imdb) {
            cells.push(
              <a
                key="imdb"
                href={titleData.imdbId ? `https://imdb.com/title/${titleData.imdbId}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="card"
                style={{ padding: '10px 6px', textAlign: 'center', textDecoration: 'none', cursor: 'pointer' }}
              >
                <div style={{ fontSize: '16px', fontWeight: '600', color: ratings.imdb >= 7 ? 'var(--green)' : 'var(--text-secondary)' }}>
                  {ratings.imdb.toFixed(1)}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>IMDB</div>
              </a>
            );
          }

          return (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, gap: '6px', marginBottom: '16px' }}>
              {cells}
            </div>
          );
        })()}

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '24px' }}>
          <button
            onClick={handleMarkWatched}
            disabled={saving}
            style={{
              padding: '12px',
              backgroundColor: status === 'watched' ? 'var(--green)' : 'transparent',
              color: status === 'watched' ? 'white' : 'var(--green)',
              border: status === 'watched' ? 'none' : '1px solid var(--green)',
              borderRadius: '6px', fontWeight: '500', cursor: 'pointer', fontSize: '13px',
              opacity: saving ? 0.6 : 1,
            }}
          >
            Seen It
          </button>
          <button
            onClick={handleMarkHidden}
            disabled={saving}
            style={{
              padding: '12px',
              backgroundColor: status === 'hidden' ? 'var(--red)' : 'transparent',
              color: status === 'hidden' ? 'white' : 'var(--red)',
              border: status === 'hidden' ? 'none' : '1px solid var(--red)',
              borderRadius: '6px', fontWeight: '500', cursor: 'pointer', fontSize: '13px',
              opacity: saving ? 0.6 : 1,
            }}
          >
            Never
          </button>
          <button
            onClick={handleMarkWatchlist}
            disabled={saving}
            style={{
              padding: '12px',
              backgroundColor: status === 'watchlisted' ? 'var(--accent)' : 'transparent',
              color: status === 'watchlisted' ? 'white' : 'var(--accent)',
              border: status === 'watchlisted' ? 'none' : '1px solid var(--accent)',
              borderRadius: '6px', fontWeight: '500', cursor: 'pointer', fontSize: '13px',
              opacity: saving ? 0.6 : 1,
            }}
          >
            Watchlist
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

        {/* Overview moved up near title for better storytelling */}

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

        {/* Free sources removed — TMDB watch providers handle free streaming in the Watch section above */}

        {/* External links */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <a
            href={`https://www.kanopy.com/en/search?q=${encodeURIComponent(titleData.title)}`}
            target="_blank" rel="noopener noreferrer"
            className="card"
            style={{ padding: '10px 16px', textDecoration: 'none', color: 'var(--text-primary)', fontSize: '12px' }}
          >
            Kanopy ↗
          </a>
          {titleData.imdbId && (
            <a
              href={`https://letterboxd.com/imdb/${titleData.imdbId}/`}
              target="_blank" rel="noopener noreferrer"
              className="card"
              style={{ padding: '10px 16px', textDecoration: 'none', color: '#00e054', fontSize: '12px' }}
            >
              Letterboxd ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
