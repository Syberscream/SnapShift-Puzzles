// Offline-friendly service worker: network first for pages and API,
// cache first for built assets and puzzle images (their URLs never change),
// and the logo/icons kept on the device (refreshed in the background), so the
// installed app always has its logo even on a slow or patchy connection.
const CACHE = 'snapshift-v2-2';
const KEEP = ['/img/logo.png', '/img/logo-icon.png', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(KEEP)).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const immutable = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/media/');
  const branding = url.pathname.startsWith('/img/') || url.pathname.startsWith('/icons/');
  if (branding) {
    // Serve the stored copy at once and refresh it for next time.
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req, { ignoreSearch: true });
        const net = fetch(req).then((r) => (r.ok && c.put(req, r.clone()), r));
        if (hit) {
          e.waitUntil(net.catch(() => {}));
          return hit;
        }
        return net;
      }),
    );
  } else if (immutable) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) || fetch(req).then((r) => (r.ok && c.put(req, r.clone()), r))));
  } else if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => (caches.open(CACHE).then((c) => c.put(req, r.clone())), r)).catch(() => caches.match(req).then((r) => r || caches.match('/'))));
  }
});
