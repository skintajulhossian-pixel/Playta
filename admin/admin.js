/* ============================================
   PLAYTA ADMIN — admin.js
   Authentication · Dashboard Logic · Charts
   ============================================ */

/* ── CONSTANTS ── */
const SK  = 'upcoming_matches';   // localStorage key (shared with main app)
const SSK = 'playta_admin_sess';  // session key

/* ── MOCK ADMIN ACCOUNTS ── */
const ADMIN_ACCOUNTS = [
  { email: 'admin@playta.com',   password: 'playta123', role: 'Super Admin',  initials: 'SA' },
  { email: 'manager@playta.com', password: 'admin123',  role: 'Admin',        initials: 'AD' },
  { email: 'mod@playta.com',     password: 'mod123',    role: 'Moderator',    initials: 'MO' }
];

/* ── MOCK ANALYTICS DATA (replace with real API calls) ──
   Each array maps to one time period in the chart.
   Simply swap these arrays with your backend responses later. */
const MOCK_DATA = {
  labels7d:   ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  labels30d:  Array.from({length:30},(_,i)=>`${i+1}`),
  labels12m:  ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],

  revenue7d:  [28000,35000,22000,48000,38000,55000,72000],
  users7d:    [210,245,198,312,280,420,388],
  mega7d:     [2,3,1,4,2,5,4],
  daily7d:    [8,12,7,15,11,18,14],

  revenue12m: [48000,62000,78000,95000,110000,142000,168000,155000,180000,205000,220000,248000],
  users12m:   [1200,1450,1820,2100,2480,3200,4100,3800,4200,4800,5100,5400],

  finWeekly:  [65000,80000,72000,95000],
  finLabels:  ['Week 1','Week 2','Week 3','Week 4']
};

/* ── ACTIVE CHART INSTANCES (for cleanup on re-render) ── */
const charts = {};
function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

/* ════════════════════════════════════
   AUTHENTICATION
   ════════════════════════════════════ */

function getSession() {
  try { return JSON.parse(localStorage.getItem(SSK)); } catch { return null; }
}
function setSession(account) {
  localStorage.setItem(SSK, JSON.stringify(account));
}
function clearSession() {
  localStorage.removeItem(SSK);
}

/* Called on page load */
function initApp() {
  updateGreeting();
  const session = getSession();
  if (session) {
    showDashboard(session);
  } else {
    showLoginPage();
  }
}

function showLoginPage() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
}

function showDashboard(account) {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  /* Set admin info */
  document.getElementById('admin-av-text').textContent   = account.initials;
  document.getElementById('admin-name-text').textContent  = account.email.split('@')[0];
  document.getElementById('admin-role-text').textContent  = account.role;
  document.getElementById('sb-av-text').textContent       = account.initials;
  document.getElementById('sb-name-text').textContent     = account.role;
  document.getElementById('sb-role-badge').textContent    = account.role === 'Super Admin' ? 'Full Access' : account.role;

  /* Role-based UI */
  applyRoleRestrictions(account.role);

  /* Init dashboard data */
  updateDashStats();
  renderMatchTable();

  /* Init charts after layout settles */
  setTimeout(initAllCharts, 150);
}

/* Hide sidebar links based on role */
function applyRoleRestrictions(role) {
  const walletLink   = document.getElementById('nav-wallet');
  const settingsLink = document.getElementById('nav-settings');

  if (role === 'Admin') {
    if (settingsLink) settingsLink.style.display = 'none';
  } else if (role === 'Moderator') {
    if (walletLink)   walletLink.style.display   = 'none';
    if (settingsLink) settingsLink.style.display = 'none';
  }
}

/* ── LOGIN HANDLER ── */
function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const errEl    = document.getElementById('login-error');

  errEl.classList.add('hidden');
  clearInputErrors();

  /* Loading state */
  btn.classList.add('loading');
  btn.disabled = true;

  setTimeout(() => {
    const account = ADMIN_ACCOUNTS.find(a => a.email === email && a.password === password);
    btn.classList.remove('loading');
    btn.disabled = false;

    if (!account) {
      errEl.classList.remove('hidden');
      document.getElementById('login-email').classList.add('error');
      document.getElementById('login-password').classList.add('error');
      return;
    }

    if (document.getElementById('remember-me').checked) setSession(account);
    showDashboard(account);
  }, 1300);
}

function clearInputErrors() {
  document.getElementById('login-email').classList.remove('error');
  document.getElementById('login-password').classList.remove('error');
}

function togglePassword() {
  const inp = document.getElementById('login-password');
  const btn = document.getElementById('pw-toggle');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

function handleLogout() {
  clearSession();
  showLoginPage();
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').classList.add('hidden');
  clearInputErrors();
}

/* Enter key on login form */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !document.getElementById('login-page').classList.contains('hidden')) {
    handleLogin();
  }
});

/* ════════════════════════════════════
   NAVIGATION
   ════════════════════════════════════ */
const PAGE_TITLES = {
  dash:        'Dashboard',
  create:      'Create Match',
  tlist:       'Tournament List',
  users:       'Users',
  withdraw:    'Withdraw Requests',
  transactions:'Transactions',
  wallet:      'Wallet',
  analytics:   'Analytics',
  notifications:'Notifications',
  support:     'Support Tickets',
  reports:     'Reports',
  settings:    'Settings'
};

function navigateTo(pageId) {
  /* Update nav items */
  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  /* Show/hide page sections */
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  const section = document.getElementById(`page-${pageId}`);
  if (section) section.classList.add('active');

  /* Update topbar title */
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[pageId] || pageId;

  /* Page-specific init */
  if (pageId === 'dash')      { updateDashStats(); renderMatchTable(); }
  if (pageId === 'create')    { renderMatchTable(); }
  if (pageId === 'tlist')     { renderMatchTable(); }
  if (pageId === 'analytics') { setTimeout(initAnalyticsCharts, 100); }
  if (pageId === 'wallet')    { setTimeout(initWalletChart, 100); }

  closeSidebar();
  window.scrollTo(0, 0);
}

function openSidebar() {
  document.getElementById('main-sidebar').classList.add('open');
  document.getElementById('sb-overlay').classList.remove('hidden');
}
function closeSidebar() {
  document.getElementById('main-sidebar').classList.remove('open');
  document.getElementById('sb-overlay').classList.add('hidden');
}

/* ════════════════════════════════════
   STORAGE HELPERS
   ════════════════════════════════════ */
function getMatches() {
  try { return JSON.parse(localStorage.getItem(SK)) || []; } catch { return []; }
}
function saveMatches(arr) {
  localStorage.setItem(SK, JSON.stringify(arr));
}
function generateId() {
  return 'match_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
}
function formatNum(n)  { return (Number(n) || 0).toLocaleString('en-IN'); }
function formatDate(s) {
  const d = new Date(s);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) + ' ' +
         d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}

/* ════════════════════════════════════
   DASHBOARD STATS
   ════════════════════════════════════ */
function updateDashStats() {
  const matches = getMatches();
  const now     = Date.now();
  const mega  = matches.filter(m => m.category === 'Mega Tournament').length;
  const daily = matches.filter(m => m.category === 'Daily Custom Room').length;
  const live  = matches.filter(m => {
    const s = new Date(m.datetime).getTime();
    return now >= s && now <= s + 20 * 60 * 1000;
  }).length;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('stat-mega',  mega);
  set('stat-daily', daily);
  set('stat-live',  live);
}

/* ════════════════════════════════════
   PRIZE DISTRIBUTION BREAKDOWN
   ════════════════════════════════════ */
let rankRowCount = 1;

function addRankRow() {
  const container = document.getElementById('rankRowsContainer');
  if (!container) return;
  rankRowCount++;
  const row = document.createElement('div');
  row.className = 'rank-row';
  row.dataset.index = rankRowCount;
  row.innerHTML = `
    <div class="rank-row-num">${rankRowCount}</div>
    <div class="rank-row-fields">
      <input type="text" class="dash-input rank-pos-input" placeholder="e.g. Rank ${rankRowCount}" maxlength="30">
      <div class="rank-prize-wrap">
        <span class="rank-prize-prefix">₹</span>
        <input type="number" class="dash-input rank-prize-input" placeholder="0" min="0" oninput="updateDistributedTotal()">
      </div>
    </div>
    <button class="rank-remove-btn" onclick="removeRankRow(this)" type="button">✕</button>`;
  container.appendChild(row);
  refreshRemoveButtons();
  updateDistributedTotal();
  row.querySelector('.rank-pos-input')?.focus();
}

function removeRankRow(btn) {
  const row = btn.closest('.rank-row');
  if (!row) return;
  row.style.transition = 'opacity 0.15s, transform 0.15s';
  row.style.opacity = '0';
  row.style.transform = 'translateX(8px)';
  setTimeout(() => {
    row.remove();
    renumberRankRows();
    refreshRemoveButtons();
    updateDistributedTotal();
  }, 160);
}

function renumberRankRows() {
  document.querySelectorAll('#rankRowsContainer .rank-row').forEach((row, i) => {
    const badge = row.querySelector('.rank-row-num');
    if (badge) badge.textContent = i + 1;
    row.dataset.index = i;
  });
  rankRowCount = document.querySelectorAll('#rankRowsContainer .rank-row').length;
}

function refreshRemoveButtons() {
  document.querySelectorAll('#rankRowsContainer .rank-row').forEach((row, i) => {
    const btn = row.querySelector('.rank-remove-btn');
    if (btn) btn.style.visibility = i === 0 ? 'hidden' : 'visible';
  });
}

function updateDistributedTotal() {
  const totalEl  = document.getElementById('rankDistributedTotal');
  const poolInput = document.getElementById('mPrize');
  if (!totalEl) return;
  let sum = 0;
  document.querySelectorAll('.rank-prize-input').forEach(inp => { sum += Number(inp.value) || 0; });
  totalEl.textContent = '₹' + sum.toLocaleString('en-IN');
  const pool = Number(poolInput?.value) || 0;
  if (pool > 0 && sum > pool) {
    totalEl.classList.add('over-budget');
    totalEl.title = 'Warning: exceeds prize pool!';
  } else {
    totalEl.classList.remove('over-budget');
    totalEl.title = '';
  }
}

function getPrizeDistribution() {
  const result = [];
  document.querySelectorAll('#rankRowsContainer .rank-row').forEach((row, i) => {
    const pos    = row.querySelector('.rank-pos-input')?.value.trim() || '';
    const amount = Number(row.querySelector('.rank-prize-input')?.value) || 0;
    if (amount > 0 || pos) result.push({ rank: pos || `Rank ${i + 1}`, amount });
  });
  return result;
}

function resetPrizeDistribution() {
  const container = document.getElementById('rankRowsContainer');
  if (!container) return;
  container.innerHTML = `
    <div class="rank-row" data-index="0">
      <div class="rank-row-num">1</div>
      <div class="rank-row-fields">
        <input type="text" class="dash-input rank-pos-input" placeholder="e.g. Rank 1 / Booyah" maxlength="30">
        <div class="rank-prize-wrap">
          <span class="rank-prize-prefix">₹</span>
          <input type="number" class="dash-input rank-prize-input" placeholder="0" min="0" oninput="updateDistributedTotal()">
        </div>
      </div>
      <button class="rank-remove-btn" onclick="removeRankRow(this)" type="button" style="visibility:hidden">✕</button>
    </div>`;
  rankRowCount = 1;
  updateDistributedTotal();
}

/* ════════════════════════════════════
   CREATE MATCH
   ════════════════════════════════════ */

/* Live rules preview */
function onRulesInput() {
  const val  = document.getElementById('mRules').value.trim();
  const prev = document.getElementById('rules-preview');
  if (val) { prev.textContent = val; prev.style.display = 'block'; }
  else     { prev.style.display = 'none'; }
}

function createMatch() {
  const title = document.getElementById('mTitle').value.trim();
  const type  = document.getElementById('mType').value;
  const cat   = document.getElementById('mCat').value;
  const fee   = document.getElementById('mFee').value;
  const prize = document.getElementById('mPrize').value;
  const kill  = document.getElementById('mKill').value;
  const spots = document.getElementById('mSpots').value;
  const dt    = document.getElementById('mDt').value;
  const rules = document.getElementById('mRules').value.trim();

  if (!title) { showToast('Please enter a Match Title', 'error'); return; }
  if (!fee || !prize || !kill) { showToast('Please fill all prize fields', 'error'); return; }
  if (!dt) { showToast('Please select Date & Time', 'error'); return; }

  const match = {
    id: generateId(),
    title, matchType: type, category: cat,
    entryFee: Number(fee), prizePool: Number(prize),
    perKill: Number(kill), totalSpots: Number(spots) || 48,
    rulesHighlight: rules,
    prizeDistribution: getPrizeDistribution(),
    datetime: dt,
    roomId: '', roomPassword: '',
    createdAt: new Date().toISOString()
  };

  const all = getMatches();
  all.push(match);
  saveMatches(all);

  /* Reset form */
  ['mTitle','mFee','mPrize','mKill','mDt','mRules'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('mSpots').value = '48';
  document.getElementById('mType').value  = 'Solo';
  document.getElementById('mCat').value   = 'Mega Tournament';
  document.getElementById('rules-preview').style.display = 'none';
  resetPrizeDistribution();

  showToast('✅ Match created successfully!');
  updateDashStats();
  renderMatchTable();
}

/* ════════════════════════════════════
   TOURNAMENT TABLE / TABS
   ════════════════════════════════════ */
let currentTab = 'mega';

function switchTab(tab, btnEl) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  renderMatchTable();
}

function renderMatchTable() {
  const all     = getMatches();
  const search  = (document.getElementById('t-search')?.value || '').toLowerCase();
  const status  = document.getElementById('t-status')?.value || 'all';
  const now     = Date.now();

  const countEl = document.getElementById('match-count-label');
  if (countEl) countEl.textContent = all.length + ' match' + (all.length !== 1 ? 'es' : '');

  let filtered = all.filter(m => {
    const isMega = m.category === 'Mega Tournament';
    if (currentTab === 'mega'  && !isMega) return false;
    if (currentTab === 'daily' &&  isMega) return false;
    if (search && !m.title.toLowerCase().includes(search)) return false;
    if (status !== 'all') {
      const s = new Date(m.datetime).getTime();
      const st = now > s + 20 * 60 * 1000 ? 'done' : now >= s ? 'live' : 'upcoming';
      if (st !== status) return false;
    }
    return true;
  }).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  const icons = ['🎮','⚔️','🏆','🎯','🔥','💥','🏅','🎖'];
  const tbody = document.getElementById('t-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--t2)">
      ${all.length === 0 ? 'No matches yet. Create one above.' : 'No matches found.'}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((m, i) => {
    const s   = new Date(m.datetime).getTime();
    const st  = now > s + 20 * 60 * 1000 ? 'done' : now >= s ? 'live' : 'upcoming';
    const stB = {
      done:     '<span class="badge badge-done">Completed</span>',
      live:     '<span class="badge badge-live">Live</span>',
      upcoming: now > s - 30*60*1000 ? '<span class="badge badge-starting">Starting</span>' : '<span class="badge badge-upcoming">Upcoming</span>'
    }[st];
    const tB = {
      Solo:  '<span class="badge badge-solo">Solo</span>',
      Duo:   '<span class="badge badge-duo">Duo</span>',
      Squad: '<span class="badge badge-squad">Squad</span>'
    }[m.matchType] || '';
    const total = m.totalSpots || 48;
    const pct   = 0; /* Real slot tracking via Firestore later */

    return `<tr>
      <td><div class="match-info">
        <div class="match-thumb">${icons[i % icons.length]}</div>
        <div>
          <div class="match-title">${escHtml(m.title)}</div>
          <div class="match-id">ID: #${m.id.split('_')[1]?.slice(-6) || '000000'}</div>
        </div>
      </div></td>
      <td>${tB}</td>
      <td>₹${formatNum(m.entryFee)}</td>
      <td class="prize-cell">₹${formatNum(m.prizePool)}</td>
      <td><div class="slots-progress">
        <div class="slots-label">0/${total} joined</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div></td>
      <td style="font-size:12px;color:var(--t1);white-space:nowrap">${formatDate(m.datetime)}</td>
      <td>${stB}</td>
      <td><div class="tbl-actions">
        <button class="tbl-btn" title="Edit" onclick="editMatch('${m.id}')">✏️</button>
        <button class="tbl-btn" title="Duplicate" onclick="dupMatch('${m.id}')">⧉</button>
        <button class="tbl-btn del" title="Delete" onclick="deleteMatch('${m.id}')">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

function editMatch(id)    { showToast('Edit: Set room ID/password in room section'); }
function dupMatch(id) {
  const all = getMatches(), m = all.find(x => x.id === id);
  if (!m) return;
  all.push({ ...m, id: generateId(), createdAt: new Date().toISOString(), roomId: '', roomPassword: '' });
  saveMatches(all);
  showToast('Match duplicated!');
  renderMatchTable(); updateDashStats();
}
function deleteMatch(id) {
  saveMatches(getMatches().filter(x => x.id !== id));
  showToast('Match deleted', 'warn');
  renderMatchTable(); updateDashStats();
}

/* ════════════════════════════════════
   CHART.JS — SPARKLINES & MAIN CHARTS
   ════════════════════════════════════ */

/* Shared tooltip config */
const tooltipCfg = {
  backgroundColor: '#1A1C20',
  titleColor: '#FFFFFF',
  bodyColor: '#8B949E',
  borderColor: '#252D38',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 8
};

/* Shared grid config */
const gridCfg = { color: 'rgba(37,45,56,0.6)' };

/* Draw a small sparkline chart */
function drawSparkline(canvasId, data, color) {
  destroyChart(canvasId);
  const el = document.getElementById(canvasId);
  if (!el) return;
  charts[canvasId] = new Chart(el, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: color.replace(')', ', 0.1)').replace('rgb', 'rgba'),
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } }
    }
  });
}

/* ── INIT ALL CHARTS on Dashboard ── */
function initAllCharts() {
  const r = n => Array.from({ length: 14 }, () => Math.floor(Math.random() * n + n * 0.5));
  drawSparkline('spark-rev',   r(50000), '#00F5A0');
  drawSparkline('spark-users', r(300),   '#00D9FF');
  drawSparkline('spark-mega',  r(10),    '#7C4DFF');
  drawSparkline('spark-txn',   r(500),   '#FF9F43');
  initFinancialChart();
}

/* ── FINANCIAL OVERVIEW CHART ── */
function initFinancialChart() {
  destroyChart('chart-fin');
  const el = document.getElementById('chart-fin');
  if (!el) return;
  const labels = ['19 May','20 May','21 May','22 May','23 May','24 May','25 May'];
  const rev    = [28000, 35000, 42000, 38000, 55000, 48000, 75000];
  charts['chart-fin'] = new Chart(el, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: rev,
        borderColor: '#00F5A0',
        backgroundColor: 'rgba(0,245,160,0.1)',
        fill: true, tension: 0.4,
        pointBackgroundColor: '#00F5A0',
        pointRadius: 4, pointHoverRadius: 6,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltipCfg },
      scales: {
        x: { grid: gridCfg, ticks: { color: '#8B949E', font: { size: 10 } } },
        y: { grid: gridCfg, ticks: { color: '#8B949E', font: { size: 10 }, callback: v => '₹' + Math.round(v/1000) + 'K' } }
      }
    }
  });
}

/* ── ANALYTICS PAGE CHARTS ── */
function initAnalyticsCharts() {
  const lgnd = { display: true, labels: { color: '#8B949E', font: { size: 11 }, boxWidth: 11, padding: 14 } };

  /* User Growth — Line */
  destroyChart('chart-users');
  const elU = document.getElementById('chart-users');
  if (elU) {
    charts['chart-users'] = new Chart(elU, {
      type: 'line',
      data: {
        labels: MOCK_DATA.labels7d,
        datasets: [{
          label: 'Active Users', data: MOCK_DATA.users7d,
          borderColor: '#00D9FF', backgroundColor: 'rgba(0,217,255,0.08)',
          fill: true, tension: 0.4, pointBackgroundColor: '#00D9FF', pointRadius: 3, borderWidth: 2
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: lgnd, tooltip: tooltipCfg }, scales: { x: { grid: gridCfg, ticks: { color: '#8B949E' } }, y: { grid: gridCfg, ticks: { color: '#8B949E' } } } }
    });
  }

  /* Revenue Growth — Line */
  destroyChart('chart-revenue');
  const elR = document.getElementById('chart-revenue');
  if (elR) {
    charts['chart-revenue'] = new Chart(elR, {
      type: 'line',
      data: {
        labels: MOCK_DATA.labels7d,
        datasets: [{
          label: 'Revenue', data: MOCK_DATA.revenue7d,
          borderColor: '#00F5A0', backgroundColor: 'rgba(0,245,160,0.08)',
          fill: true, tension: 0.4, pointBackgroundColor: '#00F5A0', pointRadius: 3, borderWidth: 2
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: lgnd, tooltip: tooltipCfg }, scales: { x: { grid: gridCfg, ticks: { color: '#8B949E' } }, y: { grid: gridCfg, ticks: { color: '#8B949E', callback: v => '₹' + Math.round(v/1000) + 'K' } } } }
    });
  }

  /* Tournaments Bar (Mega=Purple, Daily=Orange) */
  destroyChart('chart-tournaments');
  const elT = document.getElementById('chart-tournaments');
  if (elT) {
    charts['chart-tournaments'] = new Chart(elT, {
      type: 'bar',
      data: {
        labels: MOCK_DATA.labels7d,
        datasets: [
          { label: 'Mega',  data: MOCK_DATA.mega7d,  backgroundColor: 'rgba(124,77,255,0.75)', borderRadius: 4 },
          { label: 'Daily', data: MOCK_DATA.daily7d, backgroundColor: 'rgba(255,159,67,0.75)', borderRadius: 4 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: lgnd, tooltip: tooltipCfg }, scales: { x: { grid: gridCfg, ticks: { color: '#8B949E' } }, y: { grid: gridCfg, ticks: { color: '#8B949E' } } } }
    });
  }

  /* Completion Doughnut */
  destroyChart('chart-completion');
  const elC = document.getElementById('chart-completion');
  if (elC) {
    charts['chart-completion'] = new Chart(elC, {
      type: 'doughnut',
      data: {
        labels: ['Completed','Live','Upcoming','Cancelled'],
        datasets: [{ data: [847,12,38,4], backgroundColor: ['#00F5A0','#00D9FF','#7C4DFF','#FF4C4C'], borderWidth: 0, hoverOffset: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: true, position: 'bottom', labels: { color: '#8B949E', font: { size: 11 }, boxWidth: 11, padding: 12 } }, tooltip: tooltipCfg } }
    });
  }
}

/* ── WALLET PAGE CHART ── */
function initWalletChart() {
  destroyChart('chart-wallet');
  const el = document.getElementById('chart-wallet');
  if (!el) return;
  const lgnd = { display: true, labels: { color: '#8B949E', font: { size: 11 }, boxWidth: 11, padding: 14 } };
  charts['chart-wallet'] = new Chart(el, {
    type: 'bar',
    data: {
      labels: MOCK_DATA.finLabels,
      datasets: [
        { label: 'Collected', data: [84200,92800,78400,68600], backgroundColor: 'rgba(0,245,160,0.65)', borderRadius: 4 },
        { label: 'Paid Out',  data: [73500,81400,68200,59300], backgroundColor: 'rgba(255,76,76,0.55)',  borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: lgnd, tooltip: tooltipCfg }, scales: { x: { grid: gridCfg, ticks: { color: '#8B949E' } }, y: { grid: gridCfg, ticks: { color: '#8B949E', callback: v => '₹'+Math.round(v/1000)+'K' } } } }
  });
}

/* ════════════════════════════════════
   MISC UTILITIES
   ════════════════════════════════════ */
function updateGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const el = document.getElementById('dash-greeting');
  if (el) el.textContent = `${g}! Here's what's happening on Playta today.`;
}

function clearAllMatches() {
  if (confirm('Delete ALL matches from localStorage? This cannot be undone.')) {
    localStorage.removeItem(SK);
    showToast('All matches cleared', 'warn');
    updateDashStats();
    renderMatchTable();
  }
}

/* ── TOAST NOTIFICATIONS ── */
function showToast(message, type = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

/* ── START ── */
document.addEventListener('DOMContentLoaded', initApp);
