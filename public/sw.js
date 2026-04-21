// ========================================
// ATLAS SERVICE WORKER — PWA Engine
// Cloudflare Pages compatible (static file)
// Pure vanilla JS — NO TypeScript syntax
// ========================================
//
// Strategies:
//   API routes    -> NetworkFirst (tries online, cached fallback)
//   Static assets -> CacheFirst (CDN speed)
//   App shell     -> StaleWhileRevalidate (instant + update)
//   Offline       -> Custom offline fallback page

var CACHE_NAME = 'atlas-v2';
var OFFLINE_URL = '/offline.html';
var PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/offline.html'
];

// ========================================
// INSTALL — Precache core assets
// ========================================

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ========================================
// ACTIVATE — Clean old caches
// ========================================

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; }).map(function(n) { return caches.delete(n); })
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

  // API routes -> NetworkFirst
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Static assets -> CacheFirst
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

  // HTML pages -> StaleWhileRevalidate
  if (
    event.request.headers.get('accept') &&
    event.request.headers.get('accept').indexOf('text/html') !== -1
  ) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Page routes -> StaleWhileRevalidate
  if (
    url.pathname === '/' ||
    url.pathname.indexOf('/login') === 0 ||
    url.pathname.indexOf('/register') === 0 ||
    url.pathname.indexOf('/admin') === 0
  ) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
});

// ========================================
// STRATEGIES
// ========================================

function networkFirst(request) {
  return fetch(request).then(function(response) {
    if (response.ok) {
      var cloned = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, cloned);
      });
    }
    return response;
  }).catch(function() {
    return caches.match(request).then(function(cached) {
      if (cached) return cached;
      return new Response(
        JSON.stringify({ error: 'Sin conexion', offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    });
  });
}

function cacheFirst(request) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;

    return fetch(request).then(function(response) {
      if (response.ok) {
        var cloned = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, cloned);
        });
      }
      return response;
    }).catch(function() {
      return new Response('', { status: 408, statusText: 'Offline' });
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return cache.match(request).then(function(cached) {
      var fetchPromise = fetch(request).then(function(response) {
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function() {
        return cached || new Response('Offline', { status: 503 });
      });

      return cached || fetchPromise;
    });
  });
}

// ========================================
// PUSH NOTIFICATIONS — Stub for Executive Plan
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
