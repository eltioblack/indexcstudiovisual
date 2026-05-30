/* Black Wings Studio — Service Worker
   Estrategia:
   - App shell local (HTML, manifest, íconos): cache-first (funciona offline).
   - CDN de scripts (esm.sh): stale-while-revalidate (rápido y se actualiza).
   - API remove.bg y cualquier POST: siempre a la red (nunca se cachea).
   Sube el número de versión para forzar actualización del shell. */
const VERSION = 'bw-studio-v14';
const SHELL = VERSION + '-shell';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon-180.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Nunca interceptar peticiones que no sean GET (p. ej. POST a remove.bg)
  if (req.method !== 'GET') return;

  // API de recorte: siempre red, sin caché
  if (url.hostname.includes('remove.bg') || url.hostname.includes('api.anthropic.com')) {
    return; // deja que el navegador la maneje directamente
  }

  // Scripts de CDN (esm.sh, jsdelivr...): stale-while-revalidate
  if (url.hostname.includes('esm.sh') || url.hostname.includes('jsdelivr') || url.hostname.includes('unpkg')) {
    e.respondWith(
      caches.open(VERSION + '-cdn').then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // App shell y recursos locales: cache-first con respaldo a red
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        // cachea recursos locales nuevos sobre la marcha
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html')))
    );
  }
});
