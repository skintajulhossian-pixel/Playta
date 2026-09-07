/* ══════════════════════════════════════════
   PLAYTA ADMIN PANEL — admin.js
   Full admin logic: auth, stats, charts,
   CRUD for users/matches, transactions, units
══════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─────────────────────────────────────────
     CONSTANTS
  ───────────────────────────────────────── */
  var ADMIN_USER  = 'admin';
  var ADMIN_PASS  = 'playta@2024';
  var SESSION_KEY = 'playta_admin_sess';
  var USERS_KEY   = 'playta_users';
  var MATCHES_KEY = 'upcoming_matches';
  var TX_KEY      = 'playta_transactions';
  var SETTINGS_KEY= 'playta_admin_settings';

  var charts = {};
  var allUsers    = [];
  var allMatches  = [];
  var allTx       = [];

  /* ─────────────────────────────────────────
     UTILITIES
  ───────────────────────────────────────── */
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; }
  }

  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  }

  function formatDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  }

  function formatDateTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) +
           ' ' + d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  }

  function timeAgo(ts) {
    if (!ts) return '—';
    var diff = Date.now() - ts;
    var m = Math.floor(diff / 60000);
    if (m < 1)  return 'Just now';
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  function avatarLetter(name) {
    return (name || 'U').charAt(0).toUpperCase();
  }

  function showToast(msg, type) {
    var t = document.getElementById('adminToast');
    t.textContent = msg;
    t.className = 'admin-toast toast-' + (type || 'success');
    t.classList.remove('hidden');
    setTimeout(function() { t.classList.add('hidden'); }, 3000);
  }

  function generateMatchId() {
    return '#' + (270000 + Math.floor(Math.random() * 9999));
  }

  function today() { return new Date().toDateString(); }

  /* ─────────────────────────────────────────
     SEED DEMO DATA (if localStorage is empty)
  ───────────────────────────────────────── */
  function seedDemoData() {
    var users = lsGet(USERS_KEY) || [];
    if (users.length === 0) {
      var now = Date.now();
      var names = ['Arjun Singh','Rahul Verma','Priya Sharma','Dev Kumar','Ananya Roy',
                   'Rohit Mehta','Sneha Patel','Vijay Rao','Kavita Nair','Amit Joshi'];
      users = names.map(function(n, i) {
        var username = n.split(' ')[0].toLowerCase() + (1000 + i);
        return {
          name:      n,
          username:  username,
          email:     username + '@gmail.com',
          mobile:    '98765' + String(10000 + i * 1337).slice(-5),
          loggedIn:  true,
          loginTime: now - i * 3600000 * (i + 1),
          joinTime:  now - i * 86400000 * (i * 2 + 1),
          status:    i === 4 ? 'banned' : 'active',
          units:     Math.floor(Math.random() * 2000)
        };
      });
      lsSet(USERS_KEY, users);
    }

    var matches = lsGet(MATCHES_KEY) || [];
    if (matches.length === 0) {
      var types = ['Solo','Duo','Squad','Solo','Squad'];
      var now2 = Date.now();
      matches = types.map(function(t, i) {
        return {
          id:         generateMatchId(),
          matchType:  t,
          title:      'Free Fire Max - Match ' + generateMatchId(),
          entryFee:   [0, 10, 15, 20, 0][i],
          prizePool:  [5000, 8000, 12000, 3000, 6000][i],
          perKill:    [5, 8, 10, 4, 6][i],
          totalSlots: t === 'Solo' ? 48 : t === 'Duo' ? 24 : 12,
          joinedSlots:Math.floor(Math.random() * (t === 'Solo' ? 48 : t === 'Duo' ? 24 : 12)),
          date:       now2 + i * 3600000,
          status:     i === 0 ? 'live' : i === 4 ? 'full' : 'upcoming',
          map:        ['Bermuda','Kalahari','Purgatory','Bermuda','Alpine'][i],
          rules:      'Ryden BAN | Screen Recording Mandatory',
          roomId:     i === 0 ? 'FFM' + (1000 + i) : '',
          roomPass:   i === 0 ? 'playta' + i : ''
        };
      });
      lsSet(MATCHES_KEY, matches);
    }

    var tx = lsGet(TX_KEY) || [];
    if (tx.length === 0) {
      var txUsers = (lsGet(USERS_KEY) || []).slice(0, 5);
      var types2 = ['add','withdraw','buy','entry','winning','add','buy','entry'];
      var amounts = [500, 200, 300, 15, 800, 1000, 150, 20];
      tx = types2.map(function(type, i) {
        var u = txUsers[i % txUsers.length] || { name: 'User', username: 'user' };
        return {
          id:       'TX' + (1000 + i),
          user:     u.name,
          username: u.username,
          type:     type,
          amount:   amounts[i],
          units:    type === 'buy' || type === 'entry' ? amounts[i] : 0,
          date:     Date.now() - i * 3600000 * 5,
          status:   'completed'
        };
      });
      lsSet(TX_KEY, tx);
    }
  }

  /* ─────────────────────────────────────────
     AUTH
  ───────────────────────────────────────── */
  function checkAdminSession() {
    var sess = lsGet(SESSION_KEY);
    if (sess && sess.loggedIn) {
      showAdminApp();
    }
  }

  function showAdminApp() {
    document.getElementById('adminLoginOverlay').classList.add('hidden');
    document.getElementById('adminApp').classList.remove('hidden');
    initAdminApp();
  }

  function initAdminLogin() {
    var form = document.getElementById('adminLoginForm');
    if (!form) return;

    /* Eye toggle */
    var eyeBtn  = document.getElementById('adminEyeBtn');
    var eyeIco  = document.getElementById('adminEyeIco');
    var passInp = document.getElementById('adminPass');
    var eyeOpen   = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    var eyeClosed = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
    var eyeVisible = false;

    if (eyeBtn) {
      eyeBtn.addEventListener('click', function() {
        eyeVisible = !eyeVisible;
        passInp.type = eyeVisible ? 'text' : 'password';
        eyeIco.innerHTML = eyeVisible ? eyeClosed : eyeOpen;
      });
    }

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var user = document.getElementById('adminUser').value.trim();
      var pass = document.getElementById('adminPass').value;
      var err  = document.getElementById('loginError');
      var settings = lsGet(SETTINGS_KEY) || {};
      var adminPass = settings.adminPass || ADMIN_PASS;

      if (user === ADMIN_USER && pass === adminPass) {
        lsSet(SESSION_KEY, { loggedIn: true, time: Date.now() });
        err.classList.add('hidden');
        showAdminApp();
      } else {
        err.textContent = 'Invalid username or password. Please try again.';
        err.classList.remove('hidden');
      }
    });
  }

  /* ─────────────────────────────────────────
     INIT APP
  ───────────────────────────────────────── */
  function initAdminApp() {
    seedDemoData();
    loadData();
    initNav();
    initSidebar();
    updateHeaderDate();
    updateNavCounts();
    showSection('dashboard');

    document.getElementById('adminLogoutBtn').addEventListener('click', adminLogout);
  }

  function loadData() {
    allUsers   = lsGet(USERS_KEY)   || [];
    allMatches = lsGet(MATCHES_KEY) || [];
    allTx      = lsGet(TX_KEY)      || [];
  }

  function adminLogout() {
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  }

  function updateHeaderDate() {
    var el = document.getElementById('ahDate');
    if (el) {
      var d = new Date();
      el.textContent = d.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    }
  }

  function updateNavCounts() {
    var uc = document.getElementById('navUserCount');
    var mc = document.getElementById('navMatchCount');
    if (uc) uc.textContent = allUsers.length;
    if (mc) mc.textContent = allMatches.length;
  }

  /* ─────────────────────────────────────────
     SIDEBAR TOGGLE
  ───────────────────────────────────────── */
  function initSidebar() {
    var btn = document.getElementById('sidebarToggle');
    var sb  = document.getElementById('sidebar');
    if (btn && sb) {
      btn.addEventListener('click', function() {
        sb.style.width = sb.style.width === '60px' ? '' : '60px';
      });
    }
  }

  /* ─────────────────────────────────────────
     NAVIGATION
  ───────────────────────────────────────── */
  function initNav() {
    document.querySelectorAll('.nav-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var section = this.getAttribute('data-section');
        showSection(section);
      });
    });

    /* Dashboard "view all" links */
    document.querySelectorAll('.tc-link[data-section]').forEach(function(link) {
      link.addEventListener('click', function() {
        showSection(this.getAttribute('data-section'));
      });
    });
  }

  function showSection(name) {
    /* Update nav active */
    document.querySelectorAll('.nav-item').forEach(function(i) {
      i.classList.toggle('active', i.getAttribute('data-section') === name);
    });

    /* Show/hide sections */
    document.querySelectorAll('.cs').forEach(function(s) {
      s.classList.remove('active');
    });
    var target = document.getElementById('section-' + name);
    if (target) target.classList.add('active');

    /* Update page title */
    var titles = {
      dashboard:    ['Dashboard',    'Overview of your platform'],
      users:        ['Users',        'Manage all registered users'],
      matches:      ['Matches',      'Manage tournaments and matches'],
      transactions: ['Transactions', 'Financial activity log'],
      units:        ['Units',        'Platform currency management'],
      analytics:    ['Analytics',    'Deep platform insights'],
      settings:     ['Settings',     'Platform configuration']
    };

    var info = titles[name] || [name, ''];
    var pt = document.getElementById('pageTitle');
    var ps = document.getElementById('pageSub');
    if (pt) pt.textContent = info[0];
    if (ps) ps.textContent = info[1];

    /* Load section data */
    if (name === 'dashboard')    { renderDashboard(); }
    if (name === 'users')        { renderUsersTable(allUsers); initUserSearch(); }
    if (name === 'matches')      { renderMatchesTable(allMatches); initMatchSearch(); initCreateMatch(); }
    if (name === 'transactions') { renderTransactions(allTx); initTxFilter(); }
    if (name === 'units')        { renderUnits(); }
    if (name === 'analytics')    { renderAnalytics(); }
    if (name === 'settings')     { initSettings(); }
  }

  /* ─────────────────────────────────────────
     DASHBOARD
  ───────────────────────────────────────── */
  function renderDashboard() {
    loadData();
    calcStats();
    renderRecentUsers();
    renderActiveMatches();
    renderCharts();
  }

  function calcStats() {
    var now  = Date.now();
    var day  = 86400000;
    var week = day * 7;

    /* Total users */
    setEl('statTotalUsers', allUsers.length);

    /* Active today */
    var activeToday = allUsers.filter(function(u) {
      return u.loginTime && (now - u.loginTime) < day;
    }).length;
    setEl('statActiveToday', activeToday);

    /* New this week */
    var newWeek = allUsers.filter(function(u) {
      return u.joinTime && (now - u.joinTime) < week;
    }).length;
    setEl('statNewWeek', newWeek);

    /* Returning users */
    var returning = allUsers.filter(function(u) {
      return u.loginTime && u.joinTime && (u.loginTime - u.joinTime) > day;
    }).length;
    setEl('statReturning', returning);

    /* Matches */
    var live = allMatches.filter(function(m) { return m.status === 'live'; }).length;
    setEl('statMatches', allMatches.length);
    setEl('statLiveMatches', live + ' live now');

    /* Revenue: entry fees collected */
    var revenue = allTx.filter(function(t) { return t.type === 'entry'; })
                       .reduce(function(s, t) { return s + (t.amount || 0); }, 0);
    setEl('statRevenue', '₹' + revenue.toLocaleString('en-IN'));

    /* Units sold */
    var unitsSold = allTx.filter(function(t) { return t.type === 'buy'; })
                         .reduce(function(s, t) { return s + (t.units || 0); }, 0);
    setEl('statUnitsSold', unitsSold.toLocaleString('en-IN'));

    /* Withdrawals */
    var withdrawn = allTx.filter(function(t) { return t.type === 'withdraw'; })
                         .reduce(function(s, t) { return s + (t.amount || 0); }, 0);
    setEl('statWithdrawals', '₹' + withdrawn.toLocaleString('en-IN'));

    /* Users change label */
    setEl('statUsersChange', '+' + newWeek + ' this week');

    /* Transaction stats */
    var added = allTx.filter(function(t) { return t.type === 'add'; })
                     .reduce(function(s, t) { return s + (t.amount || 0); }, 0);
    setEl('txTotalAdded',     '₹' + added.toLocaleString('en-IN'));
    setEl('txTotalWithdrawn', '₹' + withdrawn.toLocaleString('en-IN'));
    setEl('txUnitsBought',    unitsSold.toLocaleString('en-IN'));
    setEl('txNetRevenue',     '₹' + (added - withdrawn).toLocaleString('en-IN'));
  }

  function setEl(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function renderRecentUsers() {
    var tbody = document.getElementById('recentUsersBody');
    if (!tbody) return;
    var recent = allUsers.slice(-5).reverse();
    tbody.innerHTML = recent.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:var(--t1);padding:20px">No users yet</td></tr>' :
      recent.map(function(u) {
        return '<tr>' +
          '<td><div class="t-user-cell">' +
            '<div class="t-avatar">' + avatarLetter(u.name) + '</div>' +
            '<div><p class="t-user-name">' + esc(u.name || u.username) + '</p></div>' +
          '</div></td>' +
          '<td style="color:var(--t1)">' + esc(u.email || '—') + '</td>' +
          '<td style="color:var(--t1)">' + formatDate(u.joinTime) + '</td>' +
          '<td><span class="badge badge-' + (u.status || 'active') + '">' + (u.status || 'active') + '</span></td>' +
        '</tr>';
      }).join('');
  }

  function renderActiveMatches() {
    var tbody = document.getElementById('activeMatchesBody');
    if (!tbody) return;
    var active = allMatches.filter(function(m) { return m.status !== 'full'; }).slice(0, 4);
    tbody.innerHTML = active.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:var(--t1);padding:20px">No active matches</td></tr>' :
      active.map(function(m) {
        var type = m.matchType || 'Solo';
        return '<tr>' +
          '<td style="font-size:12px;color:var(--t1)">' + esc(m.id) + '</td>' +
          '<td><span class="badge badge-' + type.toLowerCase() + '">' + type + '</span></td>' +
          '<td style="color:var(--t1)">' + (m.joinedSlots || 0) + '/' + (m.totalSlots || 48) + '</td>' +
          '<td><span class="badge badge-' + (m.status || 'upcoming') + '">' + (m.status || 'upcoming') + '</span></td>' +
        '</tr>';
      }).join('');
  }

  /* ─────────────────────────────────────────
     CHARTS
  ───────────────────────────────────────── */
  var chartDefaults = {
    green:  '#11FF66',
    cyan:   '#00E5FF',
    purple: '#7C4DFF',
    orange: '#FF9F43',
    red:    '#FF4C4C',
    gridColor: 'rgba(37,45,56,0.6)',
    textColor: '#8B949E'
  };

  function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function getWeekLabels() {
    var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var today = new Date().getDay();
    var result = [];
    for (var i = 6; i >= 0; i--) {
      result.push(days[(today - i + 7) % 7]);
    }
    return result;
  }

  function randomData(min, max, count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push(Math.floor(Math.random() * (max - min) + min));
    }
    return out;
  }

  function renderCharts() {
    renderUserGrowthChart();
    renderMatchTypeChart();
    renderRevenueChart();
    renderDAUChart();
  }

  function renderUserGrowthChart() {
    destroyChart('userGrowthChart');
    var ctx = document.getElementById('userGrowthChart');
    if (!ctx) return;

    var base = allUsers.length;
    var data = randomData(Math.max(1, base - 8), base + 3, 7);
    data[6] = base;

    charts['userGrowthChart'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: getWeekLabels(),
        datasets: [{
          label: 'New Users',
          data: data,
          borderColor: chartDefaults.green,
          backgroundColor: 'rgba(17,255,102,0.08)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: chartDefaults.green,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2
        }, {
          label: 'Active Users',
          data: randomData(Math.max(1, base - 4), base + 1, 7),
          borderColor: chartDefaults.cyan,
          backgroundColor: 'rgba(0,229,255,0.05)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: chartDefaults.cyan,
          pointRadius: 4,
          borderWidth: 2
        }]
      },
      options: chartOptions()
    });
  }

  function renderMatchTypeChart() {
    destroyChart('matchTypeChart');
    var ctx = document.getElementById('matchTypeChart');
    if (!ctx) return;

    var solo  = allMatches.filter(function(m) { return m.matchType === 'Solo'; }).length   || 2;
    var duo   = allMatches.filter(function(m) { return m.matchType === 'Duo'; }).length    || 1;
    var squad = allMatches.filter(function(m) { return m.matchType === 'Squad'; }).length  || 2;

    charts['matchTypeChart'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Solo', 'Duo', 'Squad'],
        datasets: [{
          data: [solo, duo, squad],
          backgroundColor: [chartDefaults.cyan, chartDefaults.purple, chartDefaults.orange],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: chartDefaults.textColor,
              padding: 14,
              font: { size: 12 }
            }
          }
        },
        cutout: '65%'
      }
    });
  }

  function renderRevenueChart() {
    destroyChart('revenueChart');
    var ctx = document.getElementById('revenueChart');
    if (!ctx) return;

    charts['revenueChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: getWeekLabels(),
        datasets: [{
          label: 'Revenue (₹)',
          data: randomData(200, 2000, 7),
          backgroundColor: 'rgba(17,255,102,0.15)',
          borderColor: chartDefaults.green,
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: chartOptions()
    });
  }

  function renderDAUChart() {
    destroyChart('dauChart');
    var ctx = document.getElementById('dauChart');
    if (!ctx) return;

    charts['dauChart'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: getWeekLabels(),
        datasets: [{
          label: 'DAU',
          data: randomData(1, allUsers.length + 3, 7),
          borderColor: chartDefaults.purple,
          backgroundColor: 'rgba(124,77,255,0.08)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: chartDefaults.purple,
          pointRadius: 3,
          borderWidth: 2
        }]
      },
      options: chartOptions()
    });
  }

  function renderAnalytics() {
    renderRetentionChart();
    renderPlatformChart();
    renderEntryRevenueChart();
    renderHourlyChart();
  }

  function renderRetentionChart() {
    destroyChart('retentionChart');
    var ctx = document.getElementById('retentionChart');
    if (!ctx) return;
    charts['retentionChart'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Day 1','Day 3','Day 7','Day 14','Day 30'],
        datasets: [{
          label: 'Retention %',
          data: [100, 72, 55, 40, 28],
          borderColor: chartDefaults.orange,
          backgroundColor: 'rgba(255,159,67,0.1)',
          fill: true, tension: 0.4,
          pointBackgroundColor: chartDefaults.orange,
          pointRadius: 5, borderWidth: 2
        }]
      },
      options: chartOptions()
    });
  }

  function renderPlatformChart() {
    destroyChart('platformChart');
    var ctx = document.getElementById('platformChart');
    if (!ctx) return;
    charts['platformChart'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Android', 'iOS', 'Desktop'],
        datasets: [{
          data: [72, 20, 8],
          backgroundColor: [chartDefaults.green, chartDefaults.cyan, chartDefaults.purple],
          borderWidth: 0, hoverOffset: 4
        }]
      },
      options: {
        plugins: { legend: { position: 'bottom', labels: { color: chartDefaults.textColor, padding: 14, font: { size: 12 } } } },
        cutout: '65%'
      }
    });
  }

  function renderEntryRevenueChart() {
    destroyChart('entryRevenueChart');
    var ctx = document.getElementById('entryRevenueChart');
    if (!ctx) return;
    charts['entryRevenueChart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: getWeekLabels(),
        datasets: [{
          label: 'Entry Revenue',
          data: randomData(100, 1500, 7),
          backgroundColor: 'rgba(0,229,255,0.15)',
          borderColor: chartDefaults.cyan,
          borderWidth: 1.5, borderRadius: 6
        }]
      },
      options: chartOptions()
    });
  }

  function renderHourlyChart() {
    destroyChart('hourlyChart');
    var ctx = document.getElementById('hourlyChart');
    if (!ctx) return;
    var labels = ['00','03','06','09','12','15','18','21','24'];
    charts['hourlyChart'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Active Users',
          data: [2,1,1,3,8,12,15,18,10],
          borderColor: chartDefaults.red,
          backgroundColor: 'rgba(255,76,76,0.08)',
          fill: true, tension: 0.4,
          pointBackgroundColor: chartDefaults.red,
          pointRadius: 3, borderWidth: 2
        }]
      },
      options: chartOptions()
    });
  }

  function chartOptions() {
    return {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: chartDefaults.textColor, font: { size: 12 }, boxWidth: 12, padding: 14 }
        }
      },
      scales: {
        x: {
          grid:  { color: chartDefaults.gridColor, drawBorder: false },
          ticks: { color: chartDefaults.textColor, font: { size: 11 } }
        },
        y: {
          grid:  { color: chartDefaults.gridColor, drawBorder: false },
          ticks: { color: chartDefaults.textColor, font: { size: 11 } },
          beginAtZero: true
        }
      }
    };
  }

  /* ─────────────────────────────────────────
     USERS TABLE
  ───────────────────────────────────────── */
  function renderUsersTable(users) {
    var tbody = document.getElementById('usersTableBody');
    var empty = document.getElementById('usersEmpty');
    if (!tbody) return;

    if (users.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');
    tbody.innerHTML = users.map(function(u, i) {
      var status = u.status || 'active';
      return '<tr>' +
        '<td style="color:var(--t1)">' + (i + 1) + '</td>' +
        '<td><div class="t-user-cell">' +
          '<div class="t-avatar">' + avatarLetter(u.name) + '</div>' +
          '<div><p class="t-user-name">' + esc(u.name || '—') + '</p><p class="t-user-email">' + esc(u.email || '—') + '</p></div>' +
        '</div></td>' +
        '<td style="color:var(--t1)">@' + esc(u.username || '—') + '</td>' +
        '<td style="color:var(--t1)">' + esc(u.email || '—') + '</td>' +
        '<td style="color:var(--t1)">' + esc(u.mobile || '—') + '</td>' +
        '<td style="color:var(--t1);font-size:12px">' + formatDate(u.joinTime) + '</td>' +
        '<td style="color:var(--t1);font-size:12px">' + timeAgo(u.loginTime) + '</td>' +
        '<td><span class="badge badge-' + status + '">' + status + '</span></td>' +
        '<td><div class="action-btns">' +
          '<button class="action-btn" title="View" onclick="viewUser(\'' + esc(u.username) + '\')">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
          '</button>' +
          '<button class="action-btn" title="' + (status === 'banned' ? 'Unban' : 'Ban') + '" onclick="toggleBanUser(\'' + esc(u.username) + '\')">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>' +
          '</button>' +
          '<button class="action-btn danger" title="Delete" onclick="deleteUser(\'' + esc(u.username) + '\')">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>' +
          '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  function initUserSearch() {
    var search = document.getElementById('userSearch');
    var filter = document.getElementById('userStatusFilter');

    function filterUsers() {
      var q = (search ? search.value : '').toLowerCase();
      var s = filter ? filter.value : 'all';
      var filtered = allUsers.filter(function(u) {
        var matchQ = !q ||
          (u.name     && u.name.toLowerCase().includes(q)) ||
          (u.email    && u.email.toLowerCase().includes(q)) ||
          (u.username && u.username.toLowerCase().includes(q)) ||
          (u.mobile   && u.mobile.includes(q));
        var matchS = s === 'all' || (u.status || 'active') === s;
        return matchQ && matchS;
      });
      renderUsersTable(filtered);
    }

    if (search) search.addEventListener('input', filterUsers);
    if (filter) filter.addEventListener('change', filterUsers);
  }

  /* User actions (global scope for onclick) */
  window.viewUser = function(username) {
    var u = allUsers.find(function(x) { return x.username === username; });
    if (u) showToast('User: ' + u.name + ' | Units: ' + (u.units || 0) + ' | Joined: ' + formatDate(u.joinTime), 'success');
  };

  window.toggleBanUser = function(username) {
    var u = allUsers.find(function(x) { return x.username === username; });
    if (!u) return;
    u.status = u.status === 'banned' ? 'active' : 'banned';
    lsSet(USERS_KEY, allUsers);
    renderUsersTable(allUsers);
    showToast('User ' + u.name + ' ' + (u.status === 'banned' ? 'banned' : 'unbanned'), u.status === 'banned' ? 'error' : 'success');
  };

  window.deleteUser = function(username) {
    if (!confirm('Delete user ' + username + '? This cannot be undone.')) return;
    allUsers = allUsers.filter(function(x) { return x.username !== username; });
    lsSet(USERS_KEY, allUsers);
    updateNavCounts();
    renderUsersTable(allUsers);
    showToast('User deleted', 'error');
  };

  /* Export CSV */
  document.addEventListener('click', function(e) {
    if (e.target.closest('#exportUsersBtn')) exportUsersCSV();
  });

  function exportUsersCSV() {
    var rows = [['Name','Username','Email','Mobile','Joined','Status']];
    allUsers.forEach(function(u) {
      rows.push([u.name, u.username, u.email, u.mobile, formatDate(u.joinTime), u.status || 'active']);
    });
    var csv = rows.map(function(r) { return r.join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'playta_users.csv';
    a.click();
    showToast('Users exported as CSV', 'success');
  }

  /* ─────────────────────────────────────────
     MATCHES TABLE
  ───────────────────────────────────────── */
  function renderMatchesTable(matches) {
    var tbody = document.getElementById('matchesTableBody');
    var empty = document.getElementById('matchesEmpty');
    if (!tbody) return;

    if (matches.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');
    tbody.innerHTML = matches.map(function(m, i) {
      var type   = m.matchType || 'Solo';
      var status = m.status    || 'upcoming';
      var slots  = (m.joinedSlots || 0) + '/' + (m.totalSlots || 48);
      var fee    = m.entryFee > 0 ? m.entryFee + ' units' : 'Free';
      return '<tr>' +
        '<td style="color:var(--t1)">' + (i+1) + '</td>' +
        '<td style="font-size:12px;color:var(--green);font-weight:600">' + esc(m.id) + '</td>' +
        '<td><span class="badge badge-' + type.toLowerCase() + '">' + type + '</span> ' +
          '<span class="badge ' + (m.category === 'mega' ? 'badge-squad' : 'badge-solo') + '" style="font-size:10px">' +
          (m.category === 'mega' ? '🏆 Mega' : '🗓️ Daily') + '</span></td>' +
        '<td style="color:var(--green);font-weight:600">🎁 ' + (m.prizePool || 0).toLocaleString('en-IN') + '</td>' +
        '<td style="color:var(--t1)">' + fee + '</td>' +
        '<td style="color:var(--t1);font-size:12px">' + formatDateTime(m.date) + '</td>' +
        '<td style="color:var(--t1)">' + slots + '</td>' +
        '<td><span class="badge badge-' + status + '">' + status + '</span></td>' +
        '<td><div class="action-btns">' +
          '<button class="action-btn" title="Edit" onclick="editMatch(\'' + esc(m.id) + '\')">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>' +
          '</button>' +
          '<button class="action-btn danger" title="Delete" onclick="deleteMatch(\'' + esc(m.id) + '\')">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>' +
          '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  function initMatchSearch() {
    var search = document.getElementById('matchSearch');
    var filter = document.getElementById('matchTypeFilter');

    function filterMatches() {
      var q = (search ? search.value : '').toLowerCase();
      var t = filter ? filter.value : 'all';
      var filtered = allMatches.filter(function(m) {
        var matchQ = !q || (m.id && m.id.toLowerCase().includes(q)) || (m.matchType && m.matchType.toLowerCase().includes(q));
        var matchT = t === 'all' || m.matchType === t;
        return matchQ && matchT;
      });
      renderMatchesTable(filtered);
    }

    if (search) search.addEventListener('input', filterMatches);
    if (filter) filter.addEventListener('change', filterMatches);
  }

  window.editMatch = function(id) {
    showToast('Edit match: ' + id + ' — coming soon', 'success');
  };

  window.deleteMatch = function(id) {
    if (!confirm('Delete match ' + id + '?')) return;
    allMatches = allMatches.filter(function(m) { return m.id !== id; });
    lsSet(MATCHES_KEY, allMatches);
    updateNavCounts();
    renderMatchesTable(allMatches);
    showToast('Match deleted', 'error');
  };

  /* ─────────────────────────────────────────
     CREATE MATCH MODAL
  ───────────────────────────────────────── */
  function initCreateMatch() {
    var openBtn  = document.getElementById('createMatchBtn');
    var modal    = document.getElementById('createMatchModal');
    var closeBtn = document.getElementById('closeMatchModal');
    var cancelBtn= document.getElementById('cancelMatchBtn');
    var saveBtn  = document.getElementById('saveMatchBtn');

    if (!modal) return;

    /* Set today's date */
    var dateInput = document.getElementById('mfDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    /* Category hint — updates live as admin selects */
    var catSelect = document.getElementById('mfCategory');
    var catHint   = document.getElementById('categoryHint');
    var hints = {
      mega:  '🏠 Will appear on the <strong style="color:#11FF66">Home Page</strong> — Live Tournaments section',
      daily: '⚡ Will appear inside the <strong style="color:#00E5FF">Free Fire Max</strong> tournament list'
    };
    if (catSelect && catHint) {
      catSelect.addEventListener('change', function() {
        catHint.innerHTML = hints[this.value] || '';
      });
    }

    function openModal()  { modal.classList.remove('hidden'); }
    function closeModal() { modal.classList.add('hidden'); }

    if (openBtn)   openBtn.addEventListener('click', openModal);
    if (closeBtn)  closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeModal();
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var category= document.getElementById('mfCategory').value;
        var type    = document.getElementById('mfType').value;
        var map     = document.getElementById('mfMap').value;
        var entry   = parseInt(document.getElementById('mfEntry').value) || 0;
        var prize   = parseInt(document.getElementById('mfPrize').value) || 0;
        var dateV   = document.getElementById('mfDate').value;
        var timeV   = document.getElementById('mfTime').value;
        var rules   = document.getElementById('mfRules').value;
        var kill    = parseInt(document.getElementById('mfKillReward').value) || 0;
        var roomId  = document.getElementById('mfRoomId').value;
        var roomPas = document.getElementById('mfRoomPass').value;

        if (!prize) { showToast('Enter a prize pool', 'error'); return; }
        if (!dateV) { showToast('Select a match date', 'error'); return; }

        var slots = type === 'Solo' ? 48 : type === 'Duo' ? 24 : 12;
        var matchDate = new Date(dateV + (timeV ? 'T' + timeV : 'T18:00')).getTime();

        var newMatch = {
          id:          generateMatchId(),
          matchType:   type,
          category:    category,
          title:       'Free Fire Max - Match ' + generateMatchId(),
          entryFee:    entry,
          prizePool:   prize,
          perKill:     kill,
          totalSlots:  slots,
          joinedSlots: 0,
          date:        matchDate,
          status:      'upcoming',
          map:         map,
          rules:       rules || (map + ' Map | Screen Recording Mandatory'),
          roomId:      roomId,
          roomPass:    roomPas
        };

        allMatches.push(newMatch);
        lsSet(MATCHES_KEY, allMatches);
        updateNavCounts();
        renderMatchesTable(allMatches);
        closeModal();
        showToast('Match created: ' + newMatch.id, 'success');
      });
    }
  }

  /* ─────────────────────────────────────────
     TRANSACTIONS
  ───────────────────────────────────────── */
  function renderTransactions(txList) {
    var tbody = document.getElementById('txTableBody');
    var empty = document.getElementById('txEmpty');
    if (!tbody) return;

    if (txList.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');

    var typeLabels = {
      add: 'Money Added', withdraw: 'Withdrawal',
      buy: 'Units Bought', entry: 'Match Entry', winning: 'Winnings'
    };
    var typeBadge = {
      add: 'active', withdraw: 'banned', buy: 'free', entry: 'paid', winning: 'solo'
    };

    tbody.innerHTML = txList.slice().reverse().map(function(tx, i) {
      return '<tr>' +
        '<td style="color:var(--t1)">' + (i+1) + '</td>' +
        '<td><div class="t-user-cell">' +
          '<div class="t-avatar">' + avatarLetter(tx.user) + '</div>' +
          '<div><p class="t-user-name">' + esc(tx.user || '—') + '</p><p class="t-user-email">@' + esc(tx.username || '—') + '</p></div>' +
        '</div></td>' +
        '<td><span class="badge badge-' + (typeBadge[tx.type] || 'active') + '">' + (typeLabels[tx.type] || tx.type) + '</span></td>' +
        '<td style="font-weight:600;color:' + (tx.type === 'withdraw' ? 'var(--red)' : tx.type === 'add' || tx.type === 'winning' ? 'var(--green)' : 'var(--t0)') + '">' +
          (tx.type === 'withdraw' ? '-' : '+') + '₹' + (tx.amount || 0).toLocaleString('en-IN') +
        '</td>' +
        '<td style="color:var(--t1)">' + (tx.units > 0 ? tx.units + ' units' : '—') + '</td>' +
        '<td style="color:var(--t1);font-size:12px">' + formatDateTime(tx.date) + '</td>' +
        '<td><span class="badge badge-active">' + (tx.status || 'completed') + '</span></td>' +
      '</tr>';
    }).join('');

    calcStats();
  }

  function initTxFilter() {
    var filter = document.getElementById('txTypeFilter');
    if (!filter) return;
    filter.addEventListener('change', function() {
      var val = this.value;
      var filtered = val === 'all' ? allTx : allTx.filter(function(t) { return t.type === val; });
      renderTransactions(filtered);
    });
  }

  /* ─────────────────────────────────────────
     UNITS
  ───────────────────────────────────────── */
  function renderUnits() {
    loadData();
    var totalIssued = allUsers.reduce(function(s, u) { return s + (u.units || 0); }, 0);
    setEl('unitTotalIssued',  totalIssued.toLocaleString('en-IN'));
    setEl('unitCirculation',  totalIssued.toLocaleString('en-IN'));
    setEl('unitUsed',         Math.floor(totalIssued * 0.3).toLocaleString('en-IN'));

    renderUnitLedger();
    initUnitSearch();
    initAddUnits();
  }

  function renderUnitLedger() {
    var tbody = document.getElementById('unitLedgerBody');
    if (!tbody) return;
    tbody.innerHTML = allUsers.map(function(u, i) {
      var balance  = u.units || 0;
      var received = balance + Math.floor(Math.random() * 500);
      var spent    = received - balance;
      return '<tr>' +
        '<td style="color:var(--t1)">' + (i+1) + '</td>' +
        '<td><div class="t-user-cell">' +
          '<div class="t-avatar">' + avatarLetter(u.name) + '</div>' +
          '<div><p class="t-user-name">' + esc(u.name) + '</p><p class="t-user-email">@' + esc(u.username) + '</p></div>' +
        '</div></td>' +
        '<td style="color:var(--green);font-weight:600">' + received.toLocaleString('en-IN') + '</td>' +
        '<td style="color:var(--red)">' + spent.toLocaleString('en-IN') + '</td>' +
        '<td style="color:var(--t0);font-weight:700">' + balance.toLocaleString('en-IN') + '</td>' +
        '<td style="color:var(--t1);font-size:12px">' + timeAgo(u.loginTime) + '</td>' +
      '</tr>';
    }).join('');
  }

  function initUnitSearch() {
    var input = document.getElementById('unitUserSearch');
    var result= document.getElementById('unitUserResult');
    if (!input || !result) return;

    input.addEventListener('input', function() {
      var q = this.value.toLowerCase();
      if (q.length < 2) { result.classList.add('hidden'); return; }
      var found = allUsers.find(function(u) {
        return (u.username && u.username.toLowerCase().includes(q)) ||
               (u.email    && u.email.toLowerCase().includes(q));
      });
      if (found) {
        result.textContent = '✓ Found: ' + found.name + ' (@' + found.username + ') — Balance: ' + (found.units || 0) + ' units';
        result.classList.remove('hidden');
        result.setAttribute('data-username', found.username);
      } else {
        result.textContent = 'No user found';
        result.className = 'unit-user-result';
        result.classList.remove('hidden');
        result.style.color = 'var(--red)';
        result.style.borderColor = 'var(--red)';
        result.removeAttribute('data-username');
      }
    });
  }

  function initAddUnits() {
    var btn = document.getElementById('addUnitsBtn');
    if (!btn) return;
    btn.addEventListener('click', function() {
      var result   = document.getElementById('unitUserResult');
      var amount   = parseInt(document.getElementById('unitAmount').value) || 0;
      var reason   = document.getElementById('unitReason').value.trim();
      var username = result ? result.getAttribute('data-username') : null;

      if (!username) { showToast('Please search and select a user first', 'error'); return; }
      if (!amount || amount < 1) { showToast('Enter a valid unit amount', 'error'); return; }

      var u = allUsers.find(function(x) { return x.username === username; });
      if (!u) { showToast('User not found', 'error'); return; }

      u.units = (u.units || 0) + amount;
      lsSet(USERS_KEY, allUsers);

      /* Log transaction */
      allTx.push({
        id: 'TX' + Date.now(), user: u.name, username: u.username,
        type: 'add', amount: amount, units: amount,
        date: Date.now(), status: 'completed', note: reason
      });
      lsSet(TX_KEY, allTx);

      showToast(amount + ' units added to ' + u.name, 'success');
      document.getElementById('unitAmount').value = '';
      document.getElementById('unitReason').value = '';
      document.getElementById('unitUserSearch').value = '';
      if (result) result.classList.add('hidden');
      renderUnitLedger();
    });
  }

  /* ─────────────────────────────────────────
     SETTINGS
  ───────────────────────────────────────── */
  function initSettings() {
    var settings = lsGet(SETTINGS_KEY) || {};

    /* Toggles */
    var mainT = document.getElementById('maintenanceToggle');
    var regT  = document.getElementById('registrationToggle');
    var freeT = document.getElementById('freeMatchToggle');

    if (mainT) mainT.checked = !!settings.maintenance;
    if (regT)  regT.checked  = settings.registrations !== false;
    if (freeT) freeT.checked = settings.freeMatches   !== false;

    [mainT, regT, freeT].forEach(function(t) {
      if (!t) return;
      t.addEventListener('change', function() {
        settings.maintenance   = mainT ? mainT.checked : false;
        settings.registrations = regT  ? regT.checked  : true;
        settings.freeMatches   = freeT ? freeT.checked : true;
        lsSet(SETTINGS_KEY, settings);
        showToast('Setting saved', 'success');
      });
    });

    /* Finance settings */
    var saveFinBtn = document.getElementById('saveFinanceBtn');
    if (saveFinBtn) {
      saveFinBtn.addEventListener('click', function() {
        settings.minWithdraw  = parseInt(document.getElementById('minWithdraw').value) || 100;
        settings.maxWithdraw  = parseInt(document.getElementById('maxWithdraw').value) || 10000;
        settings.platformFee  = parseInt(document.getElementById('platformFee').value) || 10;
        settings.unitRate     = parseFloat(document.getElementById('unitRate').value)  || 1;
        lsSet(SETTINGS_KEY, settings);
        showToast('Financial settings saved', 'success');
      });
    }

    /* Change password */
    var changePassBtn = document.getElementById('changePassBtn');
    if (changePassBtn) {
      changePassBtn.addEventListener('click', function() {
        var curr = document.getElementById('currPass').value;
        var newP = document.getElementById('newPass').value;
        var conf = document.getElementById('confPass').value;
        var msg  = document.getElementById('passMsg');
        var adminPass = settings.adminPass || ADMIN_PASS;

        if (curr !== adminPass) {
          if (msg) { msg.textContent = 'Current password is incorrect'; msg.className = 'setting-msg error'; msg.classList.remove('hidden'); }
          return;
        }
        if (newP.length < 6) {
          if (msg) { msg.textContent = 'New password must be at least 6 characters'; msg.className = 'setting-msg error'; msg.classList.remove('hidden'); }
          return;
        }
        if (newP !== conf) {
          if (msg) { msg.textContent = 'Passwords do not match'; msg.className = 'setting-msg error'; msg.classList.remove('hidden'); }
          return;
        }
        settings.adminPass = newP;
        lsSet(SETTINGS_KEY, settings);
        if (msg) { msg.textContent = 'Password changed successfully'; msg.className = 'setting-msg success'; msg.classList.remove('hidden'); }
        document.getElementById('currPass').value = '';
        document.getElementById('newPass').value  = '';
        document.getElementById('confPass').value = '';
      });
    }

    /* Data management */
    var clearMatchBtn = document.getElementById('clearMatchesBtn');
    if (clearMatchBtn) {
      clearMatchBtn.addEventListener('click', function() {
        if (!confirm('Clear ALL matches? This cannot be undone.')) return;
        lsSet(MATCHES_KEY, []);
        allMatches = [];
        updateNavCounts();
        showToast('All matches cleared', 'error');
      });
    }

    var clearUsersBtn = document.getElementById('clearUsersBtn');
    if (clearUsersBtn) {
      clearUsersBtn.addEventListener('click', function() {
        if (!confirm('Reset ALL users? This cannot be undone.')) return;
        lsSet(USERS_KEY, []);
        allUsers = [];
        updateNavCounts();
        showToast('All users cleared', 'error');
      });
    }

    var exportAllBtn = document.getElementById('exportAllBtn');
    if (exportAllBtn) {
      exportAllBtn.addEventListener('click', function() {
        var data = {
          users:    lsGet(USERS_KEY),
          matches:  lsGet(MATCHES_KEY),
          transactions: lsGet(TX_KEY),
          settings: lsGet(SETTINGS_KEY),
          exportedAt: new Date().toISOString()
        };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'playta_export_' + Date.now() + '.json';
        a.click();
        showToast('Data exported as JSON', 'success');
      });
    }
  }

  /* ─────────────────────────────────────────
     GLOBAL SEARCH
  ───────────────────────────────────────── */
  var globalSearch = document.getElementById('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('input', function() {
      var q = this.value.toLowerCase().trim();
      if (!q) return;
      var userMatch = allUsers.find(function(u) {
        return (u.name && u.name.toLowerCase().includes(q)) ||
               (u.email && u.email.toLowerCase().includes(q));
      });
      if (userMatch) {
        showToast('Found user: ' + userMatch.name, 'success');
        showSection('users');
        setTimeout(function() {
          var input = document.getElementById('userSearch');
          if (input) { input.value = q; input.dispatchEvent(new Event('input')); }
        }, 200);
      }
    });
  }

  /* ─────────────────────────────────────────
     ESCAPE HTML
  ───────────────────────────────────────── */
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─────────────────────────────────────────
     INIT
  ───────────────────────────────────────── */
  initAdminLogin();
  checkAdminSession();

}());
