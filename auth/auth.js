/* ══════════════════════════════════════════
   PLAYTA — Auth Script
   auth.js
   Sets playta_user_sess in localStorage
   before redirecting to home — required by app.js
══════════════════════════════════════════ */

(function () {
  'use strict';

  var HOME = '../index.html';

  /* ────────────────────────────────
     SESSION HELPER
     Sets playta_user_sess in localStorage
     exactly as the main app.js expects it.
  ──────────────────────────────── */
  function setSession(data) {
    try {
      localStorage.setItem('playta_user_sess', JSON.stringify(data));
    } catch (e) {
      console.warn('Session set failed:', e);
    }
  }

  /* ────────────────────────────────
     PASSWORD EYE TOGGLE
  ──────────────────────────────── */
  var EYE_OPEN =
    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
    '<circle cx="12" cy="12" r="3"/>';

  var EYE_CLOSED =
    '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20' +
      'c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>' +
    '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4' +
      'c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>' +
    '<line x1="1" y1="1" x2="23" y2="23"/>';

  document.querySelectorAll('.eye-btn').forEach(function (btn) {
    var targetId = btn.getAttribute('data-toggle-pwd');
    var input    = document.getElementById(targetId);
    var ico      = btn.querySelector('svg');
    if (!input || !ico) return;

    var visible = false;
    btn.addEventListener('click', function () {
      visible       = !visible;
      input.type    = visible ? 'text' : 'password';
      ico.innerHTML = visible ? EYE_CLOSED : EYE_OPEN;
      btn.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    });
  });

  /* ────────────────────────────────
     LOGIN FORM
     Reads whatever user typed,
     saves a session, then goes home.
  ──────────────────────────────── */
  var loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var identVal = (document.getElementById('loginIdent') || {}).value || 'player';
      var pwdVal   = (document.getElementById('loginPwd')   || {}).value || '';

      /* Build session object — same keys app.js looks for */
      var session = {
        username:  identVal,
        name:      identVal,
        email:     identVal.indexOf('@') > -1 ? identVal : '',
        mobile:    '',
        loggedIn:  true,
        loginTime: Date.now()
      };

      setSession(session);
      window.location.href = HOME;
    });
  }

  /* ────────────────────────────────
     SIGN-UP FORM
     Collects all fields, saves a
     full user session, then goes home.
  ──────────────────────────────── */
  var signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var nameVal     = (document.getElementById('fullName')    || {}).value || '';
      var userVal     = (document.getElementById('username')    || {}).value || '';
      var mobileVal   = (document.getElementById('mobile')      || {}).value || '';
      var emailVal    = (document.getElementById('signupEmail') || {}).value || '';

      /* Build session object */
      var session = {
        username:  userVal  || nameVal,
        name:      nameVal,
        email:     emailVal,
        mobile:    mobileVal,
        loggedIn:  true,
        loginTime: Date.now()
      };

      setSession(session);

      /* Also save to playta_users so app.js user list works */
      try {
        var users = JSON.parse(localStorage.getItem('playta_users') || '[]');
        users.push(session);
        localStorage.setItem('playta_users', JSON.stringify(users));
      } catch (e) {}

      window.location.href = HOME;
    });
  }

}());
