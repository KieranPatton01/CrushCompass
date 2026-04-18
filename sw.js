// ============================================================
//  FINDME — sw.js   (Service Worker)
//  Handles: PWA offline cache + FCM background push messages
//
//  !! IMPORTANT: Keep firebaseConfig in sync with js/config.js !!
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const CACHE_NAME = 'findme-v1';

const STATIC_ASSETS = [
  '/CrushCompass/',
  '/CrushCompass/index.html',
  '/CrushCompass/manifest.json',
  '/CrushCompass/css/style.css',
  '/CrushCompass/css/compass.css',
  '/CrushCompass/icons/icon-192.png',
  '/CrushCompass/icons/icon-512.png',
];

// !! Keep in sync with js/config.js !!
const firebase = {
  apiKey: "AIzaSyCgp-uyjEwZYyWM3B7DTU-fT4bYqZkrkbw",
  authDomain: "crush-compass.firebaseapp.com",
  databaseURL: "https://crush-compass-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "crush-compass",
  storageBucket: "crush-compass.firebasestorage.app",
  messagingSenderId: "585285811651",
  appId: "1:585285811651:web:1bea9529c3d7ad80559176",
  measurementId: "G-CB1MXJ8VLN"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

/* ── Install: cache static shell ─────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Use addAll but don't fail if some assets are missing
      return Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)));
    })
  );
  self.skipWaiting();
});

/* ── Activate: clear old caches ──────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch: cache-first for static, network-first for API ── */
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase / Google API calls — always network
  const url = new URL(event.request.url);
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com')    ||
      url.hostname.includes('firebaseio.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

/* ── FCM: background message handler ────────────────────── */
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const type  = payload.data?.type ?? '';
  const title = payload.notification?.title ?? 'FindMe';
  const body  = payload.notification?.body  ?? '';

  const notifOptions = {
    body,
    icon:    '/icons/icon-192.png',
    badge:   '/icons/badge-96.png',
    tag:     'findme-' + type,
    renotify: true,
    requireInteraction: type === 'location_request',
    data:    { type, url: payload.fcmOptions?.link ?? '/' },
  };

  // Action buttons only for location request (Android supports these; iOS ignores them)
  if (type === 'location_request') {
    notifOptions.actions = [
      { action: 'accept',  title: '✅ Share Location' },
      { action: 'decline', title: '❌ Not Now'        },
    ];
    notifOptions.vibrate = [200, 100, 200];
  }

  return self.registration.showNotification(title, notifOptions);
});

/* ── Notification click handler ─────────────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { type } = event.notification.data ?? {};
  const action   = event.action;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {

      // If user tapped Accept/Decline action (Android)
      if (type === 'location_request') {
        if (action === 'accept' || action === 'decline') {
          // Try to tell an open client; if none, open app with param
          const openClient = clientList.find(c => c.focused) ?? clientList[0];

          if (openClient) {
            openClient.postMessage({ type: action === 'accept' ? 'sw_accept' : 'sw_decline' });
            return openClient.focus();
          } else {
            // Open app with action encoded in URL
            return self.clients.openWindow(`/?action=${action}`);
          }
        }
      }

      // Default: just open / focus the app
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

/* ── Push event (non-FCM fallback) ───────────────────────── */
self.addEventListener('push', (event) => {
  // FCM SDK handles push events; this is a fallback for raw pushes
  if (!event.data) return;
  try {
    const payload = event.data.json();
    if (!payload.notification) return;
    event.waitUntil(
      self.registration.showNotification(
        payload.notification.title ?? 'FindMe',
        { body: payload.notification.body ?? '', icon: '/icons/icon-192.png' }
      )
    );
  } catch (e) {
    console.error('[SW] Push parse error:', e);
  }
});
