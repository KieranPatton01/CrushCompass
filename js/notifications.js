// ============================================================
//  FINDME — notifications.js
//  Firebase Cloud Messaging token management + permissions
// ============================================================

import { getMessaging, getToken, onMessage } from
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js';

let _messaging = null;
let _onForegroundMessage = null;

/* ── Initialise FCM with our service worker ──────────────── */
export async function initNotifications(firebaseApp, vapidKey, swRegistration, onForeground) {
  _messaging = getMessaging(firebaseApp);
  _onForegroundMessage = onForeground;

  // Handle messages received while app is open (foreground)
  onMessage(_messaging, (payload) => {
    console.log('[FCM] Foreground message:', payload);
    _onForegroundMessage?.(payload);
  });

  return _messaging;
}

/* ── Request notification permission + get FCM token ─────── */
export async function requestNotificationPermission(vapidKey, swRegistration) {
  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    throw new Error(`Notification permission ${permission}`);
  }

  if (!_messaging) throw new Error('Messaging not initialised');

  const token = await getToken(_messaging, {
    vapidKey,
    serviceWorkerRegistration: swRegistration,
  });

  if (!token) throw new Error('Failed to get FCM token');

  console.log('[FCM] Token obtained:', token.slice(0, 20) + '...');
  return token;
}

/* ── Check current notification permission state ────────── */
export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/* ── iOS Safari PWA install prompt helper ────────────────── */
export function isIosSafariStandalone() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !('standalone' in navigator && navigator.standalone)
  );
}

export function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator.standalone === true)
  );
}
