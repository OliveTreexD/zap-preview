// Zap service worker: app shell offline, network-first so updates land fast. Never caches the API.
const CACHE = 'zap-v3-1';
const SHELL = ['./', 'index.html', 'app.css?v=1', 'app.js?v=1', 'script.json', 'manifest.webmanifest', 'icon-192.png', 'img/zap-idle.png', 'img/zap-busy.png', 'img/zap-wave.png', 'img/zap-celebrate.png', 'chime.wav', 'fonts/Nunito-400Regular.ttf', 'fonts/Nunito-700Bold.ttf', 'fonts/Nunito-800ExtraBold.ttf'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/') || u.pathname.endsWith('/api.json')) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: false }).then((m) => m || caches.match('index.html'))));
});
