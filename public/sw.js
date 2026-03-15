// Porano Perse Service Worker v2 — enhanced caching + offline support
const CACHE_NAME = 'porano-perse-v2';
const MODEL_CACHE = 'porano-perse-models-v1';

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html',
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  const keepCaches = [CACHE_NAME, MODEL_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !keepCaches.includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Helper: is this a GLB model request?
function isModelRequest(url) {
  return url.pathname.startsWith('/models/') && url.pathname.endsWith('.glb');
}

// Helper: is this a static asset (JS/CSS bundles, images, fonts)?
function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname) ||
    url.pathname.startsWith('/_next/static/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Skip API routes
  if (url.pathname.startsWith('/api/')) return;

  // GLB models: cache-first (models rarely change)
  if (isModelRequest(url)) {
    event.respondWith(
      caches.open(MODEL_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Navigation requests: network-first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached || caches.match('/offline.html') || caches.match('/')
          )
        )
    );
    return;
  }

  // Static assets (JS/CSS/images): stale-while-revalidate
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Other same-origin GET: network-first
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
