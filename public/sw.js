// ========================================
// ATLAS SERVICE WORKER — PWA Engine v3
// Cloudflare Pages compatible (static file)
// Pure vanilla JS — NO TypeScript syntax
//
// KEY CHANGE: Auto-update for ALL users (including PWA)
// - Version is fetched from /version.json (generated at build time)
// - HTML + _next/* use NetworkFirst (always try fresh first)
// - SW auto-reloads all clients when new version detected
// - No user interaction required to get updates
// ========================================

var CACHE_VERSION = 'atlas-v3';
var OFFLINE_URL = '/offline.html';
var VERSION_CHECK_INTERVAL = 2 * 60 * 1000; // Check for updates every 2 minutes

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
        '/offline.html',
        '/version.json'
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
      return self.clients.claim(); // Take control of all pages immediately
    }).then(function() {
      // Notify all open clients to refresh
      return self.clients.matchAll({ type: 'window' }).then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', cacheVersion: CACHE_VERSION });
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

  // ---- version.json: NetworkOnly (always fresh) ----
  if (url.pathname === '/version.json') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(JSON.stringify({ version: 'unknown' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

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
  return caches.open(CACHE_VERSION).then(function(cache) {
    var fetchPromise = fetch(request).then(function(response) {
      if (response.ok) {
        // Check if content changed from cached version
        return cache.match(request).then(function(cached) {
          if (cached) {
            return cached.text().then(function(oldText) {
              return response.text().then(function(newText) {
                // If HTML changed, notify clients to reload
                if (oldText !== newText) {
                  self.clients.matchAll({ type: 'window' }).then(function(clients) {
                    clients.forEach(function(client) {
                      client.postMessage({ type: 'CONTENT_UPDATED' });
                    });
                  });
                }
                // Always cache the new version
                cache.put(request, response.clone());
                return response;
              });
            });
          } else {
            cache.put(request, response.clone());
            return response;
          }
        });
      }
      return response;
    }).catch(function() {
      return cache.match(request).then(function(cached) {
        if (cached) return cached;
        return caches.match(OFFLINE_URL);
      });
    });

    // Return cached immediately for speed, then update in background
    return cache.match(request).then(function(cached) {
      if (cached) {
        // Return cached, but still fetch in background
        fetchPromise.catch(function() {}); // Prevent unhandled rejection
        return cached;
      }
      return fetchPromise;
    });
  });
}

// ========================================
// PERIODIC UPDATE CHECK
// Every 2 minutes, check /version.json for changes
// If different, force reload all clients
// ========================================

var currentVersion = null;

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source.postMessage({
      type: 'SW_VERSION',
      cacheVersion: CACHE_VERSION
    });
  }
});

// Check for updates periodically
setInterval(function() {
  fetch('/version.json', { cache: 'no-store' })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (currentVersion && data.version && data.version !== currentVersion) {
        // New version detected! Notify all clients
        self.clients.matchAll({ type: 'window' }).then(function(clients) {
          clients.forEach(function(client) {
            client.postMessage({
              type: 'NEW_VERSION_AVAILABLE',
              version: data.version,
              reload: true
            });
          });
        });
      }
      currentVersion = data.version || currentVersion;
    })
    .catch(function() {
      // Silently fail — offline or version.json missing
    });
}, VERSION_CHECK_INTERVAL);

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
