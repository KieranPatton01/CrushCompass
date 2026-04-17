// ============================================================
//  FINDME — functions/index.js
//  Firebase Cloud Functions
//  Deploy with: firebase deploy --only functions
// ============================================================

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore }      = require('firebase-admin/firestore');
const { getMessaging }      = require('firebase-admin/messaging');

initializeApp();
const db        = getFirestore();
const messaging = getMessaging();

// !! Keep in sync with js/config.js !!
const USER_NAMES = {
  user1: 'kieran',    // Replace with real name
  user2: 'Isla',  // Replace with real name
};

// Your GitHub Pages URL — used as notification click target
const APP_URL = 'https://kieranpatton01.github.io/CrushCompass';

/* ── Trigger: session document write ────────────────────── */
exports.onSessionWrite = onDocumentWritten('sessions/main', async (event) => {
  const before = event.data?.before?.data?.() ?? {};
  const after  = event.data?.after?.data?.()  ?? {};

  const prevStatus = before.status ?? 'idle';
  const newStatus  = after.status  ?? 'idle';

  if (prevStatus === newStatus) return null;  // No status change

  console.log(`[Session] ${prevStatus} → ${newStatus} (requestedBy: ${after.requestedBy})`);

  switch (newStatus) {

    case 'requesting': {
      // Notify the OTHER user that their partner wants to find them
      const target    = after.requestedBy === 'user1' ? 'user2' : 'user1';
      const requester = USER_NAMES[after.requestedBy] ?? 'Your partner';
      await sendPush(target, {
        title: '📍 Location Request',
        body:  `${requester} wants to find you!`,
        type:  'location_request',
      });
      break;
    }

    case 'active': {
      // Notify the requester that their partner accepted
      const requester = after.requestedBy;
      if (!requester) break;
      const accepter = requester === 'user1' ? 'user2' : 'user1';
      await sendPush(requester, {
        title: '✅ Location Accepted',
        body:  `${USER_NAMES[accepter] ?? 'Your partner'} is sharing their location`,
        type:  'location_accepted',
      });
      break;
    }

    case 'declined': {
      // Notify the requester of the decline
      const requester = after.requestedBy;
      if (!requester) break;
      await sendPush(requester, {
        title: '❌ Request Declined',
        body:  'Not available right now',
        type:  'location_declined',
      });
      break;
    }

    default:
      break;
  }

  return null;
});

/* ── Helper: look up FCM token + send ────────────────────── */
async function sendPush(userId, { title, body, type }) {
  let fcmToken;

  try {
    const snap = await db.doc(`users/${userId}`).get();
    if (!snap.exists) {
      console.warn(`[Push] No user doc for ${userId}`);
      return;
    }
    fcmToken = snap.data().fcmToken;
  } catch (e) {
    console.error('[Push] Failed to read user doc:', e);
    return;
  }

  if (!fcmToken) {
    console.warn(`[Push] No FCM token for ${userId}`);
    return;
  }

  const message = {
    token: fcmToken,
    notification: { title, body },
    data: { type },
    webpush: {
      notification: {
        icon:              `${APP_URL}/icons/icon-192.png`,
        badge:             `${APP_URL}/icons/badge-96.png`,
        requireInteraction: type === 'location_request',
        vibrate:            type === 'location_request' ? [200, 100, 200] : undefined,
        actions: type === 'location_request' ? [
          { action: 'accept',  title: '✅ Share Location' },
          { action: 'decline', title: '❌ Not Now'        },
        ] : undefined,
      },
      fcmOptions: {
        link: APP_URL,
      },
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'findme_requests',
        priority: 'max',
        defaultVibrateTimings: true,
      },
    },
    apns: {
      payload: {
        aps: {
          alert: { title, body },
          sound: 'default',
          badge: 1,
          'content-available': 1,
        },
      },
    },
  };

  try {
    const response = await messaging.send(message);
    console.log(`[Push] Sent to ${userId}:`, response);
  } catch (e) {
    console.error(`[Push] Send failed for ${userId}:`, e.message);

    // If token is invalid, clear it from Firestore
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      await db.doc(`users/${userId}`).update({ fcmToken: null });
      console.log(`[Push] Cleared invalid token for ${userId}`);
    }
  }
}
