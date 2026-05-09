import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

/*──────────────────────────────────────────────────────────────────────────────
 * SOURCE CONFIGURATION
 *
 * Two tiers:
 *   1. "direct" — returns an .m3u8 (HLS) URL we play in a <video> element.
 *      This gives native AirPlay, Chromecast, PiP, and Roku casting for free.
 *   2. "embed"  — iframe-based fallback. TV casting won't work well, but the
 *      video itself will play on the phone.
 *──────────────────────────────────────────────────────────────────────────────*/

interface DirectSource {
  kind: 'direct';
  id: string;
  name: string;
  fetchUrl: (imdbId: string, mediaType: string, season: number, episode: number) => string;
  extractStream: (data: unknown) => string | null;
}

interface EmbedSource {
  kind: 'embed';
  id: string;
  name: string;
  movieUrl: (imdbId: string) => string;
  tvUrl: (imdbId: string, s: number, e: number) => string;
}

type Source = DirectSource | EmbedSource;

const SOURCES: Source[] = [
  // ── Direct HLS sources (AirPlay-compatible) ──
  {
    kind: 'direct',
    id: 'vidsrc-hls',
    name: 'Source 1 (HLS)',
    fetchUrl: (imdbId, mediaType, s, e) =>
      mediaType === 'tv'
        ? `https://vidsrc.icu/api/server?id=${imdbId}&sr=1&s=${s}&e=${e}`
        : `https://vidsrc.icu/api/server?id=${imdbId}&sr=1`,
    extractStream: (data: unknown) => {
      const d = data as { data?: { sources?: Array<{ url?: string }> } };
      return d?.data?.sources?.[0]?.url ?? null;
    },
  },
  {
    kind: 'direct',
    id: 'vidsrc2-hls',
    name: 'Source 2 (HLS)',
    fetchUrl: (imdbId, mediaType, s, e) =>
      mediaType === 'tv'
        ? `https://vidsrc.cc/v2/api/server?id=${imdbId}&sr=1&s=${s}&e=${e}`
        : `https://vidsrc.cc/v2/api/server?id=${imdbId}&sr=1`,
    extractStream: (data: unknown) => {
      const d = data as { data?: { sources?: Array<{ url?: string }> } };
      return d?.data?.sources?.[0]?.url ?? null;
    },
  },
  // ── Embed fallbacks (phone-only playback, TV casting limited) ──
  {
    kind: 'embed',
    id: 'vidsrc-icu',
    name: 'Source 3',
    movieUrl: (imdbId: string) => `https://vidsrc.icu/embed/movie/${imdbId}`,
    tvUrl: (imdbId: string, s: number, e: number) =>
      `https://vidsrc.icu/embed/tv/${imdbId}/${s}/${e}`,
  },
  {
    kind: 'embed',
    id: 'vidsrc-cc',
    name: 'Source 4',
    movieUrl: (imdbId: string) => `https://vidsrc.cc/v2/embed/movie/${imdbId}`,
    tvUrl: (imdbId: string, s: number, e: number) =>
      `https://vidsrc.cc/v2/embed/tv/${imdbId}/${s}/${e}`,
  },
  {
    kind: 'embed',
    id: '2embed',
    name: 'Source 5',
    movieUrl: (imdbId: string) => `https://www.2embed.stream/embed/movie/${imdbId}`,
    tvUrl: (imdbId: string, s: number, e: number) =>
      `https://www.2embed.stream/embed/tv/${imdbId}/${s}/${e}`,
  },
  {
    kind: 'embed',
    id: 'multiembed',
    name: 'Source 6',
    movieUrl: (imdbId: string) => `https://multiembed.mov/directstream.php?video_id=${imdbId}`,
    tvUrl: (imdbId: string, s: number, e: number) =>
      `https://multiembed.mov/directstream.php?video_id=${imdbId}&s=${s}&e=${e}`,
  },
];

/*──────────────────────────────────────────────────────────────────────────────
 * HLS.js loader — loaded from CDN on first use
 *──────────────────────────────────────────────────────────────────────────────*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let hlsPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadHls(): Promise<any> {
  if (hlsPromise) return hlsPromise;
  hlsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Hls = (window as any).Hls;
      if (Hls) resolve(Hls);
      else reject(new Error('HLS.js loaded but Hls not found on window'));
    };
    script.onerror = () => reject(new Error('Failed to load HLS.js'));
    document.head.appendChild(script);
  });
  return hlsPromise;
}

/*──────────────────────────────────────────────────────────────────────────────
 * Component
 *──────────────────────────────────────────────────────────────────────────────*/

export default function WatchPage() {
  const { mediaType, imdbId } = useParams<{ mediaType: string; imdbId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const season = parseInt(searchParams.get('s') || '1');
  const episode = parseInt(searchParams.get('e') || '1');

  const [sourceIndex, setSourceIndex] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlsRef = useRef<any>(null);

  const currentSource = SOURCES[sourceIndex];
  const isDirect = currentSource?.kind === 'direct';

  // ── Auto-hide controls ──
  useEffect(() => {
    if (!showControls) return;
    const timer = setTimeout(() => setShowControls(false), 4000);
    return () => clearTimeout(timer);
  }, [showControls]);

  // ── Fetch direct stream URL or set embed URL ──
  useEffect(() => {
    if (!imdbId || !currentSource) return;

    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (currentSource.kind === 'embed') {
      const url = mediaType === 'tv'
        ? currentSource.tvUrl(imdbId, season, episode)
        : currentSource.movieUrl(imdbId);
      setStreamUrl(url);
      setError(false);
      setLoading(false);
      return;
    }

    // Direct source — fetch the .m3u8 URL
    setLoading(true);
    setError(false);
    setStreamUrl(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    fetch(currentSource.fetchUrl(imdbId, mediaType || 'movie', season, episode), {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        clearTimeout(timer);
        const url = currentSource.extractStream(data);
        if (url) {
          setStreamUrl(url);
          setLoading(false);
        } else {
          throw new Error('No stream URL in response');
        }
      })
      .catch(() => {
        clearTimeout(timer);
        setLoading(false);
        setError(true);
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [sourceIndex, imdbId, mediaType, season, episode, currentSource]);

  // ── Attach HLS.js to <video> when we have a direct stream URL ──
  useEffect(() => {
    if (!streamUrl || !isDirect || !videoRef.current) return;

    const video = videoRef.current;

    // Native HLS support (Safari/iOS) — just set src directly
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.play().catch(() => {});
      return;
    }

    // Use HLS.js for other browsers
    loadHls()
      .then((Hls) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(Hls as any).isSupported()) {
          // Last resort — try native
          video.src = streamUrl;
          video.play().catch(() => {});
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hls = new (Hls as any)({ enableWorker: true, lowLatencyMode: false });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on('hlsMediaAttached' in hls ? 'hlsMediaAttached' : 'MEDIA_ATTACHED', () => {
          video.play().catch(() => {});
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hls.on((Hls as any).Events?.ERROR ?? 'ERROR', (_: unknown, data: any) => {
          if (data?.fatal) setError(true);
        });
      })
      .catch(() => {
        // HLS.js failed to load — try native
        video.src = streamUrl;
        video.play().catch(() => {});
      });

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, isDirect]);

  // ── Source switching ──
  const nextSource = useCallback(() => {
    setError(false);
    setSourceIndex((i) => (i + 1) % SOURCES.length);
    setShowControls(true);
  }, []);

  const handleBack = () => navigate(-1);

  if (!imdbId) {
    return (
      <div style={{
        height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', color: 'var(--text-secondary)', gap: '16px',
      }}>
        <div style={{ fontSize: '32px' }}>No IMDB ID</div>
        <button onClick={handleBack} style={backBtnStyle}>Go Back</button>
      </div>
    );
  }

  const embedUrl = !isDirect ? streamUrl : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: '#000', zIndex: 9999,
        display: 'flex', flexDirection: 'column',
      }}
      onClick={() => setShowControls(true)}
    >
      {/* ── Controls overlay ── */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          background: showControls ? 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' : 'transparent',
          padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          transition: 'opacity 0.3s', opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
        }}
      >
        <button onClick={handleBack} style={backBtnStyle}>← Back</button>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isDirect && (
            <span style={{
              background: 'rgba(76,175,80,0.25)', color: '#81c784', fontSize: '10px',
              padding: '3px 8px', borderRadius: '4px', fontWeight: '600',
              border: '1px solid rgba(76,175,80,0.3)',
            }}>
              TV Ready
            </span>
          )}
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>
            {currentSource.name}
          </span>
          <button onClick={(e) => { e.stopPropagation(); nextSource(); }} style={sourceBtnStyle}>
            Next ▸
          </button>
        </div>
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)', gap: '12px',
        }}>
          <div style={{ fontSize: '24px', animation: 'spin 1s linear infinite' }}>⏳</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
            Finding stream…
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── Error state ── */}
      {error && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)', gap: '16px',
        }}>
          <div style={{ fontSize: '40px' }}>😕</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {isDirect ? "Couldn't get a direct stream." : "This source didn't load."}
          </div>
          <button onClick={nextSource} style={sourceBtnStyle}>
            Try Next Source ▸
          </button>
        </div>
      )}

      {/* ── Native <video> player for direct HLS sources ── */}
      {isDirect && streamUrl && (
        <video
          ref={videoRef}
          style={{ flex: 1, width: '100%', backgroundColor: '#000' }}
          controls
          playsInline
          autoPlay
          // iOS AirPlay attribute — shows the AirPlay button in native controls
          {...{ 'x-webkit-airplay': 'allow' } as React.HTMLAttributes<HTMLVideoElement>}
        />
      )}

      {/* ── Iframe fallback for embed sources ── */}
      {!isDirect && embedUrl && (
        <iframe
          key={embedUrl}
          src={embedUrl}
          style={{ flex: 1, width: '100%', border: 'none', backgroundColor: '#000' }}
          allowFullScreen
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          referrerPolicy="origin"
          onError={() => setError(true)}
        />
      )}

      {/* ── Bottom source dots ── */}
      <div style={{
        backgroundColor: 'rgba(0,0,0,0.9)', padding: '6px 16px',
        display: 'flex', justifyContent: 'center', gap: '6px', alignItems: 'center',
        paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))',
      }}>
        {SOURCES.map((s, i) => (
          <button
            key={s.id}
            onClick={(e) => { e.stopPropagation(); setSourceIndex(i); setError(false); setShowControls(true); }}
            style={{
              width: s.kind === 'direct' ? '10px' : '8px',
              height: s.kind === 'direct' ? '10px' : '8px',
              borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
              backgroundColor: i === sourceIndex
                ? 'var(--accent)'
                : s.kind === 'direct'
                  ? 'rgba(76,175,80,0.5)'
                  : 'rgba(255,255,255,0.3)',
            }}
            title={`${s.name}${s.kind === 'direct' ? ' — TV casting works' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}

const backBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white',
  padding: '8px 16px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer',
  backdropFilter: 'blur(8px)',
};

const sourceBtnStyle: React.CSSProperties = {
  background: 'var(--accent)', border: 'none', color: 'white',
  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
  cursor: 'pointer',
};
