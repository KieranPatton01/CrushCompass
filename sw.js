// ============================================================
//  CRUSHCOMPASS — sw.js   (Service Worker)
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// !! Keep in sync with js/config.js !!
const firebaseConfig = {
  apiKey:            "AIzaSyCgp-uyjEwZYyWM3B7DTU-fT4bYqZkrkbw",
  authDomain:        "crush-compass.firebaseapp.com",
  projectId:         "crush-compass",
  storageBucket:     "crush-compass.firebasestorage.app",
  messagingSenderId: "585285811651",
  appId:             "1:585285811651:web:1bea9529c3d7ad80559176",
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

const CACHE_NAME = 'crushcompass-v1';

const STATIC_ASSETS = [
  '/CrushCompass/',
  '/CrushCompass/index.html',
  '/CrushCompass/manifest.json',
  '/CrushCompass/css/style.css',
  '/CrushCompass/css/compass.css',
  '/CrushCompass/icons/icon-192.png',
  '/CrushCompass/icons/icon-512.png',
];

/* ── Install ─────────────────────────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)));
    })
  );
  self.skipWaiting();
});

/* ── Activate ────────────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch ───────────────────────────────────────────────── */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

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

/* ── FCM background messages ─────────────────────────────── */
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload);

  const type  = payload.data?.type ?? '';
  const title = payload.notification?.title ?? 'CrushCompass';
  const body  = payload.notification?.body  ?? '';

  const notifOptions = {
    body,
    icon:    '/CrushCompass/icons/icon-192.png',
    badge:   '/CrushCompass/icons/badge-96.png',
    tag:     'crushcompass-' + type,
    renotify: true,
    requireInteraction: type === 'location_request',
    data:    { type, url: payload.fcmOptions?.link ?? '/CrushCompass/' },
  };

  if (type === 'location_request') {
    notifOptions.actions = [
      { action: 'accept',  title: '✅ Share Location' },
      { action: 'decline', title: '❌ Not Now'        },
    ];
    notifOptions.vibrate = [200, 100, 200];
  }

  return self.registration.showNotification(title, notifOptions);
});

/* ── Notification click ──────────────────────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { type } = event.notification.data ?? {};
  const action   = event.action;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      if (type === 'location_request' && (action === 'accept' || action === 'decline')) {
        const openClient = clientList.find(c => c.focused) ?? clientList[0];
        if (openClient) {
          openClient.postMessage({ type: action === 'accept' ? 'sw_accept' : 'sw_decline' });
          return openClient.focus();
        } else {
          return self.clients.openWindow(`/CrushCompass/?action=${action}`);
        }
      }

      if (clientList.length > 0) return clientList[0].focus();
      return self.clients.openWindow('/CrushCompass/');
    })
  );
});

/* ── Push fallback ───────────────────────────────────────── */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    if (!payload.notification) return;
    event.waitUntil(
      self.registration.showNotification(
        payload.notification.title ?? 'CrushCompass',
        { body: payload.notification.body ?? '', icon: '/CrushCompass/icons/icon-192.png' }
      )
    );
  } catch (e) {
    console.error('[SW] Push parse error:', e);
  }
});
