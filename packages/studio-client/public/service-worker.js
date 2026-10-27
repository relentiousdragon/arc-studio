const CACHE_NAME = 'arc-studio-offline-v3';
const OFFLINE_PAGE = '/offline.html';
const LOGO_ASSETS = ['/arc.png', '/nightly-icon.png'];
const OFFLINE_ASSETS = [OFFLINE_PAGE, ...LOGO_ASSETS];
//
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('arc-studio-offline-') && key !== CACHE_NAME).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (LOGO_ASSETS.includes(requestUrl.pathname)) {
    const logoUrl = requestUrl.pathname;
    const refresh = caches.open(CACHE_NAME).then((cache) => fetch(request).then((response) => {
        if (response.ok) return cache.put(logoUrl, response.clone()).then(() => response);
        return response;
    }));
    event.waitUntil(refresh.catch(() => {}));
    event.respondWith(caches.open(CACHE_NAME).then((cache) => cache.match(logoUrl)).then((cached) => cached || refresh));
    return;
  }

  if (request.mode !== 'navigate') return;
  event.respondWith(fetch(request).then((response) => {
    if (response.status >= 500) {
      return caches.match(OFFLINE_PAGE).then((offline) => offline || response);
    }
    return response;
  }).catch(() => caches.match(OFFLINE_PAGE).then((offline) => offline || Response.error())));
});
