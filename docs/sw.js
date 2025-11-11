/* eslint-disable no-restricted-globals */
const VERSION = 'v7';
const RUNTIME_CACHE = `runtime-${VERSION}`;
const PRECACHE_CACHE = `precache-${VERSION}`;

self.addEventListener('install', (event) => {
  // Activate immediately so pages can message it
  self.skipWaiting();
  event.waitUntil(caches.open(PRECACHE_CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (!k.endsWith(VERSION)) return caches.delete(k);
    }));
    self.clients.claim();
  })());
});

// Handle runtime fetches
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // cache-first for images & audio
  const isAsset = /\.(?:png|jpg|jpeg|gif|webp|svg|mp3|wav|m4a|ogg)$/i.test(url.pathname);
  if (isAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req, { mode: 'cors' });
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        // fall back to precache if available
        const pre = await caches.open(PRECACHE_CACHE);
        const ph = await pre.match(req);
        if (ph) return ph;
        throw e;
      }
    })());
  }
});

// Allow the page to push URLs to be precached
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'PRECACHE' && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(PRECACHE_CACHE);
      for (const u of data.urls) {
        try {
          const req = new Request(u, { mode: 'cors', cache: 'reload' });
          const res = await fetch(req);
          if (res && res.ok) await cache.put(req, res.clone());
          await new Promise(r => setTimeout(r, 50)); // be polite
        } catch (e) {
          // ignore single failures
        }
      }
    })());
  }
});
