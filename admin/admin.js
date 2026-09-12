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
  /* ─────────────────────────────────────────
     ADMIN ACCOUNTS + CONSTANTS
  ───────────────────────────────────────── */
  var ACCOUNTS_KEY  = 'playta_admin_accounts';
  var AUDIT_KEY     = 'playta_audit_logs';
  var RATELIMIT_KEY = 'playta_admin_ratelimit';
  var MAX_ATTEMPTS  = 5;
  var LOCKOUT_MS    = 15 * 60 * 1000;
  var SESSION_TTL   = 8  * 60 * 60 * 1000;

  var ROLE_PERMS = {
    super_admin: ['dashboard','users','matches','results','disputes','withdrawals','transactions','content','tickets','kyc','antifraud','admins','units','analytics','settings'],
    admin:       ['dashboard','users','matches','results','disputes','withdrawals','transactions','tickets','kyc','units','analytics'],
    moderator:   ['dashboard','matches','tickets','disputes']
  };

  function getAdminAccounts() {
    var acc = lsGet(ACCOUNTS_KEY);
    if (!acc || acc.length === 0) {
      acc = [
        { email:'superadmin@playta.com', password:'SuperAdmin@2024', name:'Super Admin', role:'super_admin', twoFA:true },
        { email:'admin@playta.com',      password:'playta@2024',     name:'Admin',       role:'admin',       twoFA:true },
        { email:'mod@playta.com',        password:'Mod@2024',        name:'Moderator',   role:'moderator',   twoFA:false }
      ];
      lsSet(ACCOUNTS_KEY, acc);
    }
    return acc;
  }

  /* Rate Limiting */
  function getRateData(email) { var all = lsGet(RATELIMIT_KEY)||{}; return all[email]||{attempts:0,lockedUntil:0}; }
  function setRateData(email,data) { var all=lsGet(RATELIMIT_KEY)||{}; all[email]=data; lsSet(RATELIMIT_KEY,all); }
  function clearRateData(email) { var all=lsGet(RATELIMIT_KEY)||{}; delete all[email]; lsSet(RATELIMIT_KEY,all); }
  function recordFail(email) {
    var d=getRateData(email); d.attempts=(d.attempts||0)+1;
    if(d.attempts>=MAX_ATTEMPTS){d.lockedUntil=Date.now()+LOCKOUT_MS;d.attempts=0;}
    setRateData(email,d); return d;
  }
  function isLocked(email) {
    var d=getRateData(email);
    if(d.lockedUntil&&d.lockedUntil>Date.now()) return {locked:true,remaining:d.lockedUntil-Date.now()};
    return {locked:false,attempts:d.attempts||0};
  }

  /* Audit Log */
  function logAudit(action,email,role,details,success) {
    var logs=lsGet(AUDIT_KEY)||[];
    logs.unshift({id:'LOG'+Date.now(),timestamp:Date.now(),action:action,email:email||'—',role:role||'—',details:details||'',success:success!==false});
    if(logs.length>100) logs=logs.slice(0,100);
    lsSet(AUDIT_KEY,logs);
  }

  /* 2FA OTP */
  var _otp=null, _otpEmail=null, _otpAccount=null;
  function generateOTP(){return String(Math.floor(100000+Math.random()*900000));}
  function sendOTP(account){_otp=generateOTP();_otpEmail=account.email;_otpAccount=account;console.log('[PLAYTA OTP]',_otp);return _otp;}
  function verifyOTP(input){return input===_otp&&_otpEmail!==null;}

  /* Session */
  function createAdminSession(account) {
    var sess={email:account.email,name:account.name,role:account.role,loginTime:Date.now(),expiresAt:Date.now()+SESSION_TTL,sessionId:'SID'+Date.now(),loggedIn:true};
    lsSet(SESSION_KEY,sess); return sess;
  }

  function checkAdminSession() {
    var sess = lsGet(SESSION_KEY);
    if (!sess) return;
    if (sess.expiresAt && Date.now() > sess.expiresAt) { localStorage.removeItem(SESSION_KEY); return; }
    if (sess.loggedIn) showAdminApp();
  }

  function finalizeLogin(account, email) {
    clearRateData(email);
    createAdminSession(account);
    logAudit('LOGIN_SUCCESS', email, account.role, 'Successful login', true);
    showAdminApp();
  }

  /* ── Init Login ── */
  function initAdminLogin() {
    getAdminAccounts();

    /* Eye toggle */
    var eyeBtn=document.getElementById('adminEyeBtn'),eyeIco=document.getElementById('adminEyeIco'),passInp=document.getElementById('adminPass');
    var EYE_O='<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
        EYE_C='<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>',
        eyeVis=false;
    if(eyeBtn){eyeBtn.addEventListener('click',function(){eyeVis=!eyeVis;passInp.type=eyeVis?'text':'password';eyeIco.innerHTML=eyeVis?EYE_C:EYE_O;});}

    /* Lockout countdown */
    var lockInterval=null;
    function startLockCountdown() {
      var banner=document.getElementById('rateLimitBanner'),cd=document.getElementById('lockCountdown'),sub=document.getElementById('loginSubmitBtn');
      if(banner)banner.classList.remove('hidden'); if(sub)sub.disabled=true;
      if(lockInterval)clearInterval(lockInterval);
      lockInterval=setInterval(function(){
        var email=(document.getElementById('adminEmail')||{}).value,li=isLocked(email);
        if(!li.locked){clearInterval(lockInterval);if(banner)banner.classList.add('hidden');if(sub)sub.disabled=false;return;}
        var s=Math.ceil(li.remaining/1000),m=Math.floor(s/60);
        if(cd)cd.textContent=m+':'+String(s%60).padStart(2,'0');
      },1000);
    }

    /* Step 1 form */
    var loginForm=document.getElementById('adminLoginForm');
    if(loginForm){loginForm.addEventListener('submit',function(e){
      e.preventDefault();
      if(document.getElementById('honeypot').value) return; /* bot check */
      var email=(document.getElementById('adminEmail')||{}).value.trim().toLowerCase();
      var pass=(document.getElementById('adminPass')||{}).value;
      var errEl=document.getElementById('loginError'),warnEl=document.getElementById('attemptWarn');
      var li=isLocked(email);
      if(li.locked){startLockCountdown();return;}
      var account=getAdminAccounts().find(function(a){return a.email.toLowerCase()===email&&a.password===pass;});
      if(!account){
        var d=recordFail(email); logAudit('LOGIN_FAIL',email,null,'Wrong credentials',false);
        if(d.lockedUntil){startLockCountdown();if(errEl){errEl.textContent='Account locked 15 min after too many failures.';errEl.classList.remove('hidden');}}
        else{
          if(errEl){errEl.textContent='Invalid email or password.';errEl.classList.remove('hidden');}
          var rem=MAX_ATTEMPTS-(d.attempts||0);
          if(warnEl&&rem<=3){warnEl.textContent='⚠️ '+rem+' attempt(s) remaining before lockout';warnEl.classList.remove('hidden');}
        }
        return;
      }
      if(errEl)errEl.classList.add('hidden'); if(warnEl)warnEl.classList.add('hidden');
      if(account.twoFA){
        var otp=sendOTP(account);
        document.getElementById('loginStep1').classList.remove('active');
        document.getElementById('loginStep2').classList.add('active');
        document.getElementById('dot1').classList.remove('active');
        document.getElementById('dot2').classList.add('active');
        var masked=email.replace(/(.{2})(.*)(@.*)/,function(m,a,b,c){return a+b.replace(/./g,'*')+c;});
        var dispEl=document.getElementById('otpEmailDisplay'); if(dispEl)dispEl.textContent=masked;
        var hint=document.getElementById('otpDemoHint'); if(hint)hint.textContent='⚡ Demo OTP: '+otp;
        var digits=document.querySelectorAll('.otp-digit'); if(digits[0])digits[0].focus();
        startResendTimer();
      } else { finalizeLogin(account,email); }
    });}

    /* OTP digits */
    var digits=document.querySelectorAll('.otp-digit');
    digits.forEach(function(inp,i){
      inp.addEventListener('input',function(){this.value=this.value.replace(/[^0-9]/g,'');if(this.value&&i<digits.length-1)digits[i+1].focus();this.classList.toggle('filled',!!this.value);});
      inp.addEventListener('keydown',function(e){if(e.key==='Backspace'&&!this.value&&i>0)digits[i-1].focus();});
      inp.addEventListener('paste',function(e){e.preventDefault();var p=(e.clipboardData||window.clipboardData).getData('text').replace(/[^0-9]/g,'');p.split('').forEach(function(ch,j){if(digits[j]){digits[j].value=ch;digits[j].classList.add('filled');}});digits[Math.min(p.length,digits.length-1)].focus();});
    });

    /* Verify OTP */
    var vBtn=document.getElementById('verifyOtpBtn');
    if(vBtn){vBtn.addEventListener('click',function(){
      var input=Array.from(digits).map(function(d){return d.value;}).join('');
      var oErr=document.getElementById('otpError');
      if(input.length<6){if(oErr){oErr.textContent='Enter all 6 digits.';oErr.classList.remove('hidden');}return;}
      if(verifyOTP(input)){if(oErr)oErr.classList.add('hidden');finalizeLogin(_otpAccount,_otpEmail);}
      else{if(oErr){oErr.textContent='Invalid OTP. Try again.';oErr.classList.remove('hidden');}digits.forEach(function(d){d.value='';d.classList.remove('filled');});digits[0].focus();}
    });}

    /* Back button */
    var backBtn=document.getElementById('backToLoginBtn');
    if(backBtn){backBtn.addEventListener('click',function(){
      document.getElementById('loginStep2').classList.remove('active');
      document.getElementById('loginStep1').classList.add('active');
      document.getElementById('dot2').classList.remove('active');
      document.getElementById('dot1').classList.add('active');
      _otp=null;_otpEmail=null;_otpAccount=null;
    });}

    /* Resend OTP */
    var resendInt=null;
    function startResendTimer(){
      var rb=document.getElementById('resendOtpBtn'),te=document.getElementById('resendTimer'),s=30;
      if(rb)rb.disabled=true;
      resendInt=setInterval(function(){s--;if(te)te.textContent='('+s+'s)';if(s<=0){clearInterval(resendInt);if(rb)rb.disabled=false;if(te)te.textContent='';}},1000);
    }
    var resendBtn=document.getElementById('resendOtpBtn');
    if(resendBtn){resendBtn.addEventListener('click',function(){
      if(_otpAccount){var no=sendOTP(_otpAccount);var h=document.getElementById('otpDemoHint');if(h)h.textContent='⚡ Demo OTP: '+no;digits.forEach(function(d){d.value='';d.classList.remove('filled');});digits[0].focus();startResendTimer();showToast('OTP resent!','success');}
    });}

    /* Forgot password */
    var fp=document.getElementById('forgotPassBtn'),fo=document.getElementById('forgotOverlay'),fc=document.getElementById('closeForgotBtn'),fs=document.getElementById('forgotSubmitBtn');
    if(fp&&fo)fp.addEventListener('click',function(){fo.classList.remove('hidden');});
    if(fc&&fo)fc.addEventListener('click',function(){fo.classList.add('hidden');});
    if(fo)fo.addEventListener('click',function(e){if(e.target===fo)fo.classList.add('hidden');});
    if(fs){fs.addEventListener('click',function(){
      var email=(document.getElementById('forgotEmail')||{}).value.trim().toLowerCase();
      var res=document.getElementById('forgotResult');
      var found=getAdminAccounts().find(function(a){return a.email.toLowerCase()===email;});
      if(!res)return;
      if(found){res.textContent='✓ Account found! Role: '+found.role.replace('_',' ').toUpperCase()+'. Contact Super Admin to reset password.';res.className='forgot-result success';res.classList.remove('hidden');logAudit('FORGOT_PW',email,found.role,'Recovery requested',true);}
      else{res.textContent='✗ No admin account found with this email.';res.className='forgot-result error';res.classList.remove('hidden');}
    });}
  }

  /* ─────────────────────────────────────────
     SHOW ADMIN APP + ROLE-BASED SIDEBAR
  ───────────────────────────────────────── */
  function showAdminApp() {
    document.getElementById('adminLoginOverlay').classList.add('hidden');
    document.getElementById('adminApp').classList.remove('hidden');

    /* Set role info in sidebar */
    var sess = lsGet(SESSION_KEY);
    if (sess) {
      var av = document.getElementById('sbAvatar');
      var nm = document.getElementById('sbAdminName');
      var rb = document.getElementById('sbRoleBadge');
      if (av) av.textContent = (sess.name || 'A').charAt(0).toUpperCase();
      if (nm) nm.textContent = sess.name || 'Admin';
      var roleColors = { super_admin:'chip-super', admin:'chip-admin', moderator:'chip-mod' };
      var roleLabels = { super_admin:'Super Admin', admin:'Admin', moderator:'Moderator' };
      if (rb) {
        rb.textContent  = roleLabels[sess.role] || sess.role;
        rb.className    = 'sb-role-badge role-chip ' + (roleColors[sess.role] || 'chip-admin');
      }
      /* Hide nav items not in role permissions */
      var perms = ROLE_PERMS[sess.role] || [];
      document.querySelectorAll('.nav-item[data-section]').forEach(function(item) {
        if (!perms.includes(item.getAttribute('data-section'))) item.style.display = 'none';
      });
    }
    initAdminApp();
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

    var results    = lsGet('playta_results')     || [];
    var disputes   = lsGet('playta_disputes')    || [];
    var withdrawals= lsGet('playta_withdrawals') || [];
    var tickets    = lsGet('playta_tickets')     || [];
    var kyc        = lsGet('playta_kyc')         || [];
    var fraud      = lsGet('playta_fraud')       || [];

    var rc  = document.getElementById('navResultCount');
    var dc  = document.getElementById('navDisputeCount');
    var wc  = document.getElementById('navWithdrawCount');
    var tc  = document.getElementById('navTicketCount');
    var kc  = document.getElementById('navKycCount');
    var fc  = document.getElementById('navFraudCount');

    if (rc) rc.textContent = results.filter(function(r){return r.status==='pending';}).length;
    if (dc) dc.textContent = disputes.filter(function(d){return d.status==='pending';}).length;
    if (wc) wc.textContent = withdrawals.filter(function(w){return w.status==='pending';}).length;
    if (tc) tc.textContent = tickets.filter(function(t){return t.status==='open';}).length;
    if (kc) kc.textContent = kyc.filter(function(k){return k.status==='pending';}).length;
    if (fc) fc.textContent = fraud.filter(function(f){return f.status==='flagged';}).length;
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
      dashboard:    ['Dashboard',        'Overview of your platform'],
      users:        ['Users',            'Manage all registered users'],
      matches:      ['Matches',          'Manage tournaments and matches'],
      results:      ['Match Results',    'Verify and settle match results'],
      disputes:     ['Disputes',         'Handle player reports and disputes'],
      withdrawals:  ['Withdrawals',      'Process withdrawal requests'],
      transactions: ['Transactions',     'Financial activity log'],
      content:      ['Content Manager',  'Banners and push notifications'],
      tickets:      ['Support Tickets',  'Handle user complaints and queries'],
      kyc:          ['KYC Verification', 'Review identity documents'],
      antifraud:    ['Anti-Fraud',       'Suspicious activity detection'],
      admins:       ['Admin Management', 'Manage admin accounts and roles'],
      units:        ['Units',            'Platform currency management'],
      analytics:    ['Analytics',        'Deep platform insights'],
      settings:     ['Settings',         'Platform configuration']
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
    if (name === 'results')      { renderResults(); initResultsSection(); }
    if (name === 'disputes')     { renderDisputes(); initDisputeSection(); }
    if (name === 'withdrawals')  { renderWithdrawals(); initWithdrawalSection(); }
    if (name === 'transactions') { renderTransactions(allTx); initTxFilter(); }
    if (name === 'content')      { renderContent(); initContentSection(); }
    if (name === 'tickets')      { renderTickets(); initTicketSection(); }
    if (name === 'kyc')          { renderKyc(); initKycSection(); }
    if (name === 'antifraud')    { renderAntifraud(); initAntifraudSection(); }
    if (name === 'admins')       { renderAdminMgmt(); initAdminMgmtSection(); }
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
          (m.category === 'mega' ? '🏆 Mega' : '🗓️ Daily') + '</span>' +
          (m.streamUrl ? ' <span class="stream-badge">🔴 LIVE</span>' : '') + '</td>' +
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

    /* Forgot password modal */
    var forgotBtn   = document.getElementById('forgotPassBtn');
    var forgotModal = document.getElementById('forgotModal');
    var closeBtn    = document.getElementById('closeForgotBtn');

    if (forgotBtn && forgotModal) {
      forgotBtn.addEventListener('click', function() {
        forgotModal.classList.remove('hidden');
      });
    }
    if (closeBtn && forgotModal) {
      closeBtn.addEventListener('click', function() {
        forgotModal.classList.add('hidden');
      });
    }
    if (forgotModal) {
      forgotModal.addEventListener('click', function(e) {
        if (e.target === forgotModal) forgotModal.classList.add('hidden');
      });
    }
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

    /* Stream URL live preview */
    var streamInput   = document.getElementById('mfStreamUrl');
    var streamPreview = document.getElementById('streamPreview');
    var streamText    = document.getElementById('streamPreviewText');
    if (streamInput && streamPreview) {
      streamInput.addEventListener('input', function() {
        var val = this.value.trim();
        if (val && (val.includes('youtube.com') || val.includes('youtu.be'))) {
          streamPreview.classList.remove('hidden');
          streamPreview.style.borderColor = '';
          streamPreview.style.color       = '';
          if (streamText) streamText.textContent = '🔴 YouTube stream will be shown inside this match card';
        } else if (val) {
          streamPreview.classList.remove('hidden');
          streamPreview.style.borderColor = 'rgba(255,159,67,0.3)';
          streamPreview.style.color       = 'var(--orange)';
          if (streamText) streamText.textContent = '⚠️ Use a YouTube live URL for best compatibility';
        } else {
          streamPreview.classList.add('hidden');
          streamPreview.style.borderColor = '';
          streamPreview.style.color       = '';
        }
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
        var dateV     = document.getElementById('mfDate').value;
        var timeV     = document.getElementById('mfTime').value;
        var rules     = document.getElementById('mfRules').value;
        var kill      = parseInt(document.getElementById('mfKillReward').value) || 0;
        var roomId    = document.getElementById('mfRoomId').value;
        var roomPas   = document.getElementById('mfRoomPass').value;
        var streamUrl = (document.getElementById('mfStreamUrl') || {}).value.trim();

        if (!prize) { showToast('Enter a prize pool', 'error'); return; }
        if (!dateV) { showToast('Select a match date', 'error'); return; }

        var slots     = type === 'Solo' ? 48 : type === 'Duo' ? 24 : 12;
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
          roomPass:    roomPas,
          streamUrl:   streamUrl || null
        };

        allMatches.push(newMatch);
        lsSet(MATCHES_KEY, allMatches);
        updateNavCounts();
        renderMatchesTable(allMatches);
        closeModal();
        var streamMsg = streamUrl ? ' 🔴 Stream added' : '';
        showToast('Match created: ' + newMatch.id + streamMsg, 'success');
        logAudit('MATCH_CREATED', (lsGet(SESSION_KEY)||{}).email, (lsGet(SESSION_KEY)||{}).role, 'Created ' + newMatch.id + ' (' + type + ' / ' + category + ')', true);
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
          auditLogs: lsGet(AUDIT_KEY),
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

    /* Clear audit logs */
    var clearAuditBtn = document.getElementById('clearAuditBtn');
    if (clearAuditBtn) {
      clearAuditBtn.addEventListener('click', function() {
        if (!confirm('Clear all audit logs?')) return;
        lsSet(AUDIT_KEY, []);
        renderAuditLogs();
        showToast('Audit logs cleared', 'success');
      });
    }

    /* Audit Logs */
    renderAuditLogs();
  }

  function renderAuditLogs() {
    var logs = lsGet(AUDIT_KEY) || [];
    var container = document.getElementById('auditLogContainer');
    if (!container) return;

    if (logs.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--t1);padding:30px">No audit logs yet.</p>';
      return;
    }

    var actionLabels = {
      'LOGIN_SUCCESS': '✅ Login Success',
      'LOGIN_FAIL':    '❌ Login Failed',
      'FORGOT_PW':     '🔐 Forgot Password',
      'LOGOUT':        '🚪 Logout'
    };

    container.innerHTML =
      '<table class="admin-table"><thead><tr>' +
        '<th>Time</th><th>Action</th><th>Email</th><th>Role</th><th>Details</th><th>Status</th>' +
      '</tr></thead><tbody>' +
      logs.map(function(log) {
        return '<tr>' +
          '<td style="color:var(--t1);font-size:12px">' + formatDateTime(log.timestamp) + '</td>' +
          '<td>' + (actionLabels[log.action] || log.action) + '</td>' +
          '<td style="color:var(--t1)">' + esc(log.email) + '</td>' +
          '<td><span class="role-chip chip-' + (log.role === 'super_admin' ? 'super' : log.role === 'moderator' ? 'mod' : 'admin') + '">' + (log.role || '—') + '</span></td>' +
          '<td style="color:var(--t1);font-size:12px">' + esc(log.details) + '</td>' +
          '<td class="' + (log.success ? 'audit-success' : 'audit-fail') + '">' + (log.success ? '✓ Success' : '✗ Failed') + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
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
     DANGEROUS ACTION PROTECTION
  ───────────────────────────────────────── */
  var dangerCallback = null;

  function confirmDangerAction(message, callback) {
    dangerCallback = callback;
    var modal = document.getElementById('dangerModal');
    var msg   = document.getElementById('dangerMsg');
    var pass  = document.getElementById('dangerPassword');
    var err   = document.getElementById('dangerError');
    if (msg)  msg.textContent = message;
    if (pass) pass.value = '';
    if (err)  err.classList.add('hidden');
    if (modal) modal.classList.remove('hidden');
  }

  document.addEventListener('click', function(e) {
    if (e.target.closest('#confirmDangerBtn')) {
      var pass    = (document.getElementById('dangerPassword') || {}).value;
      var sess    = lsGet(SESSION_KEY);
      var account = getAdminAccounts().find(function(a){return a.email===(sess||{}).email&&a.password===pass;});
      var errEl   = document.getElementById('dangerError');
      if (!account) { if(errEl){errEl.textContent='Incorrect password.';errEl.classList.remove('hidden');} return; }
      document.getElementById('dangerModal').classList.add('hidden');
      if (dangerCallback) { dangerCallback(); dangerCallback = null; }
    }
    if (e.target.id==='dangerModal'||e.target.closest('#cancelDangerModal')||e.target.closest('#closeDangerModal')) {
      var dm=document.getElementById('dangerModal'); if(dm)dm.classList.add('hidden');
      dangerCallback = null;
    }
  });

  /* Feature Tabs */
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.ft-btn');
    if (!btn) return;
    var tabId  = btn.getAttribute('data-tab');
    var parent = btn.closest('.cs');
    if (!parent || !tabId) return;
    parent.querySelectorAll('.ft-btn').forEach(function(b){b.classList.remove('active');});
    parent.querySelectorAll('.feat-tab-content').forEach(function(t){t.classList.remove('active');});
    btn.classList.add('active');
    var target = document.getElementById(tabId);
    if (target) target.classList.add('active');
  });

  /* ─────────────────────────────────────────
     RESULTS & SETTLEMENT
  ───────────────────────────────────────── */
  var RESULTS_KEY  = 'playta_results';
  var activeResult = null;

  function seedResults() {
    var r = lsGet(RESULTS_KEY) || [];
    if (r.length === 0) {
      r = [
        {id:'RES-001',matchId:'#271797',playerName:'Arjun Singh',username:'arjun1000',submittedKills:8,submittedRank:2,perKillReward:5,rankPrize:500,status:'pending',submittedAt:Date.now()-3600000},
        {id:'RES-002',matchId:'#271812',playerName:'Rahul Verma', username:'rahul1001',submittedKills:12,submittedRank:1,perKillReward:8,rankPrize:1000,status:'pending',submittedAt:Date.now()-7200000},
        {id:'RES-003',matchId:'#271797',playerName:'Priya Sharma',username:'priya1002',submittedKills:5,submittedRank:4,perKillReward:5,rankPrize:100,status:'approved',adminKills:5,adminRank:4,totalPaid:125,settlementId:'STL-001',settledAt:Date.now()-86400000,settledBy:'admin@playta.com'}
      ];
      lsSet(RESULTS_KEY, r);
    }
    return r;
  }

  function renderResults() {
    var results = seedResults();
    var pending = results.filter(function(r){return r.status==='pending';});
    var settled = results.filter(function(r){return r.status!=='pending';});
    var badge   = document.getElementById('pendingResultsBadge');
    if (badge) badge.textContent = pending.length + ' pending';
    var tbody = document.getElementById('pendingResultsBody'), noEl = document.getElementById('noResults');
    if (tbody) {
      if (!pending.length) { tbody.innerHTML=''; if(noEl)noEl.classList.remove('hidden'); }
      else {
        if(noEl)noEl.classList.add('hidden');
        tbody.innerHTML = pending.map(function(r){
          return '<tr><td style="color:var(--green);font-size:12px">'+esc(r.matchId)+'</td>'+
            '<td><div class="t-user-cell"><div class="t-avatar">'+avatarLetter(r.playerName)+'</div><div><p class="t-user-name">'+esc(r.playerName)+'</p><p class="t-user-email">@'+esc(r.username)+'</p></div></div></td>'+
            '<td style="font-weight:600">'+r.submittedKills+' kills</td>'+
            '<td><span class="badge badge-solo">#'+r.submittedRank+'</span></td>'+
            '<td><span style="color:var(--t1);font-size:12px">📸 Demo</span></td>'+
            '<td style="color:var(--t1);font-size:12px">'+timeAgo(r.submittedAt)+'</td>'+
            '<td><button class="btn-primary-sm" style="padding:6px 12px;font-size:11px" onclick="openResultModal(\''+r.id+'\')">Review</button></td></tr>';
        }).join('');
      }
    }
    var histBody = document.getElementById('settlementHistoryBody');
    if (histBody) {
      histBody.innerHTML = !settled.length ? '<tr><td colspan="8" style="text-align:center;color:var(--t1);padding:20px">No settlements yet</td></tr>' :
        settled.map(function(r){
          return '<tr><td style="color:var(--t1);font-size:11px">'+esc(r.settlementId||'—')+'</td><td style="color:var(--t1);font-size:12px">'+esc(r.matchId)+'</td>'+
            '<td><div class="t-user-cell"><div class="t-avatar">'+avatarLetter(r.playerName)+'</div><p class="t-user-name">'+esc(r.playerName)+'</p></div></td>'+
            '<td>'+(r.adminKills||r.submittedKills)+'</td><td>#'+(r.adminRank||r.submittedRank)+'</td>'+
            '<td style="color:var(--green);font-weight:700">₹'+(r.totalPaid||0)+'</td>'+
            '<td style="color:var(--t1);font-size:12px">'+formatDate(r.settledAt)+'</td>'+
            '<td style="color:var(--t1);font-size:11px">'+esc(r.settledBy||'—')+'</td></tr>';
        }).join('');
    }
    updateNavCounts();
  }

  window.openResultModal = function(id) {
    var results = lsGet(RESULTS_KEY)||[]; var r = results.find(function(x){return x.id===id;}); if(!r)return;
    activeResult = r;
    var info = document.getElementById('resultInfo');
    if (info) info.innerHTML = '<strong>Match:</strong> '+esc(r.matchId)+' &nbsp;|&nbsp; <strong>Player:</strong> '+esc(r.playerName)+' (@'+esc(r.username)+')';
    var ak = document.getElementById('rAdminKills'), ar = document.getElementById('rAdminRank');
    var pk = document.getElementById('rPlayerKills'), pr = document.getElementById('rPlayerRank');
    if(pk)pk.value=r.submittedKills; if(pr)pr.value=r.submittedRank;
    if(ak){ak.value=r.submittedKills; ak.oninput=function(){updateResultCalc(r);};}
    if(ar){ar.value=r.submittedRank;  ar.oninput=function(){updateResultCalc(r);};}
    updateResultCalc(r);
    document.getElementById('resultModal').classList.remove('hidden');
  };

  function updateResultCalc(r) {
    var k=parseInt((document.getElementById('rAdminKills')||{}).value)||0;
    var rk=parseInt((document.getElementById('rAdminRank')||{}).value)||1;
    var kr=((r.perKillReward||5)*k), rp=rk===1?(r.rankPrize||500):rk===2?Math.floor((r.rankPrize||500)*.5):rk<=5?Math.floor((r.rankPrize||500)*.2):0;
    setEl('rcPerKill','₹'+kr); setEl('rcRankPrize','₹'+rp); setEl('rcTotal','₹'+(kr+rp));
  }

  function initResultsSection() {
    var close=document.getElementById('closeResultModal'); if(close)close.onclick=function(){document.getElementById('resultModal').classList.add('hidden');};
    var approveBtn=document.getElementById('approveResultBtn');
    if(approveBtn)approveBtn.onclick=function(){
      if(!activeResult)return;
      var kills=parseInt((document.getElementById('rAdminKills')||{}).value)||0;
      var rank=parseInt((document.getElementById('rAdminRank')||{}).value)||1;
      var kr=((activeResult.perKillReward||5)*kills), rp=rank===1?(activeResult.rankPrize||500):rank===2?Math.floor((activeResult.rankPrize||500)*.5):rank<=5?Math.floor((activeResult.rankPrize||500)*.2):0;
      var total=kr+rp;
      confirmDangerAction('Approve result and credit ₹'+total+' to '+activeResult.playerName+'?',function(){
        var results=lsGet(RESULTS_KEY)||[]; var idx=results.findIndex(function(r){return r.id===activeResult.id;}); var sess=lsGet(SESSION_KEY);
        var stlId='STL-'+Date.now();
        if(idx>=0){results[idx].status='approved';results[idx].adminKills=kills;results[idx].adminRank=rank;results[idx].totalPaid=total;results[idx].settlementId=stlId;results[idx].settledAt=Date.now();results[idx].settledBy=(sess||{}).email;lsSet(RESULTS_KEY,results);}
        var users=lsGet(USERS_KEY)||[]; var uidx=users.findIndex(function(u){return u.username===activeResult.username;});
        if(uidx>=0){users[uidx].units=(users[uidx].units||0)+total;lsSet(USERS_KEY,users);}
        var txs=lsGet(TX_KEY)||[]; txs.push({id:stlId,user:activeResult.playerName,username:activeResult.username,type:'winning',amount:total,units:total,date:Date.now(),status:'completed',note:'Result settlement'});lsSet(TX_KEY,txs);
        logAudit('RESULT_SETTLEMENT',(sess||{}).email,(sess||{}).role,'Settled '+stlId+' ₹'+total+' → '+activeResult.username,true);
        document.getElementById('resultModal').classList.add('hidden'); renderResults(); showToast('✅ ₹'+total+' credited to '+activeResult.playerName,'success');
      });
    };
    var rejBtn=document.getElementById('rejectResultBtn');
    if(rejBtn)rejBtn.onclick=function(){
      if(!activeResult)return; var results=lsGet(RESULTS_KEY)||[]; var idx=results.findIndex(function(r){return r.id===activeResult.id;});
      if(idx>=0){results[idx].status='rejected';lsSet(RESULTS_KEY,results);}
      logAudit('RESULT_REJECTED',(lsGet(SESSION_KEY)||{}).email,'','Rejected '+activeResult.id,true);
      document.getElementById('resultModal').classList.add('hidden'); renderResults(); showToast('Result rejected','error');
    };
    var resubBtn=document.getElementById('resubmitResultBtn');
    if(resubBtn)resubBtn.onclick=function(){
      if(!activeResult)return; var results=lsGet(RESULTS_KEY)||[]; var idx=results.findIndex(function(r){return r.id===activeResult.id;});
      if(idx>=0){results[idx].status='resubmit_requested';lsSet(RESULTS_KEY,results);}
      document.getElementById('resultModal').classList.add('hidden'); renderResults(); showToast('Re-submission requested','success');
    };
  }

  /* ─────────────────────────────────────────
     DISPUTES
  ───────────────────────────────────────── */
  var DISPUTES_KEY  = 'playta_disputes';
  var activeDispute = null;

  function seedDisputes() {
    var d=lsGet(DISPUTES_KEY)||[];
    if(!d.length){
      d=[
        {id:'DIS-001',reporterName:'Arjun Singh',reporterUsername:'arjun1000',reportedName:'Rahul Verma',reportedUsername:'rahul1001',matchId:'#271797',category:'Hacker',description:'Player shooting through walls.',status:'pending',createdAt:Date.now()-7200000},
        {id:'DIS-002',reporterName:'Priya Sharma',reporterUsername:'priya1002',reportedName:'Dev Kumar',reportedUsername:'dev1003',matchId:'#271812',category:'Team-up',description:'Two players teaming up.',status:'investigating',createdAt:Date.now()-86400000},
        {id:'DIS-003',reporterName:'Rohit Mehta',reporterUsername:'rohit1005',reportedName:'Sneha Patel',reportedUsername:'sneha1006',matchId:'#271845',category:'Fake Screenshot',description:'Screenshot appears edited.',status:'resolved',action:'warning',adminNote:'Warning issued.',createdAt:Date.now()-172800000}
      ];
      lsSet(DISPUTES_KEY,d);
    }
    return d;
  }

  function renderDisputes() {
    var disputes=seedDisputes();
    var search=(document.getElementById('disputeSearch')||{}).value||'';
    var status=(document.getElementById('disputeStatusFilter')||{}).value||'all';
    var cat=(document.getElementById('disputeCatFilter')||{}).value||'all';
    var filtered=disputes.filter(function(d){
      return(!search||d.reporterUsername.toLowerCase().includes(search)||d.reportedUsername.toLowerCase().includes(search))&&(status==='all'||d.status===status)&&(cat==='all'||d.category===cat);
    });
    var tbody=document.getElementById('disputesBody'),noEl=document.getElementById('noDisputes');
    var sc={pending:'banned',investigating:'paid',resolved:'active',dismissed:'solo'};
    if(!tbody)return;
    if(!filtered.length){tbody.innerHTML='';if(noEl)noEl.classList.remove('hidden');}
    else{
      if(noEl)noEl.classList.add('hidden');
      tbody.innerHTML=filtered.map(function(d,i){
        return '<tr><td style="color:var(--t1)">'+(i+1)+'</td><td>'+esc(d.reporterName)+'<br><small style="color:var(--t1)">@'+esc(d.reporterUsername)+'</small></td>'+
          '<td>'+esc(d.reportedName)+'<br><small style="color:var(--t1)">@'+esc(d.reportedUsername)+'</small></td>'+
          '<td style="color:var(--t1);font-size:12px">'+esc(d.matchId)+'</td>'+
          '<td><span class="badge badge-banned">'+esc(d.category)+'</span></td>'+
          '<td style="color:var(--t1);font-size:12px">'+timeAgo(d.createdAt)+'</td>'+
          '<td><span class="badge badge-'+(sc[d.status]||'active')+'">'+d.status+'</span></td>'+
          '<td><button class="action-btn" onclick="openDisputeModal(\''+d.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></td></tr>';
      }).join('');
    }
    updateNavCounts();
  }

  window.openDisputeModal = function(id) {
    var d=(lsGet(DISPUTES_KEY)||[]).find(function(x){return x.id===id;}); if(!d)return; activeDispute=d;
    var det=document.getElementById('disputeDetail');
    if(det)det.innerHTML='<div class="dispute-info-grid">'+
      '<div class="di-item"><p class="di-label">ID</p><p class="di-value">'+esc(d.id)+'</p></div>'+
      '<div class="di-item"><p class="di-label">Category</p><p class="di-value">'+esc(d.category)+'</p></div>'+
      '<div class="di-item"><p class="di-label">Reporter</p><p class="di-value">@'+esc(d.reporterUsername)+'</p></div>'+
      '<div class="di-item"><p class="di-label">Reported</p><p class="di-value">@'+esc(d.reportedUsername)+'</p></div>'+
      '<div class="di-item" style="grid-column:span 2"><p class="di-label">Description</p><p class="di-value" style="font-weight:400;color:var(--t1)">'+esc(d.description)+'</p></div></div>';
    var n=document.getElementById('disputeNote'); if(n)n.value=d.adminNote||'';
    var a=document.getElementById('disputeAction'); if(a)a.value=d.action||'none';
    document.getElementById('disputeModal').classList.remove('hidden');
  };

  function initDisputeSection() {
    var close=document.getElementById('closeDisputeModal'); if(close)close.onclick=function(){document.getElementById('disputeModal').classList.add('hidden');};
    var resolveBtn=document.getElementById('resolveDisputeBtn');
    if(resolveBtn)resolveBtn.onclick=function(){
      if(!activeDispute)return;
      var note=(document.getElementById('disputeNote')||{}).value.trim();
      var action=(document.getElementById('disputeAction')||{}).value;
      if(!note){showToast('Resolution note is required','error');return;}
      var disputes=lsGet(DISPUTES_KEY)||[]; var idx=disputes.findIndex(function(d){return d.id===activeDispute.id;}); var sess=lsGet(SESSION_KEY);
      if(idx>=0){disputes[idx].status='resolved';disputes[idx].action=action;disputes[idx].adminNote=note;disputes[idx].resolvedAt=Date.now();disputes[idx].resolvedBy=(sess||{}).email;lsSet(DISPUTES_KEY,disputes);}
      if(action==='ban_temp'||action==='ban_perm'){var users=lsGet(USERS_KEY)||[];var uidx=users.findIndex(function(u){return u.username===activeDispute.reportedUsername;});if(uidx>=0){users[uidx].status='banned';lsSet(USERS_KEY,users);}}
      logAudit('DISPUTE_RESOLVED',(sess||{}).email,(sess||{}).role,'Dispute '+activeDispute.id+' resolved. Action: '+action,true);
      document.getElementById('disputeModal').classList.add('hidden'); renderDisputes(); showToast('Dispute resolved: '+action,'success');
    };
    var dismissBtn=document.getElementById('dismissDisputeBtn');
    if(dismissBtn)dismissBtn.onclick=function(){
      if(!activeDispute)return; var disputes=lsGet(DISPUTES_KEY)||[]; var idx=disputes.findIndex(function(d){return d.id===activeDispute.id;});
      if(idx>=0){disputes[idx].status='dismissed';lsSet(DISPUTES_KEY,disputes);}
      document.getElementById('disputeModal').classList.add('hidden'); renderDisputes(); showToast('Dispute dismissed','success');
    };
    ['disputeSearch','disputeStatusFilter','disputeCatFilter'].forEach(function(id){var el=document.getElementById(id);if(el)el.addEventListener(el.tagName==='SELECT'?'change':'input',renderDisputes);});
  }

  /* ─────────────────────────────────────────
     WITHDRAWALS
  ───────────────────────────────────────── */
  var WITHDRAWALS_KEY  = 'playta_withdrawals';
  var activeWithdrawal = null;

  function seedWithdrawals() {
    var w=lsGet(WITHDRAWALS_KEY)||[];
    if(!w.length){
      w=[
        {id:'WTH-001',username:'arjun1000',name:'Arjun Singh',amount:500,upiId:'arjun@ybl',status:'pending',requestedAt:Date.now()-3600000},
        {id:'WTH-002',username:'rahul1001',name:'Rahul Verma',amount:1200,upiId:'rahul@paytm',status:'pending',requestedAt:Date.now()-7200000},
        {id:'WTH-003',username:'priya1002',name:'Priya Sharma',amount:800,upiId:'priya@gpay',status:'approved',utrId:'UTR123456789',requestedAt:Date.now()-86400000,processedAt:Date.now()-82800000},
        {id:'WTH-004',username:'dev1003',name:'Dev Kumar',amount:300,upiId:'dev@phonepe',status:'rejected',rejectionReason:'Invalid UPI ID',requestedAt:Date.now()-172800000}
      ];
      lsSet(WITHDRAWALS_KEY,w);
    }
    return w;
  }

  function renderWithdrawals() {
    var wths=seedWithdrawals(); var filter=(document.getElementById('wthStatusFilter')||{}).value||'all';
    var filtered=filter==='all'?wths:wths.filter(function(w){return w.status===filter;});
    var pending=wths.filter(function(w){return w.status==='pending';}).length;
    var totalPaid=wths.filter(function(w){return w.status==='approved';}).reduce(function(s,w){return s+w.amount;},0);
    setEl('wthPending',pending); setEl('wthApproved',wths.filter(function(w){return w.status==='approved';}).length);
    setEl('wthRejected',wths.filter(function(w){return w.status==='rejected';}).length); setEl('wthTotal','₹'+totalPaid.toLocaleString('en-IN'));
    var tbody=document.getElementById('withdrawalsBody'),noEl=document.getElementById('noWithdrawals');
    var sc={pending:'paid',approved:'active',rejected:'banned',failed:'banned'};
    if(!tbody)return;
    if(!filtered.length){tbody.innerHTML='';if(noEl)noEl.classList.remove('hidden');}
    else{
      if(noEl)noEl.classList.add('hidden');
      tbody.innerHTML=filtered.map(function(w,i){
        return '<tr><td style="color:var(--t1)">'+(i+1)+'</td>'+
          '<td><div class="t-user-cell"><div class="t-avatar">'+avatarLetter(w.name)+'</div><div><p class="t-user-name">'+esc(w.name)+'</p><p class="t-user-email">@'+esc(w.username)+'</p></div></div></td>'+
          '<td style="font-weight:700">₹'+w.amount.toLocaleString('en-IN')+'</td>'+
          '<td style="color:var(--t1);font-size:12px">'+esc(w.upiId||'—')+'</td>'+
          '<td style="color:var(--t1);font-size:12px">'+timeAgo(w.requestedAt)+'</td>'+
          '<td><span class="badge badge-'+(sc[w.status]||'active')+'">'+w.status+'</span></td>'+
          '<td style="color:var(--t1);font-size:12px">'+esc(w.utrId||'—')+'</td>'+
          '<td>'+(w.status==='pending'?'<button class="btn-primary-sm" style="padding:6px 12px;font-size:11px" onclick="openWithdrawalModal(\''+w.id+'\')">Process</button>':'<span style="color:var(--t1);font-size:12px">Done</span>')+'</td></tr>';
      }).join('');
    }
    updateNavCounts();
  }

  window.openWithdrawalModal = function(id) {
    var w=(lsGet(WITHDRAWALS_KEY)||[]).find(function(x){return x.id===id;}); if(!w)return; activeWithdrawal=w;
    var det=document.getElementById('withdrawalDetail');
    if(det)det.innerHTML='<div class="withdrawal-detail">'+
      '<div class="wd-row"><span class="wd-label">ID</span><span class="wd-value">'+esc(w.id)+'</span></div>'+
      '<div class="wd-row"><span class="wd-label">User</span><span class="wd-value">'+esc(w.name)+' (@'+esc(w.username)+')</span></div>'+
      '<div class="wd-row"><span class="wd-label">Amount</span><span class="wd-value" style="color:var(--green)">₹'+w.amount.toLocaleString('en-IN')+'</span></div>'+
      '<div class="wd-row"><span class="wd-label">UPI</span><span class="wd-value">'+esc(w.upiId||'—')+'</span></div>'+
      '<div class="wd-row"><span class="wd-label">Requested</span><span class="wd-value">'+formatDateTime(w.requestedAt)+'</span></div></div>';
    document.getElementById('withdrawalModal').classList.remove('hidden');
  };

  function initWithdrawalSection() {
    ['closeWithdrawalModal','cancelWithdrawalModal'].forEach(function(id){var el=document.getElementById(id);if(el)el.onclick=function(){document.getElementById('withdrawalModal').classList.add('hidden');};});
    var processBtn=document.getElementById('processWithdrawalBtn');
    if(processBtn)processBtn.onclick=function(){
      if(!activeWithdrawal)return;
      var action=(document.getElementById('wthAction')||{}).value;
      var utr=(document.getElementById('wthUtr')||{}).value.trim();
      var reason=(document.getElementById('wthReason')||{}).value.trim();
      if(action==='approved'&&!utr){showToast('UTR/Reference ID required','error');return;}
      if(action==='rejected'&&!reason){showToast('Rejection reason required','error');return;}
      confirmDangerAction('Process ₹'+activeWithdrawal.amount+' withdrawal for '+activeWithdrawal.name+'?',function(){
        var wths=lsGet(WITHDRAWALS_KEY)||[]; var idx=wths.findIndex(function(w){return w.id===activeWithdrawal.id;}); var sess=lsGet(SESSION_KEY);
        if(idx>=0){wths[idx].status=action;wths[idx].utrId=utr;wths[idx].rejectionReason=reason;wths[idx].processedAt=Date.now();wths[idx].processedBy=(sess||{}).email;lsSet(WITHDRAWALS_KEY,wths);}
        if(action==='approved'){var users=lsGet(USERS_KEY)||[];var uidx=users.findIndex(function(u){return u.username===activeWithdrawal.username;});if(uidx>=0){users[uidx].units=Math.max(0,(users[uidx].units||0)-activeWithdrawal.amount);lsSet(USERS_KEY,users);}var txs=lsGet(TX_KEY)||[];txs.push({id:'WTH-TX-'+Date.now(),user:activeWithdrawal.name,username:activeWithdrawal.username,type:'withdraw',amount:activeWithdrawal.amount,units:0,date:Date.now(),status:'completed',note:'UTR:'+utr});lsSet(TX_KEY,txs);}
        logAudit('WITHDRAWAL_'+action.toUpperCase(),(sess||{}).email,(sess||{}).role,'Withdrawal '+activeWithdrawal.id+' '+action+(utr?' UTR:'+utr:''),true);
        document.getElementById('withdrawalModal').classList.add('hidden'); renderWithdrawals(); showToast('Withdrawal '+action,action==='approved'?'success':'error');
      });
    };
    var sf=document.getElementById('wthStatusFilter'); if(sf)sf.addEventListener('change',renderWithdrawals);
    var demoBtn=document.getElementById('addDemoWithdrawalBtn');
    if(demoBtn)demoBtn.onclick=function(){var w=lsGet(WITHDRAWALS_KEY)||[];w.push({id:'WTH-'+Date.now(),username:'demo_user',name:'Demo User',amount:Math.floor(Math.random()*1000)+100,upiId:'demo@upi',status:'pending',requestedAt:Date.now()});lsSet(WITHDRAWALS_KEY,w);renderWithdrawals();showToast('Demo withdrawal added','success');};
  }

  /* ─────────────────────────────────────────
     SUPPORT TICKETS
  ───────────────────────────────────────── */
  var TICKETS_KEY  = 'playta_tickets';
  var activeTicket = null;

  function seedTickets() {
    var t=lsGet(TICKETS_KEY)||[];
    if(!t.length){
      t=[
        {id:'TKT-001',username:'arjun1000',name:'Arjun Singh',subject:'Match result not credited',category:'Result',priority:'high',status:'open',assignedTo:'admin',messages:[{from:'user',text:'I won but winnings not credited.',timestamp:Date.now()-7200000}],internalNote:'',createdAt:Date.now()-7200000},
        {id:'TKT-002',username:'rahul1001',name:'Rahul Verma',subject:'Withdrawal stuck for 3 days',category:'Withdrawal',priority:'urgent',status:'open',assignedTo:'',messages:[{from:'user',text:'My ₹1200 withdrawal is still pending.',timestamp:Date.now()-259200000}],internalNote:'',createdAt:Date.now()-259200000},
        {id:'TKT-003',username:'priya1002',name:'Priya Sharma',subject:'Account login issue',category:'Technical',priority:'medium',status:'resolved',assignedTo:'moderator',messages:[{from:'user',text:'Cannot login.',timestamp:Date.now()-432000000},{from:'admin',text:'Please clear browser cache.',timestamp:Date.now()-431000000}],internalNote:'Resolved',createdAt:Date.now()-432000000}
      ];
      lsSet(TICKETS_KEY,t);
    }
    return t;
  }

  function renderTickets() {
    var tickets=seedTickets();
    var search=(document.getElementById('ticketSearch')||{}).value||'';
    var status=(document.getElementById('ticketStatusFilter')||{}).value||'all';
    var cat=(document.getElementById('ticketCatFilter')||{}).value||'all';
    var filtered=tickets.filter(function(t){return(!search||t.username.toLowerCase().includes(search)||t.subject.toLowerCase().includes(search))&&(status==='all'||t.status===status)&&(cat==='all'||t.category===cat);});
    var tbody=document.getElementById('ticketsBody'),noEl=document.getElementById('noTickets');
    var pc={low:'priority-low',medium:'priority-medium',high:'priority-high',urgent:'priority-urgent'};
    var sc={open:'banned',pending:'paid',resolved:'active',closed:'solo'};
    if(!tbody)return;
    if(!filtered.length){tbody.innerHTML='';if(noEl)noEl.classList.remove('hidden');}
    else{
      if(noEl)noEl.classList.add('hidden');
      tbody.innerHTML=filtered.map(function(t){
        return '<tr><td style="color:var(--green);font-size:12px">'+esc(t.id)+'</td>'+
          '<td><div class="t-user-cell"><div class="t-avatar">'+avatarLetter(t.name)+'</div><div><p class="t-user-name">'+esc(t.name)+'</p><p class="t-user-email">@'+esc(t.username)+'</p></div></div></td>'+
          '<td>'+esc(t.subject)+'</td><td><span class="badge badge-solo">'+esc(t.category)+'</span></td>'+
          '<td><span class="'+(pc[t.priority]||'priority-medium')+'">'+t.priority+'</span></td>'+
          '<td style="color:var(--t1)">'+esc(t.assignedTo||'Unassigned')+'</td>'+
          '<td style="color:var(--t1);font-size:12px">'+timeAgo(t.createdAt)+'</td>'+
          '<td><span class="badge badge-'+(sc[t.status]||'active')+'">'+t.status+'</span></td>'+
          '<td><button class="action-btn" onclick="openTicketModal(\''+t.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button></td></tr>';
      }).join('');
    }
    updateNavCounts();
  }

  window.openTicketModal = function(id) {
    var tickets=lsGet(TICKETS_KEY)||[]; var t=tickets.find(function(x){return x.id===id;}); if(!t)return; activeTicket=t;
    var det=document.getElementById('ticketDetail');
    if(det)det.innerHTML='<div class="dispute-info-grid"><div class="di-item"><p class="di-label">Ticket ID</p><p class="di-value">'+esc(t.id)+'</p></div><div class="di-item"><p class="di-label">Category / Priority</p><p class="di-value">'+esc(t.category)+' / '+esc(t.priority)+'</p></div><div class="di-item" style="grid-column:span 2"><p class="di-label">Subject</p><p class="di-value">'+esc(t.subject)+'</p></div></div>';
    var conv=document.getElementById('ticketConversation');
    if(conv)conv.innerHTML=(t.messages||[]).map(function(m){return '<div class="tc-msg '+(m.from==='admin'?'admin':'user')+'"><p class="tc-sender">'+(m.from==='admin'?'🛡️ Admin':'👤 '+t.name)+' · '+formatDateTime(m.timestamp)+'</p><p>'+esc(m.text)+'</p></div>';}).join('');
    var s=document.getElementById('ticketStatus'),a=document.getElementById('ticketAssign'),n=document.getElementById('ticketInternalNote');
    if(s)s.value=t.status; if(a)a.value=t.assignedTo||''; if(n)n.value=t.internalNote||'';
    document.getElementById('ticketModal').classList.remove('hidden');
  };

  function initTicketSection() {
    ['closeTicketModal','cancelTicketModal'].forEach(function(id){var el=document.getElementById(id);if(el)el.onclick=function(){document.getElementById('ticketModal').classList.add('hidden');};});
    var replyBtn=document.getElementById('replyTicketBtn');
    if(replyBtn)replyBtn.onclick=function(){
      if(!activeTicket)return;
      var reply=(document.getElementById('ticketReply')||{}).value.trim();
      var status=(document.getElementById('ticketStatus')||{}).value;
      var assign=(document.getElementById('ticketAssign')||{}).value;
      var note=(document.getElementById('ticketInternalNote')||{}).value.trim();
      var sess=lsGet(SESSION_KEY);
      var tickets=lsGet(TICKETS_KEY)||[]; var idx=tickets.findIndex(function(t){return t.id===activeTicket.id;});
      if(idx>=0){if(reply)tickets[idx].messages.push({from:'admin',text:reply,timestamp:Date.now()});tickets[idx].status=status;tickets[idx].assignedTo=assign;tickets[idx].internalNote=note;tickets[idx].updatedAt=Date.now();lsSet(TICKETS_KEY,tickets);}
      logAudit('TICKET_UPDATE',(sess||{}).email,(sess||{}).role,'Ticket '+activeTicket.id+' → '+status,true);
      document.getElementById('ticketModal').classList.add('hidden'); renderTickets(); showToast('Ticket updated','success');
    };
    ['ticketSearch','ticketStatusFilter','ticketCatFilter'].forEach(function(id){var el=document.getElementById(id);if(el)el.addEventListener(el.tagName==='SELECT'?'change':'input',renderTickets);});
    var demoBtn=document.getElementById('createDemoTicketBtn');
    if(demoBtn)demoBtn.onclick=function(){var t=lsGet(TICKETS_KEY)||[];t.push({id:'TKT-'+Date.now(),username:'demo_user',name:'Demo User',subject:'Demo support request',category:'Other',priority:'low',status:'open',assignedTo:'',messages:[{from:'user',text:'Demo ticket.',timestamp:Date.now()}],internalNote:'',createdAt:Date.now()});lsSet(TICKETS_KEY,t);renderTickets();showToast('Demo ticket created','success');};
  }

  /* ─────────────────────────────────────────
     KYC
  ───────────────────────────────────────── */
  var KYC_KEY  = 'playta_kyc';
  var activeKyc= null;

  function seedKyc() {
    var k=lsGet(KYC_KEY)||[];
    if(!k.length){
      k=[
        {id:'KYC-001',username:'arjun1000',name:'Arjun Singh Rawat',dob:'15/08/1998',panNumber:'ABCDE1234F',aadharLast4:'5678',docType:'Aadhar + PAN',status:'pending',submittedAt:Date.now()-3600000},
        {id:'KYC-002',username:'rahul1001',name:'Rahul Verma',dob:'22/03/1995',panNumber:'PQRST9876X',aadharLast4:'1234',docType:'Aadhar + PAN',status:'pending',submittedAt:Date.now()-7200000},
        {id:'KYC-003',username:'priya1002',name:'Priya Sharma',dob:'10/11/2000',panNumber:'LMNOP5432Y',aadharLast4:'9012',docType:'Aadhar + PAN',status:'approved',submittedAt:Date.now()-172800000,reviewedAt:Date.now()-86400000,reviewedBy:'admin@playta.com',adminNote:'Documents verified'}
      ];
      lsSet(KYC_KEY,k);
    }
    return k;
  }

  function renderKyc() {
    var kyc=seedKyc(); var filter=(document.getElementById('kycStatusFilter')||{}).value||'all';
    var filtered=filter==='all'?kyc:kyc.filter(function(k){return k.status===filter;});
    setEl('kycPending',kyc.filter(function(k){return k.status==='pending';}).length);
    setEl('kycApproved',kyc.filter(function(k){return k.status==='approved';}).length);
    setEl('kycRejected',kyc.filter(function(k){return k.status==='rejected';}).length);
    setEl('kycResubmit',kyc.filter(function(k){return k.status==='resubmit';}).length);
    var tbody=document.getElementById('kycBody'),noEl=document.getElementById('noKyc');
    var sc={pending:'paid',approved:'active',rejected:'banned',resubmit:'solo'};
    if(!tbody)return;
    if(!filtered.length){tbody.innerHTML='';if(noEl)noEl.classList.remove('hidden');}
    else{
      if(noEl)noEl.classList.add('hidden');
      tbody.innerHTML=filtered.map(function(k,i){
        return '<tr><td style="color:var(--t1)">'+(i+1)+'</td>'+
          '<td><div class="t-user-cell"><div class="t-avatar">'+avatarLetter(k.name)+'</div><div><p class="t-user-name">'+esc(k.username)+'</p></div></div></td>'+
          '<td>'+esc(k.name)+'</td><td style="color:var(--t1)">'+esc(k.dob)+'</td><td style="color:var(--t1)">'+esc(k.docType)+'</td>'+
          '<td style="color:var(--t1);font-size:12px">'+timeAgo(k.submittedAt)+'</td>'+
          '<td><span class="badge badge-'+(sc[k.status]||'active')+'">'+k.status+'</span></td>'+
          '<td><button class="action-btn" onclick="openKycModal(\''+k.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></td></tr>';
      }).join('');
    }
    updateNavCounts();
  }

  window.openKycModal = function(id) {
    var k=(lsGet(KYC_KEY)||[]).find(function(x){return x.id===id;}); if(!k)return; activeKyc=k;
    var det=document.getElementById('kycDetail');
    if(det)det.innerHTML='<div class="dispute-info-grid"><div class="di-item"><p class="di-label">Full Name</p><p class="di-value">'+esc(k.name)+'</p></div><div class="di-item"><p class="di-label">DOB</p><p class="di-value">'+esc(k.dob)+'</p></div><div class="di-item"><p class="di-label">PAN</p><p class="di-value">'+esc(k.panNumber)+'</p></div><div class="di-item"><p class="di-label">Aadhar Last 4</p><p class="di-value">XXXX-XXXX-'+esc(k.aadharLast4)+'</p></div></div>';
    var n=document.getElementById('kycNote'); if(n)n.value=k.adminNote||'';
    document.getElementById('kycModal').classList.remove('hidden');
  };

  function initKycSection() {
    var close=document.getElementById('closeKycModal'); if(close)close.onclick=function(){document.getElementById('kycModal').classList.add('hidden');};
    function updateKyc(status,msg){
      if(!activeKyc)return; var note=(document.getElementById('kycNote')||{}).value.trim();
      if(!note){showToast('Review note required','error');return;}
      var kyc=lsGet(KYC_KEY)||[]; var idx=kyc.findIndex(function(k){return k.id===activeKyc.id;}); var sess=lsGet(SESSION_KEY);
      if(idx>=0){kyc[idx].status=status;kyc[idx].adminNote=note;kyc[idx].reviewedAt=Date.now();kyc[idx].reviewedBy=(sess||{}).email;lsSet(KYC_KEY,kyc);
        if(status==='approved'){var users=lsGet(USERS_KEY)||[];var uidx=users.findIndex(function(u){return u.username===activeKyc.username;});if(uidx>=0){users[uidx].kycVerified=true;lsSet(USERS_KEY,users);}}
        logAudit('KYC_'+status.toUpperCase(),(sess||{}).email,(sess||{}).role,'KYC '+activeKyc.id+' '+status,true);}
      document.getElementById('kycModal').classList.add('hidden'); renderKyc(); showToast(msg,status==='approved'?'success':'error');
    }
    var appBtn=document.getElementById('kycApproveBtn');
    if(appBtn)appBtn.onclick=function(){confirmDangerAction('Approve KYC for '+(activeKyc||{}).name+'?',function(){updateKyc('approved','KYC Approved ✅');});};
    var rejBtn=document.getElementById('kycRejectBtn'); if(rejBtn)rejBtn.onclick=function(){updateKyc('rejected','KYC Rejected');};
    var resubBtn=document.getElementById('kycResubmitBtn'); if(resubBtn)resubBtn.onclick=function(){updateKyc('resubmit','Re-submission requested');};
    var sf=document.getElementById('kycStatusFilter'); if(sf)sf.addEventListener('change',renderKyc);
    var demoBtn=document.getElementById('addDemoKycBtn');
    if(demoBtn)demoBtn.onclick=function(){var k=lsGet(KYC_KEY)||[];k.push({id:'KYC-'+Date.now(),username:'demo_user',name:'Demo User',dob:'01/01/1990',panNumber:'DEMOX1234Y',aadharLast4:'0000',docType:'Aadhar + PAN',status:'pending',submittedAt:Date.now()});lsSet(KYC_KEY,k);renderKyc();showToast('Demo KYC added','success');};
  }

  /* ─────────────────────────────────────────
     CONTENT: BANNERS + NOTIFICATIONS
  ───────────────────────────────────────── */
  var BANNERS_KEY = 'playta_banners';
  var NOTIFS_KEY  = 'playta_notifications';

  function renderContent() { renderBanners(); renderNotifHistory(); }

  function renderBanners() {
    var banners=lsGet(BANNERS_KEY)||[]; var grid=document.getElementById('bannersGrid'),noEl=document.getElementById('noBanners');
    if(!grid)return;
    if(!banners.length){grid.innerHTML='';if(noEl)noEl.classList.remove('hidden');return;}
    if(noEl)noEl.classList.add('hidden');
    grid.innerHTML=banners.map(function(b){
      return '<div class="banner-card"><div class="banner-img">'+(b.imageUrl?'<img src="'+esc(b.imageUrl)+'" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=\'🖼️ Image Error\'">':'🖼️ No Image')+'</div>'+
        '<div class="banner-info"><p class="banner-title">'+esc(b.title)+'</p><p class="banner-meta">Order: '+b.order+' · '+(b.enabled?'<span style="color:var(--green)">Active</span>':'<span style="color:var(--red)">Disabled</span>')+'</p>'+
        '<div class="banner-actions">'+
        '<button class="action-btn" onclick="toggleBanner(\''+b.id+'\')">'+(b.enabled?'🔴 Disable':'🟢 Enable')+'</button>'+
        '<button class="action-btn danger" onclick="deleteBanner(\''+b.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button></div></div></div>';
    }).join('');
  }

  window.toggleBanner = function(id) {
    var b=lsGet(BANNERS_KEY)||[]; var idx=b.findIndex(function(x){return x.id===id;}); if(idx>=0){b[idx].enabled=!b[idx].enabled;lsSet(BANNERS_KEY,b);renderBanners();}
  };
  window.deleteBanner = function(id) {
    if(!confirm('Delete this banner?'))return; lsSet(BANNERS_KEY,(lsGet(BANNERS_KEY)||[]).filter(function(b){return b.id!==id;})); renderBanners(); showToast('Banner deleted','error');
  };

  function renderNotifHistory() {
    var notifs=lsGet(NOTIFS_KEY)||[]; var tbody=document.getElementById('notifHistoryBody'); if(!tbody)return;
    var tl={announcement:'📢 Announcement',match_reminder:'⏰ Match Reminder',room_update:'🔑 Room Update',match_starting:'🎮 Match Starting',result:'🏆 Result'};
    tbody.innerHTML=!notifs.length?'<tr><td colspan="7" style="text-align:center;color:var(--t1);padding:20px">No notifications sent yet</td></tr>':
      notifs.map(function(n,i){return '<tr><td style="color:var(--t1)">'+(i+1)+'</td><td style="font-weight:600">'+esc(n.title)+'</td><td style="color:var(--t1)">'+esc(n.message.substring(0,50))+(n.message.length>50?'…':'')+'</td><td><span class="badge badge-solo">'+esc(n.target)+'</span></td><td style="color:var(--t1)">'+esc(tl[n.type]||n.type)+'</td><td style="color:var(--t1)">'+esc(n.sentBy)+'</td><td style="color:var(--t1);font-size:12px">'+formatDateTime(n.sentAt)+'</td></tr>';}).join('');
  }

  function initContentSection() {
    var addBtn=document.getElementById('addBannerBtn'),bModal=document.getElementById('bannerModal');
    if(addBtn)addBtn.onclick=function(){bModal.classList.remove('hidden');};
    ['closeBannerModal','cancelBannerModal'].forEach(function(id){var el=document.getElementById(id);if(el)el.onclick=function(){bModal.classList.add('hidden');};});
    var saveBtn=document.getElementById('saveBannerBtn');
    if(saveBtn)saveBtn.onclick=function(){
      var title=(document.getElementById('bannerTitle')||{}).value.trim();
      if(!title){showToast('Title required','error');return;}
      var banners=lsGet(BANNERS_KEY)||[];
      banners.push({id:'BAN-'+Date.now(),title:title,imageUrl:(document.getElementById('bannerUrl')||{}).value.trim(),destination:(document.getElementById('bannerDest')||{}).value.trim(),order:parseInt((document.getElementById('bannerOrder')||{}).value)||1,enabled:(document.getElementById('bannerEnabled')||{}).value==='true',scheduledFrom:(document.getElementById('bannerFrom')||{}).value,scheduledTo:(document.getElementById('bannerTo')||{}).value,createdAt:Date.now()});
      lsSet(BANNERS_KEY,banners); bModal.classList.add('hidden'); renderBanners(); showToast('Banner added ✅','success');
    };
    var sendBtn=document.getElementById('sendNotifBtn');
    if(sendBtn)sendBtn.onclick=function(){
      var title=(document.getElementById('notifTitle')||{}).value.trim();
      var msg=(document.getElementById('notifMessage')||{}).value.trim();
      var target=(document.getElementById('notifTarget')||{}).value;
      var type=(document.getElementById('notifType')||{}).value;
      var sess=lsGet(SESSION_KEY);
      if(!title||!msg){showToast('Title and message required','error');return;}
      var notifs=lsGet(NOTIFS_KEY)||[];
      notifs.unshift({id:'NOT-'+Date.now(),title:title,message:msg,target:target,type:type,sentAt:Date.now(),sentBy:(sess||{}).email});
      lsSet(NOTIFS_KEY,notifs); logAudit('NOTIFICATION_SENT',(sess||{}).email,(sess||{}).role,'"'+title+'" → '+target,true);
      renderNotifHistory(); document.getElementById('notifTitle').value=''; document.getElementById('notifMessage').value='';
      showToast('📢 Notification sent to '+target,'success');
    };
  }

  /* ─────────────────────────────────────────
     ANTI-FRAUD
  ───────────────────────────────────────── */
  var FRAUD_KEY   = 'playta_fraud';
  var activeFraud = null;

  function renderAntifraud() {
    var fraud=lsGet(FRAUD_KEY)||[]; var filter=(document.getElementById('fraudStatusFilter')||{}).value||'all';
    var filtered=filter==='all'?fraud:fraud.filter(function(f){return f.status===filter;});
    var tbody=document.getElementById('fraudBody'),noEl=document.getElementById('noFraud');
    var sc={flagged:'banned',investigating:'paid',cleared:'active',banned:'banned'};
    if(!tbody)return;
    if(!filtered.length){tbody.innerHTML='';if(noEl)noEl.classList.remove('hidden');}
    else{
      if(noEl)noEl.classList.add('hidden');
      tbody.innerHTML=filtered.map(function(f,i){
        var rc=f.riskScore>=75?'risk-high':f.riskScore>=40?'risk-medium':'risk-low';
        return '<tr><td style="color:var(--t1)">'+(i+1)+'</td>'+
          '<td><div class="t-user-cell"><div class="t-avatar">'+avatarLetter(f.name||'U')+'</div><div><p class="t-user-name">'+esc(f.name||'?')+'</p><p class="t-user-email">@'+esc(f.username)+'</p></div></div></td>'+
          '<td><span class="'+rc+' risk-badge">'+f.riskScore+'/100</span></td>'+
          '<td>'+(f.flags||[]).map(function(fl){return '<span class="flag-chip">'+esc(fl)+'</span>';}).join('')+'</td>'+
          '<td style="color:var(--t1);font-size:12px">'+esc(f.deviceId?f.deviceId.substr(0,8)+'…':'—')+'</td>'+
          '<td style="color:var(--t1);font-size:12px">'+timeAgo(f.flaggedAt)+'</td>'+
          '<td><span class="badge badge-'+(sc[f.status]||'active')+'">'+f.status+'</span></td>'+
          '<td><button class="action-btn" onclick="openFraudModal(\''+f.id+'\')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></td></tr>';
      }).join('');
    }
    updateNavCounts();
  }

  window.openFraudModal = function(id) {
    var f=(lsGet(FRAUD_KEY)||[]).find(function(x){return x.id===id;}); if(!f)return; activeFraud=f;
    var det=document.getElementById('fraudDetail');
    if(det)det.innerHTML='<div class="fraud-detail-grid"><div class="di-item"><p class="di-label">User</p><p class="di-value">@'+esc(f.username)+'</p></div><div class="di-item"><p class="di-label">Risk Score</p><p class="di-value">'+f.riskScore+'/100</p></div><div class="di-item"><p class="di-label">Device ID</p><p class="di-value" style="font-size:11px">'+esc(f.deviceId||'—')+'</p></div><div class="di-item"><p class="di-label">Flags</p><p class="di-value">'+(f.flags||[]).join(', ')+'</p></div><div class="di-item" style="grid-column:span 2"><p class="di-label" style="color:var(--orange)">⚠️ Risk signal only — final action requires your review</p></div></div>';
    var n=document.getElementById('fraudNote'); if(n)n.value=f.investigationNotes||'';
    var a=document.getElementById('fraudAction'); if(a)a.value='investigating';
    document.getElementById('fraudModal').classList.remove('hidden');
  };

  function initAntifraudSection() {
    ['closeFraudModal','cancelFraudModal'].forEach(function(id){var el=document.getElementById(id);if(el)el.onclick=function(){document.getElementById('fraudModal').classList.add('hidden');};});
    var saveBtn=document.getElementById('saveFraudActionBtn');
    if(saveBtn)saveBtn.onclick=function(){
      if(!activeFraud)return;
      var note=(document.getElementById('fraudNote')||{}).value.trim();
      var action=(document.getElementById('fraudAction')||{}).value;
      var sess=lsGet(SESSION_KEY);
      var fraud=lsGet(FRAUD_KEY)||[]; var idx=fraud.findIndex(function(f){return f.id===activeFraud.id;});
      if(idx>=0){fraud[idx].status=action==='banned'?'banned':action==='cleared'?'cleared':'investigating';fraud[idx].investigationNotes=note;fraud[idx].reviewedBy=(sess||{}).email;lsSet(FRAUD_KEY,fraud);
        if(action==='banned'){var users=lsGet(USERS_KEY)||[];var uidx=users.findIndex(function(u){return u.username===activeFraud.username;});if(uidx>=0){users[uidx].status='banned';lsSet(USERS_KEY,users);}}
        logAudit('FRAUD_ACTION',(sess||{}).email,(sess||{}).role,'Action "'+action+'" on @'+activeFraud.username,true);}
      document.getElementById('fraudModal').classList.add('hidden'); renderAntifraud(); showToast('Action saved: '+action,'success');
    };
    var sf=document.getElementById('fraudStatusFilter'); if(sf)sf.addEventListener('change',renderAntifraud);
    var scanBtn=document.getElementById('runFraudScanBtn');
    if(scanBtn)scanBtn.onclick=function(){
      var users=lsGet(USERS_KEY)||[]; var fraud=lsGet(FRAUD_KEY)||[]; var flagged=0;
      users.forEach(function(u){
        if(!fraud.find(function(f){return f.username===u.username;})){
          var flags=[],score=0;
          if(!u.email){flags.push('missing_email');score+=15;}
          if(!u.mobile){flags.push('missing_mobile');score+=15;}
          if(score>=20){fraud.push({id:'FRD-'+Date.now()+Math.random(),username:u.username,name:u.name,riskScore:score,flags:flags,deviceId:'DEV-'+Math.random().toString(36).substr(2,12),status:'flagged',flaggedAt:Date.now(),investigationNotes:''});flagged++;}
        }
      });
      lsSet(FRAUD_KEY,fraud); renderAntifraud(); updateNavCounts();
      showToast('Scan complete. '+flagged+' account(s) flagged.',flagged>0?'error':'success');
    };
  }

  /* ─────────────────────────────────────────
     ADMIN MANAGEMENT
  ───────────────────────────────────────── */
  function renderAdminMgmt() {
    var accounts=getAdminAccounts(); var tbody=document.getElementById('adminMgmtBody'); if(!tbody)return;
    var sess=lsGet(SESSION_KEY)||{}; var rc={super_admin:'chip-super',admin:'chip-admin',moderator:'chip-mod'};
    tbody.innerHTML=accounts.map(function(a,i){
      var isSelf=a.email===sess.email;
      return '<tr><td style="color:var(--t1)">'+(i+1)+'</td>'+
        '<td style="font-weight:600">'+esc(a.name)+(isSelf?' <span style="color:var(--green);font-size:11px">(You)</span>':'')+'</td>'+
        '<td style="color:var(--t1)">'+esc(a.email)+'</td>'+
        '<td><span class="role-chip '+(rc[a.role]||'chip-admin')+'">'+esc(a.role)+'</span></td>'+
        '<td>'+(a.twoFA?'<span style="color:var(--green)">✓ On</span>':'<span style="color:var(--red)">✗ Off</span>')+'</td>'+
        '<td style="color:var(--t1);font-size:12px">'+formatDate(a.lastLogin)+'</td>'+
        '<td><span class="badge badge-'+(a.disabled?'banned':'active')+'">'+(a.disabled?'Disabled':'Active')+'</span></td>'+
        '<td>'+((!isSelf&&a.role!=='super_admin')?'<button class="action-btn danger" onclick="toggleAdminAccount(\''+a.email+'\')" title="Toggle"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>':'')+'</td></tr>';
    }).join('');
  }

  window.toggleAdminAccount = function(email) {
    var sess=lsGet(SESSION_KEY)||{}; if(sess.role!=='super_admin'){showToast('Only Super Admin can do this','error');return;}
    confirmDangerAction('Toggle admin account: '+email+'?',function(){
      var accounts=getAdminAccounts(); var idx=accounts.findIndex(function(a){return a.email===email;});
      if(idx>=0){accounts[idx].disabled=!accounts[idx].disabled;lsSet(ACCOUNTS_KEY,accounts);}
      logAudit('ADMIN_TOGGLED',sess.email,sess.role,'Toggled: '+email,true); renderAdminMgmt(); showToast('Account updated','success');
    });
  };

  function initAdminMgmtSection() {
    var sess=lsGet(SESSION_KEY)||{};
    var createBtn=document.getElementById('createAdminBtn'),modal=document.getElementById('createAdminModal');
    if(sess.role!=='super_admin'&&createBtn){createBtn.style.display='none';}
    if(createBtn)createBtn.onclick=function(){modal.classList.remove('hidden');};
    ['closeCreateAdminModal','cancelCreateAdminModal'].forEach(function(id){var el=document.getElementById(id);if(el)el.onclick=function(){modal.classList.add('hidden');};});
    var saveBtn=document.getElementById('saveNewAdminBtn');
    if(saveBtn)saveBtn.onclick=function(){
      var name=(document.getElementById('newAdminName')||{}).value.trim();
      var email=(document.getElementById('newAdminEmail')||{}).value.trim().toLowerCase();
      var pass=(document.getElementById('newAdminPass')||{}).value;
      var role=(document.getElementById('newAdminRole')||{}).value;
      var twoFA=(document.getElementById('newAdminTwoFA')||{}).value==='true';
      if(!name||!email||!pass){showToast('All fields required','error');return;}
      if(pass.length<6){showToast('Password min 6 chars','error');return;}
      var accounts=getAdminAccounts();
      if(accounts.find(function(a){return a.email===email;})){showToast('Email already exists','error');return;}
      accounts.push({email:email,password:pass,name:name,role:role,twoFA:twoFA,createdAt:Date.now()});
      lsSet(ACCOUNTS_KEY,accounts);
      logAudit('ADMIN_CREATED',(lsGet(SESSION_KEY)||{}).email,(lsGet(SESSION_KEY)||{}).role,'Created: '+email+' ('+role+')',true);
      modal.classList.add('hidden'); renderAdminMgmt(); showToast('Admin created ✅','success');
    };
  }

  window.renderAuditLogs = renderAuditLogs;

  /* ─────────────────────────────────────────
     INIT
  ───────────────────────────────────────── */
  initAdminLogin();
  checkAdminSession();

}());
