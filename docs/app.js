/* SeenIt — a minimal movie/TV tracker.
 * Everything stored in localStorage. No accounts, no auth.
 * TMDB Bearer token is read-only, hardcoded — same one used by all
 * previous versions. If TMDB revokes it, users can drop in their own
 * via Sync tab.
 */
'use strict';

const TMDB_TOKEN_DEFAULT = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5ZTcwNDBkMWRiNGEwNzEzN2NhM2MyOWNmMDljZmQ4MSIsIm5iZiI6MTczMzAwMTQ2Mi40MjksInN1YiI6IjY3NGI4MGY2YmIxMTAwNzNlOGFiOTJmZCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.VL_RbC6VJumby1MNrTYOCGTHZjnY-5j7DRlTB4-GBgc';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const STORAGE_KEY = 'seenit.v2';
const TMDB_TOKEN_KEY = 'seenit.tmdb_token';

function tmdbToken() {
  return localStorage.getItem(TMDB_TOKEN_KEY) || TMDB_TOKEN_DEFAULT;
}

async function tmdb(path, params) {
  const url = new URL(TMDB_BASE + path);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${tmdbToken()}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

/* ---------- storage ---------- */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { items: {} };
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  catch (e) { toast('Storage full'); console.error(e); }
}
let state = loadState();

function getItem(id) { return state.items[id] || null; }
function upsertItem(id, patch) {
  const cur = state.items[id] || {};
  state.items[id] = { ...cur, ...patch, id, updatedAt: Date.now() };
  saveState(state);
  return state.items[id];
}
function removeItem(id) {
  delete state.items[id];
  saveState(state);
}

/* ---------- helpers ---------- */
function poster(path, size) {
  if (!path) return null;
  return `${IMG_BASE}/${size || 'w200'}${path}`;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function fmtYear(item) {
  const d = item.release_date || item.first_air_date;
  return d ? d.slice(0, 4) : '';
}
function normalizeTMDB(t) {
  const type = t.media_type === 'tv' || (t.first_air_date && !t.release_date) ? 'tv' : 'movie';
  return {
    tmdbId: t.id,
    type,
    title: t.title || t.name || '',
    year: (t.release_date || t.first_air_date || '').slice(0, 4) || null,
    poster: t.poster_path || null,
    overview: t.overview || '',
    tmdbRating: t.vote_average || null,
  };
}
function idFor(item) {
  // Prefer imdbId when we have it (for Letterboxd sync), else tmdb:<id>
  return item.imdbId || `tmdb:${item.type}:${item.tmdbId}`;
}
function toast(msg, ms) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms || 2200);
}

/* ---------- router ---------- */
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '') || 'library';
  const [name, ...rest] = h.split('/');
  return { name, params: rest };
}
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
  if (!location.hash) location.hash = '#/library';
  render();
});

/* ---------- render ---------- */
function render() {
  const { name, params } = currentRoute();
  const app = document.getElementById('app');
  const view = views[name] || views.library;
  app.innerHTML = view.render(params);
  view.hydrate && view.hydrate(app, params);
  renderTabs(name);
}

function renderTabs(active) {
  const html = `<nav class="tabs">
    ${tabBtn('library', 'Library', active, iconLib())}
    ${tabBtn('search', 'Search', active, iconSearch())}
    ${tabBtn('discover', 'Discover', active, iconStar())}
    ${tabBtn('sync', 'Sync', active, iconSync())}
  </nav>`;
  // ensure nav exists at end of body
  let existing = document.querySelector('nav.tabs');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}
function tabBtn(id, label, active, icon) {
  return `<a href="#/${id}" class="${active === id ? 'active' : ''}">${icon}${label}</a>`;
}
function iconSearch() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`; }
function iconLib() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`; }
function iconStar() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/></svg>`; }
function iconSync() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7L21 16"/><path d="M21 21v-5h-5"/></svg>`; }

/* ---------- views ---------- */
const views = {};

/* SEARCH */
views.search = {
  render() {
    return `
      <h1>Search</h1>
      <input id="q" type="search" placeholder="Movie or show title…" autofocus />
      <div id="results" class="results"></div>
    `;
  },
  hydrate(root) {
    const input = root.querySelector('#q');
    const results = root.querySelector('#results');
    let timer;
    const run = async () => {
      const q = input.value.trim();
      if (!q) { results.innerHTML = ''; return; }
      results.innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
      try {
        const data = await tmdb('/search/multi', { query: q, include_adult: 'false' });
        const list = data.results
          .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
          .filter(r => r.poster_path || r.title || r.name)
          .slice(0, 30)
          .map(normalizeTMDB);
        results.innerHTML = list.length
          ? list.map(renderResultRow).join('')
          : `<div class="empty">No results.</div>`;
      } catch (e) {
        results.innerHTML = `<div class="empty">Search failed. ${esc(e.message)}</div>`;
      }
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 250);
    });
  },
};

function renderResultRow(t) {
  const p = poster(t.poster);
  const id = idFor(t);
  const saved = getItem(id) || getItem(`tmdb:${t.type}:${t.tmdbId}`);
  const badges = renderBadges(saved);
  return `
    <a class="result" href="#/title/${t.type}/${t.tmdbId}">
      ${p ? `<img src="${p}" alt="" loading="lazy" />` : `<div class="poster-fallback">${t.type === 'tv' ? '📺' : '🎬'}</div>`}
      <div class="result-info">
        <div class="result-title">${esc(t.title)}</div>
        <div class="result-meta">${t.year || '—'} · ${t.type === 'tv' ? 'TV' : 'Movie'}${t.tmdbRating ? ` · ★ ${t.tmdbRating.toFixed(1)}` : ''}</div>
        ${badges ? `<div class="badges">${badges}</div>` : ''}
      </div>
      <div style="color:var(--muted)">›</div>
    </a>
  `;
}
function renderBadges(item) {
  if (!item) return '';
  const b = [];
  if (item.watched) b.push('<span class="badge watched">Watched</span>');
  if (item.watchlist && !item.watched) b.push('<span class="badge watchlist">Watchlist</span>');
  if (item.rating) b.push(`<span class="badge rated">★ ${item.rating}</span>`);
  return b.join('');
}

/* LIBRARY */
views.library = {
  render() {
    const items = Object.values(state.items).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const total = items.length;
    const filter = localStorage.getItem('seenit.lib_filter') || 'all';
    const shown = filterItems(items, filter);
    return `
      <h1>Your Library</h1>
      ${total === 0 ? `
        <div class="hero">
          <h3 style="margin-bottom:6px">Nothing here yet.</h3>
          <p class="muted" style="margin:0 0 12px">Search TMDB or import your IMDB ratings CSV to get started.</p>
          <div class="row"><a href="#/search"><button class="primary">Search titles</button></a><a href="#/sync"><button>Import from IMDB</button></a></div>
        </div>
      ` : `
        <div class="filter-bar">
          ${filterBtn('all', 'All', filter, total)}
          ${filterBtn('watched', 'Watched', filter, items.filter(i => i.watched).length)}
          ${filterBtn('rated', 'Rated', filter, items.filter(i => i.rating).length)}
          ${filterBtn('watchlist', 'Watchlist', filter, items.filter(i => i.watchlist && !i.watched).length)}
        </div>
        <div class="results">
          ${shown.length ? shown.map(renderLibRow).join('') : `<div class="empty">Nothing matches this filter.</div>`}
        </div>
      `}
    `;
  },
  hydrate(root) {
    root.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        localStorage.setItem('seenit.lib_filter', btn.dataset.filter);
        render();
      });
    });
  },
};

function filterBtn(id, label, active, count) {
  return `<button data-filter="${id}" class="${active === id ? 'on' : ''}">${label} <span class="muted">${count}</span></button>`;
}
function filterItems(items, filter) {
  if (filter === 'watched') return items.filter(i => i.watched);
  if (filter === 'rated') return items.filter(i => i.rating);
  if (filter === 'watchlist') return items.filter(i => i.watchlist && !i.watched);
  return items;
}
function renderLibRow(i) {
  const p = poster(i.poster);
  const route = i.tmdbId ? `#/title/${i.type}/${i.tmdbId}` : `#/local/${encodeURIComponent(i.id)}`;
  return `
    <a class="result" href="${route}">
      ${p ? `<img src="${p}" alt="" loading="lazy" />` : `<div class="poster-fallback">${i.type === 'tv' ? '📺' : '🎬'}</div>`}
      <div class="result-info">
        <div class="result-title">${esc(i.title)}</div>
        <div class="result-meta">${i.year || '—'} · ${i.type === 'tv' ? 'TV' : 'Movie'}</div>
        <div class="badges">${renderBadges(i)}</div>
      </div>
      <div style="color:var(--muted)">›</div>
    </a>
  `;
}

/* DISCOVER */
views.discover = {
  render() {
    const window_ = localStorage.getItem('seenit.discover_window') || 'week';
    const kind = localStorage.getItem('seenit.discover_kind') || 'all';
    return `
      <h1>Discover</h1>
      <div class="filter-bar">
        <button data-kind="all" class="${kind === 'all' ? 'on' : ''}">All</button>
        <button data-kind="movie" class="${kind === 'movie' ? 'on' : ''}">Movies</button>
        <button data-kind="tv" class="${kind === 'tv' ? 'on' : ''}">TV</button>
      </div>
      <div class="filter-bar">
        <button data-window="day" class="${window_ === 'day' ? 'on' : ''}">Today</button>
        <button data-window="week" class="${window_ === 'week' ? 'on' : ''}">This week</button>
      </div>
      <div id="discover-results" class="results">
        <div class="empty"><span class="spinner"></span></div>
      </div>
    `;
  },
  hydrate(root) {
    const kind = localStorage.getItem('seenit.discover_kind') || 'all';
    const window_ = localStorage.getItem('seenit.discover_window') || 'week';
    root.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => {
      localStorage.setItem('seenit.discover_kind', b.dataset.kind);
      render();
    }));
    root.querySelectorAll('[data-window]').forEach(b => b.addEventListener('click', () => {
      localStorage.setItem('seenit.discover_window', b.dataset.window);
      render();
    }));
    const box = root.querySelector('#discover-results');
    (async () => {
      try {
        const data = await tmdb(`/trending/${kind}/${window_}`);
        const list = data.results
          .filter(r => r.media_type ? (r.media_type === 'movie' || r.media_type === 'tv') : true)
          .slice(0, 30)
          .map(normalizeTMDB);
        box.innerHTML = list.length ? list.map(renderResultRow).join('') : `<div class="empty">Nothing trending.</div>`;
      } catch (e) {
        box.innerHTML = `<div class="empty">Discover failed. ${esc(e.message)}</div>`;
      }
    })();
  },
};

/* TITLE DETAIL */
views.title = {
  render(params) {
    const [type, tmdbId] = params;
    return `
      <div class="back" onclick="history.back()">‹ Back</div>
      <div id="title-detail"><div class="empty"><span class="spinner"></span></div></div>
    `;
  },
  hydrate(root, params) {
    const [type, tmdbId] = params;
    const box = root.querySelector('#title-detail');
    (async () => {
      try {
        const path = type === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
        const append = type === 'tv' ? 'external_ids' : 'external_ids';
        const t = await tmdb(path, { append_to_response: append });
        const imdbId = t.imdb_id || (t.external_ids && t.external_ids.imdb_id) || null;
        const norm = {
          tmdbId: t.id,
          imdbId,
          type,
          title: t.title || t.name,
          year: (t.release_date || t.first_air_date || '').slice(0, 4) || null,
          poster: t.poster_path,
          overview: t.overview,
          tmdbRating: t.vote_average,
          runtime: t.runtime || (t.episode_run_time && t.episode_run_time[0]) || null,
          genres: (t.genres || []).map(g => g.name),
        };
        renderTitle(box, norm);
      } catch (e) {
        box.innerHTML = `<div class="empty">Failed to load. ${esc(e.message)}</div>`;
      }
    })();
  },
};

function renderTitle(box, t) {
  const id = idFor(t);
  const existing = getItem(id) || getItem(`tmdb:${t.type}:${t.tmdbId}`);
  const cur = existing || {};
  const rating = cur.rating || 0;
  const watched = !!cur.watched;
  const watchlist = !!cur.watchlist;
  const p = poster(t.poster, 'w300');
  box.innerHTML = `
    <div class="detail-hero">
      ${p ? `<img src="${p}" alt="" />` : `<div class="poster-fallback">${t.type === 'tv' ? '📺' : '🎬'}</div>`}
      <div>
        <h1 style="margin-bottom:4px">${esc(t.title)}</h1>
        <div class="muted">${t.year || '—'} · ${t.type === 'tv' ? 'TV' : 'Movie'}${t.runtime ? ` · ${t.runtime}m` : ''}</div>
        <div style="margin-top:6px">
          ${(t.genres || []).slice(0, 3).map(g => `<span class="tag">${esc(g)}</span>`).join('')}
        </div>
        ${t.tmdbRating ? `<div class="muted" style="margin-top:4px">TMDB ★ ${t.tmdbRating.toFixed(1)}</div>` : ''}
      </div>
    </div>
    <div class="detail-actions">
      <button data-act="watched" class="${watched ? 'on' : ''}">${watched ? '✓ Watched' : 'Watched'}</button>
      <button data-act="watchlist" class="${watchlist ? 'on' : ''}">${watchlist ? '★ Watchlist' : 'Watchlist'}</button>
      <button data-act="clear" class="${!existing ? '' : 'danger'}" ${!existing ? 'disabled' : ''}>Remove</button>
    </div>
    <div class="card">
      <div class="muted" style="text-align:center;margin-bottom:6px">Your rating</div>
      <div class="rating-picker">
        ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button data-rate="${n}" class="${rating === n ? 'on' : ''}">${n}</button>`).join('')}
      </div>
      ${rating ? `<div style="text-align:center"><button data-rate="0" class="ghost muted">Clear rating</button></div>` : ''}
    </div>
    ${t.overview ? `<div class="card" style="margin-top:12px"><p style="margin:0">${esc(t.overview)}</p></div>` : ''}
    ${t.imdbId ? `<p class="muted" style="text-align:center;margin-top:14px">IMDB: ${esc(t.imdbId)}</p>` : ''}
  `;

  box.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => {
    const n = Number(b.dataset.rate);
    upsertItem(id, { ...normFields(t), rating: n || null, watched: n ? true : watched });
    render();
    if (n) toast(`Rated ${n}/10`);
  }));
  box.querySelector('[data-act="watched"]').addEventListener('click', () => {
    const now = !watched;
    upsertItem(id, { ...normFields(t), watched: now, watchedDate: now ? (cur.watchedDate || new Date().toISOString().slice(0, 10)) : cur.watchedDate });
    render();
    toast(now ? 'Marked watched' : 'Removed watched');
  });
  box.querySelector('[data-act="watchlist"]').addEventListener('click', () => {
    upsertItem(id, { ...normFields(t), watchlist: !watchlist });
    render();
    toast(watchlist ? 'Removed from watchlist' : 'Added to watchlist');
  });
  const clearBtn = box.querySelector('[data-act="clear"]');
  if (clearBtn && existing) clearBtn.addEventListener('click', () => {
    if (!confirm('Remove this from your library?')) return;
    removeItem(id);
    if (existing.id !== id) removeItem(existing.id);
    render();
    toast('Removed');
  });
}
function normFields(t) {
  return {
    tmdbId: t.tmdbId, imdbId: t.imdbId || null, type: t.type,
    title: t.title, year: t.year || null, poster: t.poster || null,
  };
}

/* LOCAL (imported-only titles without a TMDB id lookup yet) */
views.local = {
  render(params) {
    const [enc] = params;
    const id = decodeURIComponent(enc || '');
    const item = getItem(id);
    if (!item) return `<div class="empty">Not found.</div>`;
    return `
      <div class="back" onclick="history.back()">‹ Back</div>
      <h1>${esc(item.title)}</h1>
      <div class="muted">${item.year || '—'} · ${item.type === 'tv' ? 'TV' : 'Movie'}</div>
      <div class="badges" style="margin-top:8px">${renderBadges(item)}</div>
      ${item.imdbId ? `<p class="muted">IMDB: ${esc(item.imdbId)}</p>` : ''}
      <div class="detail-actions">
        <button data-act="rewatch">${item.watched ? '✓ Watched' : 'Watched'}</button>
        <button data-act="wl">${item.watchlist ? '★ Watchlist' : 'Watchlist'}</button>
        <button class="danger" data-act="rm">Remove</button>
      </div>
      <p class="muted" style="text-align:center">Imported from IMDB. Search this title on TMDB to unlock poster & discovery.</p>
    `;
  },
  hydrate(root, params) {
    const [enc] = params;
    const id = decodeURIComponent(enc || '');
    root.querySelector('[data-act="rewatch"]')?.addEventListener('click', () => {
      const it = getItem(id); upsertItem(id, { watched: !it.watched }); render();
    });
    root.querySelector('[data-act="wl"]')?.addEventListener('click', () => {
      const it = getItem(id); upsertItem(id, { watchlist: !it.watchlist }); render();
    });
    root.querySelector('[data-act="rm"]')?.addEventListener('click', () => {
      if (!confirm('Remove?')) return;
      removeItem(id); render();
    });
  },
};

/* SYNC — IMDB import + Letterboxd export */
views.sync = {
  render() {
    const items = Object.values(state.items);
    const rated = items.filter(i => i.rating).length;
    const withImdb = items.filter(i => i.imdbId).length;
    return `
      <h1>Sync</h1>
      <div class="card">
        <h3>Import IMDB ratings</h3>
        <p class="muted">Go to IMDB → Your Ratings → Export. Drop the CSV here to import.</p>
        <label class="file-drop" id="drop">
          <input type="file" id="imdb-file" accept=".csv,text/csv" />
          <div>📥 Drop CSV or tap to choose</div>
        </label>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>Export for Letterboxd</h3>
        <p class="muted">Downloads a CSV you can upload at letterboxd.com/import.</p>
        <div class="stat"><span>Items in library</span><span>${items.length}</span></div>
        <div class="stat"><span>Rated</span><span>${rated}</span></div>
        <div class="stat"><span>With IMDB ID</span><span>${withImdb}</span></div>
        <div class="row" style="margin-top:12px">
          <button class="primary" id="download-lb" ${items.length ? '' : 'disabled'}>Download Letterboxd CSV</button>
          <button id="download-json" ${items.length ? '' : 'disabled'}>Backup JSON</button>
        </div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>Restore backup</h3>
        <p class="muted">Restore a previous SeenIt JSON backup. Replaces your current library.</p>
        <label class="file-drop">
          <input type="file" id="restore-file" accept="application/json,.json" />
          <div>♻️ Drop JSON to restore</div>
        </label>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>Reset</h3>
        <p class="muted">Clears everything you've tracked here. Irreversible.</p>
        <button class="danger" id="reset">Clear all data</button>
      </div>
      <p class="muted" style="text-align:center;margin-top:20px;font-size:12px">
        SeenIt · <a href="https://github.com/dromako/seenit" target="_blank" rel="noopener">source</a>
      </p>
    `;
  },
  hydrate(root) {
    const drop = root.querySelector('#drop');
    const file = root.querySelector('#imdb-file');
    ['dragover','dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); }));
    ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('dragover')));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) importIMDBFile(f);
    });
    file.addEventListener('change', () => {
      const f = file.files[0];
      if (f) importIMDBFile(f);
    });
    root.querySelector('#download-lb')?.addEventListener('click', downloadLetterboxdCSV);
    root.querySelector('#download-json')?.addEventListener('click', downloadJSON);
    root.querySelector('#restore-file')?.addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) restoreJSON(f);
    });
    root.querySelector('#reset')?.addEventListener('click', () => {
      if (!confirm("Delete everything you've tracked?")) return;
      localStorage.removeItem(STORAGE_KEY);
      state = loadState();
      render();
      toast('All cleared.');
    });
  },
};

/* ---------- CSV plumbing ---------- */
// Minimal RFC 4180 CSV parser. Handles quoted fields with commas / newlines / escaped quotes.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') continue;
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim()));
}
function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function importIMDBFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(String(reader.result));
      if (rows.length < 2) return toast('Empty CSV');
      const header = rows[0].map(h => h.trim());
      const idx = name => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
      const iConst = idx('Const');
      const iRating = idx('Your Rating');
      const iDate = idx('Date Rated');
      const iTitle = idx('Title');
      const iType = idx('Title Type');
      const iYear = idx('Year');
      if (iConst < 0 || iTitle < 0) {
        return toast('Not an IMDB ratings CSV (missing Const or Title column).');
      }
      let added = 0;
      for (const row of rows.slice(1)) {
        const imdbId = (row[iConst] || '').trim();
        if (!imdbId || !imdbId.startsWith('tt')) continue;
        const title = row[iTitle] || '';
        const year = iYear >= 0 ? (row[iYear] || '').trim() || null : null;
        const rawRating = iRating >= 0 ? parseInt(row[iRating] || '', 10) : NaN;
        const rating = Number.isFinite(rawRating) && rawRating > 0 ? rawRating : null;
        const dateRated = iDate >= 0 ? (row[iDate] || '').trim() || null : null;
        const titleType = iType >= 0 ? (row[iType] || '').toLowerCase() : '';
        const type = /tv|series|episode|mini/.test(titleType) ? 'tv' : 'movie';
        const existing = getItem(imdbId);
        upsertItem(imdbId, {
          imdbId,
          type: existing?.type || type,
          title: existing?.title || title,
          year: existing?.year || year,
          poster: existing?.poster || null,
          rating,
          watched: true,
          watchedDate: dateRated || existing?.watchedDate || null,
          tmdbId: existing?.tmdbId || null,
        });
        added++;
      }
      toast(`Imported ${added} title${added === 1 ? '' : 's'}.`);
      render();
    } catch (e) {
      console.error(e);
      toast('Import failed.');
    }
  };
  reader.readAsText(file);
}

function buildLetterboxdCSV() {
  // Letterboxd import: `Title,Year,Rating10,WatchedDate,imdbID` — Title + Year required,
  // imdbID lets Letterboxd match precisely. Rating10 is on 1–10 scale (Letterboxd converts).
  const header = 'Title,Year,Rating10,WatchedDate,imdbID';
  const rows = [];
  for (const it of Object.values(state.items)) {
    if (it.type !== 'movie') continue; // Letterboxd is movies only
    if (!it.title) continue;
    const line = [
      csvEscape(it.title),
      csvEscape(it.year || ''),
      csvEscape(it.rating || ''),
      csvEscape(it.watchedDate || ''),
      csvEscape(it.imdbId || ''),
    ].join(',');
    rows.push(line);
  }
  return header + '\n' + rows.join('\n');
}
function downloadLetterboxdCSV() {
  const csv = buildLetterboxdCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, `seenit-letterboxd-${new Date().toISOString().slice(0, 10)}.csv`);
  toast('Downloaded.');
}
function downloadJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `seenit-backup-${new Date().toISOString().slice(0, 10)}.json`);
  toast('Downloaded.');
}
function restoreJSON(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const parsed = JSON.parse(String(r.result));
      if (!parsed || typeof parsed !== 'object' || !parsed.items) throw new Error('bad file');
      if (!confirm(`Restore ${Object.keys(parsed.items).length} items? This replaces your current library.`)) return;
      state = parsed;
      saveState(state);
      render();
      toast('Restored.');
    } catch { toast('Bad backup file.'); }
  };
  r.readAsText(file);
}
function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- service worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/seenit/sw.js').catch(() => {});
  });
}
