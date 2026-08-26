/* ============================================================
   PLAYTA AUTH — script.js
   Login logic, session management, immediate home redirect
   ============================================================ */

'use strict';

/* ── CONFIG ── */
const HOME_URL   = '../index.html';   /* Main app — adjust if needed */
const SIGNUP_URL = 'signup.html';
const SESS_KEY   = 'playta_user_sess';
const USERS_KEY  = 'playta_users';

/* ── ON LOAD: if session exists → skip login ── */
(function checkSession() {
  try {
    const sess = JSON.parse(localStorage.getItem(SESS_KEY));
    if (sess && sess.uid) {
      window.location.replace(HOME_URL);
    }
  } catch (e) {}
})();

/* ════════════════════════
   PASSWORD TOGGLE
════════════════════════ */
function togglePassword() {
  const input  = document.getElementById('login-password');
  const eyeOn  = document.getElementById('eye-on');
  const eyeOff = document.getElementById('eye-off');
  const show   = input.type === 'password';

  input.type         = show ? 'text' : 'password';
  eyeOn.style.display  = show ? 'none'  : 'block';
  eyeOff.style.display = show ? 'block' : 'none';
}

/* ════════════════════════
   ERROR DISPLAY
════════════════════════ */
function showError(msg) {
  const box  = document.getElementById('error-box');
  const text = document.getElementById('error-text');
  if (text && msg) text.textContent = msg;
  if (box)  box.classList.add('visible');
}

function hideError() {
  const box = document.getElementById('error-box');
  if (box) box.classList.remove('visible');
}

/* ════════════════════════
   SOCIAL LOGIN (placeholder)
════════════════════════ */
function socialLogin(provider) {
  showError('Social login coming soon. Please use email or mobile.');
}

/* ════════════════════════
   PASSWORD HASHING
   Simple hash — replace with bcrypt/backend on production
════════════════════════ */
function hashPassword(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) {
    h = Math.imul(31, h) + pw.charCodeAt(i) | 0;
  }
  return 'h_' + Math.abs(h).toString(36) + '_' + pw.length;
}

/* ════════════════════════
   FIND USER in localStorage
════════════════════════ */
function findUser(identifier) {
  const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  const id    = identifier.trim().toLowerCase();
  return users.find(u =>
    (u.email      && u.email.toLowerCase()      === id) ||
    (u.mobile     && u.mobile                   === identifier.replace(/\D/g, '')) ||
    (u.inGameName && u.inGameName.toLowerCase() === id)
  ) || null;
}

/* ════════════════════════
   CREATE SESSION
════════════════════════ */
function createSession(user) {
  const session = {
    uid:        user.uid,
    email:      user.email      || '',
    mobile:     user.mobile     || '',
    inGameName: user.inGameName || '',
    loginAt:    new Date().toISOString()
  };
  localStorage.setItem(SESS_KEY, JSON.stringify(session));
}

/* ════════════════════════
   LOGIN FORM SUBMIT
   → Validates → checks localStorage users
   → On success: IMMEDIATELY redirects to HOME
════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {

  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideError();

    /* Get field values */
    const identifier = document.getElementById('login-id').value.trim();
    const password   = document.getElementById('login-password').value;
    const ageBox     = document.getElementById('age-confirm');

    /* Validation */
    if (!identifier) {
      showError('Please enter your email, mobile or username.');
      return;
    }
    if (!password) {
      showError('Please enter your password.');
      return;
    }
    if (ageBox && !ageBox.checked) {
      showError('You must confirm you are 18+ years old to continue.');
      return;
    }

    /* Loading state */
    const btn = document.getElementById('login-btn');
    btn.classList.add('loading');
    btn.disabled = true;

    /* Short delay to show loading spinner, then authenticate */
    setTimeout(function () {

      const user = findUser(identifier);

      if (user && user.password === hashPassword(password)) {
        /* ✅ Success — create session and IMMEDIATELY go to home */
        createSession(user);
        window.location.href = HOME_URL;
        return;
      }

      /* ❌ Failed — reset button and show error */
      btn.classList.remove('loading');
      btn.disabled = false;
      showError('Invalid email, mobile or password. Please try again.');

    }, 900);
  });

  /* Clear error on input */
  document.getElementById('login-id')?.addEventListener('input', hideError);
  document.getElementById('login-password')?.addEventListener('input', hideError);
});
