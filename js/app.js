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
  initUnitStore();
  initPaymentSheet();
  initUpiPaymentModal();
  syncWalletUI();
  renderHomeTournaments();
  startGlobalTicker();
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
      openUnitStore();
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
        renderHomeTournaments();
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
   CURRENCY: UNITS
   Playta's in-app currency. Conversion is always 1:1 with INR
   (₹50 = 50 Units) — Units are just how that value is displayed
   everywhere instead of the ₹ symbol.

   formatUnits(amount) returns the icon + number as an HTML
   string, e.g. <img ...> 1,250 — used anywhere a balance,
   prize, or fee is shown instead of writing "₹${amount}" by hand.
─────────────────────────────── */
function formatUnits(amount) {
  return `<img src="assets/unit-icon.png" class="unit-icon" alt="Units">${amount.toLocaleString('en-IN')}`;
}

/* ───────────────────────────────
   UNIT STORE
   Predefined top-up bundles. Elite and Champion packs credit
   real bonus Units on top of the face value (5% and 10%
   respectively) — everything else is exactly 1 INR = 1 Unit.
   All purchases land in depositBalance (spend-only, not
   withdrawable), same as a real-money top-up would.
─────────────────────────────── */
const unitBundles = [
  { id: 'starter', name: 'Starter Pack', baseUnits: 10, price: 10, bonusPercent: 0, ribbon: null, icons: 1 },
  { id: 'basic', name: 'Basic Pack', baseUnits: 50, price: 50, bonusPercent: 0, ribbon: null, icons: 1 },
  { id: 'pro', name: 'Pro Pack', baseUnits: 100, price: 100, bonusPercent: 0, ribbon: null, icons: 2 },
  { id: 'elite', name: 'Elite Pack', baseUnits: 300, price: 300, bonusPercent: 5, ribbon: '5% Extra', icons: 2 },
  { id: 'master', name: 'Master Pack', baseUnits: 500, price: 500, bonusPercent: 0, ribbon: 'Most Popular', icons: 3 },
  { id: 'champion', name: 'Champion Pack', baseUnits: 1000, price: 1000, bonusPercent: 10, ribbon: '10% Extra Bonus', icons: 3 }
];

function totalUnitsForBundle(bundle) {
  return Math.round(bundle.baseUnits * (1 + bundle.bonusPercent / 100));
}

function renderUnitStore() {
  const grid = document.getElementById('storeGrid');
  if (!grid) return;

  grid.innerHTML = unitBundles.map((b) => {
    const total = totalUnitsForBundle(b);
    const iconsHtml = Array.from({ length: b.icons })
      .map((_, i) => `<img src="assets/unit-icon.png" class="unit-icon ${b.icons > 1 ? 'small' : ''}" alt="Units">`)
      .join('');
    const ribbonHtml = b.ribbon
      ? `<span class="store-ribbon">${b.ribbon}</span>`
      : '';

    return `
      <div class="store-card" data-bundle-id="${b.id}">
        ${ribbonHtml}
        <div class="store-card-icon-row">${iconsHtml}</div>
        <div class="store-card-units">${total.toLocaleString('en-IN')} UNITS</div>
        <button type="button" class="store-card-buy-btn" data-bundle-id="${b.id}">₹${b.price}</button>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.store-card-buy-btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const bundle = unitBundles.find((b) => b.id === btn.dataset.bundleId);
      if (bundle) openPaymentSheet(bundle);
    });
  });
}

function openUnitStore() {
  const view = document.getElementById('unitStoreView');
  if (!view) return;
  renderUnitStore();
  view.classList.add('show');
}

function closeUnitStore() {
  const view = document.getElementById('unitStoreView');
  if (view) view.classList.remove('show');
}

function initUnitStore() {
  const backBtn = document.getElementById('storeBackBtn');
  if (backBtn) backBtn.addEventListener('click', closeUnitStore);
}

/* ───────────────────────────────
   UPI PAYMENT MODAL
   Bottom-sheet style picker for GPay / PhonePe / Paytm.
   initiateUPIPayment() is the single hook to wire up a real
   Razorpay/UPI-intent flow later — everything else here is UI.
─────────────────────────────── */
let activeBundle = null;
let selectedUpiApp = null;

/* ───────────────────────────────
   PAYMENT BOTTOM SHEET
   First step after tapping "Buy" on a store card — shows the
   bundle summary and lets the user pick a payment method.
   Choosing "Pay with UPI" hands off to the existing UPI app-list
   modal (openUpiPaymentModal); the sheet itself never charges
   anything directly.
─────────────────────────────── */
function openPaymentSheet(bundle) {
  activeBundle = bundle;

  const total = totalUnitsForBundle(bundle);
  document.getElementById('sheetBundleName').textContent = `${total.toLocaleString('en-IN')}-Units Bundle`;
  document.getElementById('sheetAmount').textContent = `₹${bundle.price.toFixed(2)}`;

  const overlay = document.getElementById('paymentSheetOverlay');
  if (!overlay) return;

  // Switch display:none → flex first, then wait two animation
  // frames before adding .show. This guarantees the browser has
  // painted the "closed" state (opacity:0, translateY(100%))
  // before the transition to the "open" state begins — without
  // this, the two states can collapse into the same frame and
  // the slide-up/fade-in appear to "pop" instead of animate.
  overlay.style.display = 'flex';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });
  });
}

function closePaymentSheet() {
  const overlay = document.getElementById('paymentSheetOverlay');
  if (!overlay) return;

  overlay.classList.remove('show');

  // Wait for the slide-down/fade-out transition to finish before
  // hiding the element, so the close animation is visible too.
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 350);
}

function initPaymentSheet() {
  const overlay = document.getElementById('paymentSheetOverlay');
  const sheet = document.getElementById('paymentSheet');
  const dragHandle = document.getElementById('sheetDragHandle');
  const upiOption = document.getElementById('sheetUpiOption');
  const otherOption = document.getElementById('sheetOtherMethodsOption');
  const continueBtn = document.getElementById('sheetContinueBtn');
  if (!overlay) return;

  // Tapping the dark backdrop closes the sheet
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePaymentSheet();
  });

  // "Pay with UPI" hands off to the existing UPI app-list modal
  upiOption.addEventListener('click', () => {
    closePaymentSheet();
    if (activeBundle) openUpiPaymentModal(activeBundle);
  });

  // Other payment methods aren't wired up yet — just acknowledge the tap
  otherOption.addEventListener('click', () => {
    showToast('More payment methods coming soon.');
  });

  continueBtn.addEventListener('click', () => {
    showToast('Choose a payment method above to continue.');
  });

  initSheetSwipeToClose(sheet, dragHandle);
}

/* Lets the user drag the sheet down (via the handle) to dismiss
   it, like a native bottom sheet. Pure pointer-event tracking —
   no extra libraries needed. */
function initSheetSwipeToClose(sheet, dragHandle) {
  let startY = 0;
  let currentY = 0;
  let dragging = false;

  function onDragStart(clientY) {
    dragging = true;
    startY = clientY;
    currentY = 0;
    sheet.classList.add('dragging');
  }

  function onDragMove(clientY) {
    if (!dragging) return;
    currentY = Math.max(0, clientY - startY);
    sheet.style.transform = `translateY(${currentY}px)`;
  }

  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('dragging');
    sheet.style.transform = '';

    // Dragged down far enough → close, otherwise snap back open
    if (currentY > 100) {
      closePaymentSheet();
    }
  }

  dragHandle.addEventListener('touchstart', (e) => onDragStart(e.touches[0].clientY), { passive: true });
  dragHandle.addEventListener('touchmove', (e) => onDragMove(e.touches[0].clientY), { passive: true });
  dragHandle.addEventListener('touchend', onDragEnd);

  dragHandle.addEventListener('mousedown', (e) => onDragStart(e.clientY));
  window.addEventListener('mousemove', (e) => onDragMove(e.clientY));
  window.addEventListener('mouseup', onDragEnd);
}

function openUpiPaymentModal(bundle) {
  activeBundle = bundle;
  selectedUpiApp = null;

  const total = totalUnitsForBundle(bundle);
  document.getElementById('upiSummaryText').textContent = `${total.toLocaleString('en-IN')} Units — ₹${bundle.price}`;

  document.querySelectorAll('.upi-app-btn').forEach((b) => b.classList.remove('selected'));

  const modal = document.getElementById('upiPaymentModal');
  if (modal) modal.classList.add('show');
}

function closeUpiPaymentModal() {
  const modal = document.getElementById('upiPaymentModal');
  if (modal) modal.classList.remove('show');
  activeBundle = null;
  selectedUpiApp = null;
}

/* Hook point for the real payment integration. For now it just
   logs what would be charged, then simulates a successful
   top-up so the rest of the wallet flow can be tested end to end. */
function initiateUPIPayment(amount, unitCount) {
  console.log('initiateUPIPayment called:', { amount, unitCount, upiApp: selectedUpiApp });

  // Demo only — credits Units immediately. Replace this block
  // with the real Razorpay/UPI intent result handling later.
  depositBalance += unitCount;
  syncWalletUI();
  closeUpiPaymentModal();
  showToast(`${unitCount.toLocaleString('en-IN')} Units added to your wallet!`, 'ok');
}

function initUpiPaymentModal() {
  const modal = document.getElementById('upiPaymentModal');
  const closeX = document.getElementById('upiCloseX');
  const payBtn = document.getElementById('upiPaySimulateBtn');
  if (!modal) return;

  closeX.addEventListener('click', closeUpiPaymentModal);

  modal.querySelectorAll('.upi-app-btn').forEach((appBtn) => {
    appBtn.addEventListener('click', () => {
      modal.querySelectorAll('.upi-app-btn').forEach((b) => b.classList.remove('selected'));
      appBtn.classList.add('selected');
      selectedUpiApp = appBtn.dataset.app;
    });
  });

  payBtn.addEventListener('click', () => {
    if (!activeBundle) return;
    if (!selectedUpiApp) {
      showToast('Please choose a UPI app first.');
      return;
    }
    const total = totalUnitsForBundle(activeBundle);
    initiateUPIPayment(activeBundle.price, total);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeUpiPaymentModal();
  });
}

/* ───────────────────────────────
   WALLET SYSTEM
   Three Units buckets + sync. 1 INR = 1 Unit throughout.

   depositBalance  — Units the user added via Razorpay.
                      Spendable on entry fees only — not withdrawable.
   winningBalance  — Units earned from tournament wins.
                      100% withdrawable to bank/UPI.
   bonusBalance    — Units from signup/referral bonuses.
                      Never withdrawable; capped at MAX_BONUS_PERCENT
                      of any single entry fee.
   totalBalance    — always recalculated, never edited directly
─────────────────────────────── */
let depositBalance = 0;
let winningBalance = 0;
let bonusBalance = 10;   // 10 signup bonus Units, matches the existing UI default
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

  if (totalEl) totalEl.innerHTML = formatUnits(totalBalance);
  if (depositEl) depositEl.innerHTML = formatUnits(depositBalance);
  if (winningEl) winningEl.innerHTML = formatUnits(winningBalance);
  if (bonusEl) bonusEl.innerHTML = formatUnits(bonusBalance);

  // Tiny navbar pill: Deposit + Winnings Units, kept in sync with the wallet page
  if (navBalEl) navBalEl.innerHTML = formatUnits(depositBalance + winningBalance);
  if (navBonusEl) navBonusEl.innerHTML = formatUnits(bonusBalance);
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
  showToast(`Registered for Match ${match.matchId}! ${match.entryFee} Units deducted.`, 'ok');
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
/* Formats milliseconds remaining as "02h 15m 30s", or "LIVE"
   once the match has started. Used by both card types. */
function formatCountdown(msRemaining) {
  if (msRemaining <= 0) return 'LIVE';
  const totalSeconds = Math.floor(msRemaining / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

function formatMatchDate(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* Maps a match's entry fee to the "Per Kill" amount shown on the
   card (a display-only mapping — not the same as the perKillPrize
   field stored on the tournament object). Falls back to the raw
   entry fee if a value isn't in the table, so new fee tiers don't
   silently show nothing. */
const ENTRY_FEE_TO_PER_KILL = {
  5: 4,
  10: 8,
  20: 18,
  50: 55,
  100: 110,
  500: 510,
  1000: 1100
};

function getDisplayPerKill(entryFee) {
  return ENTRY_FEE_TO_PER_KILL[entryFee] ?? entryFee;
}

function getJoinButtonState(t, capacity, isFull) {
  if (t.isJoined) return { label: 'Joined', cls: 'registered', disabled: 'disabled' };
  if (isFull) return { label: 'MATCH FULL', cls: 'full', disabled: 'disabled' };
  return { label: 'Join Match', cls: '', disabled: '' };
}

/* ── Home page card: Free/Mega matches ──
   Bold big prize number, Free entry badge, live countdown
   instead of a static time, small right-aligned button. */
function buildFreeMatchCard(t) {
  const capacity = t.type === 'Squad' ? 48 : 50;
  const isFull = t.joinedSlots >= capacity;
  const spotsLeft = Math.max(0, capacity - t.joinedSlots);
  const fillPercent = Math.min(100, Math.round((t.joinedSlots / capacity) * 100));
  const btn = getJoinButtonState(t, capacity, isFull);
  const msRemaining = t.startsAt - Date.now();

  return `
      <article class="match-card" data-match-id="${t.matchId}" data-starts-at="${t.startsAt}">
        <div class="match-card-top">
          <div class="match-card-id">
            <img src="images/ff-icon.png" alt="" class="match-card-logo">
            <span class="match-card-name">Free Fire Max - Match ${t.matchId}</span>
          </div>
          <span class="match-type-tag">${t.type}</span>
        </div>

        <div class="free-card-grid">
          <div class="free-card-prize">
            <span class="free-card-prize-label">Prize Pool</span>
            <span class="free-card-prize-value">${formatUnits(t.totalPrizePool)}</span>
          </div>
          <span class="free-card-entry-badge">Free Entry</span>
        </div>

        <div class="free-card-datetime">
          <div class="free-card-dt-col">
            <span class="free-card-dt-label">Date</span>
            <span class="free-card-dt-value">${formatMatchDate(t.startsAt)}</span>
          </div>
          <div class="free-card-dt-col align-right">
            <span class="free-card-dt-label">Starts In</span>
            <span class="free-card-dt-value js-countdown" data-starts-at="${t.startsAt}">${formatCountdown(msRemaining)}</span>
          </div>
        </div>

        <div class="match-card-bottom-row">
          <div class="match-progress-wrap flex-grow">
            <div class="match-progress-labels">
              <span>${t.joinedSlots}/${capacity} joined</span>
              <span class="match-spots-left">${spotsLeft} spots left</span>
            </div>
            <div class="match-progress-track">
              <div class="match-progress-fill" style="width:${fillPercent}%"></div>
            </div>
          </div>
          <button class="match-join-btn-small ${btn.cls}" ${btn.disabled}>
            ${btn.label}
          </button>
        </div>

        ${renderRoomBox(t)}
      </article>
    `;
}

/* ── Tournament List card: Paid matches ──
   Cyan rules box, full 2x2 data grid (Date, Live Timer,
   Prize Pool, Entry Fee), small right-aligned button,
   Room ID/Password security box underneath. */
function buildPaidMatchCard(t) {
  const capacity = t.type === 'Squad' ? 48 : 50;
  const isFull = t.joinedSlots >= capacity;
  const spotsLeft = Math.max(0, capacity - t.joinedSlots);
  const fillPercent = Math.min(100, Math.round((t.joinedSlots / capacity) * 100));
  const btn = getJoinButtonState(t, capacity, isFull);
  const msRemaining = t.startsAt - Date.now();

  return `
      <article class="match-card" data-match-id="${t.matchId}" data-starts-at="${t.startsAt}">
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
            <span class="match-stat-label">Date</span>
            <span class="match-stat-value">${formatMatchDate(t.startsAt)}</span>
          </div>
          <div class="match-stat">
            <span class="match-stat-label">Starts In</span>
            <span class="match-stat-value match-stat-timer js-countdown" data-starts-at="${t.startsAt}">${formatCountdown(msRemaining)}</span>
          </div>
          <div class="match-stat">
            <span class="match-stat-label">Prize Pool</span>
            <span class="match-stat-value neon">${formatUnits(t.totalPrizePool)}</span>
          </div>
          <div class="match-stat">
            <span class="match-stat-label">Per Kill</span>
            <span class="match-stat-value neon">${formatUnits(getDisplayPerKill(t.entryFee))}</span>
          </div>
        </div>

        <div class="match-card-bottom-row">
          <div class="match-progress-wrap flex-grow">
            <div class="match-progress-labels">
              <span>${t.joinedSlots}/${capacity} joined</span>
              <span class="match-spots-left">${spotsLeft} spots left</span>
            </div>
            <div class="match-progress-track">
              <div class="match-progress-fill" style="width:${fillPercent}%"></div>
            </div>
          </div>
          <button class="match-join-btn-small ${btn.cls}" ${btn.disabled}>
            <span class="join-btn-fee">${formatUnits(t.entryFee)}</span><span class="join-btn-sep">|</span>${btn.label}
          </button>
        </div>

        ${renderRoomBox(t)}
      </article>
    `;
}

/* Wires up the "Join Match" buttons inside any container that was
   filled using buildMatchCardHtml (Home featured list or the
   full Tournament List). Re-renders both lists on success so
   they never fall out of sync. */
function bindMatchJoinButtons(container, onJoinedRerender) {
  container.querySelectorAll('.match-join-btn-small:not(.full):not(.registered)').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

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
    .map((t) => buildPaidMatchCard(t))
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
    .map((t) => buildFreeMatchCard(t))
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
          <span class="t-stat-value prize">${formatUnits(m.totalPrizePool)}</span>
        </div>
        <div class="t-stat">
          <span class="t-stat-label">Per Kill</span>
          <span class="t-stat-value prize">${formatUnits(m.perKillPrize)}</span>
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

/* Updates every live countdown on screen (Home free-match cards
   and Tournament List paid-match cards) once a second. Switches
   to a "LIVE" pulsing style once the match has actually started,
   instead of showing a negative countdown. */
function tickAllCountdowns() {
  document.querySelectorAll('.js-countdown').forEach((el) => {
    const startsAt = Number(el.dataset.startsAt);
    const msRemaining = startsAt - Date.now();
    const isLive = msRemaining <= 0;

    el.textContent = isLive ? 'LIVE' : formatCountdown(msRemaining);
    el.classList.toggle('is-live', isLive);
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
}

/* Single global heartbeat: ticks every visible countdown timer
   and re-checks room-unlock states once a second. Runs for the
   lifetime of the app — Home, Tournament List, and My Matches
   all read from the same clock. */
function startGlobalTicker() {
  checkRoomUnlocks();
  tickAllCountdowns();
  setInterval(() => {
    checkRoomUnlocks();
    tickAllCountdowns();
  }, 1000);
}
