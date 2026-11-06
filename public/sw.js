// Offline-friendly service worker: network first for pages and API,
// cache first for built assets and puzzle images (their URLs never change).
const CACHE = 'snapshift-v2-1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const immutable = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/media/');
  if (immutable) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) || fetch(req).then((r) => (r.ok && c.put(req, r.clone()), r))));
  } else if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => (caches.open(CACHE).then((c) => c.put(req, r.clone())), r)).catch(() => caches.match(req).then((r) => r || caches.match('/'))));
  }
});
