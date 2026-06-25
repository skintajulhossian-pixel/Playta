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
  initEligibilityModal();
  initWalletAndProfileActions();
  initTournamentListView();
  initMyMatches();
  initProfileRequiredPopup();
  syncWalletUI();
  renderHomeTournaments();
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
      // Demo top-up until Razorpay is wired in — adds ₹100 to real deposit balance
      depositBalance += 100;
      syncWalletUI();
      showToast('₹100 added to Deposit balance! (Razorpay connects here)', 'ok');
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

      playerProfile.ffUid = uid;
      playerProfile.ffName = name;
      playerProfile.country = country;
      playerProfile.state = state;

      showToast('Profile saved!', 'ok');
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
   PROFILE REQUIRED POPUP
   Shown when a user without a saved Free Fire
   UID / In-Game Name tries to join a match.
   Lets them fill in both fields right here and
   resumes the match registration immediately —
   no need to leave the Tournament List screen.
─────────────────────────────── */
function showProfileRequiredPopup() {
  const modal = document.getElementById('profileRequiredModal');
  if (!modal) return;

  // Pre-fill with anything already saved, so re-opening isn't a blank slate
  document.getElementById('prUidInput').value = playerProfile.ffUid;
  document.getElementById('prNameInput').value = playerProfile.ffName;
  document.getElementById('prErr').textContent = '';

  modal.classList.add('show');
}

function hideProfileRequiredPopup() {
  const modal = document.getElementById('profileRequiredModal');
  if (modal) modal.classList.remove('show');
  pendingMatchToJoin = null;
}

function initProfileRequiredPopup() {
  const modal = document.getElementById('profileRequiredModal');
  const closeX = document.getElementById('profileRequiredCloseX');
  const saveBtn = document.getElementById('profileRequiredGoBtn');
  const errEl = document.getElementById('prErr');
  if (!modal) return;

  closeX.addEventListener('click', hideProfileRequiredPopup);

  saveBtn.addEventListener('click', () => {
    const uid = document.getElementById('prUidInput').value.trim();
    const name = document.getElementById('prNameInput').value.trim();

    if (!uid || !name) {
      errEl.textContent = 'Please enter both UID and in-game name.';
      return;
    }
    errEl.textContent = '';

    // Save to the same global profile the Profile tab reads/writes
    playerProfile.ffUid = uid;
    playerProfile.ffName = name;

    // Keep the Profile page's own inputs in sync, in case it's
    // re-opened later — single source of truth either way.
    const profileUidInput = document.getElementById('ffUidInput');
    const profileNameInput = document.getElementById('ffNameInput');
    if (profileUidInput) profileUidInput.value = uid;
    if (profileNameInput) profileNameInput.value = name;

    modal.classList.remove('show');

    // Resume the match the user was originally trying to join
    const match = pendingMatchToJoin;
    pendingMatchToJoin = null;

    if (match) {
      const success = payAndRegister(match);
      if (success) {
        renderPaidTournaments();
        renderMyMatches();
      }
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideProfileRequiredPopup();
  });
}

/* ───────────────────────────────
   TOAST UTILITY
   Single reusable toast queue.
─────────────────────────────── */
let toastTimer = null;

function showToast(message, type = '', duration = 2800) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = type ? `toast show ${type}` : 'toast show';

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

/* ───────────────────────────────
   PLAYER PROFILE STATE
   Tracks the user's saved Free Fire identity.
   payAndRegister() checks this before allowing
   anyone to join a match.
─────────────────────────────── */
const playerProfile = {
  name: '',
  ffUid: '',
  ffName: '',
  country: '',
  state: ''
};

function isProfileComplete() {
  return playerProfile.ffUid.trim() !== '' && playerProfile.ffName.trim() !== '';
}

// Remembers which match the user was trying to join when the
// Profile Required popup interrupted them, so we can resume
// registration the instant they save their UID/IGN.
let pendingMatchToJoin = null;

/* ───────────────────────────────
   WALLET SYSTEM
   Three real balance buckets + sync.

   depositBalance  — real money the user added via Razorpay
   winningBalance  — real money won from tournaments
   bonusBalance    — promotional credit (capped per-match use)
   totalBalance    — always recalculated, never edited directly
─────────────────────────────── */
let depositBalance = 0;
let winningBalance = 0;
let bonusBalance = 10;   // ₹10 signup bonus, matches the existing UI default
let totalBalance = depositBalance + winningBalance + bonusBalance;

const MAX_BONUS_PERCENT = 0.10; // WinZO/Dream11-style cap: max 10% of entry fee from bonus

function syncWalletUI() {
  totalBalance = depositBalance + winningBalance + bonusBalance;

  const totalEl = document.getElementById('walletTotalValue');
  const depositEl = document.getElementById('depositValue');
  const winningEl = document.getElementById('winningValue');
  const bonusEl = document.getElementById('bonusValue');
  const navBalEl = document.getElementById('walletBalance');
  const navBonusEl = document.getElementById('walletBonus');

  if (totalEl) totalEl.textContent = `₹${totalBalance.toLocaleString('en-IN')}`;
  if (depositEl) depositEl.textContent = `₹${depositBalance.toLocaleString('en-IN')}`;
  if (winningEl) winningEl.textContent = `₹${winningBalance.toLocaleString('en-IN')}`;
  if (bonusEl) bonusEl.textContent = `₹${bonusBalance.toLocaleString('en-IN')}`;

  // Tiny navbar pill: real cash (deposit + winnings) + bonus, kept in sync with the wallet page
  if (navBalEl) navBalEl.textContent = (depositBalance + winningBalance).toLocaleString('en-IN');
  if (navBonusEl) navBonusEl.textContent = `₹${bonusBalance.toLocaleString('en-IN')}`;
}

/* Smart deduction: max 10% of the entry fee can come from
   bonusBalance, the rest must come from real cash (deposit
   first, then winnings). Returns true on success, false
   (with a toast) if real cash is insufficient. */
function deductEntryFee(entryFee) {
  const maxBonusUsable = Math.floor(entryFee * MAX_BONUS_PERCENT);
  const bonusToUse = Math.min(bonusBalance, maxBonusUsable);
  const remainingFromCash = entryFee - bonusToUse;
  const realCashAvailable = depositBalance + winningBalance;

  if (realCashAvailable < remainingFromCash) {
    showToast('Not enough real cash. Only 10% bonus can be used per match. Please Add Money!');
    return false;
  }

  // Deduct bonus portion
  bonusBalance -= bonusToUse;

  // Deduct the rest from deposit first, then winnings
  let fromDeposit = Math.min(depositBalance, remainingFromCash);
  depositBalance -= fromDeposit;
  let stillOwed = remainingFromCash - fromDeposit;
  if (stillOwed > 0) {
    winningBalance -= stillOwed;
  }

  syncWalletUI();
  return true;
}

/* Called when the user taps "Pay & Register" on a match. */
function payAndRegister(match) {
  if (match.isJoined) return false;

  if (!isProfileComplete()) {
    pendingMatchToJoin = match;
    showProfileRequiredPopup();
    return false;
  }

  const paid = deductEntryFee(match.entryFee);
  if (!paid) return false;

  match.isJoined = true;
  match.joinedSlots = Math.min(match.totalSlots, match.joinedSlots + 1);
  showToast(`Registered for Match ${match.matchId}! ₹${match.entryFee} deducted.`, 'ok');
  return true;
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
    matchId: '#271797',
    type: 'Squad',
    matchTitle: 'SQUAD - Bermuda Map | Ryden BAN | Screen Recording Mandatory',
    time: '22/06/2026 09:50 am',
    startsAt: Date.now() + 20 * 1000,        // demo: starts in 20s
    totalPrizePool: 310,
    perKillPrize: 6,
    entryFee: 5,
    totalSlots: 48,
    joinedSlots: 24,
    isJoined: false,
    roomId: '9876543',
    roomPassword: 'playta123'
  },
  {
    matchId: '#271812',
    type: 'Solo',
    matchTitle: 'SOLO - Bermuda Map | Ryden BAN | Level 40+',
    time: '22/06/2026 10:30 am',
    startsAt: Date.now() + 45 * 60 * 1000,   // demo: starts in 45 min
    totalPrizePool: 480,
    perKillPrize: 8,
    entryFee: 10,
    totalSlots: 50,
    joinedSlots: 50,
    isJoined: false,
    roomId: '9876544',
    roomPassword: 'playta456'
  },
  {
    matchId: '#271845',
    type: 'Duo',
    matchTitle: 'DUO - Purgatory Map | Auto Headshot OFF | Full Map',
    time: '22/06/2026 11:15 am',
    startsAt: Date.now() + 90 * 60 * 1000,
    totalPrizePool: 760,
    perKillPrize: 12,
    entryFee: 20,
    totalSlots: 50,
    joinedSlots: 31,
    isJoined: false,
    roomId: '9876545',
    roomPassword: 'playta789'
  },
  {
    matchId: '#271903',
    type: 'Squad',
    matchTitle: 'SQUAD - Kalahari Full Map | M79 &amp; Vector Banned',
    time: '22/06/2026 01:00 pm',
    startsAt: Date.now() + 3 * 60 * 60 * 1000,
    totalPrizePool: 1900,
    perKillPrize: 20,
    entryFee: 50,
    totalSlots: 48,
    joinedSlots: 9,
    isJoined: false,
    roomId: '9876546',
    roomPassword: 'playta101'
  },
  {
    matchId: '#271958',
    type: 'Solo',
    matchTitle: 'SOLO - Bermuda Remastered | No Vehicle | Screen Recording Mandatory',
    time: '22/06/2026 03:30 pm',
    startsAt: Date.now() + 5 * 60 * 60 * 1000,
    totalPrizePool: 3800,
    perKillPrize: 35,
    entryFee: 100,
    totalSlots: 50,
    joinedSlots: 44,
    isJoined: false,
    roomId: '9876547',
    roomPassword: 'playta202'
  },
  {
    matchId: '#272014',
    type: 'Squad',
    matchTitle: 'SQUAD - Kalahari Map | Sniper Only | Ryden &amp; M82B Banned',
    time: '22/06/2026 06:00 pm',
    startsAt: Date.now() + 8 * 60 * 60 * 1000,
    totalPrizePool: 19000,
    perKillPrize: 150,
    entryFee: 500,
    totalSlots: 48,
    joinedSlots: 17,
    isJoined: false,
    roomId: '9876548',
    roomPassword: 'playta303'
  },
  {
    matchId: '#272077',
    type: 'Duo',
    matchTitle: 'DUO - Purgatory Map | Pro Players Only | Screen Recording Mandatory',
    time: '22/06/2026 08:30 pm',
    startsAt: Date.now() + 10 * 60 * 60 * 1000,
    totalPrizePool: 38000,
    perKillPrize: 280,
    entryFee: 1000,
    totalSlots: 50,
    joinedSlots: 5,
    isJoined: false,
    roomId: '9876549',
    roomPassword: 'playta404'
  },
  {
    matchId: '#272150',
    type: 'Solo',
    matchTitle: 'SOLO - Bermuda Map | Free Weekly Championship | Level 30+',
    time: '23/06/2026 06:30 pm',
    startsAt: Date.now() + 90 * 60 * 1000,
    totalPrizePool: 5000,
    perKillPrize: 15,
    entryFee: 0,
    totalSlots: 50,
    joinedSlots: 38,
    isJoined: false,
    roomId: '9876550',
    roomPassword: 'playta505'
  },
  {
    matchId: '#272188',
    type: 'Squad',
    matchTitle: 'SQUAD - Purgatory Map | Free Entry | Screen Recording Mandatory',
    time: '24/06/2026 07:00 pm',
    startsAt: Date.now() + 2 * 60 * 60 * 1000,
    totalPrizePool: 12000,
    perKillPrize: 25,
    entryFee: 0,
    totalSlots: 48,
    joinedSlots: 24,
    isJoined: false,
    roomId: '9876551',
    roomPassword: 'playta606'
  }
];

/* Builds the HTML for one match card. Shared by the Home page
   featured list and the full Tournament List View so both use
   the exact same visual design.

   options:
     showPerKill — include the "Per Kill" stat column (4-col grid)
                   or omit it for a simpler 3-col grid (Home page)
     showRoomBox — include the Room ID/Password reveal box
                   (only relevant once the user can join matches) */
function buildMatchCardHtml(t, options = {}) {
  const { showRoomBox = true } = options;

  // Capacity rule: Solo & Duo matches are full at 50 slots, Squad at 48 slots
  const capacity = t.type === 'Squad' ? 48 : 50;
  const isFull = t.joinedSlots >= capacity;
  const spotsLeft = Math.max(0, capacity - t.joinedSlots);
  const fillPercent = Math.min(100, Math.round((t.joinedSlots / capacity) * 100));

  let btnLabel = 'Join Match';
  let btnClass = '';
  let btnDisabled = '';
  if (t.isJoined) {
    btnLabel = 'Joined';
    btnClass = 'registered';
    btnDisabled = 'disabled';
  } else if (isFull) {
    btnLabel = 'MATCH FULL';
    btnClass = 'full';
    btnDisabled = 'disabled';
  }

  const entryFeeDisplay = t.entryFee === 0 ? 'Free' : `₹${t.entryFee}`;

  return `
      <article class="match-card" data-match-id="${t.matchId}">
        <div class="match-card-top">
          <div class="match-card-id">
            <img src="images/ff-icon.png" alt="" class="match-card-logo">
            <span class="match-card-name">Free Fire Max - Match ${t.matchId}</span>
          </div>
          <span class="match-type-tag">${t.type}</span>
        </div>

        <div class="match-title-row">${t.matchTitle}</div>

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
            <span class="match-stat-value">${entryFeeDisplay}</span>
          </div>
        </div>

        <div class="match-progress-wrap">
          <div class="match-progress-labels">
            <span>${t.joinedSlots} joined</span>
            <span class="match-spots-left">${spotsLeft} spots left</span>
          </div>
          <div class="match-progress-track">
            <div class="match-progress-fill" style="width:${fillPercent}%"></div>
          </div>
        </div>

        <button class="match-join-btn-full ${btnClass}" ${btnDisabled}>
          ${btnLabel}
        </button>

        ${showRoomBox ? renderRoomBox(t) : ''}
      </article>
    `;
}

/* Wires up the "Join Match" buttons inside any container that was
   filled using buildMatchCardHtml (Home featured list or the
   full Tournament List). Re-renders both lists on success so
   they never fall out of sync. */
function bindMatchJoinButtons(container, onJoinedRerender) {
  container.querySelectorAll('.match-join-btn-full:not(.full):not(.registered)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.match-card');
      const matchId = card.dataset.matchId;
      const match = tournaments.find((t) => t.matchId === matchId);
      if (!match) return;

      const success = payAndRegister(match);
      if (success) onJoinedRerender();
    });
  });

  bindRoomBoxEvents(container);
}

function renderPaidTournaments() {
  const scrollEl = document.getElementById('tlistScroll');
  if (!scrollEl) return;

  // The full Tournament List (Free Fire Max screen) shows only
  // paid matches — the free/mega draws live on the Home page.
  scrollEl.innerHTML = tournaments
    .filter((t) => t.entryFee > 0)
    .map((t) => buildMatchCardHtml(t))
    .join('');

  bindMatchJoinButtons(scrollEl, () => {
    renderPaidTournaments();
    renderHomeTournaments();
    renderMyMatches();
  });
}

/* Home page preview: only the top 2 free-entry tournaments
   (the soonest-starting, biggest draws), using the exact same
   card design as the Tournament List — including the Room
   ID/Password box, which only ever unlocks for matches the
   user has actually joined. */
function renderHomeTournaments() {
  const listEl = document.getElementById('homeFeaturedList');
  if (!listEl) return;

  // Home page shows only free-entry tournaments — the big draws
  // meant to attract new players. Paid matches stay in the full
  // Tournament List, reached via the Free Fire Max game tile.
  const featured = tournaments
    .filter((t) => t.entryFee === 0)
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, 2);

  listEl.innerHTML = featured
    .map((t) => buildMatchCardHtml(t))
    .join('');

  bindMatchJoinButtons(listEl, () => {
    renderHomeTournaments();
    renderPaidTournaments();
    renderMyMatches();
  });
}

function openTournamentListView() {
  const view = document.getElementById('tournamentListView');
  if (!view) return;
  renderPaidTournaments();
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

/* ───────────────────────────────
   MY MATCHES
   Pulls registered matches straight from the shared
   `tournaments` array (isJoined === true) — one
   source of truth, no duplicate data to keep in sync.
─────────────────────────────── */

function formatMatchTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function renderMyMatches() {
  const listEl = document.getElementById('mmUpcomingList');
  if (!listEl) return;

  const registered = tournaments.filter((t) => t.isJoined);

  if (registered.length === 0) {
    listEl.innerHTML = '<p class="mm-empty">You haven\'t registered for any match yet. Join a tournament from the Free Fire Max list!</p>';
    return;
  }

  listEl.innerHTML = registered.map((m) => `
    <article class="t-card" data-match-id="${m.matchId}">
      <div class="t-card-top">
        <div class="t-game-icon">🔥</div>
        <div class="t-card-info">
          <div class="t-name">Free Fire Max - Match ${m.matchId}</div>
          <div class="t-time">${formatMatchTime(m.startsAt)}</div>
        </div>
        <div class="t-mode">${m.type}</div>
      </div>

      <div class="mm-card-title-row">${m.matchTitle}</div>

      <div class="t-stats">
        <div class="t-stat">
          <span class="t-stat-label">Prize Pool</span>
          <span class="t-stat-value prize">₹${m.totalPrizePool.toLocaleString('en-IN')}</span>
        </div>
        <div class="t-stat">
          <span class="t-stat-label">Per Kill</span>
          <span class="t-stat-value prize">₹${m.perKillPrize}</span>
        </div>
      </div>

      <span class="mm-registered-badge">Registered</span>

      ${renderRoomBox(m)}
    </article>
  `).join('');

  bindRoomBoxEvents(listEl);
}

/* ── Shared 3-state Room ID/Password box ──
   State 1 — not registered:        strictly locked, red/grey lock
   State 2 — registered, > 1 min:   locked, cyan/yellow lock + note
   State 3 — registered, <= 1 min:  unlocked, shows Room ID/Password + Copy
   Used both in the Tournament List view and My Matches. */
function renderRoomBox(m) {
  const roomKey = m.matchId.replace('#', '');

  if (!m.isJoined) {
    return `
      <div class="mm-room-box state-unjoined" data-match-id="${m.matchId}" data-starts-at="${m.startsAt}" data-joined="false">
        <div class="mm-room-locked">
          <span class="mm-room-lock-icon">🔒</span>
          <span class="mm-room-locked-text">Join the match to unlock Room ID &amp; Password.</span>
        </div>
      </div>`;
  }

  return `
    <div class="mm-room-box state-joined" id="room-${roomKey}" data-match-id="${m.matchId}" data-starts-at="${m.startsAt}" data-joined="true">
      <div class="mm-room-locked">
        <span class="mm-room-lock-icon">🔒</span>
        <span class="mm-room-locked-text">You are registered! Room details will be revealed exactly 1 minute before the match.</span>
      </div>
      <div class="mm-room-unlocked">
        <div class="mm-room-row">
          <span class="mm-room-label">Room ID</span>
          <span class="mm-room-value">${m.roomId}</span>
        </div>
        <div class="mm-room-row">
          <span class="mm-room-label">Password</span>
          <span class="mm-room-value">${m.roomPassword}</span>
        </div>
        <button class="mm-copy-btn" data-room-id="${m.roomId}" data-room-password="${m.roomPassword}">Copy Room Details</button>
      </div>
    </div>`;
}

function bindRoomBoxEvents(container) {
  container.querySelectorAll('.mm-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = `Room ID: ${btn.dataset.roomId}\nPassword: ${btn.dataset.roomPassword}`;
      copyToClipboard(text);
    });
  });
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('Room Details Copied!', 'ok'))
      .catch(() => showToast('Could not copy — try again.'));
  } else {
    // Fallback for older browsers without Clipboard API
    const temp = document.createElement('textarea');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand('copy');
      showToast('Room Details Copied!', 'ok');
    } catch (e) {
      showToast('Could not copy — try again.');
    }
    document.body.removeChild(temp);
  }
}

/* Runs every second. For each registered room box, flips
   to "unlocked" once we're inside the 1-minute window
   before the match start time. Unregistered boxes never
   unlock no matter how close the match gets. */
function checkRoomUnlocks() {
  document.querySelectorAll('.mm-room-box[data-joined="true"]').forEach((box) => {
    const startsAt = Number(box.dataset.startsAt);
    const timeLeft = startsAt - Date.now();
    const oneMinute = 60 * 1000;

    box.classList.toggle('unlocked', timeLeft <= oneMinute);
  });
}

function initMyMatchesSubtabs() {
  const tabs = document.querySelectorAll('.mm-subtab');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.mmtab; // "upcoming" or "results"

      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.mm-panel').forEach((panel) => {
        panel.classList.remove('active');
      });
      document.getElementById(`mm-${target}`).classList.add('active');
    });
  });
}

function initMyMatches() {
  renderMyMatches();
  initMyMatchesSubtabs();

  checkRoomUnlocks();
  setInterval(checkRoomUnlocks, 1000);
}
