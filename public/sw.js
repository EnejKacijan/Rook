const CACHE = 'rook-v6';
const APP_SHELL = ['/manifest.webmanifest', '/icon.svg'];

async function precacheCurrentBuild() {
  const cache = await caches.open(CACHE);
  const response = await fetch('/index.html', { cache: 'no-store' });
  if (!response.ok) throw new Error('App shell unavailable');
  const html = await response.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]).filter(path => path.startsWith('/'));
  await cache.put('/index.html', response.clone());
  await cache.put('/', response);
  await cache.addAll([...new Set([...APP_SHELL, ...assets])]);
}

self.addEventListener('install', event => {
  event.waitUntil(precacheCurrentBuild().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Provider/status responses must always reflect the current connection and
  // must never be replayed from an old authenticated session.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(CACHE).then(cache => cache.put('/index.html', response.clone()));
          return response;
        })
        .catch(() => caches.match('/index.html', { ignoreVary: true }))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
        return response;
      })
      .catch(() => caches.match(request, { ignoreVary: true }))
  );
});
