/* ═══════════════════════════════════════════════════════════
   PLAYTA — Home Page Dynamic Renderer
   js/home.js

   Features:
   - Fetch enabled games from Firestore → render in existing UI
   - localStorage cache → instant load, background sync
   - Graceful offline fallback
   - Dynamic "COMING SOON" / custom badge rendering
   - Live tournament cards pulled from Firestore
   - Real-time countdown timers per match
   - Session guard — redirect to auth if not logged in
═══════════════════════════════════════════════════════════ */

import { db, auth, COLLECTIONS }              from './firebase-config.js';
import {
  fsQuery, listenToCollection,
  where, orderBy, limit, serverTimestamp
}                                              from './firebase-service.js';
import { onAuthStateChanged }                  from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

/* ─────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────── */
const CACHE_KEY_GAMES   = 'playta_games_cache';
const CACHE_KEY_MATCHES = 'playta_matches_cache';
const CACHE_TTL_MS      = 5 * 60 * 1000;   // 5 minutes cache TTL
const SESSION_KEY       = 'playta_user_sess';

/* ─────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────── */
let unsubGames   = null;
let unsubMatches = null;
let countdownInt = null;
let currentGames = [];
let currentUser  = null;

/* ─────────────────────────────────────────────────────────
   INIT — entry point called from index.html
───────────────────────────────────────────────────────── */
export function initHomePage() {
  // 1. Immediately render from cache (instant paint)
  renderGamesFromCache();
  renderMatchesFromCache();

  // 2. Auth guard
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      // Fall back to localStorage session check
      const sess = safeJSON(localStorage.getItem(SESSION_KEY));
      if (!sess?.loggedIn) {
        window.location.replace('auth/');
        return;
      }
    }
    currentUser = user;
    // 3. Start real-time Firestore listeners (background update)
    startGamesListener();
    startMatchesListener();
  });

  // 4. Offline detection banner
  window.addEventListener('offline', showOfflineBanner);
  window.addEventListener('online',  hideOfflineBanner);
}

/* ─────────────────────────────────────────────────────────
   OFFLINE BANNER
───────────────────────────────────────────────────────── */
function showOfflineBanner() {
  let banner = document.getElementById('offlineBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.style.cssText = [
      'position:fixed;top:0;left:0;right:0;z-index:9999',
      'background:rgba(255,159,67,0.95);color:#000',
      'text-align:center;padding:8px;font-size:13px;font-weight:600'
    ].join(';');
    banner.textContent = '📡 You\'re offline — showing cached data';
    document.body.prepend(banner);
  }
}

function hideOfflineBanner() {
  document.getElementById('offlineBanner')?.remove();
}

/* ═══════════════════════════════════════════════════════════
   GAMES — fetch, cache, render
═══════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────
   Render from localStorage cache instantly
───────────────────────────────────────────────────────── */
function renderGamesFromCache() {
  const cached = safeJSON(localStorage.getItem(CACHE_KEY_GAMES));
  if (cached?.data?.length) {
    renderGamesGrid(cached.data);
  }
}

/* ─────────────────────────────────────────────────────────
   Firestore real-time listener → update cache + re-render
───────────────────────────────────────────────────────── */
function startGamesListener() {
  if (unsubGames) unsubGames();

  unsubGames = listenToCollection(
    COLLECTIONS.GAMES,
    [
      where('enabled',  '==', true),
      where('archived', '==', false),
      orderBy('displayOrder', 'asc')
    ],
    (games) => {
      currentGames = games;

      // Update localStorage cache
      localStorage.setItem(CACHE_KEY_GAMES, JSON.stringify({
        data:      games,
        cachedAt:  Date.now()
      }));

      renderGamesGrid(games);
    }
  );
}

/* ─────────────────────────────────────────────────────────
   Render games into the existing home page grid
───────────────────────────────────────────────────────── */
function renderGamesGrid(games) {
  // Target the existing games grid container
  const grid = document.querySelector('.games-grid') ||
               document.getElementById('gamesGrid')  ||
               document.querySelector('[data-games-grid]');

  if (!grid) return;

  if (!games.length) {
    grid.innerHTML = '<p style="color:var(--t1);text-align:center;padding:32px;grid-column:span 2">No games available right now</p>';
    return;
  }

  grid.innerHTML = games.map(game => buildGameCard(game)).join('');

  // Bind click handlers
  grid.querySelectorAll('.game-tile[data-game-id]').forEach(tile => {
    tile.addEventListener('click', () => handleGameClick(tile.dataset.gameId, tile.dataset.gameSlug, tile.dataset.gameStatus));
  });
}

/* ─────────────────────────────────────────────────────────
   Build a single game card HTML
   Mirrors the existing static design exactly
───────────────────────────────────────────────────────── */
function buildGameCard(game) {
  const isLive   = game.status === 'LIVE';
  const hasLogo  = !!game.logoUrl;
  const hasBadge = !!game.badgeText;

  return `
    <div class="game-tile ${isLive ? '' : 'locked'}"
         data-game-id="${esc(game.id)}"
         data-game-slug="${esc(game.slug)}"
         data-game-status="${esc(game.status)}">

      ${hasBadge ? `
        <div class="game-badge" style="background:${esc(game.badgeColor || '#FF4C4C')}">
          ${esc(game.badgeText)}
        </div>
      ` : !isLive ? `
        <div class="game-badge" style="background:#FF4C4C">SOON</div>
      ` : ''}

      <div class="game-logo-wrap">
        ${hasLogo
          ? `<img src="${esc(game.logoUrl)}" alt="${esc(game.name)}" class="game-logo" loading="lazy"
                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : ''
        }
        <div class="game-logo-fallback" style="${hasLogo ? 'display:none' : ''}">🎮</div>
      </div>

      <p class="game-name ${isLive ? '' : 'coming-soon-text'}">${esc(game.name)}</p>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   Handle game tile click
───────────────────────────────────────────────────────── */
function handleGameClick(gameId, slug, status) {
  if (status === 'COMING_SOON') {
    showToast('🔜 Coming Soon! Stay tuned.', 'info');
    return;
  }

  // Store selected game for tournament list
  sessionStorage.setItem('playta_selected_game', JSON.stringify({ gameId, slug }));

  // Show the tournament list view for this game
  const listView = document.getElementById('tournamentListView') ||
                   document.getElementById('tlistView');

  if (listView) {
    openTournamentListView(gameId, slug);
  } else {
    // Navigate to a game-specific page if using multi-page setup
    window.location.href = `matches.html?game=${slug}`;
  }
}

/* ─────────────────────────────────────────────────────────
   Tournament List View (used when single-page)
───────────────────────────────────────────────────────── */
function openTournamentListView(gameId, gameSlug) {
  const view = document.getElementById('tlistView') || document.getElementById('tournamentListView');
  if (!view) return;

  // Show the view
  view.classList.remove('hidden');
  document.getElementById('homeView')?.classList.add('hidden');

  // Load matches for this game from Firestore
  loadMatchesForGame(gameId);
}

async function loadMatchesForGame(gameId) {
  const scroll = document.getElementById('tlistScroll');
  if (!scroll) return;

  scroll.innerHTML = '<p style="text-align:center;color:var(--t1);padding:40px">Loading matches...</p>';

  try {
    const matches = await fsQuery(COLLECTIONS.MATCHES, [
      where('gameId', '==', gameId),
      where('status', 'in', ['registration_open', 'live', 'upcoming', 'full']),
      orderBy('date', 'asc')
    ]);

    if (!matches.length) {
      scroll.innerHTML = '<p style="text-align:center;color:var(--t1);padding:40px">No active matches right now</p>';
      return;
    }

    scroll.innerHTML = matches.map(m => buildMatchCard(m, true)).join('');
    bindMatchJoinButtons(scroll);
    startCountdownTimers();
  } catch (err) {
    scroll.innerHTML = `<p style="text-align:center;color:var(--red);padding:40px">Error loading matches: ${err.message}</p>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   MATCHES — live tournaments on home page
═══════════════════════════════════════════════════════════ */

function renderMatchesFromCache() {
  const cached = safeJSON(localStorage.getItem(CACHE_KEY_MATCHES));
  if (cached?.data?.length) {
    renderHomeFeaturedMatches(cached.data.filter(m => m.category === 'mega'));
  }
}

function startMatchesListener() {
  if (unsubMatches) unsubMatches();

  unsubMatches = listenToCollection(
    COLLECTIONS.MATCHES,
    [
      where('status', 'in', ['registration_open', 'live', 'upcoming']),
      orderBy('date', 'asc'),
      limit(20)
    ],
    (matches) => {
      // Update cache
      localStorage.setItem(CACHE_KEY_MATCHES, JSON.stringify({
        data: matches, cachedAt: Date.now()
      }));

      // Home page shows Mega (free) tournaments
      const mega  = matches.filter(m => m.category === 'mega');
      // Paid tournaments go in game-specific list
      const daily = matches.filter(m => m.category === 'daily');

      renderHomeFeaturedMatches(mega);

      // Also update the active tournament list if open
      const scroll = document.getElementById('tlistScroll');
      if (scroll && daily.length) {
        scroll.innerHTML = daily.map(m => buildMatchCard(m, true)).join('');
        bindMatchJoinButtons(scroll);
      }

      startCountdownTimers();
    }
  );
}

function renderHomeFeaturedMatches(matches) {
  const list = document.getElementById('homeFeaturedList');
  if (!list) return;

  if (!matches.length) {
    list.innerHTML = '<p style="color:var(--t1);text-align:center;padding:32px">No live tournaments right now</p>';
    return;
  }

  list.innerHTML = matches.slice(0, 5).map(m => buildMatchCard(m, false)).join('');
  bindMatchJoinButtons(list);
}

/* ─────────────────────────────────────────────────────────
   Build Match Card HTML
───────────────────────────────────────────────────────── */
function buildMatchCard(m, showDetails = false) {
  const isFree      = !m.entryFee || m.entryFee === 0;
  const isFull      = m.joinedSlots >= m.totalSlots;
  const spotsLeft   = Math.max(0, (m.totalSlots || 0) - (m.joinedSlots || 0));
  const fillPct     = Math.min(100, Math.round(((m.joinedSlots || 0) / (m.totalSlots || 1)) * 100));
  const startDate   = m.date?.toDate ? m.date.toDate() : new Date(m.date || 0);
  const isLive      = startDate <= new Date() && m.status !== 'completed';
  const type        = m.matchType || 'Solo';

  const typeColors  = { Solo:'solo', Duo:'duo', Squad:'squad' };
  const btnClass    = isFull ? 'full' : '';
  const btnLabel    = isFull ? 'MATCH FULL' : 'JOIN MATCH';

  return `
    <div class="match-card" data-match-id="${esc(m.id)}">
      <div class="mc-header">
        <div class="mc-game-info">
          <img src="${esc(m.gameLogoUrl || '')}" alt="game" class="mc-game-logo" onerror="this.style.display='none'">
          <span class="mc-title">${esc(m.title || `Match ${m.id}`)}</span>
        </div>
        <span class="badge badge-${typeColors[type] || 'solo'}">${esc(type)}</span>
      </div>

      ${showDetails && m.rules ? `
        <div class="mc-rules">
          <span class="mc-rules-bar"></span>
          <span class="mc-rules-text">${esc(m.rules)}</span>
        </div>
      ` : ''}

      <div class="mc-stats">
        <div class="mc-stat">
          <p class="mc-stat-label">DATE</p>
          <p class="mc-stat-value">${formatDateShort(startDate)}</p>
        </div>
        <div class="mc-stat">
          <p class="mc-stat-label">STARTS IN</p>
          <p class="mc-stat-value ${isLive ? 'live-text' : ''} countdown"
             data-start="${startDate.getTime()}">
            ${isLive ? 'LIVE' : formatCountdown(startDate - Date.now())}
          </p>
        </div>
      </div>

      <div class="mc-stats">
        <div class="mc-stat">
          <p class="mc-stat-label">PRIZE POOL</p>
          <p class="mc-stat-value prize-val">🎁 ${(m.prizePool || 0).toLocaleString('en-IN')}</p>
        </div>
        ${showDetails ? `
          <div class="mc-stat">
            <p class="mc-stat-label">PER KILL</p>
            <p class="mc-stat-value prize-val">🎁 ${m.perKill || 0}</p>
          </div>
        ` : `
          <div class="mc-stat">
            <p class="mc-stat-label">ENTRY</p>
            <p class="mc-stat-value">
              ${isFree
                ? '<span class="badge badge-free">FREE ENTRY</span>'
                : `<span class="mc-stat-value">${m.entryFee} units</span>`
              }
            </p>
          </div>
        `}
      </div>

      <div class="mc-slots-row">
        <div class="mc-slots-info">
          <span style="color:var(--t1);font-size:13px">${m.joinedSlots || 0}/${m.totalSlots || 0} joined</span>
          <span style="color:var(--cyan);font-size:13px">${spotsLeft} spots left</span>
        </div>
        <button class="match-join-btn-small ${btnClass}" ${isFull ? 'disabled' : ''}>
          ${!isFree ? `<span class="join-btn-fee">${m.entryFee}</span><span class="join-btn-sep">|</span>` : ''}
          ${btnLabel}
        </button>
      </div>
      <div class="mc-progress"><div class="mc-progress-fill" style="width:${fillPct}%"></div></div>

      <div class="mm-room-locked" data-match-id="${esc(m.id)}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>Join the match to unlock Room ID &amp; Password.</span>
      </div>

      ${m.streamUrl ? `
        <a class="mc-stream-link" href="${esc(m.streamUrl)}" target="_blank" rel="noopener">
          <span class="stream-live-dot"></span> Watch Live Stream
        </a>
      ` : ''}
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   Bind JOIN MATCH button clicks
───────────────────────────────────────────────────────── */
function bindMatchJoinButtons(container) {
  container.querySelectorAll('.match-join-btn-small:not(.full):not(.registered)').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      const card    = btn.closest('.match-card');
      const matchId = card?.dataset.matchId;
      if (!matchId) return;

      // Find the match from cache
      const cached  = safeJSON(localStorage.getItem(CACHE_KEY_MATCHES));
      const match   = (cached?.data || []).find(m => m.id === matchId);

      if (match) {
        // Save to localStorage for join.html to read
        localStorage.setItem('selectedMatchId', matchId);
        localStorage.setItem('upcoming_matches', JSON.stringify(
          (cached?.data || []).map(m => ({
            id:         m.id,
            matchType:  m.matchType,
            title:      m.title,
            entryFee:   m.entryFee,
            totalSlots: m.totalSlots,
            prizePool:  m.prizePool,
            perKill:    m.perKill,
            category:   m.category,
            gameId:     m.gameId,
            rules:      m.rules
          }))
        ));
      }

      window.location.href = 'join.html';
    });
  });
}

/* ─────────────────────────────────────────────────────────
   Countdown timers
───────────────────────────────────────────────────────── */
function startCountdownTimers() {
  if (countdownInt) clearInterval(countdownInt);

  countdownInt = setInterval(() => {
    document.querySelectorAll('.countdown[data-start]').forEach(el => {
      const startMs = parseInt(el.dataset.start);
      const diff    = startMs - Date.now();
      if (diff <= 0) {
        el.textContent = 'LIVE';
        el.classList.add('live-text');
      } else {
        el.textContent = formatCountdown(diff);
      }
    });
  }, 1000);
}

/* ═══════════════════════════════════════════════════════════
   ROOM ID REVEAL (1 minute before match)
═══════════════════════════════════════════════════════════ */
export async function checkRoomReveal(matchId, userId) {
  try {
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');

    // Check if user is registered
    const regId   = `${matchId}_${userId}`;
    const regSnap = await getDoc(doc(db, COLLECTIONS.REGISTRATIONS, regId));
    if (!regSnap.exists() || regSnap.data().status !== 'confirmed') return null;

    // Check match start time — reveal 1 minute before
    const match   = await fsGet(COLLECTIONS.MATCHES, matchId);
    const startMs = match?.date?.toMillis?.() || new Date(match?.date).getTime();
    if (Date.now() < startMs - 60000) return null; // not yet

    // Fetch room details (secure subcollection)
    const roomSnap = await getDoc(doc(db, `${COLLECTIONS.MATCHES}/${matchId}/room/details`));
    if (!roomSnap.exists()) return null;

    return roomSnap.data();
  } catch (e) {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────── */
function safeJSON(str) {
  try { return str ? JSON.parse(str) : null; } catch { return null; }
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDateShort(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'});
}

function formatCountdown(ms) {
  if (ms <= 0) return 'LIVE';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

function showToast(msg, type='success') {
  const existing = document.getElementById('homeToast');
  const t = existing || document.createElement('div');
  if (!existing) {
    t.id = 'homeToast';
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 20px;font-size:13px;font-weight:500;z-index:9999;color:var(--t0);white-space:nowrap';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 3000);
}

/* ─────────────────────────────────────────────────────────
   CLEANUP
───────────────────────────────────────────────────────── */
export function destroyHomePage() {
  if (unsubGames)   { unsubGames();   unsubGames   = null; }
  if (unsubMatches) { unsubMatches(); unsubMatches = null; }
  if (countdownInt) { clearInterval(countdownInt); countdownInt = null; }
}
