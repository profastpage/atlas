// ========================================
// ATLAS SERVICE WORKER — PWA Engine
// Cloudflare Pages compatible (static file)
// ========================================
//
// Strategies:
//   API routes    → NetworkFirst (tries online, cached fallback)
//   Static assets → CacheFirst (CDN speed)
//   App shell     → StaleWhileRevalidate (instant + update)
//   Offline       → Custom offline fallback page

const CACHE_NAME = 'atlas-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// ========================================
// INSTALL — Precache core assets
// ========================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => {
      return (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
    })
  );
});

// ========================================
// ACTIVATE — Clean old caches
// ========================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
    }).then(() => {
      return (self as unknown as ServiceWorkerGlobalScope).clients.claim();
    })
  );
});

// ========================================
// FETCH — Route strategies
// ========================================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const method = event.request.method;

  // Only intercept GET requests
  if (method !== 'GET') return;

  // API routes → NetworkFirst
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Static assets → CacheFirst
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff')
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // HTML pages → StaleWhileRevalidate
  if (
    event.request.headers.get('accept')?.includes('text/html') ||
    url.pathname === '/' ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/register') ||
    url.pathname.startsWith('/admin')
  ) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
});

// ========================================
// STRATEGIES
// ========================================

async function networkFirst(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'Sin conexion', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached || new Response('Offline', { status: 503 }));

  return cached || fetchPromise;
}

// ========================================
// PUSH NOTIFICATIONS — Stub for Executive Plan
// ========================================

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string } = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Atlas', body: event.data.text() };
    }
  }

  const title = data.title || 'Atlas';
  const options: NotificationOptions = {
    body: data.body || 'Tienes una nueva alerta.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Abrir Atlas' },
      { action: 'dismiss', title: 'Ignorar' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

export {};
