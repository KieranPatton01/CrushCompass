// ============================================================
//  CRUSHCOMPASS — functions/index.js
// ============================================================

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore }      = require('firebase-admin/firestore');
const { getMessaging }      = require('firebase-admin/messaging');

initializeApp();
const db        = getFirestore();
const messaging = getMessaging();

const USER_NAMES = {
  user1: 'Kieran',
  user2: 'Isla',
};
const APP_URL = 'https://kieranpatton01.github.io/CrushCompass';

/* ── Trigger: session document write ────────────────────── */
exports.onSessionWrite = onDocumentWritten(
  { document: 'sessions/main', region: 'europe-west1' },
  async (event) => {
    const before = event.data?.before?.data?.() ?? {};
    const after  = event.data?.after?.data?.()  ?? {};

    const prevStatus = before.status ?? 'idle';
    const newStatus  = after.status  ?? 'idle';

    if (prevStatus === newStatus) return null;

    console.log(`[Session] ${prevStatus} → ${newStatus}`);

    switch (newStatus) {
      case 'requesting': {
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
        const requester = after.requestedBy;
        if (!requester) break;
        await sendPush(requester, {
          title: '❌ Request Declined',
          body:  'You Are Getting Cheated On Lil Bro',
          type:  'location_declined',
        });
        break;
      }
    }
    return null;
  }
);

/* ── Send push notification ──────────────────────────────── */
async function sendPush(userId, { title, body, type }) {
  const snap = await db.doc(`users/${userId}`).get();
  if (!snap.exists) return console.warn(`[Push] No user doc for ${userId}`);

  const fcmToken = snap.data().fcmToken;
  if (!fcmToken) return console.warn(`[Push] No token for ${userId}`);

  const message = {
    token: fcmToken,
    notification: { title, body },
    data: { type },
    webpush: {
      headers: {
        Urgency: 'high'
      },
      notification: {
        icon:  `${APP_URL}/icons/icon-192.png`,
        badge: `${APP_URL}/icons/badge-96.png`,
        requireInteraction: type === 'location_request',
        vibrate: type === 'location_request' ? [200, 100, 200] : undefined,
        actions: type === 'location_request' ? [
          { action: 'accept',  title: '✅ Share Location' },
          { action: 'decline', title: "❌ I'm Cheating"        },
        ] : undefined,
      },
      fcmOptions: { link: APP_URL },
    },
    android: {
      priority: 'high',
      notification: { channelId: 'findme_requests', priority: 'max' },
    },
    apns: {
      payload: {
        aps: { alert: { title, body }, sound: 'default', badge: 1 },
      },
    },
  };

  try {
    await messaging.send(message);
    console.log(`[Push] Sent to ${userId}`);
  } catch (e) {
    console.error(`[Push] Failed for ${userId}:`, e.message);
    if (e.code === 'messaging/registration-token-not-registered' ||
        e.code === 'messaging/invalid-registration-token') {
      await db.doc(`users/${userId}`).update({ fcmToken: null });
    }
  }
}
