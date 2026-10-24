/* ═══════════════════════════════════════════════════════════
   PLAYTA — Payment Gateway (Razorpay)
   js/payment.js
   PRD Section 9 — Add Money to Wallet

   Features:
   - Razorpay checkout integration (Indian payment gateway)
   - Preset amount buttons (₹50, ₹100, ₹200, ₹500, ₹1000, ₹2000)
   - Custom amount with min/max enforcement
   - Unit calculation display (1 Unit = ₹1)
   - Post-payment wallet credit via Firestore transaction
   - Receipt storage in wallet_transactions
   - Idempotent — duplicate payment_id prevented
   - Full audit log on every successful payment
   - Graceful fallback if Razorpay CDN fails to load

   SETUP:
   1. Create Razorpay account → https://dashboard.razorpay.com
   2. Get Test Key ID from Settings → API Keys
   3. Replace RAZORPAY_KEY_ID below with your actual key
   4. For live: replace with live key and remove test mode
═══════════════════════════════════════════════════════════ */

import { db, auth, COLLECTIONS }            from './firebase-config.js';
import {
  logAudit, generateId, fsGet, fsAdd,
  serverTimestamp
}                                            from './firebase-service.js';
import {
  doc, runTransaction, increment
}                                            from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { onAuthStateChanged }                from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

/* ─────────────────────────────────────────────────────────
   CONFIGURATION
   🔑 Replace with your actual Razorpay Key ID
───────────────────────────────────────────────────────── */
const RAZORPAY_KEY_ID = 'rzp_test_YOUR_KEY_ID_HERE';

const MIN_ADD_AMOUNT = 50;
const MAX_ADD_AMOUNT = 50000;
const PRESET_AMOUNTS = [50, 100, 200, 500, 1000, 2000];
const SESSION_KEY    = 'playta_user_sess';

/* ─────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────── */
let currentUser = null;
let rzpInstance = null;

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
export function initPaymentPage() {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      const sess = safeJSON(localStorage.getItem(SESSION_KEY));
      if (!sess?.loggedIn) { window.location.replace('auth/'); return; }
    }
    currentUser = user || safeJSON(localStorage.getItem(SESSION_KEY));
    renderAddMoneyUI();
    bindPaymentEvents();
  });
}

/* ─────────────────────────────────────────────────────────
   RENDER ADD MONEY UI
───────────────────────────────────────────────────────── */
function renderAddMoneyUI() {
  const container = document.getElementById('addMoneyContainer') ||
                    document.getElementById('paymentContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="payment-section">
      <div class="pm-header">
        <h3>Add Money to Wallet</h3>
        <p class="pm-sub">1 Unit = ₹1 &nbsp;|&nbsp; Instant credit after payment</p>
      </div>

      <!-- Preset amounts -->
      <div class="pm-presets">
        ${PRESET_AMOUNTS.map(a => `
          <button class="pm-preset-btn" type="button" data-amount="${a}">
            <span class="pm-preset-amt">₹${a}</span>
            <span class="pm-preset-units">${a} Units</span>
          </button>
        `).join('')}
      </div>

      <!-- Custom amount -->
      <div class="pm-custom">
        <label class="pf-label">Or enter custom amount</label>
        <div style="position:relative">
          <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--t1);font-size:16px;font-weight:600">₹</span>
          <input type="number" class="pf-input" id="customPayAmount"
            placeholder="${MIN_ADD_AMOUNT} – ${MAX_ADD_AMOUNT.toLocaleString('en-IN')}"
            min="${MIN_ADD_AMOUNT}" max="${MAX_ADD_AMOUNT}"
            style="padding-left:32px">
        </div>
        <p id="unitPreview" class="pm-unit-preview"></p>
      </div>

      <!-- Selected summary -->
      <div class="pm-summary hidden" id="pmSummary">
        <div class="pm-sum-row">
          <span>Amount</span>
          <span id="pmSumAmt">₹0</span>
        </div>
        <div class="pm-sum-row">
          <span>Units you'll get</span>
          <span id="pmSumUnits" style="color:var(--green)">0 Units</span>
        </div>
        <div class="pm-sum-row pm-sum-total">
          <span>You Pay</span>
          <span id="pmSumTotal">₹0</span>
        </div>
      </div>

      <div id="paymentError" class="join-error hidden"></div>

      <!-- Pay button -->
      <button class="btn-join-confirm" id="payNowBtn" type="button" disabled>
        PAY WITH RAZORPAY
      </button>

      <!-- Payment methods info -->
      <div class="pm-methods">
        <p>Accepted payments:</p>
        <div class="pm-method-icons">
          ${['UPI', 'Cards', 'NetBanking', 'Wallets'].map(m =>
            `<span class="pm-method-chip">${m}</span>`
          ).join('')}
        </div>
      </div>

      <!-- Test mode notice -->
      ${RAZORPAY_KEY_ID.startsWith('rzp_test_') ? `
        <div class="pm-test-notice">
          🧪 Test Mode — Use card: 4111 1111 1111 1111, CVV: any, Expiry: any future date
        </div>
      ` : ''}
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   BIND EVENTS
───────────────────────────────────────────────────────── */
function bindPaymentEvents() {
  let selectedAmount = 0;

  function updateSummary(amount) {
    selectedAmount = amount;
    const sumEl    = document.getElementById('pmSummary');
    const sumAmt   = document.getElementById('pmSumAmt');
    const sumUnits = document.getElementById('pmSumUnits');
    const sumTotal = document.getElementById('pmSumTotal');
    const payBtn   = document.getElementById('payNowBtn');
    const preview  = document.getElementById('unitPreview');

    if (amount >= MIN_ADD_AMOUNT) {
      sumEl?.classList.remove('hidden');
      if (sumAmt)   sumAmt.textContent   = `₹${amount.toLocaleString('en-IN')}`;
      if (sumUnits) sumUnits.textContent = `${amount} Units`;
      if (sumTotal) sumTotal.textContent = `₹${amount.toLocaleString('en-IN')}`;
      if (payBtn)   payBtn.disabled = false;
      if (preview)  preview.textContent  = `You'll receive ${amount} Units`;
    } else {
      sumEl?.classList.add('hidden');
      if (payBtn) payBtn.disabled = true;
      if (preview && amount > 0) preview.textContent = `Minimum ₹${MIN_ADD_AMOUNT}`;
    }
  }

  document.addEventListener('click', async (e) => {
    /* Preset button */
    const preset = e.target.closest('.pm-preset-btn');
    if (preset) {
      document.querySelectorAll('.pm-preset-btn').forEach(b => b.classList.remove('active'));
      preset.classList.add('active');
      const customInput = document.getElementById('customPayAmount');
      if (customInput) customInput.value = '';
      updateSummary(parseInt(preset.dataset.amount));
      return;
    }

    /* Pay button */
    if (e.target.closest('#payNowBtn') && selectedAmount >= MIN_ADD_AMOUNT) {
      await initiateRazorpayPayment(selectedAmount);
      return;
    }
  });

  /* Custom amount input */
  document.addEventListener('input', (e) => {
    if (e.target.id === 'customPayAmount') {
      const val = parseInt(e.target.value) || 0;
      document.querySelectorAll('.pm-preset-btn').forEach(b => b.classList.remove('active'));
      if (val > MAX_ADD_AMOUNT) {
        e.target.value = MAX_ADD_AMOUNT;
        updateSummary(MAX_ADD_AMOUNT);
      } else {
        updateSummary(val);
      }
    }
  });
}

/* ─────────────────────────────────────────────────────────
   LOAD RAZORPAY SDK (lazy)
───────────────────────────────────────────────────────── */
function loadRazorpaySDK() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(window.Razorpay); return; }

    const script = document.createElement('script');
    script.src   = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload  = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error('Failed to load Razorpay. Check internet connection.'));
    document.head.appendChild(script);
  });
}

/* ─────────────────────────────────────────────────────────
   INITIATE RAZORPAY PAYMENT
───────────────────────────────────────────────────────── */
async function initiateRazorpayPayment(amount) {
  const btn    = document.getElementById('payNowBtn');
  const errEl  = document.getElementById('paymentError');

  if (btn) { btn.disabled = true; btn.textContent = 'Loading payment...'; }
  errEl?.classList.add('hidden');

  try {
    /* Load Razorpay SDK */
    const Razorpay = await loadRazorpaySDK();

    const uid     = getUserId();
    const user    = auth.currentUser;
    const session = safeJSON(localStorage.getItem(SESSION_KEY));
    const name    = user?.displayName || session?.name || 'PLAYTA User';
    const email   = user?.email       || session?.email || '';
    const phone   = session?.mobile   || '';

    /*
      In production → generate order_id from your backend (Cloud Function):
        const { orderId } = await fetch('/api/create-order', {
          method: 'POST', body: JSON.stringify({ amount: amount * 100, currency: 'INR' })
        }).then(r => r.json());
      For now → use client-only flow (works in test mode without order_id)
    */

    const options = {
      key:         RAZORPAY_KEY_ID,
      amount:      amount * 100,          // Razorpay expects paise
      currency:    'INR',
      name:        'PLAYTA',
      description: `Add ₹${amount} — ${amount} Units`,
      image:       '../assets/playta-logo.png',

      prefill: { name, email, contact: phone },

      theme: { color: '#11FF66' },

      modal: {
        ondismiss: () => {
          if (btn) { btn.disabled = false; btn.textContent = 'PAY WITH RAZORPAY'; }
          showPayErr('Payment cancelled. Try again when ready.');
        }
      },

      handler: async (response) => {
        /* Payment successful — credit wallet */
        await handlePaymentSuccess({
          razorpayPaymentId: response.razorpay_payment_id,
          razorpayOrderId:   response.razorpay_order_id || null,
          razorpaySignature: response.razorpay_signature || null,
          amount,
          uid
        });
      }
    };

    rzpInstance = new Razorpay(options);

    rzpInstance.on('payment.failed', (response) => {
      showPayErr(`Payment failed: ${response.error.description || 'Unknown error'}`);
      if (btn) { btn.disabled = false; btn.textContent = 'PAY WITH RAZORPAY'; }
      logAudit({ action: 'PAYMENT_FAILED', target: 'wallet', newValue: { amount, error: response.error.code } });
    });

    rzpInstance.open();

  } catch (err) {
    showPayErr(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'PAY WITH RAZORPAY'; }
  }
}

/* ─────────────────────────────────────────────────────────
   HANDLE PAYMENT SUCCESS — credit wallet atomically
───────────────────────────────────────────────────────── */
async function handlePaymentSuccess({ razorpayPaymentId, razorpayOrderId, razorpaySignature, amount, uid }) {
  const btn = document.getElementById('payNowBtn');
  if (btn) { btn.textContent = 'Crediting wallet...'; }

  try {
    /* Idempotency — check if this payment was already credited */
    const txId    = `PAY-${razorpayPaymentId}`;
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    const txRef   = doc(db, COLLECTIONS.WALLET_TX, txId);

    await runTransaction(db, async (tx) => {
      const txSnap   = await tx.get(txRef);
      if (txSnap.exists()) throw new Error('DUPLICATE_PAYMENT');

      const userSnap = await tx.get(userRef);
      const balance  = userSnap.data()?.walletBalance || 0;

      /* Credit user wallet */
      tx.update(userRef, { walletBalance: increment(amount) });

      /* Record transaction */
      tx.set(txRef, {
        txId,
        userId:            uid,
        type:              'add_money',
        amount,
        balanceBefore:     balance,
        balanceAfter:      balance + amount,
        description:       `Wallet recharge — ₹${amount} (${amount} Units)`,
        razorpayPaymentId,
        razorpayOrderId:   razorpayOrderId  || null,
        razorpaySignature: razorpaySignature || null,
        status:            'completed',
        createdAt:         serverTimestamp()
      });
    });

    await logAudit({
      action:   'WALLET_RECHARGED',
      target:   'wallet',
      targetId: uid,
      newValue: { txId, amount, razorpayPaymentId }
    });

    /* Show success screen */
    renderPaymentSuccess(amount, razorpayPaymentId);

  } catch (err) {
    if (err.message === 'DUPLICATE_PAYMENT') {
      renderPaymentSuccess(amount, razorpayPaymentId, true);
    } else {
      showPayErr(`Wallet credit failed: ${err.message}. Contact support with payment ID: ${razorpayPaymentId}`);
      if (btn) { btn.disabled = false; btn.textContent = 'PAY WITH RAZORPAY'; }
    }
  }
}

/* ─────────────────────────────────────────────────────────
   PAYMENT SUCCESS SCREEN
───────────────────────────────────────────────────────── */
function renderPaymentSuccess(amount, paymentId, isDuplicate = false) {
  const container = document.getElementById('addMoneyContainer') ||
                    document.getElementById('paymentContainer');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center;padding:40px 20px">
      <div style="font-size:64px;margin-bottom:16px">🎉</div>
      <h2 style="margin-bottom:8px">${isDuplicate ? 'Already Credited!' : 'Payment Successful!'}</h2>
      <p style="color:var(--t1);font-size:14px;margin-bottom:6px">
        ${isDuplicate
          ? `₹${amount} was already credited to your wallet.`
          : `₹${amount} (${amount} Units) added to your wallet!`
        }
      </p>
      ${paymentId ? `<p style="color:var(--t2);font-size:12px;margin-bottom:24px">Payment ID: ${esc(paymentId)}</p>` : ''}
      <button class="btn-join-confirm" onclick="window.location.href='index.html'">
        Go to Home
      </button>
      <br>
      <button style="background:none;border:none;color:var(--cyan);font-size:13px;cursor:pointer;margin-top:14px"
        onclick="window.location.reload()">
        Add More Money
      </button>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────── */
function getUserId() {
  return auth.currentUser?.uid ||
         safeJSON(localStorage.getItem(SESSION_KEY))?.uid;
}

function showPayErr(msg) {
  const el = document.getElementById('paymentError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function safeJSON(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─────────────────────────────────────────────────────────
   CLEANUP
───────────────────────────────────────────────────────── */
export function destroyPaymentPage() {
  if (rzpInstance) { try { rzpInstance.close(); } catch {} rzpInstance = null; }
}
