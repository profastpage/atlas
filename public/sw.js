// ========================================
// ATLAS SERVICE WORKER — PWA Engine v3
// Cloudflare Pages compatible (static file)
// Pure vanilla JS — NO TypeScript syntax
//
// STRATEGY:
// - HTML + _next/* use NetworkFirst (always try fresh first)
// - No forced reloads, no polling, no version checks
// - Users get new assets naturally on next page load after deploy
// ========================================

var CACHE_VERSION = 'atlas-v3';
var OFFLINE_URL = '/offline.html';

// ========================================
// INSTALL — Precache core assets
// ========================================

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.addAll([
        '/',
        '/manifest.json',
        '/icons/icon-192x192.png',
        '/icons/icon-512x512.png',
        '/offline.html'
      ]);
    }).then(function() {
      return self.skipWaiting(); // Activate immediately, don't wait
    })
  );
});

// ========================================
// ACTIVATE — Clean old caches + notify clients
// ========================================

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_VERSION; }).map(function(n) { return caches.delete(n); })
      );
    }).then(function() {
      return self.clients.claim();
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



  // ---- API routes: NetworkFirst (try online, cached fallback) ----
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request, 10));
    return;
  }

  // ---- _next/static/* (JS bundles, CSS, fonts): NetworkFirst with short cache ----
  // These files have content hashes in filenames, so NetworkFirst is safe
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(networkFirst(event.request, 100));
    return;
  }

  // ---- Build manifest: NetworkFirst ----
  if (url.pathname === '/_next/static/chunks/webpack.json' ||
      url.pathname.indexOf('/_buildManifest') !== -1 ||
      url.pathname.indexOf('/_ssgManifest') !== -1) {
    event.respondWith(networkFirst(event.request, 60));
    return;
  }

  // ---- Icons/images: CacheFirst with long TTL (they rarely change) ----
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico')
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // ---- HTML pages: NetworkFirst (ALWAYS try fresh HTML first) ----
  if (
    (event.request.headers.get('accept') &&
     event.request.headers.get('accept').indexOf('text/html') !== -1) ||
    url.pathname === '/' ||
    url.pathname === '/login' ||
    url.pathname === '/register' ||
    url.pathname === '/update-password' ||
    url.pathname === '/admin'
  ) {
    event.respondWith(networkFirstWithReload(event.request));
    return;
  }

  // ---- Default: NetworkFirst ----
  event.respondWith(networkFirst(event.request, 50));
});

// ========================================
// STRATEGIES
// ========================================

function networkFirst(request, cacheMaxAge) {
  cacheMaxAge = cacheMaxAge || 50;
  return caches.open(CACHE_VERSION).then(function(cache) {
    return fetch(request).then(function(response) {
      if (response.ok) {
        var cloned = response.clone();
        cache.put(request, cloned);
      }
      return response;
    }).catch(function() {
      return cache.match(request).then(function(cached) {
        if (cached) return cached;
        if (request.headers.get('accept') &&
            request.headers.get('accept').indexOf('text/html') !== -1) {
          return caches.match(OFFLINE_URL);
        }
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    });
  });
}

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

function networkFirstWithReload(request) {
  return networkFirst(request, 10);
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
