// При изменении файлов приложения повышайте VERSION и APP_VERSION в app.js.
const VERSION = '1.0.2';
const CACHE = 'bbm-shell-' + VERSION;
const ROOT = new URL('./', self.location.href).href;
const FILES = [
  './',
  './app.css',
  './app.js',
  './rituals.js',
  './calendar.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

// Safari не принимает ответ с историей редиректов для навигации.
// Обычно ROOT не редиректит. Защитная нормализация нужна и для сетевого fallback.
function navigationResponse(response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(file => new Request(new URL(file, ROOT), { cache: 'reload' })));
    const rootResponse = await cache.match(ROOT);
    if (rootResponse?.redirected) await cache.put(ROOT, navigationResponse(rootResponse));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('bbm-shell-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      const cachedRoot = await cache.match(ROOT);
      return navigationResponse(cachedRoot || await fetch(ROOT, { cache: 'no-cache' }));
    }
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached || fetch(request);
  })());
});
