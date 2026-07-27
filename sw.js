// ============================================================
//  CRUSHCOMPASS — sw.js   (Service Worker)
//  Handles: PWA offline cache + FCM background push messages
// ============================================================

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const CACHE_NAME = 'findme-v3';

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
const firebaseConfig = {
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

/* ── Fetch: network-first, fallback to cache ─────────────── */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com')    ||
      url.hostname.includes('firebaseio.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, resClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
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
    icon:    '/CrushCompass/icons/icon-192.png',
    badge:   '/CrushCompass/icons/badge-96.png',
    tag:     'findme-' + type,
    renotify: true,
    requireInteraction: type === 'location_request',
    data:    { type, url: payload.fcmOptions?.link ?? '/' },
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

/* ── Notification click handler ─────────────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { type } = event.notification.data ?? {};
  const action   = event.action;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      if (type === 'location_request') {
        if (action === 'accept' || action === 'decline') {
          const openClient = clientList.find(c => c.focused) ?? clientList[0];
          if (openClient) {
            openClient.postMessage({ type: action === 'accept' ? 'sw_accept' : 'sw_decline' });
            return openClient.focus();
          } else {
            return self.clients.openWindow(`/CrushCompass/?action=${action}`);
          }
        }
      }

      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return self.clients.openWindow('/CrushCompass/');
    })
  );
});

/* ── Push event (non-FCM fallback) ───────────────────────── */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    if (!payload.notification) return;
    event.waitUntil(
      self.registration.showNotification(
        payload.notification.title ?? 'FindMe',
        { body: payload.notification.body ?? '', icon: '/CrushCompass/icons/icon-192.png' }
      )
    );
  } catch (e) {
    console.error('[SW] Push parse error:', e);
  }
});
