const CACHE = 'berrex-shell-v3';
const BASE = new URL('./', self.registration.scope).pathname;
const SHELL = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}favicon.svg`
];

function isCacheableRequest(request) {
  return request.method === 'GET' &&
    request.url.startsWith(self.location.origin);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (!isCacheableRequest(event.request)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          event.waitUntil(
            caches.open(CACHE)
              .then((cache) => cache.put(event.request, clone))
              .catch(() => undefined)
          );
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
