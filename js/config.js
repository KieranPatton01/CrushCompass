// ============================================================
//  FINDME — config.js
//  !! Edit this file with your Firebase project values !!
// ============================================================

export const CONFIG = {

  // -----------------------------------------------------------
  // Firebase project config
  // Get from: Firebase Console → Project Settings → General → Your apps
  // -----------------------------------------------------------
  firebase: {
    apiKey: "AIzaSyCgp-uyjEwZYyWM3B7DTU-fT4bYqZkrkbw",
    authDomain: "crush-compass.firebaseapp.com",
    databaseURL: "https://crush-compass-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "crush-compass",
    storageBucket: "crush-compass.firebasestorage.app",
    messagingSenderId: "585285811651",
    appId: "1:585285811651:web:1bea9529c3d7ad80559176",
    measurementId: "G-CB1MXJ8VLN"
  },

  // -----------------------------------------------------------
  // VAPID key for Web Push
  // Get from: Firebase Console → Project Settings → Cloud Messaging
  //           → Web Push certificates → Key pair
  // -----------------------------------------------------------
  vapidKey: "BGm8HIz26fX8R1N9CTi0_vgOOc81Piv55PiWU9TcXf_lUocAtAJuFrGKln8wSWZ43vZdrdU3mXWVFNgpU39qVkw",

  // -----------------------------------------------------------
  // The two users — update with your names
  // user1 = YOU, user2 = your partner (or swap, just stay consistent)
  // -----------------------------------------------------------
  users: {
    user1: { name: "Kieran",    emoji: "🧭" },
    user2: { name: "Isla",  emoji: "💫" },
  },

  // -----------------------------------------------------------
  // Your deployed GitHub Pages URL (no trailing slash)
  // Used as the click target in push notifications
  // -----------------------------------------------------------
  appUrl: "https://kieranpatton01.github.io/CrushCompass",

  // -----------------------------------------------------------
  // Behaviour settings
  // -----------------------------------------------------------
  locationUpdateIntervalMs: 10_000,  // how often to push location to Firestore
  requestTimeoutMs:        120_000,  // auto-cancel a request after 2 min
  sessionTimeoutMs:       3_600_000, // auto-end a session after 1 hour
};
