// SeenIt service worker.
// Cache shell for offline use; network-first for TMDB API + images.
const CACHE_NAME = 'seenit-v2';
const SHELL = [
  '/seenit/',
  '/seenit/index.html',
  '/seenit/app.js',
  '/seenit/manifest.json',
  '/seenit/favicon.svg',
  '/seenit/icon-192.png',
  '/seenit/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // TMDB API: network-first, fall back to cache
  if (url.hostname === 'api.themoviedb.org') {
    e.respondWith(
      fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // TMDB images: cache-first
  if (url.hostname === 'image.tmdb.org') {
    e.respondWith(
      caches.match(e.request).then((cached) => cached ||
        fetch(e.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone)).catch(() => {});
          return res;
        })
      )
    );
    return;
  }

  // Shell: cache-first, fall back to network, fall back to /seenit/ (SPA)
  e.respondWith(
    caches.match(e.request).then((cached) => cached ||
      fetch(e.request).catch(() => caches.match('/seenit/')))
  );
});
