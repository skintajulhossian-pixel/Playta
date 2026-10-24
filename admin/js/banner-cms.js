/* ═══════════════════════════════════════════════════════════
   PLAYTA — Admin Banner CMS
   admin/js/banner-cms.js
   PRD Section 3 — Home Banner Management CMS

   Features:
   - Upload, edit, enable/disable, archive/restore banners
   - Client-side image compression (800×400 WebP)
   - Upload progress with validation
   - displayOrder drag-free reorder (up/down buttons)
   - startAt / endAt scheduling
   - Safe link/tournament destination validation
   - Real-time Firestore sync to home page carousel
   - Full audit logging on every action
═══════════════════════════════════════════════════════════ */

import { db, storage, auth, COLLECTIONS }   from '../../js/firebase-config.js';
import {
  compressImage, uploadFile, logAudit,
  generateId, fsGet, fsAdd, fsUpdate,
  listenToCollection, serverTimestamp,
  where, orderBy
}                                            from '../../js/firebase-service.js';

/* ─────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────── */
let banners         = [];
let editingBannerId = null;
let unsubBanners    = null;

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
export function initBannerCMS() {
  renderBannerCMSSection();
  subscribeToBanners();
  bindBannerCMSEvents();
}

/* ─────────────────────────────────────────────────────────
   FIRESTORE LISTENER
───────────────────────────────────────────────────────── */
function subscribeToBanners() {
  if (unsubBanners) unsubBanners();
  unsubBanners = listenToCollection(
    COLLECTIONS.BANNERS,
    [orderBy('displayOrder', 'asc')],
    (data) => {
      banners = data;
      renderBannersTable();
    }
  );
}

/* ─────────────────────────────────────────────────────────
   INJECT SECTION HTML INTO ADMIN PANEL
───────────────────────────────────────────────────────── */
function renderBannerCMSSection() {
  const contentBody = document.querySelector('.content-body');
  if (!contentBody || document.getElementById('section-banners')) return;

  const section = document.createElement('section');
  section.id        = 'section-banners';
  section.className = 'cs';
  section.innerHTML = `
    <div class="section-toolbar">
      <div class="st-left">
        <div class="st-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" id="bannerSearch" placeholder="Search banners...">
        </div>
        <select class="st-filter" id="bannerStatusFilter">
          <option value="all">All</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div class="st-right">
        <button class="btn-primary-sm" id="addBannerCMSBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Banner
        </button>
      </div>
    </div>

    <div class="table-card full">
      <div class="tc-header">
        <h3>Home Page Banners</h3>
        <span class="badge badge-active" id="bannerCountBadge">0 banners</span>
      </div>
      <table class="admin-table" id="bannersTable">
        <thead>
          <tr>
            <th>Order</th>
            <th>Preview</th>
            <th>Title</th>
            <th>Destination</th>
            <th>Schedule</th>
            <th>Status</th>
            <th>Enabled</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="bannersTableBody"></tbody>
      </table>
      <div class="table-empty hidden" id="noBannersMsg">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
        <p>No banners yet — click "Add Banner" to start</p>
      </div>
    </div>
  `;
  contentBody.appendChild(section);
}

/* ─────────────────────────────────────────────────────────
   RENDER TABLE
───────────────────────────────────────────────────────── */
function renderBannersTable() {
  const tbody    = document.getElementById('bannersTableBody');
  const noEl     = document.getElementById('noBannersMsg');
  const badge    = document.getElementById('bannerCountBadge');
  const search   = (document.getElementById('bannerSearch')       || {}).value || '';
  const statusF  = (document.getElementById('bannerStatusFilter') || {}).value || 'all';

  if (!tbody) return;
  if (badge) badge.textContent = `${banners.length} banner${banners.length !== 1 ? 's' : ''}`;

  const filtered = banners.filter(b => {
    const matchQ = !search || (b.title || '').toLowerCase().includes(search.toLowerCase());
    const matchS = statusF === 'all'
      ? true
      : statusF === 'archived'
      ? !!b.archivedAt
      : statusF === 'enabled'
      ? b.enabled && !b.archivedAt
      : !b.enabled && !b.archivedAt;
    return matchQ && matchS;
  });

  if (!filtered.length) {
    tbody.innerHTML = '';
    noEl?.classList.remove('hidden');
    return;
  }
  noEl?.classList.add('hidden');

  const now = Date.now();
  tbody.innerHTML = filtered.map(b => {
    const startMs  = b.startAt?.toMillis?.() || 0;
    const endMs    = b.endAt?.toMillis?.()   || 0;
    const isLive   = b.enabled && !b.archivedAt && (!startMs || startMs <= now) && (!endMs || endMs > now);
    const isExpired= endMs > 0 && endMs <= now;

    let scheduleText = '—';
    if (startMs || endMs) {
      scheduleText = `${startMs ? fmtDate(startMs) : 'Now'} → ${endMs ? fmtDate(endMs) : '∞'}`;
    }

    let statusBadge;
    if (b.archivedAt)  statusBadge = `<span class="badge badge-banned">Archived</span>`;
    else if (isExpired) statusBadge = `<span class="badge badge-banned">Expired</span>`;
    else if (isLive)    statusBadge = `<span class="badge badge-active">🟢 Live</span>`;
    else                statusBadge = `<span class="badge badge-paid">Scheduled</span>`;

    return `
      <tr data-banner-id="${esc(b.id)}">
        <td>
          <div style="display:flex;gap:4px;align-items:center">
            <button class="action-btn banner-up-btn" data-id="${esc(b.id)}" title="Move Up">↑</button>
            <button class="action-btn banner-down-btn" data-id="${esc(b.id)}" title="Move Down">↓</button>
            <span style="color:var(--t1);font-size:12px">#${b.displayOrder ?? 0}</span>
          </div>
        </td>
        <td>
          ${b.bannerUrl
            ? `<img src="${esc(b.bannerUrl)}" style="width:80px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`
            : `<div style="width:80px;height:40px;background:var(--card2);border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--t1)">No image</div>`
          }
        </td>
        <td>
          <p style="font-weight:600;color:var(--t0)">${esc(b.title || '—')}</p>
          <p style="font-size:11px;color:var(--t1)">${esc(b.altText || '')}</p>
        </td>
        <td style="color:var(--t1);font-size:12px">
          ${b.linkUrl ? `<a href="${esc(b.linkUrl)}" target="_blank" style="color:var(--cyan)">${truncate(b.linkUrl, 30)}</a>` : '—'}
          ${b.tournamentId ? `<br><span style="color:var(--t2)">🎮 ${esc(b.tournamentId)}</span>` : ''}
        </td>
        <td style="color:var(--t1);font-size:11px">${scheduleText}</td>
        <td>${statusBadge}</td>
        <td>
          <label class="toggle-switch">
            <input type="checkbox" class="banner-toggle" data-id="${esc(b.id)}" ${b.enabled ? 'checked' : ''} ${b.archivedAt ? 'disabled' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td>
          <div class="action-btns">
            <button class="action-btn banner-preview-btn" data-id="${esc(b.id)}" title="Preview">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="action-btn banner-edit-btn" data-id="${esc(b.id)}" title="Edit" ${b.archivedAt ? 'disabled style="opacity:.4"' : ''}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>
              </svg>
            </button>
            <button class="action-btn ${b.archivedAt ? '' : 'danger'} banner-archive-btn" data-id="${esc(b.id)}"
              title="${b.archivedAt ? 'Restore' : 'Archive'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${b.archivedAt
                  ? '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'
                  : '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>'
                }
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* ─────────────────────────────────────────────────────────
   BANNER MODAL HTML
───────────────────────────────────────────────────────── */
function getBannerModalHTML(banner = null) {
  const startVal = banner?.startAt ? new Date(banner.startAt.toMillis()).toISOString().slice(0,16) : '';
  const endVal   = banner?.endAt   ? new Date(banner.endAt.toMillis()).toISOString().slice(0,16)   : '';

  return `
    <div id="bannerCMSModal" class="modal-overlay">
      <div class="modal-card" style="max-width:580px">
        <div class="modal-header">
          <h3>${banner ? '✏️ Edit Banner' : '🖼️ Add New Banner'}</h3>
          <button class="modal-close" id="closeBannerCMSModal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <!-- Image Upload -->
          <div class="mf-group full">
            <label>Banner Image <span style="color:var(--red)">*</span>
              <span style="color:var(--t1);font-size:11px;font-weight:400"> — max 800×400px WebP, max 1MB</span>
            </label>
            <div id="bannerUploadArea" style="display:flex;gap:14px;align-items:flex-start;margin-top:8px">
              <div id="bannerImgPreview" style="width:160px;height:80px;border-radius:8px;border:2px dashed var(--border);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--card2)">
                ${banner?.bannerUrl
                  ? `<img src="${esc(banner.bannerUrl)}" style="width:100%;height:100%;object-fit:cover">`
                  : '<span style="color:var(--t1);font-size:11px">Preview</span>'
                }
              </div>
              <div style="flex:1">
                <input type="file" id="bannerImageFile" accept="image/*" style="display:none">
                <button type="button" class="btn-export" id="bannerImageSelectBtn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Choose Image
                </button>
                <p id="bannerFileName" style="font-size:11px;color:var(--t1);margin-top:6px">
                  ${banner?.bannerUrl ? '✅ Current image saved' : 'No file selected'}
                </p>
                <div class="hidden" id="bannerProgressWrap" style="margin-top:8px">
                  <div style="background:var(--card2);border-radius:4px;height:4px;overflow:hidden">
                    <div id="bannerProgressFill" style="height:100%;background:var(--green);width:0%;transition:width .2s"></div>
                  </div>
                  <p id="bannerProgressText" style="font-size:11px;color:var(--t1);margin-top:4px"></p>
                </div>
              </div>
            </div>
          </div>

          <div class="mf-row">
            <div class="mf-group">
              <label>Title <span style="color:var(--red)">*</span></label>
              <input type="text" class="mf-input" id="bmTitle" placeholder="Banner title" value="${esc(banner?.title || '')}">
            </div>
            <div class="mf-group">
              <label>Alt Text <span style="color:var(--t1);font-weight:400;font-size:11px">(accessibility)</span></label>
              <input type="text" class="mf-input" id="bmAltText" placeholder="Describe the image" value="${esc(banner?.altText || '')}">
            </div>
          </div>

          <!-- Destination -->
          <div class="mf-group full">
            <label>Destination Type</label>
            <select class="mf-input" id="bmDestType" style="margin-bottom:8px">
              <option value="none" ${!banner?.linkUrl && !banner?.tournamentId ? 'selected' : ''}>No link</option>
              <option value="url"  ${banner?.linkUrl   ? 'selected' : ''}>External URL</option>
              <option value="tournament" ${banner?.tournamentId ? 'selected' : ''}>Tournament</option>
            </select>
          </div>

          <div class="mf-group full" id="bmUrlGroup" style="${banner?.linkUrl ? '' : 'display:none'}">
            <label>Link URL</label>
            <input type="url" class="mf-input" id="bmLinkUrl" placeholder="https://..." value="${esc(banner?.linkUrl || '')}">
            <p style="font-size:11px;color:var(--t1);margin-top:4px">Only https:// URLs allowed</p>
          </div>

          <div class="mf-group full" id="bmTournamentGroup" style="${banner?.tournamentId ? '' : 'display:none'}">
            <label>Tournament ID</label>
            <input type="text" class="mf-input" id="bmTournamentId" placeholder="Firestore tournament document ID" value="${esc(banner?.tournamentId || '')}">
          </div>

          <div class="mf-row">
            <div class="mf-group">
              <label>Display Order</label>
              <input type="number" class="mf-input" id="bmOrder" min="1" value="${banner?.displayOrder ?? 99}">
            </div>
            <div class="mf-group">
              <label>Enabled</label>
              <label class="toggle-switch" style="margin-top:10px;display:block">
                <input type="checkbox" id="bmEnabled" ${banner?.enabled !== false ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div class="mf-row">
            <div class="mf-group">
              <label>Show From <span style="color:var(--t1);font-weight:400;font-size:11px">(optional)</span></label>
              <input type="datetime-local" class="mf-input" id="bmStartAt" value="${startVal}">
            </div>
            <div class="mf-group">
              <label>Show Until <span style="color:var(--t1);font-weight:400;font-size:11px">(optional)</span></label>
              <input type="datetime-local" class="mf-input" id="bmEndAt" value="${endVal}">
            </div>
          </div>

          <div id="bannerSaveError" class="login-error hidden"></div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" id="cancelBannerCMSModal">Cancel</button>
          <button class="btn-primary-sm" id="saveBannerCMSBtn">
            <span id="saveBannerCMSText">${banner ? 'Save Changes' : 'Add Banner'}</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────
   BIND EVENTS
───────────────────────────────────────────────────────── */
function bindBannerCMSEvents() {
  document.addEventListener('click', async (e) => {

    // Add banner
    if (e.target.closest('#addBannerCMSBtn')) {
      editingBannerId = null;
      openBannerModal(null);
      return;
    }

    // Edit banner
    const editBtn = e.target.closest('.banner-edit-btn');
    if (editBtn && !editBtn.disabled) {
      const id     = editBtn.dataset.id;
      const banner = banners.find(b => b.id === id);
      if (banner) { editingBannerId = id; openBannerModal(banner); }
      return;
    }

    // Archive / Restore
    const archBtn = e.target.closest('.banner-archive-btn');
    if (archBtn) {
      const id     = archBtn.dataset.id;
      const banner = banners.find(b => b.id === id);
      if (!banner) return;
      const isArch = !!banner.archivedAt;
      if (!confirm(`${isArch ? 'Restore' : 'Archive'} banner "${banner.title}"?`)) return;

      const user = auth.currentUser;
      await fsUpdate(COLLECTIONS.BANNERS, id, isArch
        ? { archivedAt: null, archivedBy: null, enabled: false }
        : { archivedAt: serverTimestamp(), archivedBy: user?.email, enabled: false }
      );
      await logAudit({ action: isArch ? 'BANNER_RESTORED' : 'BANNER_ARCHIVED', target: 'banner', targetId: id });
      showToast(`Banner ${isArch ? 'restored' : 'archived'}`, 'success');
      return;
    }

    // Preview
    const prevBtn = e.target.closest('.banner-preview-btn');
    if (prevBtn) {
      const id     = prevBtn.dataset.id;
      const banner = banners.find(b => b.id === id);
      previewBanner(banner);
      return;
    }

    // Move up/down
    const upBtn   = e.target.closest('.banner-up-btn');
    const downBtn = e.target.closest('.banner-down-btn');
    if (upBtn)   { await swapBannerOrder(upBtn.dataset.id,   'up');   return; }
    if (downBtn) { await swapBannerOrder(downBtn.dataset.id, 'down'); return; }

    // Modal close
    if (e.target.closest('#closeBannerCMSModal') || e.target.closest('#cancelBannerCMSModal') || e.target.id === 'bannerCMSModal') {
      closeBannerModal();
      return;
    }

    // Save
    if (e.target.closest('#saveBannerCMSBtn')) {
      await saveBanner();
      return;
    }

    // Image select
    if (e.target.closest('#bannerImageSelectBtn')) {
      document.getElementById('bannerImageFile')?.click();
      return;
    }
  });

  // Toggle enable/disable
  document.addEventListener('change', async (e) => {
    const toggle = e.target.closest('.banner-toggle');
    if (toggle && !toggle.disabled) {
      const id      = toggle.dataset.id;
      const enabled = toggle.checked;
      await fsUpdate(COLLECTIONS.BANNERS, id, { enabled });
      await logAudit({ action: enabled ? 'BANNER_ENABLED' : 'BANNER_DISABLED', target: 'banner', targetId: id });
      showToast(`Banner ${enabled ? 'enabled' : 'disabled'}`, 'success');
      return;
    }

    // Destination type switch
    if (e.target.id === 'bmDestType') {
      const val = e.target.value;
      document.getElementById('bmUrlGroup')?.style.setProperty('display', val === 'url' ? '' : 'none');
      document.getElementById('bmTournamentGroup')?.style.setProperty('display', val === 'tournament' ? '' : 'none');
      return;
    }

    // Image file selected
    if (e.target.id === 'bannerImageFile') {
      const file = e.target.files?.[0];
      if (file) previewBannerFile(file);
      return;
    }
  });

  // Search / filter
  document.addEventListener('input', (e) => {
    if (e.target.id === 'bannerSearch') renderBannersTable();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'bannerStatusFilter') renderBannersTable();
  });
}

/* ─────────────────────────────────────────────────────────
   MODAL OPEN / CLOSE
───────────────────────────────────────────────────────── */
function openBannerModal(banner) {
  document.getElementById('bannerCMSModal')?.remove();
  const div = document.createElement('div');
  div.innerHTML = getBannerModalHTML(banner);
  document.body.appendChild(div.firstElementChild);
}

function closeBannerModal() {
  document.getElementById('bannerCMSModal')?.remove();
  editingBannerId = null;
}

/* ─────────────────────────────────────────────────────────
   IMAGE PREVIEW (before upload)
───────────────────────────────────────────────────────── */
function previewBannerFile(file) {
  const preview = document.getElementById('bannerImgPreview');
  const label   = document.getElementById('bannerFileName');
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover">`;
  }
  if (label) label.textContent = `${file.name} (${(file.size / 1024).toFixed(1)}KB)`;
}

/* ─────────────────────────────────────────────────────────
   PREVIEW BANNER (lightbox)
───────────────────────────────────────────────────────── */
function previewBanner(banner) {
  if (!banner?.bannerUrl) { showToast('No image uploaded for this banner', 'error'); return; }
  const lb = document.createElement('div');
  lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;padding:20px;cursor:zoom-out';
  lb.innerHTML = `
    <p style="color:var(--t1);font-size:13px;margin-bottom:12px">🖼️ ${esc(banner.title || 'Banner Preview')}</p>
    <img src="${esc(banner.bannerUrl)}" style="max-width:100%;max-height:70vh;border-radius:10px;object-fit:contain">
    ${banner.linkUrl ? `<p style="color:var(--cyan);font-size:12px;margin-top:10px">→ ${esc(banner.linkUrl)}</p>` : ''}
    <button style="margin-top:16px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:8px 20px;color:var(--t0);cursor:pointer" onclick="this.closest('div').remove()">Close</button>
  `;
  lb.addEventListener('click', e => { if (e.target === lb) lb.remove(); });
  document.body.appendChild(lb);
}

/* ─────────────────────────────────────────────────────────
   SAVE BANNER (Create / Update)
───────────────────────────────────────────────────────── */
async function saveBanner() {
  const saveBtn  = document.getElementById('saveBannerCMSBtn');
  const saveText = document.getElementById('saveBannerCMSText');
  const errEl    = document.getElementById('bannerSaveError');

  const title       = document.getElementById('bmTitle')?.value.trim();
  const altText     = document.getElementById('bmAltText')?.value.trim();
  const destType    = document.getElementById('bmDestType')?.value;
  const linkUrl     = document.getElementById('bmLinkUrl')?.value.trim();
  const tournId     = document.getElementById('bmTournamentId')?.value.trim();
  const order       = parseInt(document.getElementById('bmOrder')?.value) || 99;
  const enabled     = document.getElementById('bmEnabled')?.checked ?? true;
  const startAtStr  = document.getElementById('bmStartAt')?.value;
  const endAtStr    = document.getElementById('bmEndAt')?.value;
  const file        = document.getElementById('bannerImageFile')?.files?.[0];

  // Validate
  if (!title) { showBannerErr('Banner title is required.'); return; }

  // URL safety check
  if (destType === 'url' && linkUrl) {
    if (!linkUrl.startsWith('https://')) {
      showBannerErr('Only https:// URLs are allowed for safety.'); return;
    }
  }

  // End after start check
  if (startAtStr && endAtStr && new Date(startAtStr) >= new Date(endAtStr)) {
    showBannerErr('"Show Until" must be after "Show From".'); return;
  }

  const user = auth.currentUser;
  if (saveBtn) saveBtn.disabled = true;
  if (saveText) saveText.textContent = 'Saving...';
  if (errEl) errEl.classList.add('hidden');

  const prog     = document.getElementById('bannerProgressWrap');
  const progFill = document.getElementById('bannerProgressFill');
  const progText = document.getElementById('bannerProgressText');

  try {
    let bannerUrl = editingBannerId
      ? (banners.find(b => b.id === editingBannerId)?.bannerUrl || null)
      : null;

    if (file) {
      // Compress → 800×400 WebP
      prog?.classList.remove('hidden');
      if (progText) progText.textContent = 'Compressing image...';
      if (progFill) progFill.style.width = '20%';

      const compressed = await compressImage(file, 800, 400, 0.85);
      if (progFill) progFill.style.width = '50%';
      if (progText) progText.textContent = `Compressed: ${(compressed.size/1024).toFixed(1)}KB — uploading...`;

      const docId = editingBannerId || generateId('BANNER');
      const path  = `banners/${docId}/${compressed.name}`;
      bannerUrl   = await uploadFile(path, compressed);

      if (progFill) progFill.style.width = '100%';
      if (progText) progText.textContent = '✅ Upload complete';
    } else if (!bannerUrl && !editingBannerId) {
      showBannerErr('Please upload a banner image.'); return;
    }

    const bannerData = {
      title,
      altText:      altText || title,
      bannerUrl,
      linkUrl:      destType === 'url'        ? linkUrl : null,
      tournamentId: destType === 'tournament' ? tournId : null,
      displayOrder: order,
      enabled,
      startAt:      startAtStr ? new Date(startAtStr) : null,
      endAt:        endAtStr   ? new Date(endAtStr)   : null,
    };

    if (editingBannerId) {
      const old = banners.find(b => b.id === editingBannerId);
      bannerData.updatedBy = user?.email;
      await fsUpdate(COLLECTIONS.BANNERS, editingBannerId, bannerData);
      await logAudit({ action: 'BANNER_UPDATED', target: 'banner', targetId: editingBannerId, oldValue: old, newValue: bannerData });
      showToast(`✅ "${title}" updated`, 'success');
    } else {
      bannerData.createdBy  = user?.email;
      bannerData.archivedAt = null;
      bannerData.archivedBy = null;
      const newId = await fsAdd(COLLECTIONS.BANNERS, bannerData);
      await logAudit({ action: 'BANNER_CREATED', target: 'banner', targetId: newId, newValue: bannerData });
      showToast(`✅ "${title}" created`, 'success');
    }

    closeBannerModal();
  } catch (err) {
    showBannerErr(`Error: ${err.message}`);
    console.error('[BannerCMS]', err);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (saveText) saveText.textContent = editingBannerId ? 'Save Changes' : 'Add Banner';
    prog?.classList.add('hidden');
    if (progFill) progFill.style.width = '0%';
  }
}

/* ─────────────────────────────────────────────────────────
   SWAP ORDER
───────────────────────────────────────────────────────── */
async function swapBannerOrder(bannerId, direction) {
  const sorted  = [...banners].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  const idx     = sorted.findIndex(b => b.id === bannerId);
  if (idx < 0) return;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;

  const a = sorted[idx];
  const b = sorted[swapIdx];

  await Promise.all([
    fsUpdate(COLLECTIONS.BANNERS, a.id, { displayOrder: b.displayOrder ?? 0 }),
    fsUpdate(COLLECTIONS.BANNERS, b.id, { displayOrder: a.displayOrder ?? 0 })
  ]);
  await logAudit({ action: 'BANNER_REORDERED', target: 'banners', newValue: { swapped: [a.id, b.id] } });
}

/* ─────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────── */
function showBannerErr(msg) {
  const el = document.getElementById('bannerSaveError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function truncate(s, n) {
  return s && s.length > n ? s.slice(0, n) + '…' : (s || '');
}

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('adminToast');
  if (!t) return;
  t.textContent = msg;
  t.className   = `admin-toast toast-${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

/* ─────────────────────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────────────────────── */
export function destroyBannerCMS() {
  if (unsubBanners) { unsubBanners(); unsubBanners = null; }
}
