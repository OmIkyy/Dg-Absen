const CACHE_NAME = 'absensi-dgkomputer-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/logo.jpg',
  '/manifest.json'
];

// Install Event - Pre-cache essential static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up stale cache keys
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Cleaning stale cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Dynamic cache strategy for static assets, network-only for real-time/API
self.addEventListener('fetch', (event) => {
  const reqUrl = new URL(event.request.url);

  // CRITICAL: Always bypass cache for API calls (Supabase), Websockets, or POST/PUT/DELETE write actions
  if (
    event.request.method !== 'GET' ||
    reqUrl.hostname.includes('supabase.co') ||
    reqUrl.pathname.includes('/api/')
  ) {
    // Network only
    return;
  }

  // Network-first with cache fallback strategy for regular pages and static assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If response is valid, put a copy into cache
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline - Attempt cache match
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If HTML request fails and is not cached, return the offline index shell
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/');
          }
        });
      })
  );
});

// Handle Notification Click Event (opens or focuses the app when notification is clicked)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// Handle Push Notifications from Server (allows remote server-side push alarms when app is closed)
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body || 'Waktunya melakukan absensi!',
        icon: data.icon || '/logo.jpg',
        badge: data.badge || '/logo.jpg',
        vibrate: data.vibrate || [500, 150, 500, 150, 500, 150, 500],
        requireInteraction: true,
        renotify: true,
        data: data.data || {},
        tag: data.tag || 'push-alarm',
        actions: [
          { action: 'absen', title: 'Absen Sekarang ➡️' }
        ]
      };
      event.waitUntil(
        self.registration.showNotification(data.title || '🔔 Pengingat Absensi', options)
      );
    } catch (e) {
      // Fallback for plain text push messages
      const text = event.data.text();
      event.waitUntil(
        self.registration.showNotification('🔔 Pengingat Absensi', {
          body: text,
          icon: '/logo.jpg',
          badge: '/logo.jpg',
          vibrate: [500, 150, 500, 150, 500],
          requireInteraction: true,
          renotify: true,
          actions: [
            { action: 'absen', title: 'Absen Sekarang ➡️' }
          ]
        })
      );
    }
  }
});

