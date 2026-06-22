/* ═══════════════════════════════════════════
   PLAYTA — UI LOGIC (app.js)
   Handles: splash screen, game switcher,
   toast notifications, bottom nav, basic
   header interactions.
   Backend (Firebase / Payments) wired in later.
   ═══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initSplashScreen();
  initHeroCarousel();
  initGameSwitcher();
  initBottomNav();
  initHeaderActions();
  initTournamentCards();
  initEligibilityModal();
  initWalletAndProfileActions();
  initTournamentListView();
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
    freefire: 'Free Fire Max',
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

      openTournamentListView();
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
    switchToPage('wallet');
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelector('.nav-btn[data-page="wallet"]').classList.add('active');
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
   WALLET & PROFILE ACTIONS
   Placeholder handlers until the
   payment/backend integration is wired in.
─────────────────────────────── */
function initWalletAndProfileActions() {
  const addMoneyBtn = document.getElementById('addMoneyBtn');
  const withdrawBtn = document.getElementById('withdrawBtn');
  const profileSaveBtn = document.getElementById('profileSaveBtn');

  if (addMoneyBtn) {
    addMoneyBtn.addEventListener('click', () => {
      setWalletToggle('add');
      showToast('Add Money flow connects here.');
    });
  }

  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', () => {
      setWalletToggle('withdraw');
      showToast('Withdraw flow connects here.');
    });
  }

  if (profileSaveBtn) {
    profileSaveBtn.addEventListener('click', () => {
      const uid = document.getElementById('ffUidInput').value.trim();
      const name = document.getElementById('ffNameInput').value.trim();
      const country = document.getElementById('countrySelect').value;
      const state = document.getElementById('stateSelect').value;

      if (!uid || !name) {
        showToast('Please enter both UID and in-game name.');
        return;
      }
      showToast('Profile saved! (connects to backend next)');
    });
  }
}

/* Swaps which wallet tab ('add' or 'withdraw') shows the
   neon green active style. CSS transition handles the fade. */
function setWalletToggle(mode) {
  const addMoneyBtn = document.getElementById('addMoneyBtn');
  const withdrawBtn = document.getElementById('withdrawBtn');
  if (!addMoneyBtn || !withdrawBtn) return;

  if (mode === 'withdraw') {
    addMoneyBtn.classList.remove('primary');
    addMoneyBtn.classList.add('secondary');
    withdrawBtn.classList.remove('secondary');
    withdrawBtn.classList.add('primary');
  } else {
    withdrawBtn.classList.remove('primary');
    withdrawBtn.classList.add('secondary');
    addMoneyBtn.classList.remove('secondary');
    addMoneyBtn.classList.add('primary');
  }
}

/* ───────────────────────────────
   FEATURED TOURNAMENT CAROUSEL
   Auto-advances every 4s, pauses briefly
   after the user manually swipes, and
   keeps the dots in sync either way.
─────────────────────────────── */
function initHeroCarousel() {
  const track = document.getElementById('heroTrack');
  const dots = document.querySelectorAll('.hero-dot');
  if (!track || dots.length === 0) return;

  const slideCount = dots.length;
  let currentIndex = 0;
  let autoTimer = null;

  function goToSlide(index) {
    currentIndex = (index + slideCount) % slideCount;
    track.scrollTo({
      left: track.clientWidth * currentIndex,
      behavior: 'smooth'
    });
    updateDots();
  }

  function updateDots() {
    dots.forEach((dot, i) => dot.classList.toggle('active', i === currentIndex));
  }

  function startAutoSlide() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => {
      goToSlide(currentIndex + 1);
    }, 4000);
  }

  // Keep dots in sync when the user swipes by hand
  let scrollDebounce = null;
  track.addEventListener('scroll', () => {
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => {
      const newIndex = Math.round(track.scrollLeft / track.clientWidth);
      if (newIndex !== currentIndex) {
        currentIndex = newIndex;
        updateDots();
      }
    }, 100);
  });

  // Restart the auto-slide timer after any manual interaction
  ['touchstart', 'mousedown'].forEach((evt) => {
    track.addEventListener(evt, startAutoSlide);
  });

  startAutoSlide();
}

/* ───────────────────────────────
   TOURNAMENT CARDS
   "Join Match" placeholder until
   backend/auth is wired in.
─────────────────────────────── */
function initTournamentCards() {
  const joinButtons = document.querySelectorAll('.t-join-btn');

  joinButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.t-card');
      const name = card.querySelector('.t-name').textContent;
      showToast(`Joining "${name}" — sign in to confirm your spot.`);
    });
  });
}

/* ───────────────────────────────
   ELIGIBILITY POPUP MODAL
   Clicking the featured banner (#heroBanner)
   opens the modal. Closes via the X icon,
   the Close button, or clicking the overlay.
─────────────────────────────── */
function initEligibilityModal() {
  const heroBanner = document.getElementById('heroBanner');
  const modal = document.getElementById('eligibilityModal');
  const closeX = document.getElementById('eligibilityCloseX');
  const closeBtn = document.getElementById('eligibilityCloseBtn');

  function openModal() {
    modal.classList.add('show');
  }

  function closeModal() {
    modal.classList.remove('show');
  }

  heroBanner.addEventListener('click', openModal);
  closeX.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);

  // Clicking the dark overlay (outside the box) also closes it
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
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

/* ───────────────────────────────
   TOURNAMENT LIST VIEW
   Dynamic data + render + open/close.
   Replace the `tournaments` array below
   with live data from the backend later —
   the render function doesn't need to change.
─────────────────────────────── */

const tournaments = [
  {
    matchId: 271797,
    type: 'Squad',
    time: '22/06/2026 09:50 am',
    totalPrizePool: 310,
    perKillPrize: 6,
    entryFee: 5,
    totalSlots: 48,
    joinedSlots: 24
  },
  {
    matchId: 271812,
    type: 'Solo',
    time: '22/06/2026 10:30 am',
    totalPrizePool: 480,
    perKillPrize: 8,
    entryFee: 10,
    totalSlots: 48,
    joinedSlots: 48
  },
  {
    matchId: 271845,
    type: 'Duo',
    time: '22/06/2026 11:15 am',
    totalPrizePool: 760,
    perKillPrize: 12,
    entryFee: 20,
    totalSlots: 48,
    joinedSlots: 31
  },
  {
    matchId: 271903,
    type: 'Squad',
    time: '22/06/2026 01:00 pm',
    totalPrizePool: 1900,
    perKillPrize: 20,
    entryFee: 50,
    totalSlots: 48,
    joinedSlots: 9
  },
  {
    matchId: 271958,
    type: 'Solo',
    time: '22/06/2026 03:30 pm',
    totalPrizePool: 3800,
    perKillPrize: 35,
    entryFee: 100,
    totalSlots: 48,
    joinedSlots: 44
  },
  {
    matchId: 272014,
    type: 'Squad',
    time: '22/06/2026 06:00 pm',
    totalPrizePool: 19000,
    perKillPrize: 150,
    entryFee: 500,
    totalSlots: 48,
    joinedSlots: 17
  },
  {
    matchId: 272077,
    type: 'Duo',
    time: '22/06/2026 08:30 pm',
    totalPrizePool: 38000,
    perKillPrize: 280,
    entryFee: 1000,
    totalSlots: 48,
    joinedSlots: 5
  }
];

function renderTournamentList() {
  const scrollEl = document.getElementById('tlistScroll');
  if (!scrollEl) return;

  scrollEl.innerHTML = tournaments.map((t) => {
    const isFull = t.joinedSlots >= t.totalSlots;
    const fillPercent = Math.min(100, Math.round((t.joinedSlots / t.totalSlots) * 100));

    return `
      <article class="match-card" data-match-id="${t.matchId}">
        <div class="match-card-top">
          <div class="match-card-id">
            <img src="images/ff-icon.png" alt="" class="match-card-logo">
            <span class="match-card-name">Free Fire Max - Match #${t.matchId}</span>
          </div>
          <span class="match-type-tag">${t.type}</span>
        </div>

        <div class="match-stats-grid">
          <div class="match-stat">
            <span class="match-stat-label">Date &amp; Time</span>
            <span class="match-stat-value">${t.time}</span>
          </div>
          <div class="match-stat">
            <span class="match-stat-label">Prize Pool</span>
            <span class="match-stat-value neon">₹${t.totalPrizePool.toLocaleString('en-IN')}</span>
          </div>
          <div class="match-stat">
            <span class="match-stat-label">Per Kill</span>
            <span class="match-stat-value neon">₹${t.perKillPrize}</span>
          </div>
          <div class="match-stat">
            <span class="match-stat-label">Entry Fee</span>
            <span class="match-stat-value">₹${t.entryFee}</span>
          </div>
        </div>

        <div class="match-card-bottom">
          <div class="match-progress-wrap">
            <div class="match-progress-labels">
              <span>${t.joinedSlots}/${t.totalSlots} joined</span>
              <span>${fillPercent}%</span>
            </div>
            <div class="match-progress-track">
              <div class="match-progress-fill" style="width:${fillPercent}%"></div>
            </div>
          </div>
          <button class="match-join-btn ${isFull ? 'full' : ''}" ${isFull ? 'disabled' : ''}>
            ${isFull ? 'MATCH FULL' : 'Join Match'}
          </button>
        </div>
      </article>
    `;
  }).join('');

  // Wire up Join buttons (event delegation would also work,
  // but the list is short so direct binding is simple and clear)
  scrollEl.querySelectorAll('.match-join-btn:not(.full)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.match-card');
      const matchId = card.dataset.matchId;
      showToast(`Joining Match #${matchId} — sign in to confirm your entry fee.`);
    });
  });
}

function openTournamentListView() {
  const view = document.getElementById('tournamentListView');
  if (!view) return;
  renderTournamentList();
  view.classList.add('show');
}

function closeTournamentListView() {
  const view = document.getElementById('tournamentListView');
  if (!view) return;
  view.classList.remove('show');
}

function initTournamentListView() {
  const backBtn = document.getElementById('tlistBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', closeTournamentListView);
  }
}
