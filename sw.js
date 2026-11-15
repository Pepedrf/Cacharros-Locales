// Service worker: permite instalar la app y abrirla sin conexión (los datos necesitan red).
// Estrategia "network-first": siempre intenta lo más nuevo y usa la caché solo si no hay red.
const CACHE = 'cacharros-v3';
const SHELL = ['./', './index.html', './css/app.css', './js/app.js', './js/util.js', './js/stats.js',
  './js/config.js', './js/api-supabase.js', './js/api-demo.js', './js/geo.js', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
