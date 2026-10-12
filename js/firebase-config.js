/* ═══════════════════════════════════════════════════════════
   PLAYTA — Firebase Configuration
   js/firebase-config.js

   SETUP INSTRUCTIONS:
   1. Go to https://console.firebase.google.com
   2. Create project → Add Web App
   3. Copy your config object below
   4. Enable: Authentication (Email/Password + Phone)
              Cloud Firestore (Production mode)
              Firebase Storage
   5. Deploy firestore.rules and storage.rules via Firebase CLI:
      firebase deploy --only firestore:rules,storage
═══════════════════════════════════════════════════════════ */

import { initializeApp }                             from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, setPersistence,
         browserLocalPersistence }                   from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore,
         enableNetwork, disableNetwork,
         connectFirestoreEmulator }                  from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getStorage,
         connectStorageEmulator }                    from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

/* ─────────────────────────────────────────────────────────
   🔑 REPLACE THIS WITH YOUR ACTUAL FIREBASE CONFIG
   Found in: Firebase Console → Project Settings → General
───────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
  measurementId:     "YOUR_MEASUREMENT_ID"
};

/* ─────────────────────────────────────────────────────────
   Initialize Firebase App
───────────────────────────────────────────────────────── */
const app = initializeApp(firebaseConfig);

/* ─────────────────────────────────────────────────────────
   Auth — persist session across browser tabs/refreshes
───────────────────────────────────────────────────────── */
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(console.error);

/* ─────────────────────────────────────────────────────────
   Firestore
───────────────────────────────────────────────────────── */
export const db = getFirestore(app);

/* ─────────────────────────────────────────────────────────
   Storage
───────────────────────────────────────────────────────── */
export const storage = getStorage(app);

/* ─────────────────────────────────────────────────────────
   Development Emulators (uncomment when running locally)
   firebase emulators:start
───────────────────────────────────────────────────────── */
// if (location.hostname === 'localhost') {
//   connectFirestoreEmulator(db, 'localhost', 8080);
//   connectStorageEmulator(storage, 'localhost', 9199);
// }

/* ─────────────────────────────────────────────────────────
   Online / Offline helpers
───────────────────────────────────────────────────────── */
export const goOnline  = () => enableNetwork(db);
export const goOffline = () => disableNetwork(db);

/* ─────────────────────────────────────────────────────────
   Firestore Collection Paths (single source of truth)
───────────────────────────────────────────────────────── */
export const COLLECTIONS = {
  USERS:               'users',
  GAMES:               'games',
  MATCHES:             'matches',
  REGISTRATIONS:       'match_registrations',
  RESULTS:             'match_results',
  SETTLEMENTS:         'settlements',
  WALLET_TX:           'wallet_transactions',
  WITHDRAWALS:         'withdrawal_requests',
  DISPUTES:            'disputes',
  TICKETS:             'support_tickets',
  AUDIT_LOGS:          'audit_logs',
  NOTIFICATIONS:       'notifications',
  BANNERS:             'banners',
  KYC:                 'kyc_submissions',
  FRAUD_FLAGS:         'fraud_flags',
  ADMIN_ACCOUNTS:      'admin_accounts',
};

export default app;
