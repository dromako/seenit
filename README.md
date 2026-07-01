# SeenIt

A pocket-sized movie & TV tracker.

- **Live app:** https://dromako.github.io/seenit/
- **What it does:** search TMDB, rate 1–10, mark watched, keep a watchlist, discover what's trending, import your IMDB ratings CSV, export a Letterboxd-ready CSV.
- **No accounts.** Everything you track lives in your browser's localStorage.

## Development

There is nothing to build. `docs/` is a single-page vanilla-JS PWA — edit `docs/app.js` / `docs/index.html`, push, done. GitHub Actions publishes the `docs/` folder to Pages on push to `main`.

## Data

- `localStorage['seenit.v2']` — your library (items, ratings, watched/watchlist flags).
- `localStorage['seenit.tmdb_token']` — optional override for the TMDB read-access token.

## Files

- `docs/index.html` — shell + all CSS.
- `docs/app.js` — router, views, TMDB fetch, CSV import/export, service worker registration.
- `docs/sw.js` — offline cache.
- `docs/404.html` — GitHub Pages SPA fallback.
