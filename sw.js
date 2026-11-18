// Network-first for data, cache-first for the app shell, so the app still opens with weak resort Wi-Fi.
const C = 'wc-v2';
const SHELL = ['./', 'index.html', 'app.css', 'js/core.js', 'js/map.js', 'js/guest.js', 'data/map.jpg', 'icon.svg', 'art/monogram.jpg', 'art/haldi.jpg', 'art/sangeet.jpg', 'art/wedding.jpg', 'art/leaves.jpg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('wedding.json') || u.pathname.endsWith('.js') || u.pathname.endsWith('.html') || u.pathname.endsWith('/')) {
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request.url.split('?')[0], cp)); return r; })
      .catch(() => caches.match(e.request.url.split('?')[0])));
  } else e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
