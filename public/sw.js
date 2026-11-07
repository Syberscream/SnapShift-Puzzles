// Offline-friendly service worker: network first for pages and API,
// cache first for built assets and puzzle images (their URLs never change),
// and the logo/icons kept on the device (refreshed in the background), so the
// installed app always has its logo even on a slow or patchy connection.
const CACHE = 'snapshift-v2-4';
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

// Daily puzzle reminders.
self.addEventListener('push', (e) => {
  let msg = { title: 'SnapShift Puzzles', body: 'Today’s puzzle is ready.', url: '/daily', tag: 'daily' };
  try {
    if (e.data) msg = { ...msg, ...e.data.json() };
  } catch {}
  e.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: msg.tag,
      renotify: false,
      data: { url: msg.url },
    }),
  );
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/daily', location.origin);
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === url.origin && 'focus' in c) return c.navigate(url.href).then((w) => (w || c).focus());
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
