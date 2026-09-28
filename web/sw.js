// Keep the deck working offline. The games are not cached here: each one
// sits outside this scope and runs its own service worker.
//
// Every game shares this origin (<user>.github.io), so only caches carrying
// this app's prefix are ever cleared.

const PREFIX = 'mnbglibrary-';
const VERSION = `${PREFIX}v1`;
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './games.json',
  './js/app.js',
  './js/audio.js',
  './js/display.js',
  './js/font.js',
  './js/gfx.js',
  './js/sdf.js',
  './js/tapes/reels.js',
  './js/tapes/bulls.js',
  './js/tapes/temple.js',
  './js/tapes/routes.js',
  './js/tapes/gem.js',
  './icons/icon.svg',
  './icons/icon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  // The page and the catalogue: network first, so a new game shows up as
  // soon as it is added, with the cached copy when offline.
  if (request.mode === 'navigate' || url.pathname.endsWith('/games.json')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            const key = request.mode === 'navigate' ? './index.html' : request;
            caches.open(VERSION).then((cache) => cache.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(request.mode === 'navigate' ? './index.html' : request, { ignoreSearch: true })),
    );
    return;
  }

  // Everything else: straight from the cache, refreshed in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
