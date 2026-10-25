/* The web app's service worker (03_platforms.md §9, P5.11), registered by engine.js (WorkerEngine) for .../app/:

   1. Cross-origin isolation: GitHub Pages sends no COOP / COEP headers, which SharedArrayBuffer (the engine's wait for
      the speech model) and the model's threads need. Every same-origin answer that passes here gets
      Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: credentialless (the reciter's audio
      from EveryAyah still loads: a cross-origin request goes without cookies); the first visit reloads once.
   2. Offline use: the app's files are fetched from the network first (a quick 304 when unchanged) and kept in a
      cache; without network (or after NETWORK_WAIT_MS) the kept copy answers. The speech model is not kept here: the
      encoder worker stores it in the Origin Private File System (models/), after its SHA-256 check.
   Cross-origin requests and the model's parts pass through untouched. */
const CACHE = 'meddeb-app-1';
const NETWORK_WAIT_MS = 4000;

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

async function answer(req) {
  const cache = await caches.open(CACHE);
  const key = req.url.split('#')[0];
  const net = fetch(key, {cache: 'no-cache', credentials: 'same-origin'}).then(async (r) => {
    if (r.ok && r.type === 'basic') await cache.put(key, r.clone());
    return r;
  });
  const kept = await cache.match(key, {ignoreSearch: req.mode === 'navigate'});
  if (!kept) return isolated(await net);
  const slow = new Promise((res) => setTimeout(() => res(null), NETWORK_WAIT_MS));
  const r = await Promise.race([net.catch(() => null), slow]);
  return isolated(r && r.ok ? r : kept);
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/models/') || req.headers.has('range')) return;
  ev.respondWith(answer(req).catch(() => fetch(req).then(isolated)));
});
