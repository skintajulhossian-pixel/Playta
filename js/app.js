/* ═══════════════════════════════════════════
   PLAYTA — UI LOGIC (app.js)
   Handles: splash screen, game switcher,
   toast notifications, bottom nav, basic
   header interactions.
   Backend (Firebase / Payments) wired in later.
   ═══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initSplashScreen();
  initGameSwitcher();
  initBottomNav();
  initHeaderActions();
  initTournamentCards();
});

/* ───────────────────────────────
   SPLASH SCREEN
   Shows for exactly 3 seconds, then
   fades out (opacity 1 → 0) and reveals
   the main dashboard underneath.
─────────────────────────────── */
function initSplashScreen() {
  const splash = document.getElementById('splash');
  const app = document.getElementById('app');

  window.setTimeout(() => {
    splash.classList.add('fade-out');
    app.classList.add('ready');

    // Remove splash from layout once the fade transition finishes
    // (transition duration is set in CSS: 0.6s)
    window.setTimeout(() => {
      splash.style.display = 'none';
    }, 600);
  }, 3000);
}

/* ───────────────────────────────
   GAME CATEGORY SWITCHER
   Free Fire is active by default.
   Locked games show a "Coming Soon" toast
   instead of loading empty content.
─────────────────────────────── */
function initGameSwitcher() {
  const tiles = document.querySelectorAll('.game-tile');

  const gameNames = {
    freefire: 'Free Fire',
    bgmi: 'BGMI',
    codm: 'COD Mobile',
    valorant: 'Valorant'
  };

  tiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      const game = tile.dataset.game;

      if (!tile.classList.contains('active')) {
        showToast(`Coming Soon! We are launching ${gameNames[game]} tournaments very soon. Stay tuned!`);
        return;
      }

      tiles.forEach((t) => t.classList.remove('active'));
      tile.classList.add('active');
      // Active game tournament list rendering hooks in here later.
    });
  });
}

/* ───────────────────────────────
   BOTTOM NAVIGATION
   Visual active state only for now;
   page routing wires in with backend step.
─────────────────────────────── */
function initBottomNav() {
  const navButtons = document.querySelectorAll('.nav-btn');

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetPage = btn.dataset.page; // e.g. "home", "matches", "leaderboard"
      switchToPage(targetPage);

      navButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

/* ───────────────────────────────
   PAGE / TAB SWITCHING
   Hides every .page-section, then shows
   only the one matching the clicked tab.
   The .active class triggers the CSS
   fade-in animation defined in style.css.
─────────────────────────────── */
function switchToPage(pageName) {
  const sections = document.querySelectorAll('.page-section');

  sections.forEach((section) => {
    section.classList.remove('active');
  });

  const target = document.getElementById(`${pageName}-section`);
  if (target) {
    target.classList.add('active');
  }

  // Scroll back to top so the new tab doesn't open mid-scroll
  document.querySelector('.scroll-area').scrollTo({ top: 0, behavior: 'instant' });
}

/* ───────────────────────────────
   HEADER ACTIONS
   Wallet pill / add-money button / bell icon
─────────────────────────────── */
function initHeaderActions() {
  const walletBtn = document.getElementById('walletBtn');
  const walletAddBtn = document.getElementById('walletAddBtn');
  const bellBtn = document.getElementById('bellBtn');

  walletBtn.addEventListener('click', (e) => {
    if (e.target.closest('#walletAddBtn')) return; // handled separately
    showToast('Wallet page coming up next.');
  });

  walletAddBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showToast('Add Money flow connects here.');
  });

  bellBtn.addEventListener('click', () => {
    showToast('No new notifications.');
  });
}

/* ───────────────────────────────
   TOURNAMENT CARDS
   "Join Match" placeholder until
   backend/auth is wired in.
─────────────────────────────── */
function initTournamentCards() {
  const joinButtons = document.querySelectorAll('.t-join-btn');
  const heroPlayBtn = document.getElementById('heroPlayBtn');

  joinButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.t-card');
      const name = card.querySelector('.t-name').textContent;
      showToast(`Joining "${name}" — sign in to confirm your spot.`);
    });
  });

  heroPlayBtn.addEventListener('click', () => {
    document.querySelector('.tournaments').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* ───────────────────────────────
   TOAST UTILITY
   Single reusable toast queue.
─────────────────────────────── */
let toastTimer = null;

function showToast(message, duration = 2800) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}
