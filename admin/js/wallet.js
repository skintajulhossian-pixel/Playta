/* ═══════════════════════════════════════════════════════════
   PLAYTA — Wallet Ledger
   js/wallet.js
   PRD Section 8 — User Wallet Page

   Features:
   - Real-time wallet balance from Firestore
   - Full transaction history with filters
   - Withdrawal request form with UPI / Bank validation
   - Minimum/Maximum withdrawal enforcement
   - Duplicate pending withdrawal prevention
   - Add money flow (stub for Razorpay — Section 9)
   - localStorage fallback when offline
═══════════════════════════════════════════════════════════ */

import { db, auth, COLLECTIONS }            from './firebase-config.js';
import {
  fsGet, fsAdd, fsQuery, listenToDoc,
  listenToCollection, serverTimestamp,
  where, orderBy, limit
}                                            from './firebase-service.js';
import { onAuthStateChanged }                from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

/* ─────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────── */
const MIN_WITHDRAWAL  = 100;
const MAX_WITHDRAWAL  = 10000;
const SESSION_KEY     = 'playta_user_sess';

/* ─────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────── */
let currentUser   = null;
let currentBal    = 0;
let unsubBalance  = null;
let unsubTx       = null;

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
export function initWalletPage() {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      const sess = safeJSON(localStorage.getItem(SESSION_KEY));
      if (!sess?.loggedIn) { window.location.replace('auth/'); return; }
    }
    currentUser = user || safeJSON(localStorage.getItem(SESSION_KEY));
    loadWalletData();
  });
}

/* ─────────────────────────────────────────────────────────
   LOAD WALLET DATA
───────────────────────────────────────────────────────── */
async function loadWalletData() {
  const uid = getUserId();
  if (!uid) return;

  /* Real-time balance listener */
  unsubBalance = listenToDoc(COLLECTIONS.USERS, uid, (userData) => {
    currentBal = userData?.walletBalance ?? 0;
    renderWalletHeader(currentBal, userData);
  });

  /* Real-time transaction history */
  unsubTx = listenToCollection(
    COLLECTIONS.WALLET_TX,
    [where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(50)],
    (txList) => {
      renderTransactionHistory(txList);
    }
  );

  /* Render withdrawal form */
  renderWithdrawalForm();

  /* Bind all events */
  bindWalletEvents();
}

/* ─────────────────────────────────────────────────────────
   RENDER WALLET HEADER (balance card)
───────────────────────────────────────────────────────── */
function renderWalletHeader(balance, userData) {
  const balEl  = document.getElementById('walletBalance') || document.querySelector('[data-wallet-balance]');
  const nameEl = document.getElementById('walletUserName');
  const kycEl  = document.getElementById('walletKycStatus');

  if (balEl) {
    balEl.textContent = `₹${balance.toLocaleString('en-IN')}`;
    balEl.style.color = balance > 0 ? 'var(--green)' : 'var(--t0)';
  }
  if (nameEl) nameEl.textContent = userData?.fullName || userData?.name || 'Gamer';
  if (kycEl) {
    kycEl.textContent = userData?.kycVerified ? '✅ KYC Verified' : '⚠️ KYC Pending';
    kycEl.style.color = userData?.kycVerified ? 'var(--green)' : 'var(--orange)';
  }

  /* Update add/withdraw buttons state */
  const wthBtn = document.getElementById('withdrawalSubmitBtn');
  if (wthBtn) wthBtn.disabled = balance < MIN_WITHDRAWAL;
}

/* ─────────────────────────────────────────────────────────
   RENDER TRANSACTION HISTORY
───────────────────────────────────────────────────────── */
function renderTransactionHistory(txList) {
  const container = document.getElementById('txHistoryList') ||
                    document.getElementById('walletTxList');
  if (!container) return;

  /* Apply active filter */
  const activeFilter = document.querySelector('.tx-filter-btn.active')?.dataset.type || 'all';
  const filtered     = activeFilter === 'all'
    ? txList
    : txList.filter(t => t.type === activeFilter);

  if (!filtered.length) {
    container.innerHTML = `
      <div class="tx-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
        <p>No transactions yet</p>
      </div>
    `;
    return;
  }

  const TYPE_CONFIG = {
    entry_deduction:   { icon: '🎮', label: 'Match Entry',   color: 'var(--red)',    sign: '-' },
    winnings_credit:   { icon: '🏆', label: 'Match Win',     color: 'var(--green)',  sign: '+' },
    auto_refund:       { icon: '↩️', label: 'Refund',        color: 'var(--cyan)',   sign: '+' },
    withdrawal_refund: { icon: '↩️', label: 'WD Refund',     color: 'var(--cyan)',   sign: '+' },
    withdrawal:        { icon: '💸', label: 'Withdrawal',    color: 'var(--orange)', sign: '-' },
    add_money:         { icon: '💳', label: 'Money Added',   color: 'var(--green)',  sign: '+' },
    bonus:             { icon: '🎁', label: 'Bonus',         color: 'var(--green)',  sign: '+' },
  };

  container.innerHTML = filtered.map(tx => {
    const cfg  = TYPE_CONFIG[tx.type] || { icon: '₹', label: tx.type, color: 'var(--t0)', sign: '' };
    const ts   = tx.createdAt?.toDate?.() || new Date(tx.createdAt || 0);
    const amt  = Math.abs(tx.amount || 0);

    return `
      <div class="tx-item">
        <div class="tx-icon-wrap" style="background:${cfg.color}18;border:1px solid ${cfg.color}30">
          <span style="font-size:18px">${cfg.icon}</span>
        </div>
        <div class="tx-info">
          <p class="tx-label">${cfg.label}</p>
          <p class="tx-desc">${esc(tx.description || tx.matchId || '')}</p>
          <p class="tx-time">${formatDateTime(ts)}</p>
        </div>
        <div class="tx-amount-wrap">
          <p class="tx-amount" style="color:${cfg.color}">
            ${cfg.sign}₹${amt.toLocaleString('en-IN')}
          </p>
          ${tx.balanceAfter !== undefined
            ? `<p class="tx-balance">Bal: ₹${(tx.balanceAfter || 0).toLocaleString('en-IN')}</p>`
            : ''
          }
          <span class="tx-status ${tx.status === 'completed' ? 'tx-done' : 'tx-pending'}">
            ${tx.status || 'completed'}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

/* ─────────────────────────────────────────────────────────
   WITHDRAWAL FORM
───────────────────────────────────────────────────────── */
function renderWithdrawalForm() {
  const form = document.getElementById('withdrawalFormContainer');
  if (!form) return;

  form.innerHTML = `
    <div class="wf-section">
      <h3>Withdraw Funds</h3>
      <p class="wf-note">Min: ₹${MIN_WITHDRAWAL} &nbsp;|&nbsp; Max: ₹${MAX_WITHDRAWAL} per request</p>

      <!-- Amount -->
      <div class="wf-group">
        <label class="wf-label">Amount (₹) <span style="color:var(--red)">*</span></label>
        <input type="number" class="pf-input" id="wthAmount"
          placeholder="Enter amount" min="${MIN_WITHDRAWAL}" max="${MAX_WITHDRAWAL}">
        <div class="wf-quick-btns">
          ${[100, 250, 500, 1000, 2000].map(a =>
            `<button class="wf-quick" type="button" data-amount="${a}">₹${a}</button>`
          ).join('')}
        </div>
      </div>

      <!-- Method -->
      <div class="wf-group">
        <label class="wf-label">Withdrawal Method <span style="color:var(--red)">*</span></label>
        <select class="pf-input" id="wthMethod">
          <option value="">Select method</option>
          <option value="upi">UPI</option>
          <option value="bank">Bank Transfer</option>
        </select>
      </div>

      <!-- UPI fields -->
      <div id="upiFields" class="wf-method-fields" style="display:none">
        <div class="wf-group">
          <label class="wf-label">UPI ID <span style="color:var(--red)">*</span></label>
          <input type="text" class="pf-input" id="wthUpiId" placeholder="yourname@upi">
          <p class="pf-help">e.g. 9876543210@ybl, name@paytm, name@gpay</p>
        </div>
        <div class="wf-group">
          <label class="wf-label">UPI App</label>
          <div class="upi-app-row">
            ${['GPay','PhonePe','Paytm','BHIM','Other'].map(app =>
              `<button class="upi-app-btn" type="button" data-app="${app}">${app}</button>`
            ).join('')}
          </div>
        </div>
      </div>

      <!-- Bank fields -->
      <div id="bankFields" class="wf-method-fields" style="display:none">
        <div class="wf-group">
          <label class="wf-label">Account Holder Name <span style="color:var(--red)">*</span></label>
          <input type="text" class="pf-input" id="wthBankName" placeholder="As per bank records">
        </div>
        <div class="wf-group">
          <label class="wf-label">Account Number <span style="color:var(--red)">*</span></label>
          <input type="text" class="pf-input" id="wthBankAcc" placeholder="Bank account number">
        </div>
        <div class="wf-group">
          <label class="wf-label">IFSC Code <span style="color:var(--red)">*</span></label>
          <input type="text" class="pf-input" id="wthBankIfsc" placeholder="e.g. SBIN0001234"
            maxlength="11" style="text-transform:uppercase">
          <p class="pf-help">11-character IFSC code (found on cheque book)</p>
        </div>
      </div>

      <!-- Terms -->
      <div class="wf-terms">
        <input type="checkbox" id="wthTerms">
        <label for="wthTerms">I confirm this is my personal account. Withdrawal takes 1–3 business days.</label>
      </div>

      <div id="withdrawalError" class="join-error hidden"></div>

      <button class="btn-join-confirm" id="withdrawalSubmitBtn" type="button">
        REQUEST WITHDRAWAL
      </button>

      <p style="font-size:11px;color:var(--t2);text-align:center;margin-top:10px">
        Processing time: 1–3 working days. Amount ₹${MIN_WITHDRAWAL} minimum.
      </p>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   BIND WALLET EVENTS
───────────────────────────────────────────────────────── */
function bindWalletEvents() {
  /* Tx filter tabs */
  document.querySelectorAll('.tx-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tx-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      /* Re-render with current cached data */
      const cached = safeJSON(localStorage.getItem('playta_wallet_tx'));
      if (cached) renderTransactionHistory(cached);
    });
  });

  /* Withdrawal method switch */
  document.addEventListener('change', (e) => {
    if (e.target.id === 'wthMethod') {
      document.getElementById('upiFields').style.display = e.target.value === 'upi'  ? '' : 'none';
      document.getElementById('bankFields').style.display= e.target.value === 'bank' ? '' : 'none';
    }
    if (e.target.id === 'wthBankIfsc') {
      e.target.value = e.target.value.toUpperCase();
    }
  });

  /* Quick amount buttons */
  document.addEventListener('click', async (e) => {
    const quick = e.target.closest('.wf-quick');
    if (quick) {
      const amt = document.getElementById('wthAmount');
      if (amt) amt.value = quick.dataset.amount;
      return;
    }

    /* UPI app selector */
    const appBtn = e.target.closest('.upi-app-btn');
    if (appBtn) {
      document.querySelectorAll('.upi-app-btn').forEach(b => b.classList.remove('active'));
      appBtn.classList.add('active');
      return;
    }

    /* Submit withdrawal */
    if (e.target.closest('#withdrawalSubmitBtn')) {
      await submitWithdrawal();
      return;
    }
  });
}

/* ─────────────────────────────────────────────────────────
   SUBMIT WITHDRAWAL REQUEST
───────────────────────────────────────────────────────── */
async function submitWithdrawal() {
  const errEl  = document.getElementById('withdrawalError');
  const btn    = document.getElementById('withdrawalSubmitBtn');

  const amount = parseFloat(document.getElementById('wthAmount')?.value) || 0;
  const method = document.getElementById('wthMethod')?.value;
  const terms  = document.getElementById('wthTerms')?.checked;

  /* Validations */
  if (!amount || amount < MIN_WITHDRAWAL) { showWthErr(`Minimum withdrawal is ₹${MIN_WITHDRAWAL}`); return; }
  if (amount > MAX_WITHDRAWAL)            { showWthErr(`Maximum withdrawal is ₹${MAX_WITHDRAWAL}`); return; }
  if (amount > currentBal)               { showWthErr(`Insufficient balance (available: ₹${currentBal})`); return; }
  if (!method)                           { showWthErr('Please select a withdrawal method.'); return; }
  if (!terms)                            { showWthErr('Please confirm the terms.'); return; }

  let upiId = '', bankDetails = {};

  if (method === 'upi') {
    upiId = document.getElementById('wthUpiId')?.value.trim();
    if (!upiId || !upiId.includes('@')) { showWthErr('Enter a valid UPI ID (e.g. name@upi)'); return; }
  } else {
    const bankName = document.getElementById('wthBankName')?.value.trim();
    const bankAcc  = document.getElementById('wthBankAcc')?.value.trim();
    const bankIfsc = document.getElementById('wthBankIfsc')?.value.trim().toUpperCase();
    if (!bankName) { showWthErr('Enter account holder name.'); return; }
    if (!bankAcc)  { showWthErr('Enter account number.'); return; }
    if (!bankIfsc || bankIfsc.length !== 11) { showWthErr('Enter a valid 11-character IFSC code.'); return; }
    bankDetails = { bankName, bankAcc, bankIfsc };
  }

  const uid = getUserId();
  if (!uid) { showWthErr('Session expired. Please login again.'); return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

  try {
    /* Check for existing pending withdrawal */
    const existing = await fsQuery(COLLECTIONS.WITHDRAWALS, [
      where('userId', '==', uid),
      where('status', '==', 'pending')
    ]);
    if (existing.length > 0) {
      showWthErr('You already have a pending withdrawal request. Please wait for it to be processed.');
      return;
    }

    const user = auth.currentUser;
    const reqId = await fsAdd(COLLECTIONS.WITHDRAWALS, {
      userId:      uid,
      username:    user?.displayName || safeJSON(localStorage.getItem(SESSION_KEY))?.username || 'unknown',
      name:        user?.displayName || safeJSON(localStorage.getItem(SESSION_KEY))?.name     || 'Unknown',
      email:       user?.email,
      amount,
      method,
      upiId:       method === 'upi' ? upiId : null,
      bankDetails: method === 'bank' ? bankDetails : null,
      status:      'pending',
      requestedAt: serverTimestamp()
    });

    /* Show success */
    const formContainer = document.getElementById('withdrawalFormContainer');
    if (formContainer) {
      formContainer.innerHTML = `
        <div style="text-align:center;padding:40px 20px">
          <div style="font-size:48px;margin-bottom:16px">✅</div>
          <h3 style="margin-bottom:8px">Withdrawal Requested!</h3>
          <p style="color:var(--t1);font-size:14px">
            ₹${amount.toLocaleString('en-IN')} withdrawal requested successfully.<br>
            Processing time: 1–3 working days.
          </p>
          <p style="color:var(--t2);font-size:12px;margin-top:8px">Request ID: ${reqId}</p>
          <button class="btn-join-confirm" onclick="window.location.reload()" style="margin-top:24px">Done</button>
        </div>
      `;
    }
  } catch(err) {
    showWthErr(`Request failed: ${err.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'REQUEST WITHDRAWAL'; }
  }
}

/* ─────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────── */
function getUserId() {
  return auth.currentUser?.uid ||
         safeJSON(localStorage.getItem(SESSION_KEY))?.uid ||
         safeJSON(localStorage.getItem(SESSION_KEY))?.username;
}

function showWthErr(msg) {
  const el = document.getElementById('withdrawalError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  setTimeout(() => el?.classList.add('hidden'), 5000);
}

function safeJSON(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDateTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-IN', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}

/* ─────────────────────────────────────────────────────────
   CLEANUP
───────────────────────────────────────────────────────── */
export function destroyWalletPage() {
  if (unsubBalance) { unsubBalance(); unsubBalance = null; }
  if (unsubTx)      { unsubTx();      unsubTx      = null; }
}
