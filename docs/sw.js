
const CACHE_NAME = 'animal-words-v1';
const PASS_THROUGH = [/^https:\/\/placehold\.co\//];
self.addEventListener('install', (e)=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME));
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event)=>{
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/cache/')) {
    event.respondWith((async ()=>{
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(event.request);
      if (match) return match;
      // normally there is no network for this synthetic path; just 404
      return new Response('Not found', {status: 404});
    })());
    return;
  }
  if (PASS_THROUGH.some(r=>r.test(event.request.url))) {
    event.respondWith((async ()=>{
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(event.request);
      if (hit) return hit;
      try {
        const res = await fetch(event.request, {mode:'cors'});
        cache.put(event.request, res.clone());
        return res;
      } catch(e) {
        return hit || Response.error();
      }
    })());
    return;
  }
});
