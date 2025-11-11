
const CACHE = 'animal-words-v3';

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE)); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

// Handle runtime precache requests
self.addEventListener('message', async (event) => {
  const data = event.data || {};
  if (data.type === 'PRECACHE' && Array.isArray(data.urls)) {
    const cache = await caches.open(CACHE);
    await Promise.all(data.urls.map(async (u) => {
      try {
        const req = new Request(u, { mode: 'cors' });
        const hit = await cache.match(req);
        if (!hit) {
          const res = await fetch(req);
          if (res && res.ok) await cache.put(req, res.clone());
        }
      } catch (e) {}
    }));
  }
});

// Cache-first for images; SWR for same-origin
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isImage = /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url.pathname);

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) {
      // background update
      fetch(req).then(res => { if(res.ok) cache.put(req, res.clone()); }).catch(()=>{});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok && (url.origin === location.origin || isImage)) {
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
