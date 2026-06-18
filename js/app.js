// ============================================================
//  FINDME — app.js
//  Main orchestration: Firebase, session state, location loop
// ============================================================

import { CONFIG } from './config.js';
import * as UI    from './ui.js';
import * as Loc   from './location.js';
import * as Cmp   from './compass.js';
import { initNotifications, requestNotificationPermission,
         getNotificationPermission, isInstalled, isIosSafariStandalone }
  from './notifications.js';

// Firebase SDK (modular v10)
import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp, Timestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/* ── App-level state ─────────────────────────────────────── */
let db            = null;
let firebaseApp   = null;
let swReg         = null;
let myUserId      = null;   // 'user1' | 'user2'
let partnerUserId = null;
let sessionUnsub  = null;
let partnerUnsub  = null;
let sessionStatus = 'idle'; // 'idle' | 'requesting' | 'incoming' | 'active' | 'declined'

/* ── Bootstrap ───────────────────────────────────────────── */
async function boot() {
  // 1. Register service worker
  if ('serviceWorker' in navigator) {
    try {
      swReg = await navigator.serviceWorker.register('./sw.js');
      console.log('[SW] Registered, scope:', swReg.scope);
    } catch (e) {
      console.warn('[SW] Registration failed:', e);
    }
  }

  // 2. Initialise Firebase
  firebaseApp = initializeApp(CONFIG.firebase);
  db          = getFirestore(firebaseApp);

  // 3. Populate identity screen names
  UI.populateIdentityScreen(CONFIG.users);

  // 4. Check if identity already chosen
  const storedId = localStorage.getItem('findme_userid');
  if (storedId === 'user1' || storedId === 'user2') {
    await setIdentity(storedId, false);
  } else {
    UI.showScreen('screen-identity');
  }

  // Listen for messages from SW (notification action clicks)
  navigator.serviceWorker?.addEventListener('message', onSwMessage);
}

/* ── Identity selection ──────────────────────────────────── */
async function setIdentity(userId, saveToStorage = true) {
  myUserId      = userId;
  partnerUserId = userId === 'user1' ? 'user2' : 'user1';

  if (saveToStorage) localStorage.setItem('findme_userid', userId);

  const myName      = CONFIG.users[myUserId].name;
  const partnerName = CONFIG.users[partnerUserId].name;
  UI.setIdentityLabels(myName, partnerName);

  // Check permissions — if all granted, skip straight to main screen
  const needsPerms = await checkPermissionsNeeded();
  if (needsPerms) {
    UI.showScreen('screen-permissions');
    updatePermStatusIcons();
  } else {
    await enterMainApp();
  }
}

/* ── Permission helpers ──────────────────────────────────── */
async function checkPermissionsNeeded() {
  const notifPerm = getNotificationPermission();
  if (notifPerm !== 'granted') return true;

  // Check geolocation
  try {
    const geoStatus = await navigator.permissions?.query({ name: 'geolocation' });
    if (geoStatus?.state !== 'granted') return true;
  } catch { return true; }

  return false;
}

function updatePermStatusIcons() {
  const notifPerm = getNotificationPermission();
  UI.setPermStatus('notification', notifPerm === 'granted' ? 'granted'
                                 : notifPerm === 'denied'  ? 'denied' : 'pending');
}

async function grantPermissions() {
  // 1. Geolocation
  try {
    await Loc.getPositionOnce();
    UI.setPermStatus('location', 'granted');
  } catch {
    UI.setPermStatus('location', 'denied');
    UI.showToast('Location permission is required', 'error');
    return;
  }

  // 2. Notifications + FCM token
  try {
    await initNotifications(firebaseApp, CONFIG.vapidKey, swReg, onForegroundMessage);
    const token = await requestNotificationPermission(CONFIG.vapidKey, swReg);
    UI.setPermStatus('notification', 'granted');
    await saveUserProfile(token);
  } catch (e) {
    UI.setPermStatus('notification', 'denied');
    UI.showToast('Notifications are required for location requests', 'error');
    return;
  }

  // 3. Device orientation (iOS requires gesture-triggered permission)
  try {
    await Cmp.requestOrientationPermission();
    UI.setPermStatus('orientation', 'granted');
  } catch {
    // Non-fatal — compass will be less accurate without it
    UI.setPermStatus('orientation', 'denied');
    Cmp.startOrientationIfAvailable();
  }

  await enterMainApp();
}

/* ── Enter main app ──────────────────────────────────────── */
async function enterMainApp() {
  // Ensure notifications initialised (may already be done in grantPermissions)
  try {
    await initNotifications(firebaseApp, CONFIG.vapidKey, swReg, onForegroundMessage);
    const token = await requestNotificationPermission(CONFIG.vapidKey, swReg);
    await saveUserProfile(token);
  } catch (e) {
    console.warn('[FCM] Could not init notifications:', e);
  }

  Cmp.startOrientationIfAvailable();
  Cmp.initCompass();
  UI.showScreen('screen-main');
  UI.showAction('action-idle');
  UI.setCompassOverlay(true, 'Press Find to share location');

  // Watch own position (for accuracy badge)
  Loc.startLocationWatch((pos) => {
    UI.updateInfoPanel({ myAccuracy: `±${pos.accuracy}m` });
  });

  // Listen for session changes
  listenToSession();
}

/* ── Firestore: save/update user profile ─────────────────── */
async function saveUserProfile(fcmToken) {
  await setDoc(doc(db, 'users', myUserId), {
    name:     CONFIG.users[myUserId].name,
    fcmToken: fcmToken,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function pushMyLocation(position) {
  await setDoc(doc(db, 'users', myUserId), {
    location: {
      lat:       position.lat,
      lng:       position.lng,
      accuracy:  position.accuracy,
      timestamp: serverTimestamp(),
    }
  }, { merge: true });
}

/* ── Session Firestore listener ──────────────────────────── */
function listenToSession() {
  if (sessionUnsub) sessionUnsub();

  sessionUnsub = onSnapshot(doc(db, 'sessions', 'main'), (snap) => {
    const data = snap.exists() ? snap.data() : { status: 'idle' };
    handleSessionUpdate(data);
  });
}

function handleSessionUpdate(data) {
  const prev = sessionStatus;
  sessionStatus = data.status ?? 'idle';

  switch (sessionStatus) {

    case 'idle':
      Loc.stopLocationPusher();
      stopPartnerListener();
      UI.showAction('action-idle');
      UI.setCompassOverlay(true, 'Press Find to share location');
      Cmp.clearTargetBearing();
      UI.stopLastUpdatedTicker();
      UI.stopRequestCountdown();
      UI.setConnectionStatus('offline');
      break;

    case 'requesting':
      if (data.requestedBy === myUserId) {
        // I made the request — show waiting UI
        UI.showAction('action-requesting');
        UI.setCompassOverlay(true, 'Waiting for response…');
        UI.startRequestCountdown(CONFIG.requestTimeoutMs, onRequestTimeout);
      } else {
        // Partner made the request — show incoming UI
        UI.setRequesterName(CONFIG.users[partnerUserId].name);
        UI.showAction('action-incoming');
        UI.setCompassOverlay(true, `${CONFIG.users[partnerUserId].name} wants to find you`);
      }
      break;

    case 'active':
      UI.stopRequestCountdown();
      UI.showAction('action-active');
      UI.setCompassOverlay(false);
      UI.setConnectionStatus('online');

      // Start pushing own location
      Loc.startLocationPusher(CONFIG.locationUpdateIntervalMs, pushMyLocation);

      // Start listening to partner's location
      listenToPartner();
      break;

    case 'declined':
      UI.showToast('Request declined', 'warning');
      resetSession();
      break;
  }
}

/* ── Partner location listener ───────────────────────────── */
function listenToPartner() {
  if (partnerUnsub) partnerUnsub();

  partnerUnsub = onSnapshot(doc(db, 'users', partnerUserId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data.location) return;

    const { lat, lng, accuracy, timestamp } = data.location;
    const myPos = Loc.getCurrentPosition();

    if (myPos) {
      const dist    = Loc.distanceMetres(myPos.lat, myPos.lng, lat, lng);
      const bearing = Loc.bearingDegrees(myPos.lat, myPos.lng, lat, lng);

      Cmp.setTargetBearing(bearing);
      UI.updateInfoPanel({
        distance: Loc.formatDistance(dist),
        bearing:  `${Math.round(bearing)}°`,
      });
    }

    // Last updated ticker
    const ts = timestamp?.toMillis?.() ?? Date.now();
    UI.startLastUpdatedTicker(ts);

    // Staleness check
    const ageSecs = (Date.now() - ts) / 1000;
    UI.setConnectionStatus(ageSecs > 30 ? 'stale' : 'online');
  });
}

function stopPartnerListener() {
  if (partnerUnsub) { partnerUnsub(); partnerUnsub = null; }
}

/* ── Actions ─────────────────────────────────────────────── */
async function requestLocationShare() {
  try {
    await setDoc(doc(db, 'sessions', 'main'), {
      status:      'requesting',
      requestedBy: myUserId,
      requestedAt: serverTimestamp(),
    });
  } catch (e) {
    UI.showToast('Could not send request', 'error');
    console.error(e);
  }
}

async function acceptRequest() {
  try {
    await setDoc(doc(db, 'sessions', 'main'), {
      status:     'active',
      acceptedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    UI.showToast('Failed to accept', 'error');
  }
}

async function declineRequest() {
  try {
    await setDoc(doc(db, 'sessions', 'main'), {
      status:      'declined',
      declinedAt:  serverTimestamp(),
    }, { merge: true });
    // Reset to idle after a moment
    setTimeout(resetSession, 2000);
  } catch (e) {
    console.error(e);
  }
}

async function cancelRequest() {
  await resetSession();
  UI.stopRequestCountdown();
}

async function stopSharing() {
  await resetSession();
}

async function resetSession() {
  try {
    await setDoc(doc(db, 'sessions', 'main'), {
      status:    'idle',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.error('Reset session error:', e);
  }
}

async function onRequestTimeout() {
  UI.showToast('No response — request expired', 'warning');
  await resetSession();
}

/* ── Foreground FCM message handler ─────────────────────── */
function onForegroundMessage(payload) {
  const type = payload.data?.type;
  if (type === 'location_request') {
    UI.showToast(`${CONFIG.users[partnerUserId].name} wants to find you!`, 'info', 6000);
  } else if (type === 'location_accepted') {
    UI.showToast('Location sharing started!', 'success');
  } else if (type === 'location_declined') {
    UI.showToast('Request was declined', 'warning');
  }
}

/* ── Service Worker message handler ────────────────────── */
function onSwMessage(event) {
  const { type } = event.data ?? {};
  if (type === 'sw_accept')  acceptRequest();
  if (type === 'sw_decline') declineRequest();
  if (type === 'sw_open')    {} // already open
}

/* ── Wire up DOM events ──────────────────────────────────── */
function bindEvents() {
  // Identity screen
  document.getElementById('btn-user1').addEventListener('click', () => setIdentity('user1'));
  document.getElementById('btn-user2').addEventListener('click', () => setIdentity('user2'));

  // Permissions screen
  document.getElementById('btn-grant-permissions').addEventListener('click', grantPermissions);

  // Main screen
  document.getElementById('btn-find').addEventListener('click',           requestLocationShare);
  document.getElementById('btn-cancel-request').addEventListener('click', cancelRequest);
  document.getElementById('btn-accept').addEventListener('click',         acceptRequest);
  document.getElementById('btn-decline').addEventListener('click',        declineRequest);
  document.getElementById('btn-stop').addEventListener('click',           stopSharing);

  // Allow changing identity (long-press on own name badge)
  document.getElementById('my-identity').addEventListener('dblclick', () => {
    if (confirm('Switch user?')) {
      localStorage.removeItem('findme_userid');
      location.reload();
    }
  });
}

/* ── Handle action passed via URL param (notification tap on iOS) ── */
async function handlePendingSwAction() {
  const action = window.__pendingSwAction;
  if (!action) return;
  window.__pendingSwAction = null;

  // Wait briefly for session listener to catch up
  await new Promise(r => setTimeout(r, 800));

  if (action === 'accept')  await acceptRequest();
  if (action === 'decline') await declineRequest();
}

/* ── Kick off ────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  boot()
    .then(handlePendingSwAction)
    .catch(err => {
      console.error('[Boot] Fatal error:', err);
      UI.showToast('App failed to start. Check console.', 'error', 10_000);
    });
});
