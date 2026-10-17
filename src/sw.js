// Service worker: precache every built file so the app works fully offline.
// The build fills in VERSION and FILES (see vite.config.ts).
const VERSION = __VERSION__;
const FILES = __FILES__;
const CACHE = `plot-planner-${VERSION}`;
const SCOPE = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', ...FILES.filter((f) => f !== 'index.html')].map((f) => new URL(f, SCOPE).href))),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('plot-planner-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never touch other hosts (the optional climate lookups go straight to the network).
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // App shell: network first so updates arrive, cache when offline.
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(new URL('./', SCOPE).href, copy));
        return res;
      }).catch(() => caches.match(new URL('./', SCOPE).href)),
    );
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
