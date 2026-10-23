// RegSonar service worker: lets the site be installed to a home screen and
// keeps the last loaded notices on this device for use offline.
//
// - Pages: network first, falling back to the last saved copy.
// - Built files in /assets/ have hashed names, so a saved copy is always right.
// - Icons and other files in public/: network first, then the saved copy.
// - Notices: network first; offline, the last saved
//   response is returned with an X-RegSonar-Saved header giving when it was saved.
// - Google Fonts: the saved copy is used and refreshed in the background.
// - Pages, public files and notices wait for the network at most WAIT_MS
//   before the saved copy is used.
const VERSION = 'regsonar-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/favicon-32.png'];
const SAVED_API = ['/api/feeds/sync'];
// How long to wait for the network before answering with the saved copy. The
// network request carries on, and a late answer still updates the saved copy;
// with no saved copy the wait continues. The feed's limit is under the page's
// own (60 seconds, src/api/client.ts), so a stalled refresh gets the saved
// notices rather than an error.
const WAIT_MS = { page: 10000, feed: 50000 };

// The answer, or undefined once ms have passed without one
function timeLimit(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

// The network's answer within ms; otherwise, or when offline, the saved copy;
// with neither, the network's answer whenever it comes (or its error)
async function networkWithin(network, ms, cache, cacheKey) {
  // A late failure after the saved copy was used is not an error worth reporting
  network.catch(() => {});
  try {
    const response = await timeLimit(network, ms);
    if (response) return response;
  } catch (err) {
    const saved = await cache.match(cacheKey);
    if (saved) return saved;
    throw err;
  }
  return (await cache.match(cacheKey)) || network;
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(VERSION);
  const network = fetch(request).then(async response => {
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  });
  return networkWithin(network, WAIT_MS.page, cache, cacheKey);
}

async function savedApiResponse(request, url) {
  const cache = await caches.open(VERSION);
  // One saved copy per path and query
  const cacheKey = url.pathname + url.search;
  const network = fetch(request).then(async response => {
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set('X-RegSonar-Saved', new Date().toISOString());
      const body = await response.clone().arrayBuffer();
      await cache.put(cacheKey, new Response(body, { status: response.status, headers }));
    }
    return response;
  });
  return networkWithin(network, WAIT_MS.feed, cache, cacheKey);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const saved = await cache.match(request);
  const fresh = fetch(request)
    .then(response => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => saved);
  return saved || fresh;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.method === 'POST' && url.pathname === '/api/feeds/sync') {
      // A manual refresh: when offline, answer with the saved notices instead
      event.respondWith(savedApiResponse(request, new URL('/api/feeds/sync', url)));
      return;
    }
    if (request.method !== 'GET') return;
    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request, '/'));
    } else if (url.pathname.startsWith('/assets/')) {
      event.respondWith(caches.match(request).then(saved => saved || networkFirst(request, request)));
    } else if (SAVED_API.includes(url.pathname)) {
      event.respondWith(savedApiResponse(request, url));
    } else if (!url.pathname.startsWith('/api/')) {
      // Icons, manifest and other files in public/
      event.respondWith(networkFirst(request, url.pathname));
    }
    return;
  }

  if (request.method === 'GET' && (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com')) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
