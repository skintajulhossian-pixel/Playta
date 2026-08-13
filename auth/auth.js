/* ============================================================
   PLAYTA — auth.js
   Authentication Logic | Session Management | Validation
   Connects to existing app via localStorage session.
   ============================================================

   SESSION KEY:   playta_user_sess  (user-facing app)
   USERS STORE:   playta_users      (registered accounts)
   HOME PAGE:     ../index.html     (auth is in auth/ subfolder)

   ============================================================ */

'use strict';

/* ── CONFIG ── */
const HOME_URL    = '../index.html';  /* auth/ subfolder → root index.html */
const SESS_KEY    = 'playta_user_sess';
const USERS_KEY   = 'playta_users';

/* ── INDIAN STATES LIST ── */
const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
  'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
  'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra & Nagar Haveli and Daman & Diu',
  'Delhi (NCT)','Jammu & Kashmir','Ladakh','Lakshadweep','Puducherry'
];

/* ════════════════════════════════════
   INIT — runs on DOMContentLoaded
   ════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* 1. If user already has a valid session → skip auth → go home */
  if (getSession()) {
    redirect(HOME_URL);
    return;
  }

  /* 2. Populate state dropdown */
  populateStates();

  /* 3. Wire tab buttons */
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  /* 4. Wire form submissions */
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('signup-form')?.addEventListener('submit', handleSignup);

  /* 5. Wire password toggle buttons */
  document.querySelectorAll('.pw-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => togglePassword(btn));
  });

  /* 6. Wire live inline validation on blur */
  document.querySelectorAll('.field-input, .field-select').forEach(el => {
    el.addEventListener('blur', () => validateField(el));
    el.addEventListener('input', () => clearFieldError(el));
  });

  /* 7. Check URL param — ?tab=signup → open signup tab */
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'signup') switchTab('signup');
});

/* ════════════════════════════════════
   SESSION MANAGEMENT
   ════════════════════════════════════ */

function getSession() {
  try {
    const raw = localStorage.getItem(SESS_KEY);
    if (!raw) return null;
    const sess = JSON.parse(raw);
    /* Validate session has required fields */
    if (!sess || !sess.uid || !sess.email) return null;
    return sess;
  } catch {
    return null;
  }
}

function createSession(user) {
  const sess = {
    uid:       user.uid,
    email:     user.email,
    mobile:    user.mobile     || '',
    inGameName:user.inGameName || '',
    state:     user.state      || '',
    createdAt: user.createdAt  || new Date().toISOString(),
    loginAt:   new Date().toISOString()
  };
  localStorage.setItem(SESS_KEY, JSON.stringify(sess));
  return sess;
}

function clearSession() {
  localStorage.removeItem(SESS_KEY);
}

/* ════════════════════════════════════
   USERS STORE (localStorage)
   Replace these with real API calls
   when you wire Firebase/Supabase.
   ════════════════════════════════════ */

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; }
  catch { return []; }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function findUser(identifier) {
  /* Find by email, mobile, or in-game name */
  const id = identifier.trim().toLowerCase();
  return getUsers().find(u =>
    u.email?.toLowerCase()      === id ||
    u.mobile                    === id ||
    u.inGameName?.toLowerCase() === id
  ) || null;
}

function generateUID() {
  return 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
}

/* ════════════════════════════════════
   TAB SWITCHING
   ════════════════════════════════════ */

function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
    t.setAttribute('aria-selected', t.dataset.tab === tab);
  });
  document.querySelectorAll('.auth-form').forEach(f => {
    f.classList.toggle('active', f.id === `${tab}-form`);
  });
  /* Clear all alerts on tab switch */
  clearAllAlerts();
}

/* ════════════════════════════════════
   LOGIN
   ════════════════════════════════════ */

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const idEl = form.querySelector('#login-id');
  const pwEl = form.querySelector('#login-password');

  /* Validate */
  let valid = true;
  if (!validateRequired(idEl, 'Enter your email, mobile or username'))     valid = false;
  if (!validateRequired(pwEl, 'Enter your password'))                       valid = false;
  if (!valid) return;

  const btn = form.querySelector('.btn-auth');
  setLoading(btn, true);
  clearAllAlerts();

  /* Simulate async (replace with real API call) */
  await delay(900);

  const identifier = idEl.value.trim();
  const password   = pwEl.value;
  const user       = findUser(identifier);

  if (!user) {
    setLoading(btn, false);
    showAlert('login-alert', 'No account found with those details. Please check and try again.', 'error');
    setFieldError(idEl, 'Account not found');
    return;
  }

  if (user.password !== hashPassword(password)) {
    setLoading(btn, false);
    showAlert('login-alert', 'Incorrect password. Please try again.', 'error');
    setFieldError(pwEl, 'Incorrect password');
    return;
  }

  /* Success */
  createSession(user);
  showToast('Login successful! Redirecting…', 'success');
  setLoading(btn, false);

  await delay(800);
  redirect(HOME_URL);
}

/* ════════════════════════════════════
   SIGN UP
   ════════════════════════════════════ */

async function handleSignup(e) {
  e.preventDefault();
  const form = e.target;

  const emailEl     = form.querySelector('#signup-email');
  const mobileEl    = form.querySelector('#signup-mobile');
  const nameEl      = form.querySelector('#signup-ingame');
  const stateEl     = form.querySelector('#signup-state');
  const passwordEl  = form.querySelector('#signup-password');
  const ageEl       = form.querySelector('#age-confirm');

  /* Validate all fields */
  let valid = true;
  if (!validateEmail(emailEl))                                                        valid = false;
  if (!validateMobile(mobileEl))                                                      valid = false;
  if (!validateRequired(nameEl, 'Enter your In-Game Name / UID'))                     valid = false;
  if (!validateSelect(stateEl, 'Select your state'))                                  valid = false;
  if (!validateRequired(passwordEl, 'Create a password'))                             valid = false;
  else if (!validatePasswordStrength(passwordEl))                                     valid = false;
  if (!ageEl.checked) {
    showAlert('signup-alert', 'You must confirm you are 18+ years old to continue.', 'error');
    valid = false;
  }
  if (!valid) return;

  const btn = form.querySelector('.btn-auth');
  setLoading(btn, true);
  clearAllAlerts();

  await delay(1100);

  const email    = emailEl.value.trim().toLowerCase();
  const mobile   = mobileEl.value.trim().replace(/\D/g,'');
  const users    = getUsers();

  /* Check duplicates */
  if (users.find(u => u.email === email)) {
    setLoading(btn, false);
    showAlert('signup-alert', 'An account already exists with this email address.', 'error');
    setFieldError(emailEl, 'Email already registered');
    return;
  }
  if (users.find(u => u.mobile === mobile)) {
    setLoading(btn, false);
    showAlert('signup-alert', 'This mobile number is already registered.', 'error');
    setFieldError(mobileEl, 'Mobile number already in use');
    return;
  }

  /* Create new user */
  const newUser = {
    uid:        generateUID(),
    email,
    mobile,
    inGameName: nameEl.value.trim(),
    state:      stateEl.value,
    password:   hashPassword(passwordEl.value),
    createdAt:  new Date().toISOString(),
    walletBalance: 0,
    bonusBalance:  10,   /* Welcome bonus */
    matchesPlayed: 0
  };

  users.push(newUser);
  saveUsers(users);

  /* Auto-login after signup */
  createSession(newUser);

  showAlert('signup-alert', '🎉 Account created! Logging you in…', 'success');
  setLoading(btn, false);

  await delay(1200);
  redirect(HOME_URL);
}

/* ════════════════════════════════════
   VALIDATION HELPERS
   ════════════════════════════════════ */

function validateRequired(el, msg) {
  if (!el.value.trim()) { setFieldError(el, msg); return false; }
  clearFieldError(el);
  return true;
}

function validateEmail(el) {
  const val = el.value.trim();
  if (!val) { setFieldError(el, 'Email address is required'); return false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    setFieldError(el, 'Enter a valid email address');
    return false;
  }
  clearFieldError(el); return true;
}

function validateMobile(el) {
  const val = el.value.trim().replace(/\D/,'');
  if (!el.value.trim()) { setFieldError(el, 'Mobile number is required'); return false; }
  if (!/^[6-9]\d{9}$/.test(el.value.trim().replace(/\D/g,''))) {
    setFieldError(el, 'Enter a valid 10-digit Indian mobile number');
    return false;
  }
  clearFieldError(el); return true;
}

function validateSelect(el, msg) {
  if (!el.value) { setFieldError(el, msg); return false; }
  clearFieldError(el); return true;
}

function validatePasswordStrength(el) {
  const val = el.value;
  if (val.length < 8) {
    setFieldError(el, 'Password must be at least 8 characters');
    return false;
  }
  clearFieldError(el); return true;
}

function validateField(el) {
  /* Generic per-field validation on blur */
  const id = el.id;
  if (id === 'signup-email')    validateEmail(el);
  else if (id === 'signup-mobile') validateMobile(el);
  else if (id === 'signup-password') el.value && validatePasswordStrength(el);
  else if (el.tagName === 'SELECT') validateSelect(el, 'Please select an option');
}

/* ════════════════════════════════════
   UI HELPERS
   ════════════════════════════════════ */

function setFieldError(el, msg) {
  el.classList.add('error');
  const errEl = el.closest('.field-wrap')?.querySelector('.field-error')
             || el.closest('.field')?.querySelector('.field-error');
  if (errEl) { errEl.textContent = '⚠ ' + msg; errEl.classList.add('show'); }
}

function clearFieldError(el) {
  el.classList.remove('error');
  const errEl = el.closest('.field-wrap')?.querySelector('.field-error')
             || el.closest('.field')?.querySelector('.field-error');
  if (errEl) { errEl.textContent = ''; errEl.classList.remove('show'); }
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `auth-alert ${type} show`;
}

function clearAllAlerts() {
  document.querySelectorAll('.auth-alert').forEach(el => {
    el.className = 'auth-alert';
    el.textContent = '';
  });
}

function setLoading(btn, state) {
  btn.classList.toggle('loading', state);
  btn.disabled = state;
}

function togglePassword(btn) {
  const wrap = btn.closest('.field-wrap');
  const inp  = wrap?.querySelector('.field-input');
  if (!inp) return;
  const isText = inp.type === 'text';
  inp.type     = isText ? 'password' : 'text';
  btn.textContent = isText ? '👁' : '🙈';
  btn.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = `show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 2800);
}

function populateStates() {
  const sel = document.getElementById('signup-state');
  if (!sel) return;
  INDIAN_STATES.forEach(s => {
    const opt = document.createElement('option');
    opt.value       = s;
    opt.textContent = s;
    sel.appendChild(opt);
  });
}

function redirect(url) {
  window.location.href = url;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* Simple hash (NOT cryptographically secure — use bcrypt on a real backend) */
function hashPassword(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) {
    h = ((h << 5) - h) + pw.charCodeAt(i);
    h |= 0;
  }
  return 'h_' + Math.abs(h).toString(36) + '_' + pw.length;
}

/* ════════════════════════════════════
   GLOBAL — Expose logout for main app
   Call window.playtaLogout() from the
   existing home page to clear session.
   ════════════════════════════════════ */
window.playtaLogout = function() {
  clearSession();
  redirect('index.html');   /* auth/index.html = this login page */
};

window.playtaGetSession = getSession;
