// ========================================
// ATLAS SERVICE WORKER — PWA Engine v5
// Cloudflare Pages compatible (static file)
// Pure vanilla JS — NO TypeScript syntax
//
// STRATEGY:
// - HTML pages: NETWORK ONLY (never cache HTML, always fresh)
// - _next/static/* (hashed assets): CacheFirst (safe, filename = hash)
// - Icons/images: CacheFirst with long TTL
// - API routes: NetworkOnly (pass through)
// - On SW update: clear ALL caches + one-time client reload
// - No polling, no version.json checks
// ========================================

var CACHE_VERSION = 'atlas-v5';
var OFFLINE_URL = '/offline.html';

// ========================================
// INSTALL — Precache ONLY static assets (NOT HTML!)
// HTML is never cached to prevent stale references to deleted JS chunks
// ========================================

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      // Only precache immutable static assets — NO HTML pages
      return cache.addAll([
        '/manifest.json',
        '/icons/icon-192x192.png',
        '/icons/icon-512x512.png',
        '/offline.html'
      ]);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ========================================
// ACTIVATE — Clean old caches + notify clients
// ========================================

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(n) { return caches.delete(n); }));
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      return self.clients.matchAll({ type: 'window' }).then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        });
      });
    })
  );
});

// ========================================
// FETCH — Route strategies
// ========================================

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);
  var method = event.request.method;

  // Only intercept GET requests
  if (method !== 'GET') return;

  // ---- sw.js itself: NetworkOnly (must always get latest) ----
  if (url.pathname === '/sw.js') {
    return;
  }

  // ---- API routes: NetworkOnly (pass through, no caching) ----
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // ---- _next/static/* (JS bundles, CSS, fonts): CacheFirst ----
  // These files have content hashes in filenames — safe to cache forever
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // ---- Build manifest files: CacheFirst ----
  if (url.pathname === '/_next/static/chunks/webpack.json' ||
      url.pathname.indexOf('/_buildManifest') !== -1 ||
      url.pathname.indexOf('/_ssgManifest') !== -1) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // ---- Icons/images: CacheFirst with long TTL ----
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff')
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // ---- HTML pages: NETWORK ONLY — never cache ----
  // This prevents stale HTML referencing deleted JS chunks
  if (
    (event.request.headers.get('accept') &&
     event.request.headers.get('accept').indexOf('text/html') !== -1) ||
    url.pathname === '/' ||
    url.pathname === '/login' ||
    url.pathname === '/register' ||
    url.pathname === '/update-password' ||
    url.pathname === '/admin'
  ) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(OFFLINE_URL) || new Response(
          '<html><body><h1>Offline</h1><p>No connection available.</p></body></html>',
          { headers: { 'Content-Type': 'text/html' }, status: 503 }
        );
      })
    );
    return;
  }

  // ---- Default: let browser handle normally (no SW interception) ----
});

// ========================================
// STRATEGIES
// ========================================

function cacheFirst(request) {
  return caches.open(CACHE_VERSION).then(function(cache) {
    return cache.match(request).then(function(cached) {
      if (cached) return cached;

      return fetch(request).then(function(response) {
        if (response.ok) {
          var cloned = response.clone();
          cache.put(request, cloned);
        }
        return response;
      }).catch(function() {
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    });
  });
}

// ========================================
// PUSH NOTIFICATIONS — Executive Plan
// ========================================

self.addEventListener('push', function(event) {
  var data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Atlas', body: event.data.text() };
    }
  }

  var title = data.title || 'Atlas';
  var options = {
    body: data.body || 'Tienes una nueva alerta.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Abrir Atlas' },
      { action: 'dismiss', title: 'Ignorar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  var targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(function(clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url === targetUrl && 'focus' in clients[i]) {
          return clients[i].focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
