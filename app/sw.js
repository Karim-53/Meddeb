/* The web app's service worker (03_platforms.md §9, P5.11), registered by engine.js (WorkerEngine) for .../app/:

   1. Cross-origin isolation: GitHub Pages sends no COOP / COEP headers, which SharedArrayBuffer (the engine's wait for
      the speech model) and the model's threads need. Every same-origin answer that passes here gets
      Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: credentialless (the reciter's audio
      from EveryAyah still loads: a cross-origin request goes without cookies); the first visit reloads once.
   2. Offline use and #74 (v0.20, D1: "every time i open it … it gets downloaded"): the runtime and the engine (vendor/,
      engine/: ~34 MB) are served from the cache with no request while the kept copy's SHA-256 (X-Meddeb-Sha256, the
      hash of its own body) is the one app/files.json names (tools/export_app.py writes it; fetched network-first
      with each page load); else they are downloaded once and kept with their hash, so a deploy re-downloads only the
      files it changed. The other files (the page, its scripts) come from the network first (a quick 304 when
      unchanged) and are rewritten in the cache only when their ETag changed; without network (or after
      NETWORK_WAIT_MS) the kept copy answers. The speech model is not kept here: the encoder worker stores it in the
      Origin Private File System (models/), after its SHA-256 check.
   Cross-origin requests and the model's parts pass through untouched. */
// the name of 0.16-0.19 kept: their copies are reused when their body's hash is the listed one (hashed once)
const CACHE = 'meddeb-app-1';
const NETWORK_WAIT_MS = 4000;
const SHA = 'X-Meddeb-Sha256';
const HASHED = /^(vendor|engine)\//;   // under the scope (.../app/), cache-first by files.json

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('meddeb-app-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

function isolated(resp) {
  if (!resp || resp.status === 0 || resp.type === 'opaque') return resp;
  const h = new Headers(resp.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'credentialless');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(resp.body, {status: resp.status, statusText: resp.statusText, headers: h});
}

const scope = () => (self.registration && self.registration.scope) || new URL('./', self.location.href).href;

async function digest(buf) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** A response rebuilt from its body (read once), carrying the body's hash; the body is already decoded. */
function withBody(resp, buf, sha) {
  const h = new Headers(resp.headers);
  h.delete('content-encoding'); h.delete('content-length');
  h.set(SHA, sha);
  return new Response(buf, {status: resp.status, statusText: resp.statusText, headers: h});
}

/** The network's answer, or the kept copy offline / after NETWORK_WAIT_MS; the cache is rewritten only when the
 *  file changed (another ETag, or none to compare). */
async function networkFirst(cache, key, matchOpts) {
  const kept = await cache.match(key, matchOpts);
  const net = fetch(key, {cache: 'no-cache', credentials: 'same-origin'}).then(async (r) => {
    if (r.ok && r.type === 'basic') {
      const tag = r.headers.get('etag');
      if (!(kept && tag && kept.headers.get('etag') === tag)) await cache.put(key, r.clone());
    }
    return r;
  });
  if (!kept) return net;
  let timer = null;
  const slow = new Promise((res) => { timer = setTimeout(() => res(null), NETWORK_WAIT_MS); });
  const r = await Promise.race([net.catch(() => null), slow]);
  clearTimeout(timer);
  return r && r.ok ? r : kept;
}

// files.json of this page load: a promise of {path under app/: sha256} or null (none: everything network-first)
let index = null;
function loadIndex(cache) {
  index = networkFirst(cache, scope() + 'files.json')
    .then((r) => (r && r.ok ? r.json() : null))
    .catch(() => null);
  return index;
}

/** vendor/ and engine/: the kept copy when its hash is the listed one (no request), else one download, kept with the
 *  hash of what arrived (a CDN still serving the old file is asked again at the next load); offline the kept copy. */
async function hashed(cache, key, want) {
  let kept = await cache.match(key);
  if (kept) {
    let have = kept.headers.get(SHA);
    if (!have) {   // kept by 0.16-0.19 (no hash): hashed once, and kept with it when it is the listed one
      const buf = await kept.arrayBuffer();
      have = await digest(buf);
      kept = withBody(kept, buf, have);
      if (have === want) await cache.put(key, kept.clone());
    }
    if (have === want) return kept;
  }
  let r;
  try { r = await fetch(key, {cache: 'no-cache', credentials: 'same-origin'}); } catch (e) { if (kept) return kept; throw e; }
  if (!r.ok || r.type !== 'basic') return !r.ok && kept ? kept : r;
  const buf = await r.arrayBuffer();
  const fresh = withBody(r, buf, await digest(buf));
  await cache.put(key, fresh.clone());
  return fresh;
}

const inflight = new Map();   // one download of a hashed file for requests that arrive together

async function answer(req) {
  const cache = await caches.open(CACHE);
  const key = req.url.split('#')[0];
  if (req.mode === 'navigate' || !index) loadIndex(cache);   // a new page load: files.json again
  const base = scope(), path = key.startsWith(base) ? key.slice(base.length).split('?')[0] : null;
  if (path !== null && HASHED.test(path)) {
    const files = await index;
    const want = files && typeof files[path] === 'string' ? files[path] : null;
    if (want) {
      let p = inflight.get(key);
      if (!p) { p = hashed(cache, key, want).finally(() => inflight.delete(key)); inflight.set(key, p); }
      return isolated((await p).clone());
    }
  }
  return isolated(await networkFirst(cache, key, {ignoreSearch: req.mode === 'navigate'}));
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/models/') || req.headers.has('range')) return;
  ev.respondWith(answer(req).catch(() => fetch(req).then(isolated)));
});
