/* ══════════════════════════════════════════
   PLAYTA — Auth Script
   auth.js  |  shared by auth/index.html & auth/signup.html
══════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Post-auth destination ── */
  /* auth/ folder ke andar se root ka index.html */
  var HOME = '../index.html';

  /* ────────────────────────────────
     PASSWORD VISIBILITY TOGGLE
     Finds every .eye-btn that carries
     data-toggle-pwd="<inputId>" and wires
     it up automatically. Works on both pages.
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
      btn.setAttribute('aria-label',
        visible ? 'Hide password' : 'Show password');
    });
  });

  /* ────────────────────────────────
     LOGIN  →  ../index.html
  ──────────────────────────────── */
  var loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      window.location.href = HOME;
    });
  }

  /* ────────────────────────────────
     SIGN-UP  →  ../index.html
  ──────────────────────────────── */
  var signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      window.location.href = HOME;
    });
  }

}());
