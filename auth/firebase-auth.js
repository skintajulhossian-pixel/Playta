/* ═══════════════════════════════════════════════════════════
   PLAYTA — Firebase Authentication Module
   auth/firebase-auth.js

   Replaces the old localStorage-only auth system with real
   Firebase Authentication while keeping the same UX flow.

   Features:
   - Email / Password sign-in & sign-up via Firebase Auth
   - Auto-redirect after login → ../index.html
   - Persist session (browserLocalPersistence)
   - On sign-up → create /users/{uid} doc in Firestore
   - Error messages in plain Hindi-friendly English
   - Falls back gracefully if Firebase is unreachable
═══════════════════════════════════════════════════════════ */

import {
  auth, db, COLLECTIONS
}                                             from '../js/firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
}                                             from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
  doc, setDoc, serverTimestamp
}                                             from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

/* ─────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────── */
const HOME_URL    = '../index.html';
const SESSION_KEY = 'playta_user_sess';

/* ─────────────────────────────────────────────────────────
   FRIENDLY ERROR MESSAGES
───────────────────────────────────────────────────────── */
const AUTH_ERRORS = {
  'auth/user-not-found':       'No account found with this email.',
  'auth/wrong-password':       'Incorrect password. Please try again.',
  'auth/invalid-credential':   'Invalid email or password.',
  'auth/email-already-in-use': 'This email is already registered. Please log in.',
  'auth/weak-password':        'Password must be at least 6 characters.',
  'auth/invalid-email':        'Please enter a valid email address.',
  'auth/too-many-requests':    'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Please check your internet connection.',
  'auth/user-disabled':        'This account has been disabled. Contact support.',
};

function getErrorMessage(error) {
  return AUTH_ERRORS[error.code] || `An error occurred: ${error.message}`;
}

/* ─────────────────────────────────────────────────────────
   SESSION HELPER — keeps localStorage in sync with Firebase
   so existing app.js session checks still work
───────────────────────────────────────────────────────── */
function syncSession(user) {
  if (user) {
    const sess = {
      uid:       user.uid,
      name:      user.displayName || user.email.split('@')[0],
      email:     user.email,
      username:  user.displayName || user.email.split('@')[0],
      loggedIn:  true,
      loginTime: Date.now()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

/* ─────────────────────────────────────────────────────────
   AUTH STATE LISTENER
   Runs on every page load — handles redirects
───────────────────────────────────────────────────────── */
export function listenAuthState(onLoggedIn, onLoggedOut) {
  onAuthStateChanged(auth, (user) => {
    syncSession(user);
    if (user) onLoggedIn(user);
    else       onLoggedOut();
  });
}

/* ═══════════════════════════════════════════════════════════
   LOGIN PAGE — initLoginPage()
═══════════════════════════════════════════════════════════ */
export function initLoginPage() {
  // If already logged in → go home
  onAuthStateChanged(auth, (user) => {
    if (user) { syncSession(user); window.location.href = HOME_URL; }
  });

  const form  = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = getVal('adminEmail') || getVal('loginIdent');
    const password = getVal('adminPass')  || getVal('loginPwd');
    if (!email || !password) { showAuthError('Please fill in all fields.'); return; }

    setLoginLoading(true);
    clearAuthError();

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      syncSession(cred.user);
      window.location.href = HOME_URL;
    } catch (err) {
      showAuthError(getErrorMessage(err));
    } finally {
      setLoginLoading(false);
    }
  });

  // Forgot password
  const forgotBtn = document.getElementById('forgotPassBtn');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', showForgotPasswordUI);
  }
}

/* ─────────────────────────────────────────────────────────
   Forgot Password flow
───────────────────────────────────────────────────────── */
function showForgotPasswordUI() {
  const overlay  = document.getElementById('forgotOverlay') || document.getElementById('forgotModal');
  if (overlay) { overlay.classList.remove('hidden'); return; }

  // If no overlay in DOM, create a minimal one
  const div = document.createElement('div');
  div.id    = 'forgotOverlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:2000;padding:20px';
  div.innerHTML = `
    <div style="background:#0D1117;border:1px solid #252D38;border-radius:16px;padding:28px 24px;width:100%;max-width:360px">
      <h3 style="color:#fff;margin-bottom:8px">Reset Password</h3>
      <p style="color:#8B949E;font-size:13px;margin-bottom:16px">Enter your registered email to receive a reset link.</p>
      <input type="email" id="forgotEmail" placeholder="Your email address"
        style="width:100%;background:#111;border:1px solid #252D38;border-radius:10px;padding:12px 14px;color:#fff;font-size:14px;outline:none;margin-bottom:12px">
      <div id="forgotMsg" style="font-size:12px;margin-bottom:12px;display:none"></div>
      <button id="forgotSendBtn"
        style="width:100%;padding:13px;background:linear-gradient(90deg,#11FF66 0%,#11FF66 55%,#00E5FF 100%);border:none;border-radius:10px;font-weight:800;font-size:14px;color:#000;cursor:pointer;margin-bottom:10px">
        SEND RESET LINK
      </button>
      <button onclick="this.closest('#forgotOverlay').remove()"
        style="width:100%;padding:10px;background:#161B22;border:1px solid #252D38;border-radius:10px;color:#8B949E;cursor:pointer;font-size:13px">
        Cancel
      </button>
    </div>
  `;
  document.body.appendChild(div);
  document.getElementById('forgotSendBtn').addEventListener('click', sendReset);
}

async function sendReset() {
  const email  = getVal('forgotEmail');
  const msgEl  = document.getElementById('forgotMsg');
  if (!email) { if(msgEl){msgEl.style.color='#FF4C4C';msgEl.textContent='Enter your email.';msgEl.style.display='block';} return; }

  try {
    await sendPasswordResetEmail(auth, email.trim());
    if(msgEl){msgEl.style.color='#11FF66';msgEl.textContent='✅ Reset link sent! Check your inbox.';msgEl.style.display='block';}
    setTimeout(() => document.getElementById('forgotOverlay')?.remove(), 3000);
  } catch(err) {
    if(msgEl){msgEl.style.color='#FF4C4C';msgEl.textContent=getErrorMessage(err);msgEl.style.display='block';}
  }
}

/* ═══════════════════════════════════════════════════════════
   SIGN-UP PAGE — initSignupPage()
═══════════════════════════════════════════════════════════ */
export function initSignupPage() {
  // If already logged in → go home
  onAuthStateChanged(auth, (user) => {
    if (user) { syncSession(user); window.location.href = HOME_URL; }
  });

  const form = document.getElementById('signupForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName  = getVal('fullName');
    const username  = getVal('username');
    const mobile    = getVal('mobile');
    const email     = getVal('signupEmail');
    const password  = getVal('signupPwd');
    const confirm   = getVal('confirmPwd');
    const age18     = document.getElementById('ageConfirm')?.checked;
    const terms     = document.getElementById('termsConfirm')?.checked;

    // Validation
    if (!fullName)  { showAuthError('Full name is required.');     return; }
    if (!username)  { showAuthError('Username is required.');      return; }
    if (!mobile)    { showAuthError('Mobile number is required.'); return; }
    if (!email)     { showAuthError('Email address is required.'); return; }
    if (!password)  { showAuthError('Password is required.');      return; }
    if (password !== confirm) { showAuthError('Passwords do not match.'); return; }
    if (password.length < 6)  { showAuthError('Password must be at least 6 characters.'); return; }
    if (!age18)    { showAuthError('You must confirm you are 18 years or older.'); return; }
    if (!terms)    { showAuthError('You must agree to the Terms of Service.');      return; }

    setSignupLoading(true);
    clearAuthError();

    try {
      // 1. Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = cred.user;

      // 2. Update display name
      await updateProfile(user, { displayName: fullName.trim() });

      // 3. Create user document in Firestore
      await setDoc(doc(db, COLLECTIONS.USERS, user.uid), {
        uid:           user.uid,
        fullName:      fullName.trim(),
        username:      username.trim().toLowerCase(),
        mobile:        mobile.trim(),
        email:         email.trim().toLowerCase(),
        walletBalance: 0,
        kycVerified:   false,
        status:        'active',
        createdAt:     serverTimestamp(),
        lastLogin:     serverTimestamp()
      });

      // 4. Sync localStorage session
      syncSession(user);

      // 5. Also save to playta_users (legacy compatibility)
      const legacyUsers = safeJSON(localStorage.getItem('playta_users')) || [];
      legacyUsers.push({
        uid: user.uid, name: fullName.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim(), mobile: mobile.trim(),
        loggedIn: true, joinTime: Date.now()
      });
      localStorage.setItem('playta_users', JSON.stringify(legacyUsers));

      // 6. Redirect home
      window.location.href = HOME_URL;

    } catch(err) {
      showAuthError(getErrorMessage(err));
    } finally {
      setSignupLoading(false);
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   LOGOUT — call from profile / admin logout button
═══════════════════════════════════════════════════════════ */
export async function firebaseLogout() {
  try {
    await signOut(auth);
    syncSession(null);
    window.location.replace('auth/');
  } catch(err) {
    console.error('[PLAYTA] Logout error:', err);
    // Force local logout even if Firebase fails
    syncSession(null);
    window.location.replace('auth/');
  }
}

/* ─────────────────────────────────────────────────────────
   UI HELPERS
───────────────────────────────────────────────────────── */
function getVal(id) {
  return (document.getElementById(id)?.value || '').trim();
}

function showAuthError(msg) {
  const ids = ['loginError','signupError','authError'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.classList.remove('hidden'); return; }
  }
}

function clearAuthError() {
  ['loginError','signupError','authError'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function setLoginLoading(on) {
  const btn  = document.querySelector('#loginForm .btn-login') || document.querySelector('.btn-login');
  if (btn) { btn.disabled = on; btn.textContent = on ? 'LOGGING IN...' : 'LOGIN'; }
}

function setSignupLoading(on) {
  const btn  = document.querySelector('#signupForm .btn-login') || document.querySelector('.btn-login');
  if (btn) { btn.disabled = on; btn.textContent = on ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'; }
}

function safeJSON(str) {
  try { return str ? JSON.parse(str) : null; } catch { return null; }
}
