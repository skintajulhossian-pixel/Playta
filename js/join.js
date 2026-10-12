/* ═══════════════════════════════════════════════════════════
   PLAYTA — Dynamic Join Page
   js/join.js

   Features:
   - Reads selectedMatchId + game from localStorage/Firestore
   - Fetches game's requiredPlayerFields from Firestore
   - Dynamically renders required input fields (IGN, UID, Riot ID, etc.)
   - Validates all required fields before submission
   - Secure entry fee deduction via Firestore transaction
   - Slot grid rendering (Solo=48, Duo=24, Squad=12 teams)
   - Duplicate registration prevention
   - Real-time slot availability check
   - Post-registration Room ID reveal (1 min before match)
═══════════════════════════════════════════════════════════ */

import { db, auth, COLLECTIONS }           from './firebase-config.js';
import {
  deductEntryFee, logAudit,
  fsGet, fsQuery, fsUpdate, fsAdd,
  listenToDoc, serverTimestamp,
  where, orderBy
}                                          from './firebase-service.js';
import { onAuthStateChanged }              from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc }                     from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

/* ─────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────── */
let currentMatch   = null;
let currentGame    = null;
let currentUser    = null;
let selectedSlot   = null;
let unsubMatch     = null;
let roomRevealInt  = null;

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
export async function initJoinPage() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      const sess = safeJSON(localStorage.getItem('playta_user_sess'));
      if (!sess?.loggedIn) { window.location.replace('auth/'); return; }
    }
    currentUser = user || safeJSON(localStorage.getItem('playta_user_sess'));
    await loadMatchAndGame();
  });
}

/* ─────────────────────────────────────────────────────────
   LOAD MATCH + GAME DATA
───────────────────────────────────────────────────────── */
async function loadMatchAndGame() {
  const matchId = localStorage.getItem('selectedMatchId');
  if (!matchId) { showError('No match selected. Please go back and choose a match.'); return; }

  showLoading(true);

  try {
    // Try Firestore first, fall back to localStorage cache
    let match = await fsGet(COLLECTIONS.MATCHES, matchId);

    if (!match) {
      // Fall back to localStorage cached matches
      const cached = safeJSON(localStorage.getItem('upcoming_matches')) || [];
      match = cached.find(m => m.id === matchId);
    }

    if (!match) { showError('Match not found. It may have been cancelled.'); return; }

    currentMatch = match;

    // Load game data to get requiredPlayerFields
    if (match.gameId) {
      currentGame = await fsGet(COLLECTIONS.GAMES, match.gameId);
    }

    // Fallback: check if user already registered
    const userId = currentUser?.uid || currentUser?.username;
    if (userId) {
      const regId  = `${matchId}_${userId}`;
      const regDoc = await fsGet(COLLECTIONS.REGISTRATIONS, regId);
      if (regDoc?.status === 'confirmed') {
        renderAlreadyJoined(match, regDoc);
        return;
      }
    }

    // Check match status
    if (match.status === 'cancelled') {
      showError('This match has been cancelled.');
      return;
    }
    if (match.joinedSlots >= match.totalSlots) {
      showMatchFull(match);
      return;
    }

    // Render everything
    renderMatchHeader(match);
    renderSlotGrid(match);
    renderPlayerFields(currentGame?.requiredPlayerFields || getDefaultFields(match.matchType));
    renderEntrySection(match);
    startRoomRevealChecker(matchId, userId);

    // Real-time slot updates
    startMatchListener(matchId);

  } catch (err) {
    showError(`Failed to load match: ${err.message}`);
    console.error('[JoinPage]', err);
  } finally {
    showLoading(false);
  }
}

/* ─────────────────────────────────────────────────────────
   MATCH HEADER
───────────────────────────────────────────────────────── */
function renderMatchHeader(match) {
  const header = document.getElementById('joinMatchHeader');
  if (!header) return;

  const startDate  = match.date?.toDate ? match.date.toDate() : new Date(match.date || 0);
  const spotsLeft  = Math.max(0, (match.totalSlots || 0) - (match.joinedSlots || 0));
  const type       = match.matchType || 'Solo';

  header.innerHTML = `
    <div class="jh-top">
      <button class="jh-back" onclick="history.back()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <div class="jh-game">
        ${currentGame?.logoUrl
          ? `<img src="${esc(currentGame.logoUrl)}" alt="${esc(currentGame.name)}" class="jh-game-logo">`
          : '<div class="jh-game-logo" style="background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:20px">🎮</div>'
        }
        <span class="jh-game-name">${esc(currentGame?.name || 'Free Fire Max')}</span>
      </div>
      <div class="jh-badge">
        <span id="joinSlotCounter">${match.joinedSlots || 0} / ${match.totalSlots || 48} joined</span>
      </div>
    </div>
    <div class="jh-info">
      <span class="badge badge-${(type).toLowerCase()}">${esc(type)}</span>
      <span style="color:var(--t1);font-size:13px">Entry: <strong style="color:${!match.entryFee ? 'var(--green)' : 'var(--t0)'}">
        ${!match.entryFee ? 'FREE' : `${match.entryFee} Units`}
      </strong></span>
      <span style="color:var(--t1);font-size:13px">${spotsLeft} spots left</span>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   SLOT GRID (Solo=48, Duo=24, Squad=12)
───────────────────────────────────────────────────────── */
function renderSlotGrid(match) {
  const container = document.getElementById('slotGridContainer') ||
                    document.getElementById('slotGrid');
  if (!container) return;

  const type       = match.matchType || 'Solo';
  const totalSlots = match.totalSlots || (type === 'Solo' ? 48 : type === 'Duo' ? 24 : 12);
  const taken      = match.joinedSlots || 0;

  container.innerHTML = `
    <div class="slot-grid-header">
      <h3>Select Your Slot</h3>
      <p style="color:var(--t1);font-size:13px">${type} mode · ${totalSlots} slots · ${taken} taken</p>
    </div>
    <div class="slot-grid" id="slotGrid">
      ${Array.from({ length: totalSlots }, (_, i) => {
        const slotNum  = i + 1;
        const isTaken  = i < taken;
        return `
          <div class="slot-cell ${isTaken ? 'taken' : 'available'}"
               data-slot="${slotNum}"
               ${isTaken ? '' : `onclick="window.joinPage.selectSlot(${slotNum})"`}
               title="Slot #${slotNum}${isTaken ? ' — Taken' : ''}">
            <span class="slot-num">#${slotNum}</span>
            <span class="slot-status">${isTaken ? '✕' : 'JOIN'}</span>
          </div>
        `;
      }).join('')}
    </div>
    <p id="selectedSlotInfo" class="slot-selected-info hidden">
      ✅ Slot <strong id="selectedSlotNum">—</strong> selected
    </p>
  `;
}

/* ─────────────────────────────────────────────────────────
   DYNAMIC PLAYER FIELDS
───────────────────────────────────────────────────────── */
function renderPlayerFields(fields) {
  const container = document.getElementById('playerFieldsContainer') ||
                    document.getElementById('dynamicPlayerFields');
  if (!container || !fields?.length) return;

  container.innerHTML = `
    <div class="pf-section">
      <h3 class="pf-title">
        ${currentGame?.name || 'Game'} Account Details
        <span style="color:var(--t1);font-size:12px;font-weight:400">Required to verify your identity</span>
      </h3>
      ${fields.map(field => `
        <div class="pf-group">
          <label class="pf-label">
            ${esc(field.label)}
            ${field.required ? '<span style="color:var(--red)">*</span>' : '<span style="color:var(--t1)">(optional)</span>'}
          </label>
          <input
            type="${field.inputType || 'text'}"
            class="pf-input"
            id="pf_${esc(field.key)}"
            name="${esc(field.key)}"
            placeholder="${esc(field.placeholder || `Enter your ${field.label}`)}"
            ${field.required ? 'required' : ''}
            ${field.maxLength ? `maxlength="${field.maxLength}"` : ''}
            ${field.pattern   ? `pattern="${field.pattern}"` : ''}
          >
          ${field.helpText ? `<p class="pf-help">${esc(field.helpText)}</p>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   DEFAULT FIELDS per match type (fallback when no game config)
───────────────────────────────────────────────────────── */
function getDefaultFields(matchType) {
  return [
    { label: 'In-Game Name (IGN)', key: 'ign', required: true,
      placeholder: 'Your exact in-game name', helpText: 'Must match your in-game name exactly' },
    { label: 'Player UID',         key: 'uid', required: true,
      placeholder: 'Your player UID', maxLength: 12, pattern: '[0-9]+',
      helpText: 'Found in your game profile → Settings → About' }
  ];
}

/* ─────────────────────────────────────────────────────────
   ENTRY & CONFIRM SECTION
───────────────────────────────────────────────────────── */
function renderEntrySection(match) {
  const section = document.getElementById('entrySection') ||
                  document.getElementById('joinConfirmSection');
  if (!section) return;

  const isFree = !match.entryFee || match.entryFee === 0;

  section.innerHTML = `
    <div class="entry-section">
      ${!isFree ? `
        <div class="entry-cost-info">
          <div class="ec-row">
            <span>Entry Fee</span>
            <span class="ec-amount">₹${(match.entryFee || 0).toLocaleString('en-IN')}</span>
          </div>
          <div class="ec-row">
            <span>Your Balance</span>
            <span class="ec-balance" id="userBalance">Loading...</span>
          </div>
          <div class="ec-row ec-total">
            <span>You Pay</span>
            <span>₹${(match.entryFee || 0).toLocaleString('en-IN')}</span>
          </div>
        </div>
      ` : `
        <div class="entry-free-badge">
          🎉 FREE ENTRY — No units required!
        </div>
      `}

      <div id="joinFormError" class="join-error hidden"></div>

      <button class="btn-join-confirm" id="confirmJoinBtn" onclick="window.joinPage.confirmJoin()">
        <span id="joinBtnText">${isFree ? 'JOIN MATCH — FREE' : `JOIN & PAY ${match.entryFee} UNITS`}</span>
        <span id="joinBtnSpinner" class="hidden">⏳</span>
      </button>

      <p class="join-terms">
        By joining, you agree to PLAYTA's
        <a href="#" style="color:var(--cyan)">Terms of Service</a>.
        Entry fee is non-refundable unless the match is cancelled by admin.
      </p>
    </div>
  `;

  // Load user balance if paid match
  if (!isFree) loadUserBalance();
}

async function loadUserBalance() {
  const balEl = document.getElementById('userBalance');
  if (!balEl) return;

  try {
    const uid  = auth.currentUser?.uid || currentUser?.uid;
    if (!uid)  { balEl.textContent = '—'; return; }
    const user = await fsGet(COLLECTIONS.USERS, uid);
    const bal  = user?.walletBalance ?? 0;
    balEl.textContent = `₹${bal.toLocaleString('en-IN')}`;
    balEl.style.color = bal >= (currentMatch?.entryFee || 0) ? 'var(--green)' : 'var(--red)';
  } catch {
    balEl.textContent = 'Unknown';
  }
}

/* ─────────────────────────────────────────────────────────
   SELECT SLOT
───────────────────────────────────────────────────────── */
window.joinPage = window.joinPage || {};

window.joinPage.selectSlot = function(slotNum) {
  // Deselect previous
  document.querySelectorAll('.slot-cell.selected').forEach(c => c.classList.remove('selected'));

  // Select new
  const cell = document.querySelector(`.slot-cell[data-slot="${slotNum}"]`);
  if (cell && cell.classList.contains('available')) {
    cell.classList.add('selected');
    selectedSlot = slotNum;

    const info   = document.getElementById('selectedSlotInfo');
    const numEl  = document.getElementById('selectedSlotNum');
    if (info)  info.classList.remove('hidden');
    if (numEl) numEl.textContent = `#${slotNum}`;
  }
};

/* ─────────────────────────────────────────────────────────
   CONFIRM JOIN (validate → deduct → register)
───────────────────────────────────────────────────────── */
window.joinPage.confirmJoin = async function() {
  const errEl  = document.getElementById('joinFormError');
  const btnText= document.getElementById('joinBtnText');
  const spinner= document.getElementById('joinBtnSpinner');
  const btn    = document.getElementById('confirmJoinBtn');

  if (!currentMatch) { showJoinError('Match data not loaded. Please refresh.'); return; }

  // Validate slot selection
  if (!selectedSlot) {
    showJoinError('Please select a slot from the grid above.');
    return;
  }

  // Collect and validate player fields
  const game   = currentGame;
  const fields = game?.requiredPlayerFields || getDefaultFields(currentMatch.matchType);
  const playerData = {};

  for (const field of fields) {
    const input = document.getElementById(`pf_${field.key}`);
    const value = input?.value.trim() || '';

    if (field.required && !value) {
      input?.focus();
      showJoinError(`"${field.label}" is required.`);
      return;
    }

    if (field.pattern && value && !new RegExp(`^${field.pattern}$`).test(value)) {
      showJoinError(`"${field.label}" format is invalid.`);
      return;
    }

    playerData[field.key] = value;
  }

  // Loading state
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Processing...';
  if (spinner) spinner.classList.remove('hidden');
  if (errEl) errEl.classList.add('hidden');

  try {
    const userId  = auth.currentUser?.uid || currentUser?.uid || currentUser?.username;
    const matchId = currentMatch.id;
    const entryFee= currentMatch.entryFee || 0;

    let txId;

    if (entryFee > 0) {
      // Secure entry fee deduction via Firestore transaction
      const result = await deductEntryFee({ userId, matchId, amount: entryFee, adminId: null });
      if (!result.success) {
        showJoinError(
          result.error === 'Already registered for this match'
            ? 'You are already registered for this match!'
            : result.error === 'Insufficient balance'
            ? 'Insufficient wallet balance. Please add units first.'
            : `Registration failed: ${result.error}`
        );
        return;
      }
      txId = result.txId;
    } else {
      // Free match — just create registration
      const regId  = `${matchId}_${userId}`;
      const exists = await fsGet(COLLECTIONS.REGISTRATIONS, regId);
      if (exists) { showJoinError('You are already registered for this match!'); return; }

      await fsUpdate(COLLECTIONS.REGISTRATIONS, regId, {
        matchId, userId, status: 'confirmed',
        entryFee: 0, registeredAt: serverTimestamp()
      });
    }

    // Save player game data
    const regId = `${matchId}_${userId}`;
    await fsUpdate(COLLECTIONS.REGISTRATIONS, regId, {
      slotNumber: selectedSlot,
      playerData,
      gameId: currentGame?.id || null
    });

    // Increment match joinedSlots
    const { doc: fDoc, updateDoc, increment } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
    await updateDoc(fDoc(db, COLLECTIONS.MATCHES, matchId), {
      joinedSlots: increment(1)
    });

    await logAudit({
      action: 'MATCH_JOINED', target: 'match', targetId: matchId,
      newValue: { userId, slot: selectedSlot, entryFee, playerData }
    });

    // Show success screen
    renderJoinSuccess(currentMatch, selectedSlot, txId);

  } catch (err) {
    showJoinError(`An error occurred: ${err.message}`);
    console.error('[JoinPage] confirmJoin error:', err);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = currentMatch?.entryFee ? `JOIN & PAY ${currentMatch.entryFee} UNITS` : 'JOIN MATCH — FREE';
    if (spinner) spinner.classList.add('hidden');
  }
};

/* ─────────────────────────────────────────────────────────
   SUCCESS SCREEN
───────────────────────────────────────────────────────── */
function renderJoinSuccess(match, slot, txId) {
  const main = document.getElementById('joinMain') || document.body;
  main.innerHTML = `
    <div class="join-success-screen">
      <div class="js-icon">✅</div>
      <h2 class="js-title">You're In!</h2>
      <p class="js-sub">Successfully joined <strong>${esc(match.title || match.id)}</strong></p>

      <div class="js-details">
        <div class="js-row"><span>Slot</span><strong>#${slot}</strong></div>
        <div class="js-row"><span>Match</span><strong>${esc(match.matchType || 'Solo')}</strong></div>
        <div class="js-row"><span>Date</span><strong>${formatDate(match.date?.toDate?.() || match.date)}</strong></div>
        ${txId ? `<div class="js-row"><span>Tx ID</span><code style="font-size:11px">${esc(txId)}</code></div>` : ''}
      </div>

      <div class="js-room-info" id="roomInfoBox">
        <div class="mm-room-locked">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>Room ID &amp; Password will be revealed 1 minute before the match starts.</span>
        </div>
      </div>

      <button class="btn-join-confirm" onclick="window.location.href='index.html'" style="margin-top:24px">
        Back to Home
      </button>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   ALREADY JOINED screen
───────────────────────────────────────────────────────── */
function renderAlreadyJoined(match, reg) {
  const main = document.getElementById('joinMain') || document.querySelector('main');
  if (!main) return;

  main.innerHTML = `
    <div class="join-success-screen">
      <div class="js-icon">🎮</div>
      <h2 class="js-title">Already Registered</h2>
      <p class="js-sub">You're already in <strong>${esc(match.title || match.id)}</strong></p>
      <div class="js-details">
        <div class="js-row"><span>Slot</span><strong>#${reg.slotNumber || '—'}</strong></div>
        <div class="js-row"><span>Status</span><strong style="color:var(--green)">${reg.status}</strong></div>
      </div>
      <div class="js-room-info" id="roomInfoBox">
        <div class="mm-room-locked">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span>Room ID &amp; Password will be revealed 1 minute before the match starts.</span>
        </div>
      </div>
      <button class="btn-join-confirm" onclick="history.back()" style="margin-top:24px">← Go Back</button>
    </div>
  `;

  // Start checking room reveal
  const uid = auth.currentUser?.uid || currentUser?.uid;
  if (uid) startRoomRevealChecker(match.id, uid);
}

/* ─────────────────────────────────────────────────────────
   MATCH FULL screen
───────────────────────────────────────────────────────── */
function renderMatchFull(match) {
  const main = document.getElementById('joinMain') || document.querySelector('main');
  if (!main) return;
  main.innerHTML = `
    <div class="join-success-screen">
      <div class="js-icon">🔒</div>
      <h2 class="js-title">Match Full</h2>
      <p class="js-sub">All ${match.totalSlots} slots for <strong>${esc(match.title || match.id)}</strong> are taken.</p>
      <button class="btn-join-confirm" onclick="history.back()" style="margin-top:24px">← View Other Matches</button>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   ROOM REVEAL CHECKER — polls every 30s
───────────────────────────────────────────────────────── */
function startRoomRevealChecker(matchId, userId) {
  if (roomRevealInt) clearInterval(roomRevealInt);

  async function check() {
    try {
      const match   = await fsGet(COLLECTIONS.MATCHES, matchId);
      if (!match) return;

      const startMs = match.date?.toMillis?.() || new Date(match.date || 0).getTime();
      const now     = Date.now();

      if (now >= startMs - 60000) {
        // Time to reveal — fetch room details
        const roomSnap = await getDoc(doc(db, `${COLLECTIONS.MATCHES}/${matchId}/room/details`));
        if (roomSnap.exists()) {
          const room = roomSnap.data();
          renderRoomRevealed(room);
          clearInterval(roomRevealInt);
        }
      }
    } catch (e) {
      console.warn('[JoinPage] Room reveal check error:', e.message);
    }
  }

  check(); // immediate check
  roomRevealInt = setInterval(check, 30000); // check every 30s
}

function renderRoomRevealed(room) {
  const box = document.getElementById('roomInfoBox');
  if (!box) return;
  box.innerHTML = `
    <div class="room-revealed">
      <div class="rr-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
        🎮 Room Details Unlocked!
      </div>
      <div class="rr-item">
        <span class="rr-label">Room ID</span>
        <span class="rr-value">${esc(room.roomId || '—')}</span>
        <button onclick="navigator.clipboard.writeText('${esc(room.roomId || '')}');showCopyToast('Room ID')" class="rr-copy">Copy</button>
      </div>
      <div class="rr-item">
        <span class="rr-label">Password</span>
        <span class="rr-value">${esc(room.password || '—')}</span>
        <button onclick="navigator.clipboard.writeText('${esc(room.password || '')}');showCopyToast('Password')" class="rr-copy">Copy</button>
      </div>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   REAL-TIME MATCH LISTENER (update slot count live)
───────────────────────────────────────────────────────── */
function startMatchListener(matchId) {
  unsubMatch = listenToDoc(COLLECTIONS.MATCHES, matchId, (match) => {
    if (!match) return;
    currentMatch = match;

    // Update slot counter
    const counter = document.getElementById('joinSlotCounter');
    if (counter) counter.textContent = `${match.joinedSlots || 0} / ${match.totalSlots || 0} joined`;

    // Re-render slot grid if slots changed
    if (match.joinedSlots !== undefined) {
      const slots = document.querySelectorAll('.slot-cell.available');
      // Mark newly taken slots
      for (let i = 0; i < (match.joinedSlots || 0); i++) {
        const cell = document.querySelector(`.slot-cell[data-slot="${i+1}"]`);
        if (cell && !cell.classList.contains('taken')) {
          cell.classList.remove('available', 'selected');
          cell.classList.add('taken');
          cell.querySelector('.slot-status').textContent = '✕';
          cell.removeAttribute('onclick');
        }
      }
    }

    // If match became full while user was on page
    if (match.joinedSlots >= match.totalSlots && !selectedSlot) {
      renderMatchFull(match);
    }
  });
}

/* ─────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────── */
function showLoading(show) {
  const loader = document.getElementById('joinLoader') || document.getElementById('loadingSpinner');
  const main   = document.getElementById('joinMain');
  if (loader) loader.style.display = show ? 'flex' : 'none';
  if (main && show) main.style.opacity = '0.4';
  if (main && !show) main.style.opacity = '1';
}

function showError(msg) {
  const main = document.getElementById('joinMain') || document.querySelector('main');
  if (main) main.innerHTML = `
    <div style="text-align:center;padding:60px 20px">
      <div style="font-size:48px;margin-bottom:16px">⚠️</div>
      <h3 style="color:var(--t0);margin-bottom:8px">Oops!</h3>
      <p style="color:var(--t1)">${esc(msg)}</p>
      <button class="btn-join-confirm" onclick="history.back()" style="margin-top:24px">← Go Back</button>
    </div>
  `;
}

function showJoinError(msg) {
  const el = document.getElementById('joinFormError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  setTimeout(() => el?.classList.add('hidden'), 5000);
}

function safeJSON(str) {
  try { return str ? JSON.parse(str) : null; } catch { return null; }
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

window.showCopyToast = function(label) {
  showJoinError(`✅ ${label} copied!`);
  const el = document.getElementById('joinFormError');
  if (el) { el.style.color='var(--green)'; el.style.background='rgba(17,255,102,0.08)'; el.style.borderColor='rgba(17,255,102,0.3)'; }
  setTimeout(() => {
    if (el) { el.style.color=''; el.style.background=''; el.style.borderColor=''; el.classList.add('hidden'); }
  }, 2000);
};

/* ─────────────────────────────────────────────────────────
   CLEANUP
───────────────────────────────────────────────────────── */
export function destroyJoinPage() {
  if (unsubMatch)   { unsubMatch(); unsubMatch = null; }
  if (roomRevealInt){ clearInterval(roomRevealInt); roomRevealInt = null; }
}
