// firebase-config.js — Lead Snapper
// ─────────────────────────────────────────────────────────────────
// SETUP INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com
// 2. Create/select your project
// 3. Project Settings → Add App → Web → copy the firebaseConfig below
// 4. Enable Google Sign-In: Authentication → Sign-in method → Google → Enable
// 5. Create Firestore: Firestore Database → Create database (test mode)
// 6. Go to https://console.cloud.google.com → APIs & Services → Credentials
//    Find "Web client (auto created by Google Service)" → copy the Client ID
//    Paste it in manifest.json under "oauth2" → "client_id"
// 7. In that same OAuth client, add Authorized redirect URI:
//    https://<YOUR_EXTENSION_ID>.chromiumapp.org
//    (Find extension ID at chrome://extensions after loading unpacked)
// ─────────────────────────────────────────────────────────────────

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAc5W5xh7qH59_pOKuSyaWF87DqC1UX1xo",
  authDomain: "lead-snapper.firebaseapp.com",
  projectId: "lead-snapper",
  storageBucket: "lead-snapper.firebasestorage.app",
  messagingSenderId: "1086825892115",
  appId: "1:1086825892115:web:4175333d5bc80a9468b2e6",
  measurementId: "G-298SMPZWH6"
};
