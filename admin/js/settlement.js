/* ═══════════════════════════════════════════════════════════
   PLAYTA — Admin Settlement & Financial Operations
   admin/js/settlement.js

   Features:
   - Match result verification + prize auto-calculation
   - Strict idempotent settlement (no duplicate payouts)
   - Withdrawal queue processing (Approve/Reject + UTR)
   - Auto-refund on match cancellation
   - Tournament status automation
   - Complete audit trail for every financial action
═══════════════════════════════════════════════════════════ */

import { db, auth, COLLECTIONS }             from '../../js/firebase-config.js';
import {
  creditWinnings, autoRefundMatch,
  logAudit, generateId, fsGet, fsUpdate,
  fsQuery, listenToCollection,
  serverTimestamp, where, orderBy, limit
}                                             from '../../js/firebase-service.js';

/* ─────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────── */
let activeResultId     = null;
let activeWithdrawalId = null;
let unsubs             = {};    // active Firestore listeners

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
export function initSettlement() {
  initResultsListener();
  initWithdrawalListener();
}

export function destroySettlement() {
  Object.values(unsubs).forEach(fn => fn && fn());
  unsubs = {};
}

/* ═══════════════════════════════════════════════════════════
   SECTION 1 — MATCH RESULTS & WINNER SETTLEMENT
═══════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────
   Real-time listener for pending results
───────────────────────────────────────────────────────── */
function initResultsListener() {
  unsubs.results = listenToCollection(
    COLLECTIONS.RESULTS,
    [where('status', '==', 'pending'), orderBy('submittedAt', 'desc')],
    (results) => {
      renderResultsTable(results);
      updateBadge('navResultCount', results.length);
    }
  );
}

/* ─────────────────────────────────────────────────────────
   Render pending results table
───────────────────────────────────────────────────────── */
function renderResultsTable(results) {
  const tbody = document.getElementById('pendingResultsBody');
  const noEl  = document.getElementById('noResults');
  const badge = document.getElementById('pendingResultsBadge');
  if (!tbody) return;

  if (badge) badge.textContent = `${results.length} pending`;

  if (!results.length) {
    tbody.innerHTML = '';
    noEl?.classList.remove('hidden');
    return;
  }
  noEl?.classList.add('hidden');

  tbody.innerHTML = results.map(r => `
    <tr>
      <td style="color:var(--green);font-size:12px">${esc(r.matchId)}</td>
      <td>
        <div class="t-user-cell">
          <div class="t-avatar">${(r.playerName || 'U')[0].toUpperCase()}</div>
          <div>
            <p class="t-user-name">${esc(r.playerName || '—')}</p>
            <p class="t-user-email">@${esc(r.username || '—')}</p>
          </div>
        </div>
      </td>
      <td style="font-weight:600">${r.kills ?? '—'} kills</td>
      <td><span class="badge badge-solo">#${r.rank ?? '—'}</span></td>
      <td>
        <button class="action-btn" onclick="window.playtaSettlement.viewScreenshot('${r.screenshotUrl || ''}','${esc(r.playerName || '')}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </td>
      <td style="color:var(--t1);font-size:12px">${formatTimeAgo(r.submittedAt?.toDate?.() || r.submittedAt)}</td>
      <td>
        <button class="btn-primary-sm" style="padding:6px 12px;font-size:11px"
          onclick="window.playtaSettlement.openResultModal('${r.id}')">
          Verify & Settle
        </button>
      </td>
    </tr>
  `).join('');
}

/* ─────────────────────────────────────────────────────────
   Settlement History listener
───────────────────────────────────────────────────────── */
export function initSettlementHistory() {
  unsubs.history = listenToCollection(
    COLLECTIONS.SETTLEMENTS,
    [orderBy('settledAt', 'desc'), limit(50)],
    (settlements) => renderSettlementHistory(settlements)
  );
}

function renderSettlementHistory(settlements) {
  const tbody = document.getElementById('settlementHistoryBody');
  if (!tbody) return;

  tbody.innerHTML = !settlements.length
    ? '<tr><td colspan="8" style="text-align:center;color:var(--t1);padding:24px">No settlements yet</td></tr>'
    : settlements.map((s, i) => `
        <tr>
          <td style="color:var(--t1);font-size:11px;font-family:monospace">${esc(s.id)}</td>
          <td style="color:var(--t1);font-size:12px">${esc(s.matchId)}</td>
          <td>
            <div class="t-user-cell">
              <div class="t-avatar">${(s.playerName || 'U')[0].toUpperCase()}</div>
              <p class="t-user-name">${esc(s.playerName || s.userId)}</p>
            </div>
          </td>
          <td style="font-weight:600">${s.adminVerifiedKills ?? '—'}</td>
          <td>#${s.adminVerifiedRank ?? '—'}</td>
          <td style="color:var(--green);font-weight:700">₹${(s.totalPaid || 0).toLocaleString('en-IN')}</td>
          <td style="color:var(--t1);font-size:12px">${formatDate(s.settledAt?.toDate?.() || s.settledAt)}</td>
          <td style="color:var(--t1);font-size:11px">${esc(s.settledBy || '—')}</td>
        </tr>
      `).join('');
}

/* ─────────────────────────────────────────────────────────
   Open Result Modal (verify + settle)
───────────────────────────────────────────────────────── */
window.playtaSettlement = window.playtaSettlement || {};

window.playtaSettlement.openResultModal = async function(resultId) {
  activeResultId = resultId;
  const result   = await fsGet(COLLECTIONS.RESULTS, resultId);
  if (!result) { showToast('Result not found', 'error'); return; }

  // Fetch match for per-kill rate and rank prizes
  const match    = result.matchId ? await fsGet(COLLECTIONS.MATCHES, result.matchId) : null;

  // Populate modal
  setVal('rPlayerKills', result.kills     ?? 0);
  setVal('rPlayerRank',  result.rank      ?? 1);
  setVal('rAdminKills',  result.kills     ?? 0);
  setVal('rAdminRank',   result.rank      ?? 1);
  setVal('rAdminNote',   '');

  const infoEl = document.getElementById('resultInfo');
  if (infoEl) infoEl.innerHTML = `
    <strong>Match:</strong> ${esc(result.matchId)} &nbsp;|&nbsp;
    <strong>Player:</strong> ${esc(result.playerName || result.userId)} (@${esc(result.username || '')})
    <br><span style="color:var(--t1);font-size:11px">Per-Kill Rate: ₹${match?.perKill || 0} &nbsp;|&nbsp; Prize Pool: ₹${match?.prizePool || 0}</span>
  `;

  // Store match data on window for calculator
  window._activeMatch  = match;
  window._activeResult = result;

  updateResultCalc();

  // Wire live calculator
  document.getElementById('rAdminKills')?.addEventListener('input', updateResultCalc);
  document.getElementById('rAdminRank')?.addEventListener('input',  updateResultCalc);

  document.getElementById('resultModal')?.classList.remove('hidden');
};

window.playtaSettlement.viewScreenshot = function(url, playerName) {
  if (!url) { showToast('No screenshot submitted', 'error'); return; }

  // Open screenshot in a lightbox
  const existing = document.getElementById('screenshotLightbox');
  if (existing) existing.remove();

  const lb = document.createElement('div');
  lb.id    = 'screenshotLightbox';
  lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;padding:20px;cursor:zoom-out';
  lb.innerHTML = `
    <p style="color:var(--t1);font-size:13px;margin-bottom:12px">📸 Screenshot — ${esc(playerName)}</p>
    <img src="${url}" style="max-width:100%;max-height:80vh;border-radius:8px;object-fit:contain" alt="proof">
    <button style="margin-top:16px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:8px 20px;color:var(--t0);cursor:pointer" onclick="this.closest('#screenshotLightbox').remove()">Close</button>
  `;
  lb.addEventListener('click', e => { if (e.target === lb) lb.remove(); });
  document.body.appendChild(lb);
};

/* ─────────────────────────────────────────────────────────
   Prize Auto-Calculator
───────────────────────────────────────────────────────── */
function updateResultCalc() {
  const match   = window._activeMatch;
  const kills   = parseInt(document.getElementById('rAdminKills')?.value) || 0;
  const rank    = parseInt(document.getElementById('rAdminRank')?.value)  || 1;

  const perKill    = match?.perKill    || 0;
  const prizePool  = match?.prizePool  || 0;
  const killReward = perKill * kills;

  // Rank prize distribution (configurable; fallback default)
  const prizeDistrib = match?.prizeDistribution || {
    1: 0.50, 2: 0.25, 3: 0.15, 4: 0.07, 5: 0.03
  };
  const rankMultiplier = prizeDistrib[rank] || 0;
  const rankPrize      = Math.floor(prizePool * rankMultiplier);
  const total          = killReward + rankPrize;

  setEl('rcPerKill',   `₹${killReward.toLocaleString('en-IN')}`);
  setEl('rcRankPrize', `₹${rankPrize.toLocaleString('en-IN')}`);
  setEl('rcTotal',     `₹${total.toLocaleString('en-IN')}`);
}

/* ─────────────────────────────────────────────────────────
   Approve Result — trigger settlement
───────────────────────────────────────────────────────── */
export async function approveResult() {
  if (!activeResultId) return;

  const result = window._activeResult;
  const match  = window._activeMatch;
  const admin  = auth.currentUser;
  if (!result || !admin) return;

  const kills   = parseInt(document.getElementById('rAdminKills')?.value) || 0;
  const rank    = parseInt(document.getElementById('rAdminRank')?.value)  || 1;
  const note    = document.getElementById('rAdminNote')?.value || '';

  const perKill    = match?.perKill    || 0;
  const prizePool  = match?.prizePool  || 0;
  const killReward = perKill * kills;
  const prizeDistrib = match?.prizeDistribution || { 1: 0.50, 2: 0.25, 3: 0.15, 4: 0.07, 5: 0.03 };
  const rankPrize  = Math.floor(prizePool * (prizeDistrib[rank] || 0));
  const total      = killReward + rankPrize;

  if (total < 0) { showToast('Invalid prize amount', 'error'); return; }

  // Idempotent settlement ID — based on resultId so it's always the same
  const settlementId = `STL-${activeResultId}`;

  setBtnLoading('approveResultBtn', true, 'Processing...');

  try {
    const outcome = await creditWinnings({
      userId:              result.userId,
      matchId:             result.matchId,
      resultId:            activeResultId,
      amount:              total,
      adminId:             admin.uid,
      settlementId
    });

    if (!outcome.success) {
      if (outcome.error?.includes('duplicate')) {
        showToast('⚠️ Already settled — duplicate prevented', 'error');
      } else {
        showToast(`Error: ${outcome.error}`, 'error');
      }
      return;
    }

    // Update result document to approved
    await fsUpdate(COLLECTIONS.RESULTS, activeResultId, {
      status:             'approved',
      adminVerifiedKills: kills,
      adminVerifiedRank:  rank,
      totalPaid:          total,
      settlementId,
      adminNote:          note,
      settledAt:          serverTimestamp(),
      settledBy:          admin.email
    });

    await logAudit({
      action:   'RESULT_SETTLEMENT',
      target:   'match_result',
      targetId: activeResultId,
      newValue: { settlementId, totalPaid: total, kills, rank },
      reason:   note
    });

    document.getElementById('resultModal')?.classList.add('hidden');
    showToast(`✅ ₹${total.toLocaleString('en-IN')} credited to ${result.playerName || result.userId}`, 'success');
  } catch (err) {
    showToast(`Settlement failed: ${err.message}`, 'error');
  } finally {
    setBtnLoading('approveResultBtn', false, '✅ Approve & Settle');
  }
}

/* ─────────────────────────────────────────────────────────
   Reject / Request Re-submission
───────────────────────────────────────────────────────── */
export async function rejectResult(requestResubmit = false) {
  if (!activeResultId) return;
  const admin = auth.currentUser;
  const note  = document.getElementById('rAdminNote')?.value || '';

  const newStatus = requestResubmit ? 'resubmit_requested' : 'rejected';

  await fsUpdate(COLLECTIONS.RESULTS, activeResultId, {
    status: newStatus, adminNote: note,
    reviewedAt: serverTimestamp(), reviewedBy: admin?.email
  });

  await logAudit({
    action: requestResubmit ? 'RESULT_RESUBMIT_REQUESTED' : 'RESULT_REJECTED',
    target: 'match_result', targetId: activeResultId, reason: note
  });

  document.getElementById('resultModal')?.classList.add('hidden');
  showToast(requestResubmit ? 'Re-submission requested from player' : 'Result rejected', 'success');
}

/* ═══════════════════════════════════════════════════════════
   SECTION 2 — WITHDRAWAL PROCESSING
═══════════════════════════════════════════════════════════ */

function initWithdrawalListener() {
  unsubs.withdrawals = listenToCollection(
    COLLECTIONS.WITHDRAWALS,
    [orderBy('requestedAt', 'desc')],
    (wths) => {
      renderWithdrawalsTable(wths);
      updateWithdrawalStats(wths);
      updateBadge('navWithdrawCount', wths.filter(w => w.status === 'pending').length);
    }
  );
}

function renderWithdrawalsTable(wths) {
  const filter  = document.getElementById('wthStatusFilter')?.value || 'all';
  const filtered= filter === 'all' ? wths : wths.filter(w => w.status === filter);
  const tbody   = document.getElementById('withdrawalsBody');
  const noEl    = document.getElementById('noWithdrawals');
  if (!tbody) return;

  const sc = { pending:'paid', approved:'active', rejected:'banned', failed:'banned' };

  if (!filtered.length) {
    tbody.innerHTML = '';
    noEl?.classList.remove('hidden');
    return;
  }
  noEl?.classList.add('hidden');

  tbody.innerHTML = filtered.map((w, i) => `
    <tr>
      <td style="color:var(--t1)">${i+1}</td>
      <td>
        <div class="t-user-cell">
          <div class="t-avatar">${(w.name || 'U')[0].toUpperCase()}</div>
          <div>
            <p class="t-user-name">${esc(w.name || '—')}</p>
            <p class="t-user-email">@${esc(w.username || '—')}</p>
          </div>
        </div>
      </td>
      <td style="font-weight:700">₹${(w.amount || 0).toLocaleString('en-IN')}</td>
      <td style="color:var(--t1);font-size:12px">${esc(w.upiId || w.bankAccount || '—')}</td>
      <td style="color:var(--t1);font-size:12px">${formatTimeAgo(w.requestedAt?.toDate?.() || w.requestedAt)}</td>
      <td><span class="badge badge-${sc[w.status] || 'active'}">${w.status}</span></td>
      <td style="color:var(--t1);font-size:12px;font-family:monospace">${esc(w.utrId || '—')}</td>
      <td>
        ${w.status === 'pending'
          ? `<button class="btn-primary-sm" style="padding:6px 12px;font-size:11px"
               onclick="window.playtaSettlement.openWithdrawalModal('${w.id}')">
               Process
             </button>`
          : `<span style="color:var(--t1);font-size:12px">Done</span>`
        }
      </td>
    </tr>
  `).join('');
}

function updateWithdrawalStats(wths) {
  const now       = Date.now();
  const today     = new Date().toDateString();
  const totalPaid = wths.filter(w => w.status === 'approved')
    .reduce((s, w) => s + (w.amount || 0), 0);

  setEl('wthPending',  wths.filter(w => w.status === 'pending').length);
  setEl('wthApproved', wths.filter(w => w.status === 'approved' && new Date(w.processedAt?.toDate?.() || 0).toDateString() === today).length);
  setEl('wthRejected', wths.filter(w => w.status === 'rejected' && new Date(w.processedAt?.toDate?.() || 0).toDateString() === today).length);
  setEl('wthTotal',    `₹${totalPaid.toLocaleString('en-IN')}`);
}

/* ─────────────────────────────────────────────────────────
   Open Withdrawal Modal
───────────────────────────────────────────────────────── */
window.playtaSettlement.openWithdrawalModal = async function(withdrawalId) {
  activeWithdrawalId = withdrawalId;
  const w = await fsGet(COLLECTIONS.WITHDRAWALS, withdrawalId);
  if (!w) { showToast('Withdrawal not found', 'error'); return; }

  const detEl = document.getElementById('withdrawalDetail');
  if (detEl) detEl.innerHTML = `
    <div class="withdrawal-detail">
      <div class="wd-row"><span class="wd-label">ID</span><span class="wd-value" style="font-family:monospace;font-size:12px">${esc(w.id)}</span></div>
      <div class="wd-row"><span class="wd-label">User</span><span class="wd-value">${esc(w.name || '—')} (@${esc(w.username || '—')})</span></div>
      <div class="wd-row"><span class="wd-label">Amount</span><span class="wd-value" style="color:var(--green);font-size:18px">₹${(w.amount || 0).toLocaleString('en-IN')}</span></div>
      <div class="wd-row"><span class="wd-label">UPI ID</span><span class="wd-value">${esc(w.upiId || '—')}</span></div>
      ${w.bankAccount ? `<div class="wd-row"><span class="wd-label">Bank A/C</span><span class="wd-value">${esc(w.bankAccount)}</span></div>` : ''}
      <div class="wd-row"><span class="wd-label">Requested</span><span class="wd-value">${formatDate(w.requestedAt?.toDate?.() || w.requestedAt)}</span></div>
    </div>
  `;

  // Reset fields
  setVal('wthAction', 'approved');
  setVal('wthUtr',    '');
  setVal('wthReason', '');

  document.getElementById('withdrawalModal')?.classList.remove('hidden');
};

/* ─────────────────────────────────────────────────────────
   Process Withdrawal (Approve / Reject)
───────────────────────────────────────────────────────── */
export async function processWithdrawal() {
  if (!activeWithdrawalId) return;

  const admin   = auth.currentUser;
  const action  = document.getElementById('wthAction')?.value;
  const utr     = document.getElementById('wthUtr')?.value.trim();
  const reason  = document.getElementById('wthReason')?.value.trim();

  if (action === 'approved' && !utr) {
    showToast('UTR / Reference ID is required for approval', 'error');
    return;
  }
  if (action === 'rejected' && !reason) {
    showToast('Rejection reason is required', 'error');
    return;
  }

  setBtnLoading('processWithdrawalBtn', true, 'Processing...');

  try {
    const w = await fsGet(COLLECTIONS.WITHDRAWALS, activeWithdrawalId);
    if (!w) throw new Error('Withdrawal not found');
    if (w.status !== 'pending') throw new Error('Already processed');

    // Idempotency: if UTR already used, reject
    if (utr) {
      const existing = await fsQuery(COLLECTIONS.WITHDRAWALS, [
        where('utrId', '==', utr),
        where('status', '==', 'approved')
      ]);
      if (existing.length > 0) {
        throw new Error(`UTR ${utr} already used for another withdrawal — duplicate prevented`);
      }
    }

    const updateData = {
      status:      action,
      utrId:       utr || null,
      rejectionReason: reason || null,
      processedAt: serverTimestamp(),
      processedBy: admin?.email
    };

    await fsUpdate(COLLECTIONS.WITHDRAWALS, activeWithdrawalId, updateData);

    // If rejected, refund the held amount back to user wallet
    if (action === 'rejected') {
      const { increment, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
      await updateDoc(doc(db, COLLECTIONS.USERS, w.userId), {
        walletBalance: increment(w.amount || 0)
      });
      // Log refund tx
      const { fsAdd } = await import('../../js/firebase-service.js');
      await fsAdd(COLLECTIONS.WALLET_TX, {
        userId: w.userId, type: 'withdrawal_refund',
        amount: w.amount, description: `Withdrawal rejected — ${reason}`,
        withdrawalId: activeWithdrawalId
      });
    }

    await logAudit({
      action:   `WITHDRAWAL_${action.toUpperCase()}`,
      target:   'withdrawal_request',
      targetId: activeWithdrawalId,
      newValue: { action, utrId: utr, reason },
      reason
    });

    document.getElementById('withdrawalModal')?.classList.add('hidden');
    showToast(`Withdrawal ${action}${utr ? ` — UTR: ${utr}` : ''}`, action === 'approved' ? 'success' : 'error');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    setBtnLoading('processWithdrawalBtn', false, 'Process Payment');
  }
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3 — TOURNAMENT STATUS AUTOMATION
═══════════════════════════════════════════════════════════ */

/**
 * Advance a match through its status lifecycle.
 * upcoming → registration_open → full → live → result_pending → completed
 */
export async function advanceMatchStatus(matchId) {
  const match = await fsGet(COLLECTIONS.MATCHES, matchId);
  if (!match) { showToast('Match not found', 'error'); return; }

  const STATUS_FLOW = {
    'upcoming':          'registration_open',
    'registration_open': 'live',
    'full':              'live',
    'live':              'result_pending',
    'result_pending':    'completed'
  };

  const nextStatus = STATUS_FLOW[match.status];
  if (!nextStatus) { showToast('Match is already in final state', 'error'); return; }

  await fsUpdate(COLLECTIONS.MATCHES, matchId, {
    status: nextStatus,
    [`statusTimestamps.${nextStatus}`]: serverTimestamp()
  });

  await logAudit({
    action:   'MATCH_STATUS_ADVANCED',
    target:   'match',
    targetId: matchId,
    oldValue: { status: match.status },
    newValue: { status: nextStatus }
  });

  showToast(`Match status: ${match.status} → ${nextStatus}`, 'success');
}

/**
 * Cancel match and auto-refund all registered players.
 */
export async function cancelMatchWithRefund(matchId, reason) {
  if (!reason?.trim()) { showToast('Cancellation reason is required', 'error'); return; }

  setBtnLoading('confirmDangerBtn', true, 'Cancelling...');
  try {
    const admin   = auth.currentUser;
    const outcome = await autoRefundMatch({ matchId, adminId: admin?.uid, reason });

    if (!outcome.success) throw new Error(outcome.error);

    showToast(`Match cancelled. ${outcome.refunded} player(s) refunded.`, 'success');
  } catch (err) {
    showToast(`Cancel failed: ${err.message}`, 'error');
  } finally {
    setBtnLoading('confirmDangerBtn', false, 'CONFIRM ACTION');
  }
}

/* ─────────────────────────────────────────────────────────
   Wire up button actions (called from admin.js showSection)
───────────────────────────────────────────────────────── */
export function bindResultsActions() {
  document.getElementById('approveResultBtn')?.addEventListener('click', approveResult);
  document.getElementById('rejectResultBtn')?.addEventListener('click', () => rejectResult(false));
  document.getElementById('resubmitResultBtn')?.addEventListener('click', () => rejectResult(true));
  document.getElementById('closeResultModal')?.addEventListener('click', () => {
    document.getElementById('resultModal')?.classList.add('hidden');
  });
}

export function bindWithdrawalActions() {
  document.getElementById('processWithdrawalBtn')?.addEventListener('click', processWithdrawal);
  ['closeWithdrawalModal','cancelWithdrawalModal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      document.getElementById('withdrawalModal')?.classList.add('hidden');
    });
  });
  document.getElementById('wthStatusFilter')?.addEventListener('change', () => {
    // Re-filter the current cached data
    listenToCollection(COLLECTIONS.WITHDRAWALS, [orderBy('requestedAt','desc')], wths => {
      renderWithdrawalsTable(wths);
    });
  });
}

/* ─────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────── */
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setEl(id, val) { const el=document.getElementById(id); if(el)el.textContent=val; }
function setVal(id, val){ const el=document.getElementById(id); if(el)el.value=val; }
function showToast(msg, type='success') {
  const t=document.getElementById('adminToast'); if(!t)return;
  t.textContent=msg; t.className=`admin-toast toast-${type}`; t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'),3500);
}
function updateBadge(id, count) { const el=document.getElementById(id); if(el)el.textContent=count; }
function setBtnLoading(id, loading, text) {
  const btn=document.getElementById(id); if(!btn)return;
  btn.disabled=loading; btn.textContent=text;
}
function formatTimeAgo(ts) {
  if (!ts) return '—';
  const d=new Date(ts); const diff=Date.now()-d.getTime();
  const m=Math.floor(diff/60000);
  if(m<1)return 'Just now'; if(m<60)return `${m}m ago`;
  const h=Math.floor(m/60); if(h<24)return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}
function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
