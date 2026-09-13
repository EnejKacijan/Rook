const CACHE = 'rook-v12';
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
          if (response.ok) {
            const cacheResponse = response.clone();
            event.waitUntil(caches.open(CACHE).then(cache => cache.put('/index.html', cacheResponse)));
          }
          return response;
        })
        .catch(() => caches.match('/index.html', { ignoreVary: true }))
    );
    return;
  }

  // Vite fingerprints build assets in their filenames. Once downloaded, that
  // exact URL is immutable, so artwork and bundles can be returned immediately
  // without waiting for a network round trip on every view.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            // Clone before returning the response to the image consumer. Opening
            // CacheStorage is async; by then the original body may be consumed.
            const cacheResponse = response.clone();
            event.waitUntil(
              caches.open(CACHE).then(cache => cache.put(request, cacheResponse))
            );
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const cacheResponse = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, cacheResponse)));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreVary: true }))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(openClients => {
      const existing = openClients.find(client => new URL(client.url).origin === self.location.origin);
      if (existing) {
        existing.navigate?.(target);
        return existing.focus();
      }
      return clients.openWindow(target);
    })
  );
});
