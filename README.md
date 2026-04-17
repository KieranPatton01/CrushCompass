# 🧭 FindMe

A PWA compass app for two people to find each other. When one person taps **Find**, the other gets a push notification asking them to share their location. Once both say yes, the compass needle points toward the other person in real-time.

---

## Prerequisites

- A [Firebase project](https://console.firebase.google.com/) — free **Spark** plan works for Firestore + FCM
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- A GitHub repository with GitHub Pages enabled

---

## Setup (do this once)

### 1. Create Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) → New project
2. Enable **Firestore Database** (start in production mode)
3. Enable **Cloud Messaging** (it's on by default)

### 2. Get your Firebase config

Firebase Console → Project Settings → General → Your apps → **Add app** → Web

Copy the config object. You'll need:
- `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`

### 3. Get your VAPID key

Firebase Console → Project Settings → **Cloud Messaging** → Web configuration → **Generate key pair** (or use existing)

Copy the **Key pair** value.

### 4. Configure the app

Edit **`js/config.js`**:
```js
firebase: {
  apiKey:            "...",
  // fill in all fields
},
vapidKey: "...",
users: {
  user1: { name: "YourName",    emoji: "🧭" },
  user2: { name: "PartnerName", emoji: "💫" },
},
appUrl: "https://yourusername.github.io/findme",
```

Edit **`sw.js`** — find the `firebaseConfig` object near the top and fill in the **same values** as above. (This duplication is needed because service workers can't use ES modules.)

Edit **`functions/index.js`** — update `USER_NAMES` and `APP_URL`:
```js
const USER_NAMES = { user1: 'YourName', user2: 'PartnerName' };
const APP_URL = 'https://yourusername.github.io/findme';
```

### 5. Set up Firestore security rules

In the Firebase Console → Firestore → Rules, replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only allow reads/writes to the two user docs and the shared session
    match /users/{userId} {
      allow read, write: if userId == "user1" || userId == "user2";
    }
    match /sessions/main {
      allow read, write: if true;
    }
  }
}
```

### 6. Deploy Cloud Functions

```bash
cd functions
npm install
cd ..
firebase login
firebase use --add   # select your project
firebase deploy --only functions
```

> ℹ️ Cloud Functions require the **Blaze (pay-as-you-go)** plan for outbound network calls, but sending FCM messages via Firebase Admin SDK is free and doesn't count against Blaze quotas. You will not be charged for normal usage of this app.

### 7. Generate PWA icons

You need three icon files in the `icons/` folder:

| File | Size |
|------|------|
| `icon-192.png` | 192×192 |
| `icon-512.png` | 512×512 |
| `apple-touch-icon.png` | 180×180 |
| `badge-96.png` | 96×96 (monochrome, for Android notification bar) |

Use any icon generator, e.g. https://realfavicongenerator.net or https://maskable.app

### 8. Deploy to GitHub Pages

Push all files to your GitHub repo's `main` branch (or `docs/` folder). Enable GitHub Pages in repo Settings → Pages.

Your app will be at: `https://yourusername.github.io/findme`

---

## Installing as PWA

### Android (Chrome)
1. Open the app URL in Chrome
2. Tap the three-dot menu → **Add to Home screen**
3. Accept any permission prompts when the app first opens

### iOS (Safari)
iOS 16.4+ supports web push notifications **only when installed as a PWA**.

1. Open the URL in **Safari** (not Chrome or Firefox)
2. Tap the **Share** button → **Add to Home Screen**
3. Open from the home screen icon — **not** from Safari
4. Accept all permission prompts

> ⚠️ iOS will **not** deliver push notifications if the app is opened in Safari directly. It must be launched from the home screen icon.

---

## How to use

1. Both users open the app and choose their identity (one-time setup, stored locally)
2. Accept all permission prompts
3. When you want to find each other:
   - Tap **Find [Partner's Name]**
   - Your partner gets a push notification
   - They tap **Share Location** in the notification or in the app
4. The compass needle points toward your partner
5. The needle updates as you (or they) move
6. Tap **Stop Sharing** when done

---

## Architecture

```
GitHub Pages (static)          Firebase
┌──────────────────────┐       ┌─────────────────────────┐
│  index.html           │       │  Firestore               │
│  sw.js                │◄─────►│  ├── users/user1         │
│  js/app.js            │       │  ├── users/user2         │
│  js/compass.js        │       │  └── sessions/main       │
│  js/location.js       │       │                         │
│  js/notifications.js  │       │  Cloud Functions         │
│  js/ui.js             │       │  └── onSessionWrite ──► FCM
└──────────────────────┘       └─────────────────────────┘
```

**Session lifecycle:**

```
idle ──► requesting ──► active ──► idle
              └──────► declined ──► idle
```

---

## Troubleshooting

**Notifications not arriving on Android**
- Make sure the app is installed as a PWA (not just bookmarked)
- Check Chrome → Settings → Site Settings → the app URL → Notifications = Allowed
- Make sure the Cloud Function deployed successfully: `firebase functions:log`

**Notifications not arriving on iOS**
- Must be using iOS **16.4 or later**
- Must be opened from the **home screen icon**, not Safari
- Go to Settings → [App Name] → Notifications → Enable

**Compass doesn't rotate**
- On iOS, motion permission must be granted via the in-app prompt (tap "Grant All Permissions")
- On Android, make sure the device has a magnetometer (most do)

**"App failed to start"**
- Open browser DevTools → Console — usually a missing/wrong Firebase config
- Double-check both `js/config.js` AND `sw.js` have the correct config

**Location not updating**
- Check Firestore rules allow writes to `users/user1` and `users/user2`
- Check browser console for Firestore permission errors
