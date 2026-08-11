/* ========================================================================
   Term Schedule Builder — Application Logic
   Horizontal timeline layout with Day → Level → Program grouping
   Realtime Multi-Device Cloud Synchronization powered by Firebase
   ======================================================================== */

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SLOT_MINUTES = 15; // 15-minute time slots
const DEFAULT_START = 9 * 60;  // 9:00 AM in minutes
const DEFAULT_END = 16 * 60; // 4:00 PM in minutes

// Program definitions with colors (light mode)
const PROGRAMS = [
  { id: 'general',    name: 'General',                            color: '#475569', bg: '#f1f5f9', textColor: '#334155' },
  { id: 'biotech',    name: 'Molecular Biotechnology',            color: '#15803d', bg: '#dcfce7', textColor: '#14532d' },
  { id: 'chemistry',  name: 'Industrial Chemistry',               color: '#d97706', bg: '#fef3c7', textColor: '#78350f' },
  { id: 'renewable',  name: 'Sustainable and Renewable Energy',   color: '#1d4ed8', bg: '#dbeafe', textColor: '#1e3a8a' },
  { id: 'engineering',name: 'Engineering',                        color: '#7e22ce', bg: '#f3e8ff', textColor: '#581c87' },
];

const DAY_COLORS = {
  'Saturday':  { bg: '#c6d9f1', textColor: '#1f4e78', accent: '#1f4e78' },
  'Sunday':    { bg: '#c6d9f1', textColor: '#1f4e78', accent: '#1f4e78' },
  'Monday':    { bg: '#c6d9f1', textColor: '#1f4e78', accent: '#1f4e78' },
  'Tuesday':   { bg: '#c6d9f1', textColor: '#1f4e78', accent: '#1f4e78' },
  'Wednesday': { bg: '#c6d9f1', textColor: '#1f4e78', accent: '#1f4e78' },
  'Thursday':  { bg: '#c6d9f1', textColor: '#1f4e78', accent: '#1f4e78' },
  'Friday':    { bg: '#c6d9f1', textColor: '#1f4e78', accent: '#1f4e78' }
};

// ─── Firebase Realtime Multi-Device Sync Engine ──────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAPrfR-hG-5CeZiD0EIz_P1r93ywZbxcjc",
  authDomain: "chompchem.firebaseapp.com",
  projectId: "chompchem",
  storageBucket: "chompchem.firebasestorage.app",
  messagingSenderId: "379599502348",
  appId: "1:379599502348:web:d1be32d868ac2a813f0229",
  measurementId: "G-NWEXYL1PQ0",
  databaseURL: "https://chompchem-default-rtdb.firebaseio.com"
};

let db = null;
let isRemoteSyncUpdate = false;

function initFirebase() {
  if (typeof firebase !== 'undefined') {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.database();

      // Automatically handle Firebase Auth State changes (Google Sign-In & sessions)
      if (firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
          if (user && user.email) {
            console.log("Firebase Auth State Changed:", user.email);
            processGoogleUserAuth(user.email, user.displayName || user.email);
          }
        });

        firebase.auth().getRedirectResult().then((result) => {
          if (result && result.user) {
            processGoogleUserAuth(result.user.email, result.user.displayName || result.user.email);
          }
        }).catch((err) => {
          console.warn("Google Auth redirect result notice:", err);
        });
      }

      setupRealtimeSyncListeners();
    } catch(e) {
      console.warn("Firebase Realtime Sync Notice:", e);
    }
  }
}

function setupRealtimeSyncListeners() {
  if (!db) return;

  // 1. Realtime Timetable Schedule Sync across devices
  db.ref('term_schedule/scheduleData').on('value', (snapshot) => {
    const val = snapshot.val();
    if (val && Array.isArray(val)) {
      isRemoteSyncUpdate = true;
      scheduleData = val;
      localStorage.setItem('termScheduleData', JSON.stringify(scheduleData));
      renderGrid();
      updateStats();
      isRemoteSyncUpdate = false;
    }
  });

  // 2. Realtime Registered Users Sync across devices
  db.ref('term_schedule/users').on('value', (snapshot) => {
    const val = snapshot.val();
    if (val && Array.isArray(val)) {
      localStorage.setItem('term_sched_users', JSON.stringify(val));
      
      if (currentUser) {
        const selfInDb = val.find(u => u.username && u.username.toLowerCase() === currentUser.username.toLowerCase());
        if (selfInDb) {
          currentUser.approved = selfInDb.approved;
          currentUser.role = selfInDb.role;
          localStorage.setItem('term_sched_current_user', JSON.stringify(currentUser));
        }
      }
      updateAuthHeaderUI();

      const adminModal = document.getElementById('modal-admin-users');
      if (adminModal && adminModal.classList.contains('active')) {
        renderAdminUsersTable();
      }
    }
  });

  // 3. Realtime Activity Audit Logs Sync across devices
  db.ref('term_schedule/activityLogs').on('value', (snapshot) => {
    const val = snapshot.val();
    if (val && Array.isArray(val)) {
      localStorage.setItem('term_sched_activity_logs', JSON.stringify(val));
      const logModal = document.getElementById('modal-activity-log');
      if (logModal && logModal.classList.contains('active')) {
        renderActivityLogs();
      }
    }
  });
}

function syncUsersToFirebase(users) {
  localStorage.setItem('term_sched_users', JSON.stringify(users));
  if (db) {
    db.ref('term_schedule/users').set(users);
  }
}

// ─── User Accounts & Auth Engine ─────────────────────────────────────────────
let currentUser = null;
let currentAuthTab = 'signin';

const SUPER_ADMIN_EMAIL = 'abdullah.amr.makky@gmail.com';
const SUPER_ADMIN = {
  username: 'abdullah',
  email: SUPER_ADMIN_EMAIL,
  name: 'Abdullah Amr Maged',
  password: 'H2CO3NaOH#',
  role: 'Super Admin',
  approved: true
};

function initAuth() {
  let users = JSON.parse(localStorage.getItem('term_sched_users') || '[]');
  
  // Filter out any legacy admin accounts
  users = users.filter(u => u.email !== 'abdullahamr871@aiu.edu.eg' && u.username !== 'abdullahamr871');

  // Ensure Super Admin exists in users list
  const adminIdx = users.findIndex(u => u.email && u.email.toLowerCase() === SUPER_ADMIN_EMAIL);
  if (adminIdx === -1) {
    users.unshift(SUPER_ADMIN);
  } else {
    users[adminIdx] = { ...SUPER_ADMIN, ...users[adminIdx], approved: true, password: 'H2CO3NaOH#' };
  }
  syncUsersToFirebase(users);

  const savedUser = localStorage.getItem('term_sched_current_user');
  if (savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      const dbUser = users.find(u => u.email && u.email.toLowerCase() === parsed.email.toLowerCase());
      if (dbUser && dbUser.approved) {
        currentUser = { name: dbUser.name, username: dbUser.username, email: dbUser.email, role: dbUser.role, approved: true };
      } else {
        currentUser = null;
        localStorage.removeItem('term_sched_current_user');
      }
    } catch(e) {
      currentUser = null;
    }
  } else {
    currentUser = null; // Do NOT auto-login as admin unless manually signed in!
  }

  updateAuthHeaderUI();
}

function getCurrentUser() {
  return currentUser;
}

function requireAuth(actionLabel = 'make changes') {
  if (!currentUser) {
    showToast(`🔐 Authentication required to ${actionLabel}. Please sign in.`, 'error');
    openAuthModal('signin');
    return false;
  }
  if (!currentUser.approved) {
    showToast(`⏳ Account Pending Approval. Contact Admin (${SUPER_ADMIN_EMAIL}) to approve your account.`, 'error');
    return false;
  }
  return true;
}

function updateAuthHeaderUI() {
  const container = document.getElementById('auth-header-container');
  const appEl = document.querySelector('.app');
  const btnCloseAuth = document.getElementById('btn-close-auth');
  const users = JSON.parse(localStorage.getItem('term_sched_users') || '[]');
  const pendingCount = users.filter(u => !u.approved).length;

  if (currentUser) {
    // UNLOCK PAGE CONTENT & CLOSE AUTH MODAL
    if (appEl) appEl.classList.remove('page-locked');
    if (btnCloseAuth) btnCloseAuth.style.display = 'block';
    const authModal = document.getElementById('modal-auth');
    if (authModal) authModal.classList.remove('active');
    document.body.style.overflow = '';

    const isAdmin = currentUser.email && currentUser.email.toLowerCase() === SUPER_ADMIN_EMAIL;
    const adminBtn = isAdmin ? `
      <button class="btn btn-xs btn-warning" onclick="openAdminUsersModal()" style="font-size:0.7rem; padding:2px 8px;" title="Manage user accounts & approvals">
        👑 Accounts ${pendingCount > 0 ? `<span style="background:#ef4444; color:#fff; padding:1px 5px; border-radius:10px; font-weight:800;">${pendingCount}</span>` : ''}
      </button>
    ` : '';

    if (container) {
      container.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; background:#f1f5f9; padding:4px 10px; border-radius:20px; border:1px solid #cbd5e1; font-size:0.75rem;">
          <span style="font-weight:800; color:#1e293b;">👤 ${currentUser.name}</span>
          <span style="font-size:0.65rem; background:#dbeafe; color:#1e3a8a; padding:1px 6px; border-radius:10px; font-weight:700;">${currentUser.role || 'User'}</span>
          ${adminBtn}
          <button onclick="signOutUser()" style="background:none; border:none; color:#ef4444; font-weight:700; cursor:pointer; font-size:0.75rem; margin-left:2px;" title="Sign Out">✕</button>
        </div>
      `;
    }
  } else {
    // LOCK PAGE CONTENT & FORCE SIGN IN
    if (appEl) appEl.classList.add('page-locked');
    if (btnCloseAuth) btnCloseAuth.style.display = 'none';

    if (container) {
      container.innerHTML = `
        <button class="btn btn-primary btn-sm" onclick="openAuthModal('signin')" style="font-size:0.75rem; font-weight:700;">
          <span>🔐</span> Sign In
        </button>
      `;
    }
    openAuthModal('signin');
  }

  // Update header buttons visual disabled state if signed out
  const actionButtons = ['btn-import', 'btn-export', 'btn-export-visual', 'btn-activity-log', 'btn-add', 'btn-clear'];
  actionButtons.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      if (!currentUser) {
        btn.style.opacity = '0.7';
        btn.title = '🔐 Sign In required to use this action';
      } else {
        btn.style.opacity = '1';
      }
    }
  });
}

function openAuthModal(tab = 'signin') {
  switchAuthTab(tab);
  openModal('modal-auth');
}

function switchAuthTab(tab) {
  currentAuthTab = tab;
  const isRegister = tab === 'register';
  const tabSignin = document.getElementById('auth-tab-signin');
  const tabRegister = document.getElementById('auth-tab-register');
  if (tabSignin) tabSignin.classList.toggle('active', !isRegister);
  if (tabRegister) tabRegister.classList.toggle('active', isRegister);
  
  const gName = document.getElementById('auth-group-name');
  const gUser = document.getElementById('auth-group-username');
  const noticeMsg = document.getElementById('auth-notice-msg');

  if (gName) gName.classList.toggle('hidden', !isRegister);
  if (gUser) gUser.classList.toggle('hidden', !isRegister);
  if (noticeMsg) noticeMsg.style.display = isRegister ? 'block' : 'none';

  const emailLabel = document.getElementById('auth-email-label');
  if (emailLabel) emailLabel.textContent = isRegister ? 'Email Address' : 'Username or Email';

  const emailInput = document.getElementById('auth-email');
  if (emailInput) {
    emailInput.placeholder = isRegister ? 'Example@aiu.edu.eg' : 'Salem123 or Example@aiu.edu.eg';
  }

  const modalTitle = document.getElementById('auth-modal-title');
  if (modalTitle) modalTitle.textContent = isRegister ? '📝 Register New Account' : '🔐 Sign In to Schedule Builder';
  const btnSubmit = document.getElementById('btn-auth-submit');
  if (btnSubmit) btnSubmit.textContent = isRegister ? 'Register Account' : 'Sign In';
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const inputEmailOrUser = document.getElementById('auth-email').value.trim().toLowerCase();
  const password = document.getElementById('auth-password').value.trim();

  const users = JSON.parse(localStorage.getItem('term_sched_users') || '[]');

  if (currentAuthTab === 'register') {
    const name = document.getElementById('auth-name').value.trim();
    const username = document.getElementById('auth-username').value.trim().toLowerCase();

    if (!name || !username || !inputEmailOrUser || !password) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    const existing = users.find(u => (u.username && u.username.toLowerCase() === username) || (u.email && u.email.toLowerCase() === inputEmailOrUser));
    if (existing) {
      showToast('An account with this username or email already exists', 'error');
      return;
    }

    const newUser = {
      name,
      username,
      email: inputEmailOrUser,
      role: 'User',
      password,
      approved: false, // REQUIRES ADMIN APPROVAL!
      registeredAt: new Date().toLocaleDateString()
    };
    users.push(newUser);
    syncUsersToFirebase(users);

    logActivity('📝 Registered Account (Pending)', `User ${name} (@${username}) registered`, '👤');
    showToast(`✅ Registration submitted! Account must be approved by Admin (${SUPER_ADMIN_EMAIL}) before signing in.`, 'info');
    closeModal('modal-auth');
    document.getElementById('auth-form').reset();
    updateAuthHeaderUI();
  } else {
    if (!inputEmailOrUser || !password) {
      showToast('Username/Email and password required', 'error');
      return;
    }

    // Check Super Admin credentials
    const cleanInput = inputEmailOrUser.trim().toLowerCase();
    const isAdminAlias = cleanInput === SUPER_ADMIN_EMAIL || 
                         cleanInput === 'abdullah' || 
                         cleanInput === 'abdullahamr871' || 
                         cleanInput === 'abdullah.amr871' || 
                         cleanInput === 'abdullah.amr' ||
                         cleanInput.includes('abdullahamr') ||
                         cleanInput.includes('abdullah.amr');

    if (isAdminAlias && password === 'H2CO3NaOH#') {
      currentUser = { name: SUPER_ADMIN.name, username: SUPER_ADMIN.username, email: SUPER_ADMIN.email, role: SUPER_ADMIN.role, approved: true };
      localStorage.setItem('term_sched_current_user', JSON.stringify(currentUser));
      logActivity('🔐 Admin Signed In', `Admin ${currentUser.name} signed in`, '👑');
      showToast(`Welcome back Admin, ${currentUser.name}!`, 'success');
      updateAuthHeaderUI();
      closeModal('modal-auth');
      document.getElementById('auth-form').reset();
      setTimeout(() => { window.location.reload(); }, 200);
      return;
    }

    const found = users.find(u => 
      ((u.username && u.username.toLowerCase() === inputEmailOrUser) || (u.email && u.email.toLowerCase() === inputEmailOrUser)) && 
      u.password === password
    );

    if (!found) {
      showToast('Invalid username/email or password', 'error');
      return;
    }

    if (!found.approved) {
      showToast(`⏳ Account Pending Approval. Contact Admin (${SUPER_ADMIN_EMAIL}) to approve your account.`, 'error');
      return;
    }

    currentUser = { name: found.name, username: found.username, email: found.email, role: found.role, approved: true };
    localStorage.setItem('term_sched_current_user', JSON.stringify(currentUser));
    logActivity('🔐 Signed In', `User ${currentUser.name} (@${currentUser.username}) signed in`, '🔐');
    showToast(`Signed in as ${currentUser.name}`, 'success');

    updateAuthHeaderUI();
    closeModal('modal-auth');
    document.getElementById('auth-form').reset();
    setTimeout(() => { window.location.reload(); }, 200);
  }
}

function signOutUser() {
  if (currentUser) {
    logActivity('🚪 Signed Out', `User ${currentUser.name} signed out`, '🚪');
  }
  if (typeof firebase !== 'undefined' && firebase.auth) {
    try { firebase.auth().signOut(); } catch(e) {}
  }
  currentUser = null;
  localStorage.removeItem('term_sched_current_user');
  window.location.reload();
}

// ─── Google Account Authentication ───────────────────────────────────────────
function signInWithGoogle() {
  if (typeof firebase !== 'undefined' && firebase.auth) {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');

      firebase.auth().signInWithPopup(provider).then((result) => {
        if (result && result.user) {
          processGoogleUserAuth(result.user.email, result.user.displayName || result.user.email);
        } else {
          promptGoogleAuthFallback();
        }
      }).catch((err) => {
        console.warn("Google Auth popup notice:", err);
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
          showToast('Opening Google Sign-In redirect...', 'info');
          firebase.auth().signInWithRedirect(provider);
        } else {
          promptGoogleAuthFallback();
        }
      });
    } catch(e) {
      console.warn("Google Auth exception:", e);
      promptGoogleAuthFallback();
    }
  } else {
    promptGoogleAuthFallback();
  }
}

function promptGoogleAuthFallback() {
  const email = prompt("🌐 Google Account Sign In\n\nPlease enter your Google email address:");
  if (!email || !email.trim()) return;
  const cleanEmail = email.trim().toLowerCase();
  const namePart = cleanEmail.split('@')[0];
  const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
  processGoogleUserAuth(cleanEmail, displayName);
}

function processGoogleUserAuth(email, displayName) {
  if (!email) return;
  const cleanEmail = email.trim().toLowerCase();
  const username = cleanEmail.split('@')[0] || generateId();
  
  // Super Admin Check (abdullah.amr.makky@gmail.com)
  const isAdminEmail = cleanEmail === SUPER_ADMIN_EMAIL || cleanEmail.includes('abdullah.amr.makky') || cleanEmail.includes('abdullahamr');

  let users = JSON.parse(localStorage.getItem('term_sched_users') || '[]');
  let existing = users.find(u => u.email && u.email.toLowerCase().trim() === cleanEmail);

  if (!existing) {
    existing = {
      name: displayName || username,
      username: username,
      email: cleanEmail,
      role: isAdminEmail ? 'Super Admin' : 'User',
      approved: true, // Google Sign-Ins are automatically approved!
      registeredAt: new Date().toLocaleDateString()
    };
    users.push(existing);
  } else {
    // Force approve & grant Super Admin status if matching Admin email!
    existing.approved = true;
    if (isAdminEmail) {
      existing.role = 'Super Admin';
      existing.name = displayName || 'Abdullah Amr Maged';
    }
  }

  syncUsersToFirebase(users);

  currentUser = {
    name: existing.name || (isAdminEmail ? 'Abdullah Amr Maged' : username),
    username: existing.username || username,
    email: cleanEmail,
    role: isAdminEmail ? 'Super Admin' : (existing.role || 'User'),
    approved: true
  };

  localStorage.setItem('term_sched_current_user', JSON.stringify(currentUser));
  logActivity('🔐 Google Signed In', `User ${currentUser.name} (${cleanEmail}) signed in with Google Account`, '🌐');
  showToast(`Welcome ${currentUser.name}! Signed in as ${currentUser.role}`, 'success');

  updateAuthHeaderUI();
  closeModal('modal-auth');
  const authForm = document.getElementById('auth-form');
  if (authForm) authForm.reset();

  // Automatically refresh website to cleanly open access!
  setTimeout(() => {
    window.location.reload();
  }, 200);
}

// ─── Admin Users Management Panel ────────────────────────────────────────────
function openAdminUsersModal() {
  if (!currentUser || currentUser.email.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    showToast(`Only Super Admin (${SUPER_ADMIN_EMAIL}) can manage accounts`, 'error');
    return;
  }
  renderAdminUsersTable();
  openModal('modal-admin-users');
}

function renderAdminUsersTable() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  const users = JSON.parse(localStorage.getItem('term_sched_users') || '[]');

  tbody.innerHTML = users.map(u => {
    const isSuperAdmin = u.email && u.email.toLowerCase() === SUPER_ADMIN_EMAIL;
    const statusHtml = u.approved
      ? `<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:12px; font-weight:800; font-size:0.7rem;">✅ Approved</span>`
      : `<span style="background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:12px; font-weight:800; font-size:0.7rem;">⏳ Pending Approval</span>`;

    const actionHtml = isSuperAdmin ? `<span style="font-size:0.7rem; color:#64748b; font-weight:700;">(Super Admin)</span>` : `
      <div style="display:flex; gap:4px; justify-content:center;">
        ${!u.approved ? `<button class="btn btn-xs btn-success" onclick="approveUserAccount('${u.username}')" style="font-size:0.68rem; padding:2px 6px;">✅ Approve</button>` : ''}
        <button class="btn btn-xs btn-danger" onclick="deleteUserAccount('${u.username}')" style="font-size:0.68rem; padding:2px 6px;">❌ Delete</button>
      </div>
    `;

    return `
      <tr>
        <td style="font-weight:700; color:#1e293b;">${u.name}</td>
        <td style="font-size:0.75rem; color:#475569;">
          <div style="font-weight:700; color:#0f172a;">@${u.username}</div>
          <div style="font-size:0.68rem; color:#94a3b8;">${u.email}</div>
        </td>
        <td style="font-size:0.75rem; color:#334155; font-weight:600;">${u.role || 'User'}</td>
        <td>${statusHtml}</td>
        <td style="text-align:center;">${actionHtml}</td>
      </tr>
    `;
  }).join('');
}

function approveUserAccount(username) {
  let users = JSON.parse(localStorage.getItem('term_sched_users') || '[]');
  const u = users.find(x => x.username && x.username.toLowerCase() === username.toLowerCase());
  if (u) {
    u.approved = true;
    syncUsersToFirebase(users);
    logActivity('✅ Account Approved', `Admin approved account for ${u.name} (@${u.username})`, '👑');
    showToast(`Approved account for ${u.name}!`, 'success');
    renderAdminUsersTable();
    updateAuthHeaderUI();
  }
}

function deleteUserAccount(username) {
  let users = JSON.parse(localStorage.getItem('term_sched_users') || '[]');
  const target = users.find(x => x.username && x.username.toLowerCase() === username.toLowerCase());
  if (target && target.email && target.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
    showToast('Cannot delete Super Admin account', 'error');
    return;
  }
  showConfirm(`Delete account for @${username}?`, () => {
    users = users.filter(x => x.username && x.username.toLowerCase() !== username.toLowerCase());
    syncUsersToFirebase(users);
    logActivity('❌ Account Deleted', `Admin deleted account @${username}`, '👑');
    showToast(`Account @${username} deleted`, 'info');
    renderAdminUsersTable();
    updateAuthHeaderUI();
  });
}

// ─── Activity Audit Log System ───────────────────────────────────────────────
function logActivity(action, details, icon = '📝') {
  const user = getCurrentUser();
  const logs = JSON.parse(localStorage.getItem('term_sched_activity_logs') || '[]');
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + now.toLocaleDateString() + ')';
  
  const logEntry = {
    id: generateId(),
    time: timeStr,
    userName: user ? user.name : 'Guest User',
    userEmail: user ? user.email : 'guest',
    action,
    details,
    icon
  };

  logs.unshift(logEntry);
  if (logs.length > 200) logs.pop();
  localStorage.setItem('term_sched_activity_logs', JSON.stringify(logs));
  if (db && !isRemoteSyncUpdate) {
    db.ref('term_schedule/activityLogs').set(logs);
  }
}

function openActivityLogModal() {
  renderActivityLogs();
  openModal('modal-activity-log');
}

function renderActivityLogs() {
  const tbody = document.getElementById('activity-log-tbody');
  const countLabel = document.getElementById('activity-count-label');
  if (!tbody) return;

  const logs = JSON.parse(localStorage.getItem('term_sched_activity_logs') || '[]');
  if (countLabel) countLabel.textContent = `${logs.length} activity log(s) recorded`;

  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; color:#94a3b8; padding:24px;">No activity logs recorded yet. Any schedule changes will appear here.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logs.map(log => `
    <tr>
      <td style="font-size:0.72rem; color:#64748b; font-weight:600;">${log.time}</td>
      <td style="font-weight:700; color:#1e293b;">
        <div>${log.userName}</div>
        <div style="font-size:0.65rem; color:#94a3b8; font-weight:500;">${log.userEmail}</div>
      </td>
      <td style="font-weight:700; font-size:0.75rem;">${log.icon || '📝'} ${log.action}</td>
      <td style="font-size:0.75rem; color:#334155;">${log.details}</td>
    </tr>
  `).join('');
}

function clearActivityLogs() {
  showConfirm('Clear all user activity logs?', () => {
    localStorage.removeItem('term_sched_activity_logs');
    renderActivityLogs();
    showToast('Activity logs cleared', 'success');
  });
}

// ─── Color Customization Helpers ─────────────────────────────────────────────
function adjustColorBrightness(hex, percent) {
  if (!hex || hex[0] !== '#') return hex;
  let num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00FF) + percent;
  let b = (num & 0x0000FF) + percent;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function changeEntryColor(id, hex) {
  const entry = scheduleData.find(e => e.id === id);
  if (entry) {
    entry.customColor = hex;
    saveData();
    renderGrid();
    logActivity('🎨 Changed Block Color', `${entry.courseCode} custom color updated to ${hex}`, '🎨');
    showToast('Custom block color updated', 'success');
  }
}

function resetEntryColor(id) {
  const entry = scheduleData.find(e => e.id === id);
  if (entry) {
    delete entry.customColor;
    saveData();
    renderGrid();
    closeEntryPopup();
    logActivity('🎨 Reset Block Color', `${entry.courseCode} color reset to default`, '🎨');
    showToast('Entry color reset to default', 'success');
  }
}

function getProgramById(id) {
  return PROGRAMS.find(p => p.id === id) || PROGRAMS[0];
}

// ─── State ────────────────────────────────────────────────────────────────────
let scheduleData = [];
let currentEditId = null;
let pendingImportData = [];
let confirmCallback = null;
let activePopup = null;

// ─── Utility ──────────────────────────────────────────────────────────────────
function generateId() {
  return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ─── Component Parser ────────────────────────────────────────────────────────
function parseComponent(component) {
  if (!component) return { type: 'lecture', group: '', label: 'Unknown', code: '' };
  const str = component.trim().toUpperCase();
  const match = str.match(/^([LB])(\d+)S$/);
  if (!match) return { type: 'lecture', group: '', label: component, code: component };

  const [, typeChar, numStr] = match;
  const num = parseInt(numStr);

  if (typeChar === 'L') {
    return { type: 'lecture', group: num, label: `Lecture Group ${num}`, code: str };
  } else {
    const groupNum = Math.ceil(num / 2);
    const subGroup = num % 2 === 1 ? 'A' : 'B';
    return { type: 'lab', group: `${groupNum}${subGroup}`, label: `Lab/Tutorial Group ${groupNum}${subGroup}`, code: str };
  }
}

function buildComponentCode(type, lectureGroup, parentGroup, subGroup) {
  if (type === 'lecture') return `L${lectureGroup}S`;
  const n = (parentGroup - 1) * 2 + (subGroup === 'A' ? 1 : 2);
  return `B${n}S`;
}

function getComponentLabel(type, code) {
  const parsed = parseComponent(code);
  if (type === 'tutorial' && parsed.type === 'lab') return parsed.label.replace('Lab/Tutorial', 'Tutorial');
  if (type === 'lab' && parsed.type === 'lab') return parsed.label.replace('Lab/Tutorial', 'Lab');
  return parsed.label;
}

// ─── Time Utilities ──────────────────────────────────────────────────────────
function parseTimeString(str) {
  if (!str) return null;
  str = str.trim();
  const match12 = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1]);
    const minutes = parseInt(match12[2]);
    const period = match12[4].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const match24 = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24) return parseInt(match24[1]) * 60 + parseInt(match24[2]);
  return null;
}

function minutesToTimeString(mins) {
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function minutesTo24h(mins) {
  return Math.floor(mins / 60).toString().padStart(2, '0') + ':' + (mins % 60).toString().padStart(2, '0');
}

function time24ToMinutes(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function formatSlotLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${dh}:${m.toString().padStart(2, '0')} ${period}`;
}

// ─── Compute Time Range ──────────────────────────────────────────────────────
function getTimeRange() {
  let minStart = DEFAULT_START;
  let maxEnd = DEFAULT_END;
  scheduleData.forEach(e => {
    if (e.startMinutes < minStart) minStart = e.startMinutes;
    if (e.endMinutes > maxEnd) maxEnd = e.endMinutes;
  });
  minStart = Math.floor(minStart / 60) * 60;
  maxEnd = Math.ceil(maxEnd / 60) * 60;
  if (maxEnd < 16 * 60) maxEnd = 16 * 60;
  return { start: minStart, end: maxEnd };
}

function generateTimeSlots(start, end) {
  const slots = [];
  for (let m = start; m < end; m += SLOT_MINUTES) {
    slots.push({ start: m, end: m + SLOT_MINUTES });
  }
  return slots;
}

// ─── Group entries by Day → Level → Program ──────────────────────────────────
function groupByLevelProgram(entries) {
  const map = {};
  entries.forEach(e => {
    const key = `${e.level || 0}_${e.program || 'general'}`;
    if (!map[key]) {
      map[key] = {
        level: parseInt(e.level) || 0,
        program: e.program || 'general',
        entries: []
      };
    }
    map[key].entries.push(e);
  });

  const progOrder = PROGRAMS.map(p => p.id);
  return Object.values(map).sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return progOrder.indexOf(a.program) - progOrder.indexOf(b.program);
  });
}

// ─── Group Parsing Helper ───────────────────────────────────────────────────
function getExactGroupIdentifier(componentStr) {
  if (!componentStr) return null;
  const p = parseComponent(componentStr);
  if (p.type === 'lecture') {
    const match = componentStr.match(/L(\d+)S/i) || componentStr.match(/Group\s*(\d+)/i) || componentStr.match(/\d+/);
    return match ? { parent: parseInt(match[1]), sub: null } : null;
  } else {
    const bMatch = componentStr.match(/B(\d+)S/i);
    if (bMatch) {
      const n = parseInt(bMatch[1]);
      const parent = Math.ceil(n / 2);
      const sub = n % 2 === 1 ? 'A' : 'B';
      return { parent, sub };
    }
    const groupMatch = componentStr.match(/Group\s*(\d+)([AB])?/i);
    if (groupMatch) {
      const parent = parseInt(groupMatch[1]);
      const sub = groupMatch[2] ? groupMatch[2].toUpperCase() : null;
      return { parent, sub };
    }
    const numMatch = componentStr.match(/\d+/);
    if (numMatch) {
      const n = parseInt(numMatch[0]);
      return { parent: Math.ceil(n / 2), sub: n % 2 === 1 ? 'A' : 'B' };
    }
    return null;
  }
}

// ─── Conflict Detection Engine ───────────────────────────────────────────────
function getConflictsForEntry(entry, allEntries) {
  const conflicts = [];
  if (!entry || !allEntries) return conflicts;

  const g1 = getExactGroupIdentifier(entry.component);

  allEntries.forEach(other => {
    if (other.id === entry.id) return;
    if (!other.day || !entry.day) return;
    if (other.day.toLowerCase() !== entry.day.toLowerCase()) return;

    // Time overlap check
    const timeOverlap = other.startMinutes < entry.endMinutes && entry.startMinutes < other.endMinutes;
    if (!timeOverlap) return;

    // 1. Room Double-Booking Conflict (Same Room across ALL Levels and ALL Programs)
    const getRooms = (facStr) => (facStr || '').split('/').map(r => r.trim().toLowerCase()).filter(Boolean);
    const rooms1 = getRooms(entry.facilityId);
    const rooms2 = getRooms(other.facilityId);
    const conflictRoom = rooms1.find(r => rooms2.includes(r));
    if (conflictRoom) {
      conflicts.push({
        type: 'room',
        other,
        message: `Room Double-Booked: Facility "${conflictRoom.toUpperCase()}" is also used by ${other.courseCode} (${other.component})`
      });
    }

    // 2. Student Group Schedule Conflict (Same Level & Same Program & Same Student Group)
    const prog1 = (entry.program || 'general').toLowerCase();
    const prog2 = (other.program || 'general').toLowerCase();

    if (String(entry.level) === String(other.level) && prog1 === prog2) {
      const g2 = getExactGroupIdentifier(other.component);
      if (g1 && g2) {
        let isGroupConflict = false;
        if (g1.sub && g2.sub) {
          if (g1.parent === g2.parent && g1.sub === g2.sub) {
            isGroupConflict = true;
          }
        } else if (!g1.sub && !g2.sub) {
          if (g1.parent === g2.parent) {
            isGroupConflict = true;
          }
        } else {
          if (g1.parent === g2.parent) {
            isGroupConflict = true;
          }
        }

        if (isGroupConflict) {
          conflicts.push({
            type: 'group',
            other,
            message: `Student Group Conflict: Group ${g1.parent}${g1.sub || ''} is already scheduled for ${other.courseCode} (${other.component})`
          });
        }
      }
    }

    // 3. Instructor Double-Booking Conflict (Same Instructor scheduled in multiple classes at same time)
    const normalizeInstName = (str) => {
      if (!str) return '';
      let clean = str.trim().toLowerCase();
      // Remove common Arabic & English academic titles (د., م., Dr., Eng., Prof., etc.)
      clean = clean.replace(/^(د\.|م\.|dr\.|eng\.|prof\.|أ\.د\.|م\.د\.)\s*/i, '').trim();
      return clean;
    };

    const getInstructors = (instStr) => {
      if (!instStr) return [];
      return instStr.split('+').map(i => normalizeInstName(i)).filter(Boolean);
    };

    const insts1 = getInstructors(entry.instructor);
    const insts2 = getInstructors(other.instructor);
    const conflictInst = insts1.find(i => insts2.includes(i));
    if (conflictInst) {
      conflicts.push({
        type: 'instructor',
        other,
        message: `Instructor Double-Booked: Instructor "${conflictInst}" is also teaching ${other.courseCode} (${other.component})`
      });
    }
  });

  return conflicts;
}

// ─── Parallel Sub-Row Track Packager ─────────────────────────────────────────
function packEntriesIntoSubRows(entries, timeStart, slots) {
  const subRows = [];
  const sorted = [...entries].sort((a, b) => a.startMinutes - b.startMinutes || (b.endMinutes - a.endMinutes));

  sorted.forEach(entry => {
    const startIdx = Math.max(0, Math.floor((entry.startMinutes - timeStart) / SLOT_MINUTES));
    const endIdx = Math.min(slots.length, Math.ceil((entry.endMinutes - timeStart) / SLOT_MINUTES));

    let placed = false;
    for (let r = 0; r < subRows.length; r++) {
      const slotMap = subRows[r];
      let fits = true;
      for (let i = startIdx; i < endIdx; i++) {
        if (slotMap[i] !== null) {
          fits = false;
          break;
        }
      }
      if (fits) {
        for (let i = startIdx; i < endIdx; i++) {
          slotMap[i] = entry;
        }
        placed = true;
        break;
      }
    }

    if (!placed) {
      const newSlotMap = new Array(slots.length).fill(null);
      for (let i = startIdx; i < endIdx; i++) {
        newSlotMap[i] = entry;
      }
      subRows.push(newSlotMap);
    }
  });

  return subRows.length > 0 ? subRows : [new Array(slots.length).fill(null)];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE TABLE RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function renderGrid() {
  const container = document.getElementById('schedule-grid');
  container.innerHTML = '';

  const { start: timeStart, end: timeEnd } = getTimeRange();
  const slots = generateTimeSlots(timeStart, timeEnd);

  const table = document.createElement('table');
  table.className = 'sched-table';

  // Build thead
  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');

  const thDay = document.createElement('th');
  thDay.className = 'sched-th-day';
  thDay.textContent = 'DAY';
  trHead.appendChild(thDay);

  const thLevel = document.createElement('th');
  thLevel.className = 'sched-th-level';
  thLevel.textContent = 'LEVEL';
  trHead.appendChild(thLevel);

  slots.forEach((slot) => {
    const th = document.createElement('th');
    th.className = 'sched-th-time';
    if (slot.start % 60 === 0) th.classList.add('on-hour');
    th.textContent = formatSlotLabel(slot.start);
    trHead.appendChild(th);
  });

  const thEnd = document.createElement('th');
  thEnd.className = 'sched-th-time sched-th-end on-hour';
  thEnd.textContent = formatSlotLabel(timeEnd);
  trHead.appendChild(thEnd);

  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  DAYS.forEach(day => {
    const dayEntries = scheduleData.filter(e => e.day && e.day.toLowerCase() === day.toLowerCase());
    const groups = groupByLevelProgram(dayEntries);

    const groupSubRowsMap = groups.map(group => ({
      group,
      subRows: packEntriesIntoSubRows(group.entries, timeStart, slots)
    }));

    const totalDaySubRows = groupSubRowsMap.reduce((sum, item) => sum + item.subRows.length, 0);

    if (groups.length === 0) {
      // Show empty day row
      const tr = document.createElement('tr');
      tr.className = 'sched-row day-last';

      const dayColor = DAY_COLORS[day] || DAY_COLORS['Saturday'];
      const tdDay = document.createElement('td');
      tdDay.className = 'sched-day';
      tdDay.rowSpan = 1;
      tdDay.style.cssText = `background-color: ${dayColor.bg} !important; color: ${dayColor.textColor} !important; border-left: 4px solid ${dayColor.accent};`;
      tdDay.textContent = day.substring(0, 3);
      tr.appendChild(tdDay);

      const tdLevel = document.createElement('td');
      tdLevel.className = 'sched-level';
      tdLevel.innerHTML = '<span style="color:var(--text-muted);font-size:0.62rem;">—</span>';
      tr.appendChild(tdLevel);

      slots.forEach((slot) => {
        const td = document.createElement('td');
        td.className = 'sched-empty';
        if (slot.start % 60 === 0) td.classList.add('on-hour');
        tr.appendChild(td);
      });
      const tdEnd = document.createElement('td');
      tdEnd.className = 'sched-end-cell';
      tr.appendChild(tdEnd);

      tbody.appendChild(tr);
    } else {
      let isFirstDayRow = true;

      groupSubRowsMap.forEach(({ group, subRows }, gIdx) => {
        const prog = getProgramById(group.program);

        subRows.forEach((slotMap, sIdx) => {
          const tr = document.createElement('tr');
          tr.className = 'sched-row';

          const isLastSubRowInGroup = sIdx === subRows.length - 1;
          const isLastGroupInDay = gIdx === groupSubRowsMap.length - 1;

          if (isLastGroupInDay && isLastSubRowInGroup) {
            tr.classList.add('day-last');
          }

          // Day cell (very first subRow of the day)
          if (isFirstDayRow) {
            const dayColor = DAY_COLORS[day] || DAY_COLORS['Saturday'];
            const tdDay = document.createElement('td');
            tdDay.className = 'sched-day';
            tdDay.rowSpan = totalDaySubRows;
            tdDay.style.cssText = `background-color: ${dayColor.bg} !important; color: ${dayColor.textColor} !important; border-left: 4px solid ${dayColor.accent};`;
            tdDay.textContent = day.substring(0, 3);
            tr.appendChild(tdDay);
            isFirstDayRow = false;
          }

          // Level cell (first subRow of this group)
          if (sIdx === 0) {
            const tdLevel = document.createElement('td');
            tdLevel.className = 'sched-level';
            tdLevel.rowSpan = subRows.length;
            tdLevel.style.cssText = `background-color: ${prog.bg} !important; border-left: 3px solid ${prog.color}; border-right: 2px solid #cbd5e1; vertical-align: middle; text-align: center; padding: 4px 6px;`;

            let levelInner = `<div style="font-weight:800; font-size:0.75rem; color:${prog.textColor};">Level ${group.level}</div>`;
            if (group.program !== 'general') {
              levelInner += `<div style="font-size:0.62rem; color:${prog.color}; font-weight:800; margin-top:2px;">${prog.name}</div>`;
            }
            tdLevel.innerHTML = levelInner;
            tr.appendChild(tdLevel);
          }

          // Generate time cells for this subRow
          let i = 0;
          while (i < slots.length) {
            if (slotMap[i] !== null) {
              const entry = slotMap[i];
              let span = 0;
              while (i + span < slots.length && slotMap[i + span] === entry) {
                span++;
              }

              const td = document.createElement('td');
              td.colSpan = span;
              const entryType = entry.entryType || parseComponent(entry.component).type;
              td.className = `sched-entry-cell ${entryType}`;
              td.dataset.id = entry.id;

              if (entry.customColor) {
                const darkBorder = adjustColorBrightness(entry.customColor, -45);
                td.style.cssText = `background-color: ${entry.customColor} !important; border-left: 4px solid ${darkBorder} !important;`;
              }

              const conflicts = getConflictsForEntry(entry, scheduleData);
              if (conflicts.length > 0) {
                td.classList.add('has-conflict');
              }

              const conflictBadgeHtml = conflicts.length > 0
                ? `<div class="entry-conflict-badge" title="${conflicts.map(c => c.message).join('\n')}">⚠️ CONFLICT (${conflicts.length})</div>`
                : '';

              const parsed = parseComponent(entry.component);
              let courseHtml = entry.courseName 
                ? `<span class="code-part">${entry.courseCode}</span><span class="name-part"> - ${entry.courseName}</span>`
                : `<span class="code-part">${entry.courseCode}</span>`;

              let typeLabelHtml = '';
              if (entryType === 'lecture') {
                const groupMatch = parsed.label.match(/\(Group\s*\d+\)|Group\s*\d+/i);
                const groupStr = groupMatch ? groupMatch[0] : '';
                const formattedGroup = groupStr ? (groupStr.startsWith('(') ? groupStr : `(${groupStr})`) : '';
                const classNoStr = entry.classNo ? ` (Class No: ${entry.classNo})` : '';
                typeLabelHtml = `<span class="type-prefix">Lecture </span><span class="type-group">${formattedGroup}${classNoStr}</span>`;
              } else if (entryType === 'lab') {
                let groupStr = parsed.label.replace(/^Lab\/Tutorial\s*/i, '').replace(/^Lab\s*/i, '');
                if (groupStr && !groupStr.startsWith('-') && !groupStr.startsWith('(')) {
                  groupStr = '-' + groupStr;
                }
                const classNoStr = entry.classNo ? ` (Class No: ${entry.classNo})` : '';
                typeLabelHtml = `<span class="type-prefix">Lab</span><span class="type-group">${groupStr}${classNoStr}</span>`;
              } else {
                let groupStr = parsed.label.replace(/^Lab\/Tutorial\s*/i, '').replace(/^Tut(orial)?\s*/i, '');
                if (groupStr && !groupStr.startsWith('-') && !groupStr.startsWith('(')) {
                  groupStr = '-' + groupStr;
                }
                const classNoStr = entry.classNo ? ` (Class No: ${entry.classNo})` : '';
                typeLabelHtml = `<span class="type-prefix">Tut</span><span class="type-group">${groupStr}${classNoStr}</span>`;
              }

              const widthPx = span * 52;
              let innerContent = '';
              if (widthPx > 200) {
                innerContent = `
                  ${conflictBadgeHtml}
                  <div class="entry-course">${courseHtml}</div>
                  <div class="entry-type-label">${typeLabelHtml}</div>
                  <div class="entry-instructor">👤 ${entry.instructor || '—'}</div>
                  <div class="entry-facility">📍 ${entry.facilityId || '—'}${entry.capacity ? ` (${entry.capacity})` : ''}</div>
                `;
              } else if (widthPx > 120) {
                innerContent = `
                  ${conflictBadgeHtml}
                  <div class="entry-course">${courseHtml}</div>
                  <div class="entry-type-label">${typeLabelHtml}</div>
                  <div class="entry-instructor">👤 ${entry.instructor || '—'}</div>
                `;
              } else {
                innerContent = `
                  ${conflictBadgeHtml}
                  <div class="entry-course">${courseHtml}</div>
                  <div class="entry-type-label">${typeLabelHtml}</div>
                `;
              }
              td.innerHTML = `<div class="sched-entry-cell-content">${innerContent}</div>`;

              td.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!requireAuth('view or modify schedule entries')) return;
                showEntryPopup(entry, td);
              });

              tr.appendChild(td);
              i += span;
            } else {
              const td = document.createElement('td');
              td.className = 'sched-empty';
              if (slots[i].start % 60 === 0) td.classList.add('on-hour');
              tr.appendChild(td);
              i++;
            }
          }

          const tdEnd = document.createElement('td');
          tdEnd.className = 'sched-end-cell';
          tr.appendChild(tdEnd);

          tbody.appendChild(tr);
        });
      });
    }
  });

  table.appendChild(tbody);
  container.appendChild(table);
  updateStats();
}

// ─── Stats ───────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-entries').textContent = scheduleData.length;
  const courses = new Set(scheduleData.map(e => e.courseCode));
  document.getElementById('stat-courses').textContent = courses.size;

  let lectures = 0, labs = 0, tutorials = 0;
  scheduleData.forEach(e => {
    const t = e.entryType || parseComponent(e.component).type;
    if (t === 'lecture') lectures++;
    else if (t === 'tutorial') tutorials++;
    else labs++;
  });
  document.getElementById('stat-lectures').textContent = lectures;
  document.getElementById('stat-labs').textContent = labs;
  document.getElementById('stat-tutorials').textContent = tutorials;

  // Conflict Counter
  let conflictCount = 0;
  const conflictEntries = new Set();
  scheduleData.forEach(e => {
    const conflicts = getConflictsForEntry(e, scheduleData);
    if (conflicts.length > 0) conflictEntries.add(e.id);
  });
  const statConflictEl = document.getElementById('stat-conflicts');
  if (statConflictEl) statConflictEl.textContent = conflictEntries.size;
}

// ─── Entry Detail Popup ──────────────────────────────────────────────────────
function showEntryPopup(entry, anchorEl) {
  closeEntryPopup();
  const popup = document.getElementById('entry-popup');
  const parsed = parseComponent(entry.component);
  const entryType = entry.entryType || parsed.type;
  const prog = getProgramById(entry.program || 'general');
  const conflicts = getConflictsForEntry(entry, scheduleData);

  const typeLabel = entryType === 'tutorial'
    ? parsed.label.replace('Lab/Tutorial', 'Tutorial')
    : entryType === 'lab'
      ? parsed.label.replace('Lab/Tutorial', 'Lab')
      : parsed.label;

  let conflictHtml = '';
  if (conflicts.length > 0) {
    conflictHtml = `
      <div class="popup-conflict-box">
        <div class="popup-conflict-title">⚠️ Schedule Conflict Detected (${conflicts.length})</div>
        <ul class="popup-conflict-list">
          ${conflicts.map(c => `<li>${c.message} (${minutesToTimeString(c.other.startMinutes)} - ${minutesToTimeString(c.other.endMinutes)})</li>`).join('')}
        </ul>
      </div>
    `;
  }

  popup.innerHTML = `
    <div class="entry-popup-header">
      <div class="entry-popup-course">${entry.courseCode} - ${entry.courseName}</div>
      <span class="entry-popup-type ${entryType}">${entryType.charAt(0).toUpperCase() + entryType.slice(1)}</span>
    </div>
    <div class="entry-popup-details">
      <div class="entry-popup-row"><span class="icon">📋</span><span class="label">Component</span><span class="value">${entry.component} — ${typeLabel}</span></div>
      <div class="entry-popup-row"><span class="icon">📅</span><span class="label">Day</span><span class="value">${entry.day}</span></div>
      <div class="entry-popup-row"><span class="icon">🕐</span><span class="label">Time</span><span class="value">${minutesToTimeString(entry.startMinutes)} — ${minutesToTimeString(entry.endMinutes)}</span></div>
      <div class="entry-popup-row"><span class="icon">📍</span><span class="label">Facility</span><span class="value">${entry.facilityId || '—'}</span></div>
      <div class="entry-popup-row"><span class="icon">👥</span><span class="label">Capacity</span><span class="value">${entry.capacity || '—'}</span></div>
      <div class="entry-popup-row"><span class="icon">👤</span><span class="label">Instructor</span><span class="value">${entry.instructor || '—'}</span></div>
      <div class="entry-popup-row"><span class="icon">🔢</span><span class="label">Level</span><span class="value">${entry.level || '—'}</span></div>
      <div class="entry-popup-row"><span class="icon">🎓</span><span class="label">Program</span><span class="value" style="color:${prog.color}">${prog.name}</span></div>
      <div class="entry-popup-row"><span class="icon">🔗</span><span class="label">Assoc.</span><span class="value">${entry.association || '—'}</span></div>
      <div class="entry-popup-row"><span class="icon">🏷️</span><span class="label">Class No</span><span class="value">${entry.classNo || '—'}</span></div>
      <div class="entry-popup-row" style="margin-top:6px; padding-top:6px; border-top:1px dashed #cbd5e1;">
        <span class="icon">🎨</span>
        <span class="label">Color</span>
        <div style="display:flex; align-items:center; gap:8px; flex:1;">
          <input type="color" value="${entry.customColor || (entryType === 'lecture' ? '#95b3d7' : '#da9694')}" onchange="changeEntryColor('${entry.id}', this.value)" style="width:30px; height:26px; padding:0; border:none; border-radius:4px; cursor:pointer;" title="Click to choose custom block color" />
          ${entry.customColor ? `<button class="btn btn-xs btn-danger" onclick="resetEntryColor('${entry.id}')" style="font-size:0.68rem; padding:2px 8px;">Reset Color</button>` : `<span style="font-size:0.7rem; color:#64748b;">(Default)</span>`}
        </div>
      </div>
    </div>
    ${conflictHtml}
    <div class="entry-popup-actions">
      <button class="btn btn-sm" onclick="editEntry('${entry.id}')">✏️ Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteEntry('${entry.id}')">🗑️ Delete</button>
      <button class="btn btn-sm" onclick="closeEntryPopup()" style="margin-left:auto;">Close</button>
    </div>
  `;

  popup.classList.remove('hidden');

  const rect = anchorEl.getBoundingClientRect();
  const popHeight = popup.offsetHeight || 360;
  const popWidth = popup.offsetWidth || 320;

  let left = rect.left;
  let top = rect.bottom + 6;

  // Horizontal bounds check
  if (left + popWidth > window.innerWidth - 20) left = window.innerWidth - popWidth - 20;
  if (left < 10) left = 10;

  // Vertical bounds check: if placing below anchor goes off-screen, flip above anchor!
  if (top + popHeight > window.innerHeight - 15) {
    top = rect.top - popHeight - 6;
  }

  // If placing above anchor STILL goes above top of screen, clamp top to 15px!
  if (top < 15) top = 15;

  // Ensure maxHeight never extends beyond viewport bottom
  const availableMaxHeight = window.innerHeight - top - 15;
  popup.style.maxHeight = `${availableMaxHeight}px`;

  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  activePopup = entry.id;
}

function closeEntryPopup() {
  const popup = document.getElementById('entry-popup');
  popup.classList.add('hidden');
  popup.innerHTML = '';
  activePopup = null;
}

// ─── Edit Entry ──────────────────────────────────────────────────────────────
function editEntry(id) {
  closeEntryPopup();
  const entry = scheduleData.find(e => e.id === id);
  if (!entry) return;

  currentEditId = id;
  document.getElementById('modal-entry-title').textContent = 'Edit Schedule Entry';

  document.getElementById('field-course-code').value = entry.courseCode || '';
  document.getElementById('field-course-name').value = entry.courseName || '';
  document.getElementById('field-level').value = entry.level || 1;
  document.getElementById('field-program').value = entry.program || 'general';
  document.getElementById('field-association').value = entry.association || 1;
  document.getElementById('field-class-no').value = entry.classNo || '';
  document.getElementById('field-day').value = entry.day || 'Saturday';
  
  const fac = entry.facilityId || '';
  if (fac.includes('/')) {
    const parts = fac.split('/');
    document.getElementById('field-facility').value = parts[0].trim();
    document.getElementById('field-facility-tut').value = parts[1] ? parts[1].trim() : '';
  } else {
    document.getElementById('field-facility').value = fac;
    document.getElementById('field-facility-tut').value = '';
  }

  document.getElementById('field-start-time').value = minutesTo24h(entry.startMinutes);
  document.getElementById('field-end-time').value = minutesTo24h(entry.endMinutes);
  document.getElementById('field-capacity').value = entry.capacity || 100;

  const instContainer = document.getElementById('instructors-container');
  if (instContainer) instContainer.innerHTML = '';
  const inst = entry.instructor || '';
  if (inst.includes('+')) {
    const parts = inst.split('+').map(p => p.trim()).filter(Boolean);
    parts.forEach(p => addInstructorInputRow(p));
  } else if (inst) {
    addInstructorInputRow(inst);
  } else {
    addInstructorInputRow('');
  }

  const entryType = entry.entryType || parseComponent(entry.component).type;
  setEntryType(entryType);

  const parsed = parseComponent(entry.component);
  if (entryType === 'lecture') {
    document.getElementById('field-lecture-group').value = parsed.group || 1;
  } else {
    const groupStr = String(parsed.group);
    const parentGroup = parseInt(groupStr) || 1;
    const subGroup = groupStr.endsWith('B') ? 'B' : 'A';
    document.getElementById('field-parent-group').value = parentGroup;
    setSubGroup(subGroup);
  }

  updateComponentPreview();
  document.getElementById('field-association').value = entry.association || 1;

  if (entry.customColor) {
    if (document.getElementById('field-use-custom-color')) document.getElementById('field-use-custom-color').checked = true;
    if (document.getElementById('field-custom-color')) document.getElementById('field-custom-color').value = entry.customColor;
  } else {
    if (document.getElementById('field-use-custom-color')) document.getElementById('field-use-custom-color').checked = false;
    if (document.getElementById('field-custom-color')) document.getElementById('field-custom-color').value = entryType === 'lecture' ? '#95b3d7' : '#da9694';
  }

  openModal('modal-entry');
}

// ─── Delete Entry ────────────────────────────────────────────────────────────
function deleteEntry(id) {
  closeEntryPopup();
  const entry = scheduleData.find(e => e.id === id);
  showConfirm('Delete this schedule entry?', () => {
    if (entry) {
      logActivity('🗑️ Deleted Entry', `${entry.courseCode} (${entry.component})`, '🗑️');
    }
    scheduleData = scheduleData.filter(e => e.id !== id);
    saveData();
    renderGrid();
    showToast('Entry deleted', 'success');
  });
}

// ─── CSV Parser ──────────────────────────────────────────────────────────────
function parseCSV(text) {
  if (!text) return [];
  // Strip UTF-8 BOM if present (\uFEFF)
  text = text.replace(/^\uFEFF/, '');
  
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => fixMojibake(h.trim().toLowerCase()));

  const colMap = {};
  const mappings = [
    { keys: ['level', 'lvl'], field: 'level' },
    { keys: ['course code', 'course_code', 'coursecode', 'code'], field: 'courseCode' },
    { keys: ['course name', 'course_name', 'coursename', 'name'], field: 'courseName' },
    { keys: ['component', 'comp'], field: 'component' },
    { keys: ['association', 'assoc'], field: 'association' },
    { keys: ['class no', 'class_no', 'classno', 'class#', 'class n', 'class nbr', 'class number'], field: 'classNo' },
    { keys: ['facility id', 'facility_id', 'facilityid', 'facility', 'room'], field: 'facilityId' },
    { keys: ['mtg start', 'mtg_start', 'start', 'start time', 'starttime', 'meeting start'], field: 'mtgStart' },
    { keys: ['mtg end', 'mtg_end', 'end', 'end time', 'endtime', 'meeting end'], field: 'mtgEnd' },
    { keys: ['day', 'days'], field: 'day' },
    { keys: ['capacity', 'cap', 'seats'], field: 'capacity' },
    { keys: ['instructor 1', 'instructor1', 'instructor', 'prof', 'teacher'], field: 'instructor' },
    { keys: ['program', 'programme', 'dept', 'department'], field: 'program' }
  ];

  headers.forEach((h, idx) => {
    for (const mapping of mappings) {
      if (mapping.keys.some(k => h.includes(k))) {
        colMap[mapping.field] = idx;
        break;
      }
    }
  });

  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 3) continue;

    const getValue = (field) => {
      const idx = colMap[field];
      return idx !== undefined && idx < vals.length ? fixMojibake(vals[idx].trim()) : '';
    };

    const component = getValue('component');
    const parsed = parseComponent(component);
    const startMin = parseTimeString(getValue('mtgStart'));
    const endMin = parseTimeString(getValue('mtgEnd'));
    if (startMin === null || endMin === null) continue;

    // Try to match program from CSV
    let program = getValue('program').toLowerCase();
    if (program) {
      const found = PROGRAMS.find(p => p.name.toLowerCase() === program || p.id === program);
      program = found ? found.id : 'general';
    } else {
      program = 'general';
    }

    entries.push({
      id: generateId(),
      level: getValue('level') || '1',
      courseCode: getValue('courseCode'),
      courseName: getValue('courseName'),
      component,
      entryType: parsed.type,
      association: getValue('association'),
      classNo: getValue('classNo'),
      facilityId: getValue('facilityId'),
      startMinutes: startMin,
      endMinutes: endMin,
      day: capitalizeDay(getValue('day')),
      capacity: getValue('capacity'),
      instructor: getValue('instructor'),
      program
    });
  }
  return entries;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

function capitalizeDay(day) {
  if (!day) return 'Saturday';
  const d = day.trim().toLowerCase();
  const map = {
    'saturday': 'Saturday', 'sat': 'Saturday',
    'sunday': 'Sunday', 'sun': 'Sunday',
    'monday': 'Monday', 'mon': 'Monday',
    'tuesday': 'Tuesday', 'tue': 'Tuesday', 'tues': 'Tuesday',
    'wednesday': 'Wednesday', 'wed': 'Wednesday',
    'thursday': 'Thursday', 'thu': 'Thursday', 'thur': 'Thursday',
    'friday': 'Friday', 'fri': 'Friday'
  };
  return map[d] || day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
}

// ─── Arabic Mojibake Auto-Fix Helper ─────────────────────────────────────────
function fixMojibake(str) {
  if (!str || typeof str !== 'string') return str;
  // Detect common UTF-8 -> ISO-8859-1 / Windows-1252 mojibake characters (Ø, Ù, etc.)
  if (/[\u00C0-\u00FF]/.test(str)) {
    try {
      const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0) & 0xFF));
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return decoded;
    } catch (e) {
      return str;
    }
  }
  return str;
}

// ─── CSV Exporter ────────────────────────────────────────────────────────────
function exportCSV() {
  if (scheduleData.length === 0) { showToast('No data to export', 'error'); return; }

  const headers = ['LEVEL', 'Course code', 'Course name', 'Component', 'Class No', 'Association',
    'Facility ID', 'Mtg Start', 'Mtg End', 'Day', 'Capacity', 'Instructor 1', 'Program'];

  const rows = scheduleData.map(e => [
    e.level || '',
    e.courseCode || '',
    csvEscape(e.courseName || ''),
    e.component || '',
    e.classNo || '',
    e.association || '',
    e.facilityId || '',
    minutesToTimeString(e.startMinutes),
    minutesToTimeString(e.endMinutes),
    e.day || '',
    e.capacity || '',
    csvEscape(e.instructor || ''),
    getProgramById(e.program || 'general').name
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `SIS_Schedule_Export_${getDateStamp()}.csv`, 'text/csv');
  showToast(`Exported ${scheduleData.length} entries as CSV`, 'success');
}

function csvEscape(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

// ─── Visual Schedule Excel Exporter ──────────────────────────────────────────
function exportVisualExcel() {
  if (scheduleData.length === 0) {
    showToast('No entries in schedule to export', 'error');
    return;
  }

  const { start: timeStart, end: timeEnd } = getTimeRange();
  const slots = generateTimeSlots(timeStart, timeEnd);

  let tableHtml = `
  <table border="1" style="border-collapse:collapse; font-family: Arial, sans-serif; font-size: 11px; width:100%;">
    <thead>
      <tr style="background-color: #d9d9d9; height: 34px;">
        <th style="width:70px; background-color:#d9d9d9; font-weight:bold; text-align:center; border:1px solid #94a3b8; color:#000000;">DAY</th>
        <th style="width:110px; background-color:#d9d9d9; font-weight:bold; text-align:center; border:1px solid #94a3b8; color:#000000;">LEVEL</th>
  `;

  // Time slot headers
  slots.forEach(slot => {
    tableHtml += `<th style="width:52px; background-color:#d9d9d9; font-weight:bold; text-align:center; border:1px solid #cbd5e1; color:#000000;">${formatSlotLabel(slot.start)}</th>`;
  });

  // 4:00 PM header cell
  tableHtml += `<th style="width:45px; background-color:#d9d9d9; font-weight:bold; text-align:center; border:1px solid #cbd5e1; color:#000000;">${formatSlotLabel(timeEnd)}</th>`;

  tableHtml += `</tr></thead><tbody>`;

  DAYS.forEach(day => {
    const dayEntries = scheduleData.filter(e => e.day && e.day.toLowerCase() === day.toLowerCase());
    const groups = groupByLevelProgram(dayEntries);

    const groupSubRowsMap = groups.map(group => ({
      group,
      subRows: packEntriesIntoSubRows(group.entries, timeStart, slots)
    }));

    const totalDaySubRows = groupSubRowsMap.reduce((sum, item) => sum + item.subRows.length, 0);

    if (groups.length === 0) {
      const dayColor = DAY_COLORS[day] || DAY_COLORS['Saturday'];
      tableHtml += `
        <tr style="height: 50px;">
          <td style="width:70px; font-weight:bold; font-size:13px; background-color:${dayColor.bg}; color:${dayColor.textColor}; border-left:4px solid ${dayColor.accent}; text-align:center; vertical-align:middle; border-right:2px solid #cbd5e1; border-bottom:3.5px solid #dc2626;">${day.substring(0, 3)}</td>
          <td style="width:110px; font-weight:bold; text-align:center; vertical-align:middle; background-color:#ffffff; border-right:2px solid #cbd5e1; border-bottom:3.5px solid #dc2626; color:#94a3b8;">—</td>
      `;
      slots.forEach(() => {
        tableHtml += `<td style="background-color:#ffffff; border-right:1px solid #e2e8f0; border-bottom:3.5px solid #dc2626;"></td>`;
      });
      // 4:00 PM closing cell
      tableHtml += `<td style="background-color:#ffffff; border-right:none; border-bottom:3.5px solid #dc2626;"></td></tr>`;
    } else {
      let isFirstDayRow = true;

      groupSubRowsMap.forEach(({ group, subRows }, gIdx) => {
        const isLastGroupInDay = gIdx === groupSubRowsMap.length - 1;

        subRows.forEach((slotMap, sIdx) => {
          const isLastSubRowInGroup = sIdx === subRows.length - 1;
          const isDayLast = isLastGroupInDay && isLastSubRowInGroup;
          const bottomBorderStyle = isDayLast ? 'border-bottom: 3.5px solid #dc2626;' : 'border-bottom: 1.5px solid #cbd5e1;';
          
          tableHtml += `<tr style="height: 60px;">`;

          if (isFirstDayRow) {
            const dayColor = DAY_COLORS[day] || DAY_COLORS['Saturday'];
            tableHtml += `<td rowspan="${totalDaySubRows}" style="width:70px; font-weight:bold; font-size:13px; background-color:${dayColor.bg}; color:${dayColor.textColor}; border-left:4px solid ${dayColor.accent}; text-align:center; vertical-align:middle; border-right:2px solid #cbd5e1; border-bottom:3.5px solid #dc2626;">${day.substring(0, 3)}</td>`;
            isFirstDayRow = false;
          }

          if (sIdx === 0) {
            const prog = getProgramById(group.program);
            const levelLabel = `Level ${group.level}`;
            const levelText = group.program !== 'general' 
              ? `<span style="font-weight:bold; color:${prog.textColor}; mso-data-placement:same-cell;">${levelLabel}</span><br/><span style="color:${prog.color}; font-size:9px; font-weight:bold; mso-data-placement:same-cell;">${prog.name}</span>`
              : `<span style="font-weight:bold; color:#334155; mso-data-placement:same-cell;">${levelLabel}</span>`;

            tableHtml += `<td rowspan="${subRows.length}" style="width:110px; text-align:center; vertical-align:middle; background-color:${prog.bg}; border-left:3px solid ${prog.color}; border-right:2px solid #cbd5e1; ${isLastGroupInDay ? 'border-bottom:3.5px solid #dc2626;' : 'border-bottom:1.5px solid #cbd5e1;'} mso-data-placement:same-cell; padding:4px;">${levelText}</td>`;
          }

          // Slot mapping
          let s = 0;
          while (s < slots.length) {
            if (slotMap[s] !== null) {
              const entry = slotMap[s];
              let span = 0;
              while (s + span < slots.length && slotMap[s + span] === entry) {
                span++;
              }

              const entryType = entry.entryType || parseComponent(entry.component).type;
              const parsed = parseComponent(entry.component);
              let typeLabel = entryType === 'tutorial'
                ? parsed.label.replace('Lab/Tutorial', 'Tut')
                : entryType === 'lab'
                  ? parsed.label.replace('Lab/Tutorial', 'Lab')
                  : parsed.label.replace('Lecture ', 'Lec ');
              if (entry.classNo) typeLabel += ` (Class No: ${entry.classNo})`;

              const defaultBg = entryType === 'lecture' ? '#95b3d7' : '#da9694';
              const defaultBorder = entryType === 'lecture' ? '#366092' : '#9c4543';
              const cellBg = entry.customColor || defaultBg;
              const cellBorder = entry.customColor ? adjustColorBrightness(entry.customColor, -45) : defaultBorder;

              if (entryType === 'lecture') {
                const groupMatch = parsed.label.match(/\(Group\s*\d+\)|Group\s*\d+/i);
                const groupStr = groupMatch ? groupMatch[0] : '';
                const formattedGroup = groupStr ? (groupStr.startsWith('(') ? groupStr : `(${groupStr})`) : '';
                const classNoStr = entry.classNo ? ` (Class No: ${entry.classNo})` : '';

                tableHtml += `
                  <td colspan="${span}" style="background-color:${cellBg}; text-align:center; vertical-align:middle; border-left: 4px solid ${cellBorder}; border-top:1px solid #cbd5e1; border-right:1px solid #cbd5e1; ${bottomBorderStyle} padding:4px; mso-data-placement:same-cell;">
                    <span style="font-weight:bold; font-size:11px; display:block; mso-data-placement:same-cell;">
                      <span style="color:#0000ff;">${entry.courseCode}</span><span style="color:#000000;">${entry.courseName ? `-${entry.courseName}` : ''}</span>
                    </span><br/>
                    <span style="font-size:10px; font-weight:bold; display:block; mso-data-placement:same-cell;">
                      <span style="color:#0000ff;">Lecture </span><span style="color:#ff0000;">${formattedGroup}${classNoStr}</span>
                    </span><br/>
                    <span style="font-size:10px; font-weight:bold; color:#000000; display:block; mso-data-placement:same-cell;">👤 ${entry.instructor || '—'}</span><br/>
                    <span style="font-size:9px; font-weight:bold; color:#000000; display:block; mso-data-placement:same-cell;">📍 ${entry.facilityId || '—'}${entry.capacity ? ` (${entry.capacity})` : ''}</span>
                  </td>
                `;
              } else {
                let rawType = entryType === 'tutorial' ? 'Tut' : 'Lab';
                let groupStr = parsed.label.replace(/^Lab\/Tutorial\s*/i, '').replace(/^(Lab|Tut(orial)?)\s*/i, '');
                if (groupStr && !groupStr.startsWith('-') && !groupStr.startsWith('(')) {
                  groupStr = '-' + groupStr;
                }
                const classNoStr = entry.classNo ? ` (Class No: ${entry.classNo})` : '';

                tableHtml += `
                  <td colspan="${span}" style="background-color:${cellBg}; text-align:center; vertical-align:middle; border-left: 4px solid ${cellBorder}; border-top:1px solid #cbd5e1; border-right:1px solid #cbd5e1; ${bottomBorderStyle} padding:4px; mso-data-placement:same-cell;">
                    <span style="font-weight:bold; font-size:11px; display:block; mso-data-placement:same-cell;">
                      <span style="color:#0000ff;">${entry.courseCode}</span><span style="color:#000000;">${entry.courseName ? `-${entry.courseName}` : ''}</span>
                    </span><br/>
                    <span style="font-size:10px; font-weight:bold; display:block; mso-data-placement:same-cell;">
                      <span style="color:#0000ff;">${rawType}</span><span style="color:#ff0000;">${groupStr}${classNoStr}</span>
                    </span><br/>
                    <span style="font-size:10px; font-weight:bold; color:#000000; display:block; mso-data-placement:same-cell;">👤 ${entry.instructor || '—'}</span><br/>
                    <span style="font-size:9px; font-weight:bold; color:#000000; display:block; mso-data-placement:same-cell;">📍 ${entry.facilityId || '—'}${entry.capacity ? ` (${entry.capacity})` : ''}</span>
                  </td>
                `;
              }
              s += span;
            } else {
              tableHtml += `<td style="background-color:#ffffff; border-right:1px solid #e2e8f0; ${bottomBorderStyle}"></td>`;
              s++;
            }
          }

          // 4:00 PM closing cell
          tableHtml += `<td style="background-color:#ffffff; border-right:none; ${bottomBorderStyle}"></td></tr>`;
        });
      });
    }
  });

  tableHtml += `</tbody></table>`;

  const excelDocument = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <!--[if gte mso 9]>
    <xml>
     <x:ExcelWorkbook>
      <x:ExcelWorksheets>
       <x:ExcelWorksheet>
        <x:Name>Term Schedule Grid</x:Name>
        <x:WorksheetOptions>
         <x:DisplayGridlines/>
        </x:WorksheetOptions>
       </x:ExcelWorksheet>
      </x:ExcelWorksheets>
     </x:ExcelWorkbook>
    </xml>
    <![endif]-->
    <style>
      br { mso-data-placement: same-cell; }
      span { mso-data-placement: same-cell; }
      td { mso-data-placement: same-cell; }
    </style>
  </head>
  <body>
    ${tableHtml}
  </body>
  </html>
  `;

  downloadFile(excelDocument, `Visual_Term_Schedule_${getDateStamp()}.xls`, 'application/vnd.ms-excel');
  showToast('Visual Schedule exported to Excel (.xls)', 'success');
}

// ─── Import Schedule State ───────────────────────────────────────────────────
function importScheduleState() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.csv,.txt';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      const trimmed = content.trim().replace(/^\uFEFF/, '');
      if (file.name.endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          const entries = Array.isArray(parsed) ? parsed : (parsed.entries || []);
          if (entries.length > 0) {
            scheduleData = entries;
            saveData();
            renderGrid();
            showToast(`Successfully imported ${entries.length} schedule entries`, 'success');
          } else {
            showToast('No entries found in JSON file', 'error');
          }
        } catch (err) {
          showToast('Invalid JSON file structure', 'error');
        }
      } else {
        handleFileSelect(file);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function getDateStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function downloadFile(content, filename, type) {
  // Prepend UTF-8 BOM (\uFEFF) so Microsoft Excel opens Arabic characters correctly in UTF-8
  const blob = new Blob(['\uFEFF' + content], { type: type + ';charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Import Flow ─────────────────────────────────────────────────────────────
function handleFileSelect(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      pendingImportData = parseCSV(e.target.result);
      if (pendingImportData.length === 0) {
        showToast('No valid entries found. Check column headers.', 'error');
        return;
      }
      renderImportPreview(pendingImportData);
      document.getElementById('btn-confirm-import').classList.remove('hidden');
    } catch (err) {
      showToast('Error parsing CSV: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function renderImportPreview(entries) {
  const container = document.getElementById('import-preview');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="import-preview-header">
      <h3>Preview</h3>
      <span class="import-preview-count">${entries.length} entries found</span>
    </div>
    <div class="import-table-wrap">
      <table class="import-table">
        <thead><tr>
          <th>Course</th><th>Name</th><th>Component</th><th>Day</th><th>Time</th><th>Room</th><th>Instructor</th>
        </tr></thead>
        <tbody>
          ${entries.slice(0, 50).map(e => `<tr>
            <td>${e.courseCode}</td><td>${e.courseName}</td><td>${e.component}</td>
            <td>${e.day}</td><td>${minutesToTimeString(e.startMinutes)} - ${minutesToTimeString(e.endMinutes)}</td>
            <td>${e.facilityId}</td><td>${e.instructor}</td>
          </tr>`).join('')}
          ${entries.length > 50 ? `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">... and ${entries.length - 50} more</td></tr>` : ''}
        </tbody>
      </table>
    </div>`;
}

function confirmImport() {
  if (pendingImportData.length === 0) return;
  scheduleData = [...scheduleData, ...pendingImportData];
  saveData();
  renderGrid();
  closeModal('modal-import');
  resetImportModal();
  showToast(`Imported ${pendingImportData.length} entries successfully!`, 'success');
  pendingImportData = [];
}

function resetImportModal() {
  document.getElementById('import-preview').innerHTML = '';
  document.getElementById('import-preview').classList.add('hidden');
  document.getElementById('btn-confirm-import').classList.add('hidden');
  document.getElementById('file-input').value = '';
}

// ─── Entry Form & Dynamic Instructors ────────────────────────────────────────
let selectedType = 'lecture';
let selectedSubGroup = 'A';

function addInstructorInputRow(value = '') {
  const container = document.getElementById('instructors-container');
  if (!container) return;
  const count = container.querySelectorAll('.instructor-input-row').length + 1;
  const row = document.createElement('div');
  row.className = 'instructor-input-row';
  row.innerHTML = `
    <span class="instructor-num-badge">${count}</span>
    <input class="form-input instructor-field" type="text" placeholder="${count === 1 ? 'Primary Instructor (e.g. Prof. Dr. Mohammed Slalem)' : `Instructor ${count} (e.g. Dr. Ahmed Soffar)`}" value="${value}" style="flex:1;" />
    ${count > 1 ? '<button type="button" class="btn-remove-inst" title="Remove Instructor">×</button>' : ''}
  `;

  if (count > 1) {
    const btnRemove = row.querySelector('.btn-remove-inst');
    btnRemove.addEventListener('click', () => {
      row.remove();
      updateInstructorBadges();
    });
  }

  container.appendChild(row);
}

function updateInstructorBadges() {
  const container = document.getElementById('instructors-container');
  if (!container) return;
  const rows = container.querySelectorAll('.instructor-input-row');
  rows.forEach((row, idx) => {
    const badge = row.querySelector('.instructor-num-badge');
    const input = row.querySelector('.instructor-field');
    if (badge) badge.textContent = idx + 1;
    if (input && idx > 0) {
      input.placeholder = `Instructor ${idx + 1} (e.g. Dr. Ahmed Soffar)`;
    }
  });
}

function setEntryType(type) {
  selectedType = type;
  document.querySelectorAll('.type-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  const l = document.getElementById('group-lecture-wrap');
  const p = document.getElementById('group-parent-wrap');
  const s = document.getElementById('group-sub-wrap');
  const labFac = document.getElementById('label-facility');
  const labTut = document.getElementById('label-facility-tut');

  if (type === 'lecture') { 
    l.classList.remove('hidden'); p.classList.add('hidden'); s.classList.add('hidden'); 
    if (labFac) labFac.textContent = 'Facility ID (Lecture Hall)';
    if (labTut) labTut.textContent = 'Secondary Room (Optional)';
  } else { 
    l.classList.add('hidden'); p.classList.remove('hidden'); s.classList.remove('hidden'); 
    if (labFac) labFac.textContent = 'Lab Room (Facility ID)';
    if (labTut) labTut.textContent = 'Tutorial Room (Optional)';
  }
  updateComponentPreview();
}

function setSubGroup(sub) {
  selectedSubGroup = sub;
  document.querySelectorAll('.sub-group-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sub === sub);
  });
  updateComponentPreview();
}

function updateComponentPreview() {
  const lg = parseInt(document.getElementById('field-lecture-group').value) || 1;
  const pg = parseInt(document.getElementById('field-parent-group').value) || 1;
  let code, label;
  if (selectedType === 'lecture') {
    code = buildComponentCode('lecture', lg);
    label = `→ Lecture Group ${lg}`;
  } else {
    code = buildComponentCode(selectedType, null, pg, selectedSubGroup);
    const tn = selectedType === 'tutorial' ? 'Tutorial' : 'Lab';
    label = `→ ${tn} Group ${pg}${selectedSubGroup}`;
  }
  document.getElementById('component-preview-code').textContent = code;
  document.getElementById('component-preview-label').textContent = label;

  // Automatically sync Association number to match Group number
  const groupNum = selectedType === 'lecture' ? lg : pg;
  document.getElementById('field-association').value = groupNum;
}

function saveEntry() {
  const courseCode = document.getElementById('field-course-code').value.trim();
  const courseName = document.getElementById('field-course-name').value.trim();
  const level = document.getElementById('field-level').value;
  const program = document.getElementById('field-program').value;
  const association = document.getElementById('field-association').value;
  const classNo = document.getElementById('field-class-no').value.trim();
  const day = document.getElementById('field-day').value;
  
  const primaryFacility = document.getElementById('field-facility').value.trim();
  const tutFacility = document.getElementById('field-facility-tut').value.trim();
  const facilityId = tutFacility ? `${primaryFacility}/${tutFacility}` : primaryFacility;

  const startTime = document.getElementById('field-start-time').value;
  const endTime = document.getElementById('field-end-time').value;
  const capacity = document.getElementById('field-capacity').value;

  const instInputs = document.querySelectorAll('#instructors-container .instructor-field');
  const instList = [];
  instInputs.forEach(inp => {
    const val = inp.value.trim();
    if (val) instList.push(val);
  });
  const instructor = instList.join(' + ');

  if (!courseCode) { showToast('Course code is required', 'error'); return; }
  if (!courseName) { showToast('Course name is required', 'error'); return; }
  if (!startTime || !endTime) { showToast('Start and end times are required', 'error'); return; }

  const startMin = time24ToMinutes(startTime);
  const endMin = time24ToMinutes(endTime);
  if (endMin <= startMin) { showToast('End time must be after start time', 'error'); return; }

  const lg = parseInt(document.getElementById('field-lecture-group').value) || 1;
  const pg = parseInt(document.getElementById('field-parent-group').value) || 1;
  const component = selectedType === 'lecture'
    ? buildComponentCode('lecture', lg)
    : buildComponentCode(selectedType, null, pg, selectedSubGroup);

  const useCustomColor = document.getElementById('field-use-custom-color') ? document.getElementById('field-use-custom-color').checked : false;
  const customColorVal = document.getElementById('field-custom-color') ? document.getElementById('field-custom-color').value : null;

  const entry = {
    id: currentEditId || generateId(),
    level, courseCode, courseName, component,
    entryType: selectedType,
    association, classNo, facilityId,
    startMinutes: startMin, endMinutes: endMin,
    day, capacity, instructor, program,
    customColor: useCustomColor ? customColorVal : undefined
  };

  const isEdit = !!currentEditId;
  if (currentEditId) {
    const idx = scheduleData.findIndex(e => e.id === currentEditId);
    if (idx !== -1) scheduleData[idx] = entry;
  } else {
    scheduleData.push(entry);
  }

  saveData();
  renderGrid();
  logActivity(isEdit ? '✏️ Updated Entry' : '➕ Added Entry', `${entry.courseCode} (${entry.component}) on ${entry.day} ${minutesToTimeString(entry.startMinutes)}-${minutesToTimeString(entry.endMinutes)}`, isEdit ? '✏️' : '➕');
  closeModal('modal-entry');
  resetEntryForm();
  const entryConflicts = getConflictsForEntry(entry, scheduleData);
  if (entryConflicts.length > 0) {
    showToast(`${currentEditId ? 'Entry updated' : 'Entry registered'}! ⚠️ ${entryConflicts.length} conflict(s) detected`, 'error');
  } else {
    showToast(currentEditId ? 'Entry updated!' : 'Entry registered!', 'success');
  }
  currentEditId = null;
}

function resetEntryForm() {
  document.getElementById('entry-form').reset();
  document.getElementById('field-facility-tut').value = '';
  document.getElementById('field-class-no').value = '';
  const instContainer = document.getElementById('instructors-container');
  if (instContainer) {
    instContainer.innerHTML = '';
    addInstructorInputRow('');
  }
  currentEditId = null;
  document.getElementById('modal-entry-title').textContent = 'Add Schedule Entry';
  setEntryType('lecture');
  setSubGroup('A');
  document.getElementById('field-lecture-group').value = 1;
  document.getElementById('field-parent-group').value = 1;
  document.getElementById('field-start-time').value = '09:00';
  document.getElementById('field-end-time').value = '10:45';
  document.getElementById('field-level').value = 1;
  document.getElementById('field-program').value = 'general';
  document.getElementById('field-association').value = 1;
  document.getElementById('field-capacity').value = 100;
  updateComponentPreview();
}

// ─── Modal Management ────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'flex';
    el.classList.add('active');
  }
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('active');
    el.style.display = 'none';
  }
  document.body.style.overflow = '';
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────
function showConfirm(message, callback) {
  document.getElementById('confirm-message').textContent = message;
  confirmCallback = callback;
  openModal('modal-confirm');
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 250); }, 3000);
}

// ─── LocalStorage ────────────────────────────────────────────────────────────
function saveData() {
  try {
    localStorage.setItem('termScheduleData', JSON.stringify(scheduleData));
    if (db && !isRemoteSyncUpdate) {
      db.ref('term_schedule/scheduleData').set(scheduleData);
    }
  }
  catch (e) { console.warn('Save failed:', e); }
}

function loadData() {
  try {
    const data = localStorage.getItem('termScheduleData');
    if (data) {
      scheduleData = JSON.parse(data);
      scheduleData.forEach(e => {
        if (!e.id) e.id = generateId();
        if (!e.program) e.program = 'general';
        if (e.instructor) e.instructor = fixMojibake(e.instructor);
        if (e.courseName) e.courseName = fixMojibake(e.courseName);
        if (e.courseCode) e.courseCode = fixMojibake(e.courseCode);
        if (e.facilityId) e.facilityId = fixMojibake(e.facilityId);
      });
    }
  } catch (e) { scheduleData = []; }
}

// ─── Event Listeners ─────────────────────────────────────────────────────────
function initEventListeners() {
  document.getElementById('btn-import').addEventListener('click', () => {
    if (!requireAuth('import SIS data')) return;
    resetImportModal();
    openModal('modal-import');
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    if (!requireAuth('export SIS data')) return;
    exportCSV();
  });
  
  const btnExportVisual = document.getElementById('btn-export-visual');
  if (btnExportVisual) btnExportVisual.addEventListener('click', () => {
    if (!requireAuth('export visual schedule')) return;
    exportVisualExcel();
  });

  const btnImportSchedule = document.getElementById('btn-import-schedule');
  if (btnImportSchedule) btnImportSchedule.addEventListener('click', () => {
    if (!requireAuth('import schedule state')) return;
    importScheduleState();
  });

  const btnActivityLog = document.getElementById('btn-activity-log');
  if (btnActivityLog) btnActivityLog.addEventListener('click', () => {
    if (!requireAuth('view activity log')) return;
    openActivityLogModal();
  });

  const btnCloseAct = document.getElementById('btn-close-activity');
  if (btnCloseAct) btnCloseAct.addEventListener('click', () => closeModal('modal-activity-log'));

  const btnCloseActFooter = document.getElementById('btn-close-activity-footer');
  if (btnCloseActFooter) btnCloseActFooter.addEventListener('click', () => closeModal('modal-activity-log'));

  const btnCloseAuth = document.getElementById('btn-close-auth');
  if (btnCloseAuth) btnCloseAuth.addEventListener('click', () => closeModal('modal-auth'));

  const btnCloseAdminUsers = document.getElementById('btn-close-admin-users');
  if (btnCloseAdminUsers) btnCloseAdminUsers.addEventListener('click', () => closeModal('modal-admin-users'));

  const btnCloseAdminUsersFooter = document.getElementById('btn-close-admin-users-footer');
  if (btnCloseAdminUsersFooter) btnCloseAdminUsersFooter.addEventListener('click', () => closeModal('modal-admin-users'));

  const authForm = document.getElementById('auth-form');
  if (authForm) authForm.addEventListener('submit', handleAuthSubmit);

  document.getElementById('btn-add').addEventListener('click', () => {
    if (!requireAuth('add schedule entry')) return;
    resetEntryForm();
    openModal('modal-entry');
  });

  // Clear handler with activity logging
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!requireAuth('clear schedule')) return;
    if (scheduleData.length === 0) { showToast('Schedule is already empty', 'info'); return; }
    showConfirm(`Clear all ${scheduleData.length} entries?`, () => {
      const count = scheduleData.length;
      scheduleData = [];
      saveData();
      renderGrid();
      logActivity('🗑️ Cleared Timetable', `Cleared all ${count} entries from timetable`, '🗑️');
      showToast('All entries cleared', 'success');
    });
  });

  // Entry modal
  document.getElementById('btn-close-entry').addEventListener('click', () => closeModal('modal-entry'));
  document.getElementById('btn-cancel-entry').addEventListener('click', () => closeModal('modal-entry'));
  document.getElementById('btn-save-entry').addEventListener('click', saveEntry);

  // Dynamic Instructor Add Button
  const btnAddInst = document.getElementById('btn-add-instructor');
  if (btnAddInst) {
    btnAddInst.addEventListener('click', () => addInstructorInputRow());
  }

  // Type/group
  document.querySelectorAll('.type-option').forEach(btn => btn.addEventListener('click', () => setEntryType(btn.dataset.type)));
  document.querySelectorAll('.sub-group-btn').forEach(btn => btn.addEventListener('click', () => setSubGroup(btn.dataset.sub)));
  document.getElementById('field-lecture-group').addEventListener('input', updateComponentPreview);
  document.getElementById('field-parent-group').addEventListener('input', updateComponentPreview);

  // Import modal
  document.getElementById('btn-close-import').addEventListener('click', () => { closeModal('modal-import'); resetImportModal(); });
  document.getElementById('btn-cancel-import').addEventListener('click', () => { closeModal('modal-import'); resetImportModal(); });
  document.getElementById('btn-confirm-import').addEventListener('click', confirmImport);

  // Dropzone
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); handleFileSelect(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));

  // Confirm modal
  document.getElementById('btn-close-confirm').addEventListener('click', () => closeModal('modal-confirm'));
  document.getElementById('btn-cancel-confirm').addEventListener('click', () => closeModal('modal-confirm'));
  document.getElementById('btn-do-confirm').addEventListener('click', () => {
    closeModal('modal-confirm');
    if (confirmCallback) { confirmCallback(); confirmCallback = null; }
  });

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEntryPopup();
      document.querySelectorAll('.modal-overlay.active').forEach(m => { m.classList.remove('active'); document.body.style.overflow = ''; });
    }
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────
function init() {
  initAuth();
  loadData();
  renderGrid();
  initEventListeners();
  updateComponentPreview();
  initFirebase();
}

document.addEventListener('DOMContentLoaded', init);
