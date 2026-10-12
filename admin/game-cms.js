/* ═══════════════════════════════════════════════════════════
   PLAYTA — Admin Game CMS
   admin/js/game-cms.js

   Features:
   - Add / Edit / Archive (soft delete) / Enable-Disable games
   - Client-side image compression (300×300 WebP) before upload
   - Firebase Storage upload with progress indicator
   - Dynamic requiredPlayerFields configuration per game
   - Real-time Firestore sync to home page
   - Drag-to-reorder display order (updates displayOrder field)
═══════════════════════════════════════════════════════════ */

import {
  db, storage, auth, COLLECTIONS
}                                        from '../../js/firebase-config.js';
import {
  compressImage, uploadFile, logAudit,
  generateId, generateSlug,
  fsGet, fsSet, fsAdd, fsUpdate, fsDelete,
  fsQuery, listenToCollection,
  serverTimestamp, where, orderBy
}                                        from '../../js/firebase-service.js';

/* ─────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────── */
let games         = [];          // local cache
let editingGameId = null;        // null = creating, string = editing
let unsubGames    = null;        // Firestore listener unsubscribe

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
export function initGameCMS() {
  renderGameCMSSection();
  subscribeToGames();
  bindGameCMSEvents();
}

/* ─────────────────────────────────────────────────────────
   FIRESTORE REAL-TIME LISTENER
───────────────────────────────────────────────────────── */
function subscribeToGames() {
  if (unsubGames) unsubGames(); // clean up previous listener

  unsubGames = listenToCollection(
    COLLECTIONS.GAMES,
    [orderBy('displayOrder', 'asc')],
    (data) => {
      games = data;
      renderGamesTable();
      updateGameCount();
    }
  );
}

/* ─────────────────────────────────────────────────────────
   RENDER — inject CMS HTML into admin panel
───────────────────────────────────────────────────────── */
function renderGameCMSSection() {
  // Find the content body and inject the game CMS section
  const contentBody = document.querySelector('.content-body');
  if (!contentBody) return;

  // Check if section already exists
  if (document.getElementById('section-games')) return;

  const section = document.createElement('section');
  section.id = 'section-games';
  section.className = 'cs';
  section.innerHTML = `
    <div class="section-toolbar">
      <div class="st-left">
        <div class="st-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" id="gameSearch" placeholder="Search games...">
        </div>
        <select class="st-filter" id="gameStatusFilter">
          <option value="all">All Status</option>
          <option value="LIVE">🟢 Live</option>
          <option value="COMING_SOON">🔴 Coming Soon</option>
        </select>
      </div>
      <div class="st-right">
        <button class="btn-primary-sm" id="addGameBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Game
        </button>
      </div>
    </div>

    <div class="table-card full">
      <div class="tc-header">
        <h3>Game Library</h3>
        <span class="badge badge-active" id="gameCountBadge">0 games</span>
      </div>
      <table class="admin-table" id="gamesTable">
        <thead>
          <tr>
            <th>Order</th>
            <th>Logo</th>
            <th>Name</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Badge</th>
            <th>Player Fields</th>
            <th>Enabled</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="gamesTableBody"></tbody>
      </table>
      <div class="table-empty hidden" id="noGames">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <p>No games yet — click "Add Game" to start</p>
      </div>
    </div>
  `;

  contentBody.appendChild(section);
}

/* ─────────────────────────────────────────────────────────
   RENDER — Games Table
───────────────────────────────────────────────────────── */
function renderGamesTable() {
  const tbody    = document.getElementById('gamesTableBody');
  const noEl     = document.getElementById('noGames');
  const search   = (document.getElementById('gameSearch')       || {}).value || '';
  const statusF  = (document.getElementById('gameStatusFilter') || {}).value || 'all';

  if (!tbody) return;

  const filtered = games.filter(g => {
    const matchQ = !search || g.name.toLowerCase().includes(search.toLowerCase());
    const matchS = statusF === 'all' || g.status === statusF;
    return matchQ && matchS;
  });

  if (!filtered.length) {
    tbody.innerHTML = '';
    noEl && noEl.classList.remove('hidden');
    return;
  }

  noEl && noEl.classList.add('hidden');

  tbody.innerHTML = filtered.map(g => `
    <tr data-game-id="${g.id}">
      <td>
        <div style="display:flex;gap:4px">
          <button class="action-btn move-up-btn" data-id="${g.id}" title="Move Up">↑</button>
          <button class="action-btn move-down-btn" data-id="${g.id}" title="Move Down">↓</button>
          <span style="color:var(--t1);font-size:12px">#${g.displayOrder || 0}</span>
        </div>
      </td>
      <td>
        ${g.logoUrl
          ? `<img src="${g.logoUrl}" alt="${g.name}" style="width:36px;height:36px;border-radius:8px;object-fit:cover">`
          : `<div style="width:36px;height:36px;border-radius:8px;background:var(--card2);display:flex;align-items:center;justify-content:center;color:var(--t1);font-size:18px">🎮</div>`
        }
      </td>
      <td>
        <p style="font-weight:600;color:var(--t0)">${esc(g.name)}</p>
        <p style="font-size:11px;color:var(--t1)">${esc(g.description || '')}</p>
      </td>
      <td style="color:var(--t1);font-size:12px;font-family:monospace">${esc(g.slug || '')}</td>
      <td>
        <span class="badge ${g.status === 'LIVE' ? 'badge-active' : 'badge-banned'}">
          ${g.status === 'LIVE' ? '🟢 LIVE' : '🔴 COMING SOON'}
        </span>
      </td>
      <td>
        ${g.badgeText
          ? `<span style="background:${g.badgeColor || '#FF4C4C'};color:#fff;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700">${esc(g.badgeText)}</span>`
          : '<span style="color:var(--t2)">—</span>'
        }
      </td>
      <td style="color:var(--t1);font-size:12px">
        ${(g.requiredPlayerFields || []).map(f => `<span style="background:var(--card2);border:1px solid var(--border);border-radius:4px;padding:1px 6px;margin:1px;display:inline-block;font-size:11px">${esc(f.label)}</span>`).join('') || '—'}
      </td>
      <td>
        <label class="toggle-switch">
          <input type="checkbox" class="game-toggle" data-id="${g.id}" ${g.enabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>
        <div class="action-btns">
          <button class="action-btn edit-game-btn" data-id="${g.id}" title="Edit">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>
            </svg>
          </button>
          <button class="action-btn ${g.archived ? '' : 'danger'} archive-game-btn" data-id="${g.id}" title="${g.archived ? 'Restore' : 'Archive'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${g.archived
                ? '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'
                : '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>'
              }
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function updateGameCount() {
  const badge = document.getElementById('gameCountBadge');
  if (badge) badge.textContent = `${games.length} game${games.length !== 1 ? 's' : ''}`;
}

/* ─────────────────────────────────────────────────────────
   GAME MODAL HTML
───────────────────────────────────────────────────────── */
function getGameModalHTML(game = null) {
  const fields = game?.requiredPlayerFields || [{ label: 'In-Game Name', key: 'ign', required: true }];

  return `
    <div id="gameModal" class="modal-overlay">
      <div class="modal-card" style="max-width:620px;max-height:90vh;overflow-y:auto">
        <div class="modal-header">
          <h3>${game ? '✏️ Edit Game' : '🎮 Add New Game'}</h3>
          <button class="modal-close" id="closeGameModal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">

          <div class="mf-row">
            <div class="mf-group">
              <label>Game Name <span style="color:var(--red)">*</span></label>
              <input type="text" class="mf-input" id="gmName" placeholder="e.g. Free Fire Max" value="${esc(game?.name || '')}">
            </div>
            <div class="mf-group">
              <label>Slug (auto-generated)</label>
              <input type="text" class="mf-input" id="gmSlug" placeholder="free-fire-max" value="${esc(game?.slug || '')}" style="color:var(--t1)">
            </div>
          </div>

          <div class="mf-group full">
            <label>Description</label>
            <input type="text" class="mf-input" id="gmDesc" placeholder="Short game description" value="${esc(game?.description || '')}">
          </div>

          <div class="mf-row">
            <div class="mf-group">
              <label>Status</label>
              <select class="mf-input" id="gmStatus">
                <option value="LIVE" ${game?.status === 'LIVE' ? 'selected' : ''}>🟢 LIVE</option>
                <option value="COMING_SOON" ${game?.status === 'COMING_SOON' ? 'selected' : ''}>🔴 Coming Soon</option>
              </select>
            </div>
            <div class="mf-group">
              <label>Display Order</label>
              <input type="number" class="mf-input" id="gmOrder" value="${game?.displayOrder ?? 99}" min="1">
            </div>
          </div>

          <div class="mf-row">
            <div class="mf-group">
              <label>Badge Text <span style="color:var(--t1)">(optional)</span></label>
              <input type="text" class="mf-input" id="gmBadgeText" placeholder='e.g. MAX, NEW, HOT' value="${esc(game?.badgeText || '')}">
            </div>
            <div class="mf-group">
              <label>Badge Color</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="color" id="gmBadgeColor" value="${game?.badgeColor || '#FF4C4C'}" style="width:44px;height:38px;border:1px solid var(--border);border-radius:8px;background:none;cursor:pointer">
                <input type="text" class="mf-input" id="gmBadgeColorHex" value="${game?.badgeColor || '#FF4C4C'}" placeholder="#FF4C4C" style="flex:1">
              </div>
            </div>
          </div>

          <div class="mf-group full">
            <label>Enable Game</label>
            <label class="toggle-switch" style="margin-top:6px">
              <input type="checkbox" id="gmEnabled" ${game?.enabled !== false ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <!-- Logo Upload -->
          <div class="mf-group full">
            <label>Game Logo <span style="color:var(--t1);font-size:11px">(auto-compressed to 300×300 WebP)</span></label>
            <div class="logo-upload-area" id="logoUploadArea">
              ${game?.logoUrl
                ? `<img src="${game.logoUrl}" id="logoPreview" style="width:80px;height:80px;object-fit:cover;border-radius:12px">`
                : '<div id="logoPreview" style="width:80px;height:80px;border-radius:12px;background:var(--card2);display:flex;align-items:center;justify-content:center;color:var(--t1);font-size:28px">🎮</div>'
              }
              <div style="flex:1">
                <input type="file" id="gmLogoFile" accept="image/*" style="display:none">
                <button type="button" class="btn-export" id="logoSelectBtn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Choose Image
                </button>
                <p id="logoFileName" style="font-size:11px;color:var(--t1);margin-top:6px">${game?.logoUrl ? 'Current logo saved' : 'No file selected'}</p>
                <div class="upload-progress-bar hidden" id="logoProgressBar">
                  <div class="upload-progress-fill" id="logoProgressFill" style="width:0%"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Required Player Fields -->
          <div class="mf-group full">
            <label style="display:flex;justify-content:space-between;align-items:center">
              Required Player Fields
              <button type="button" class="btn-export" id="addFieldBtn" style="font-size:11px;padding:4px 10px">+ Add Field</button>
            </label>
            <p style="font-size:11px;color:var(--t1);margin-bottom:8px">
              These fields will be shown when a player joins a match for this game.
            </p>
            <div id="playerFieldsList">
              ${fields.map((f, i) => renderFieldRow(f, i)).join('')}
            </div>
          </div>

          <div id="gameSaveError" class="login-error hidden"></div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" id="cancelGameModal">Cancel</button>
          <button class="btn-primary-sm" id="saveGameBtn">
            <span id="saveGameBtnText">${game ? 'Save Changes' : 'Create Game'}</span>
            <span id="saveGameSpinner" class="hidden" style="margin-left:6px">⏳</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderFieldRow(field, index) {
  return `
    <div class="player-field-row" data-index="${index}" style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:8px;margin-bottom:8px;align-items:center">
      <input type="text" class="mf-input field-label" placeholder="Label (e.g. In-Game Name)" value="${esc(field.label || '')}">
      <input type="text" class="mf-input field-key"   placeholder="Key (e.g. ign)"            value="${esc(field.key   || '')}">
      <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--t1);white-space:nowrap">
        <input type="checkbox" class="field-required" ${field.required ? 'checked' : ''}> Required
      </label>
      <button type="button" class="action-btn danger remove-field-btn" title="Remove">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   EVENT BINDINGS
───────────────────────────────────────────────────────── */
function bindGameCMSEvents() {
  document.addEventListener('click', async (e) => {

    // Add game button
    if (e.target.closest('#addGameBtn')) {
      editingGameId = null;
      openGameModal(null);
      return;
    }

    // Edit game
    const editBtn = e.target.closest('.edit-game-btn');
    if (editBtn) {
      const id   = editBtn.dataset.id;
      const game = games.find(g => g.id === id);
      if (game) { editingGameId = id; openGameModal(game); }
      return;
    }

    // Archive / Restore game
    const archBtn = e.target.closest('.archive-game-btn');
    if (archBtn) {
      const id   = archBtn.dataset.id;
      const game = games.find(g => g.id === id);
      if (!game) return;
      const action = game.archived ? 'restore' : 'archive';
      if (!confirm(`${action === 'archive' ? 'Archive' : 'Restore'} game "${game.name}"?`)) return;

      await fsUpdate(COLLECTIONS.GAMES, id, {
        archived: !game.archived,
        enabled:  game.archived ? false : game.enabled
      });
      await logAudit({ action: `GAME_${action.toUpperCase()}`, target: 'game', targetId: id, oldValue: { archived: game.archived }, newValue: { archived: !game.archived } });
      showToast(`Game ${action}d`, 'success');
      return;
    }

    // Move up/down (display order)
    const upBtn = e.target.closest('.move-up-btn');
    if (upBtn) { await swapOrder(upBtn.dataset.id, 'up');   return; }
    const downBtn = e.target.closest('.move-down-btn');
    if (downBtn) { await swapOrder(downBtn.dataset.id, 'down'); return; }

    // Close game modal
    if (e.target.closest('#closeGameModal') || e.target.closest('#cancelGameModal') || e.target.id === 'gameModal') {
      closeGameModal();
      return;
    }

    // Add player field
    if (e.target.closest('#addFieldBtn')) {
      const list = document.getElementById('playerFieldsList');
      if (list) {
        const idx  = list.querySelectorAll('.player-field-row').length;
        const div  = document.createElement('div');
        div.innerHTML = renderFieldRow({ label: '', key: '', required: false }, idx);
        list.appendChild(div.firstElementChild);
      }
      return;
    }

    // Remove player field
    const removeBtn = e.target.closest('.remove-field-btn');
    if (removeBtn) {
      removeBtn.closest('.player-field-row')?.remove();
      return;
    }

    // Save game
    if (e.target.closest('#saveGameBtn')) {
      await saveGame();
      return;
    }

    // Logo select
    if (e.target.closest('#logoSelectBtn')) {
      document.getElementById('gmLogoFile')?.click();
      return;
    }
  });

  // Toggle enable/disable inline
  document.addEventListener('change', async (e) => {
    const toggle = e.target.closest('.game-toggle');
    if (toggle) {
      const id      = toggle.dataset.id;
      const enabled = toggle.checked;
      await fsUpdate(COLLECTIONS.GAMES, id, { enabled });
      await logAudit({ action: enabled ? 'GAME_ENABLED' : 'GAME_DISABLED', target: 'game', targetId: id });
      showToast(`Game ${enabled ? 'enabled' : 'disabled'}`, 'success');
      return;
    }

    // Color picker sync
    if (e.target.id === 'gmBadgeColor') {
      const hexInput = document.getElementById('gmBadgeColorHex');
      if (hexInput) hexInput.value = e.target.value;
    }
    if (e.target.id === 'gmBadgeColorHex') {
      const picker = document.getElementById('gmBadgeColor');
      if (picker && /^#[0-9a-f]{6}$/i.test(e.target.value)) picker.value = e.target.value;
    }

    // Logo file selected
    if (e.target.id === 'gmLogoFile') {
      const file = e.target.files?.[0];
      if (!file) return;
      previewLogo(file);
    }
  });

  // Auto-generate slug from name
  document.addEventListener('input', (e) => {
    if (e.target.id === 'gmName') {
      const slugInput = document.getElementById('gmSlug');
      if (slugInput && !editingGameId) {
        slugInput.value = generateSlug(e.target.value);
      }
    }

    // Search/filter
    if (e.target.id === 'gameSearch') renderGamesTable();
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'gameStatusFilter') renderGamesTable();
  });
}

/* ─────────────────────────────────────────────────────────
   MODAL OPEN / CLOSE
───────────────────────────────────────────────────────── */
function openGameModal(game) {
  // Remove existing modal
  document.getElementById('gameModal')?.remove();

  const div  = document.createElement('div');
  div.innerHTML = getGameModalHTML(game);
  document.body.appendChild(div.firstElementChild);
}

function closeGameModal() {
  document.getElementById('gameModal')?.remove();
  editingGameId = null;
}

/* ─────────────────────────────────────────────────────────
   LOGO PREVIEW
───────────────────────────────────────────────────────── */
function previewLogo(file) {
  const preview = document.getElementById('logoPreview');
  const label   = document.getElementById('logoFileName');
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.outerHTML = `<img src="${url}" id="logoPreview" style="width:80px;height:80px;object-fit:cover;border-radius:12px">`;
  }
  if (label) label.textContent = `${file.name} (${(file.size / 1024).toFixed(1)}KB) → will compress`;
}

/* ─────────────────────────────────────────────────────────
   SAVE GAME (Create or Update)
───────────────────────────────────────────────────────── */
async function saveGame() {
  const saveBtn  = document.getElementById('saveGameBtn');
  const spinner  = document.getElementById('saveGameSpinner');
  const errEl    = document.getElementById('gameSaveError');
  const btnText  = document.getElementById('saveGameBtnText');

  const name    = document.getElementById('gmName')?.value.trim();
  const slug    = document.getElementById('gmSlug')?.value.trim() || generateSlug(name);
  const desc    = document.getElementById('gmDesc')?.value.trim();
  const status  = document.getElementById('gmStatus')?.value;
  const order   = parseInt(document.getElementById('gmOrder')?.value) || 99;
  const badge   = document.getElementById('gmBadgeText')?.value.trim();
  const color   = document.getElementById('gmBadgeColorHex')?.value.trim() || '#FF4C4C';
  const enabled = document.getElementById('gmEnabled')?.checked ?? true;
  const file    = document.getElementById('gmLogoFile')?.files?.[0];

  // Validate
  if (!name) {
    if (errEl) { errEl.textContent = 'Game name is required'; errEl.classList.remove('hidden'); }
    return;
  }

  // Collect player fields
  const fieldRows  = document.querySelectorAll('.player-field-row');
  const playerFields = [];
  for (const row of fieldRows) {
    const label    = row.querySelector('.field-label')?.value.trim();
    const key      = row.querySelector('.field-key')?.value.trim() || generateSlug(label || '');
    const required = row.querySelector('.field-required')?.checked ?? true;
    if (label) playerFields.push({ label, key, required });
  }

  // Show loading
  if (saveBtn) saveBtn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  if (btnText) btnText.textContent = 'Saving...';
  if (errEl)   errEl.classList.add('hidden');

  try {
    let logoUrl = editingGameId ? (games.find(g => g.id === editingGameId)?.logoUrl || null) : null;

    // Compress + upload logo if a new file was selected
    if (file) {
      if (btnText) btnText.textContent = 'Compressing...';
      const compressed = await compressImage(file, 300, 300, 0.85);
      const label      = document.getElementById('logoFileName');
      if (label) label.textContent = `Compressed: ${(compressed.size / 1024).toFixed(1)}KB → uploading...`;

      const path = `games/${editingGameId || generateId('GAME')}/logo/${compressed.name}`;
      if (btnText) btnText.textContent = 'Uploading...';
      logoUrl = await uploadFile(path, compressed);
    }

    const gameData = {
      name, slug, description: desc || '', status,
      displayOrder: order, badgeText: badge || null,
      badgeColor: badge ? color : null, logoUrl, enabled,
      requiredPlayerFields: playerFields,
      archived: false
    };

    if (editingGameId) {
      const oldGame = games.find(g => g.id === editingGameId);
      await fsUpdate(COLLECTIONS.GAMES, editingGameId, gameData);
      await logAudit({
        action: 'GAME_UPDATED', target: 'game',
        targetId: editingGameId, oldValue: oldGame, newValue: gameData
      });
      showToast(`✅ "${name}" updated`, 'success');
    } else {
      const newId = await fsAdd(COLLECTIONS.GAMES, gameData);
      await logAudit({ action: 'GAME_CREATED', target: 'game', targetId: newId, newValue: gameData });
      showToast(`✅ "${name}" created`, 'success');
    }

    closeGameModal();
  } catch (err) {
    console.error('[GameCMS] Save error:', err);
    if (errEl) { errEl.textContent = `Error: ${err.message}`; errEl.classList.remove('hidden'); }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
    if (btnText) btnText.textContent = editingGameId ? 'Save Changes' : 'Create Game';
  }
}

/* ─────────────────────────────────────────────────────────
   DISPLAY ORDER — swap two games
───────────────────────────────────────────────────────── */
async function swapOrder(gameId, direction) {
  const sorted = [...games].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  const idx    = sorted.findIndex(g => g.id === gameId);
  if (idx < 0) return;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;

  const a = sorted[idx];
  const b = sorted[swapIdx];

  await Promise.all([
    fsUpdate(COLLECTIONS.GAMES, a.id, { displayOrder: b.displayOrder || 0 }),
    fsUpdate(COLLECTIONS.GAMES, b.id, { displayOrder: a.displayOrder || 0 })
  ]);

  await logAudit({ action: 'GAME_ORDER_CHANGED', target: 'games', newValue: { swapped: [a.id, b.id] } });
}

/* ─────────────────────────────────────────────────────────
   PUBLIC API — expose what admin panel needs
───────────────────────────────────────────────────────── */
export function destroyGameCMS() {
  if (unsubGames) { unsubGames(); unsubGames = null; }
}

/* ─────────────────────────────────────────────────────────
   UTILITY — HTML escape
───────────────────────────────────────────────────────── */
function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('adminToast');
  if (!t) return;
  t.textContent = msg;
  t.className   = `admin-toast toast-${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}
