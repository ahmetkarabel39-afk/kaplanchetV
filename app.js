const api = {
  login: '/api/login',
  generate: '/api/generate-key',
  keys: '/api/keys',
  config: '/api/config',
  revoke: '/api/revoke-key',
  me: '/api/me'
};

function el(id){return document.getElementById(id)}

const loginCard = el('loginCard');
const panelCard = el('panelCard');
const loginBtn = el('loginBtn');
const logoutBtn = el('logoutBtn');
const username = el('username');
const password = el('password');
const loginError = el('loginError');
const displayName = el('displayName');
const roleEl = el('role');
const daysInput = el('daysInput');
const countInput = el('countInput');
const maxDevicesInput = el('maxDevicesInput');
const hideDaysInput = el('hideDaysInput');
const ppnttn = el('genBtn');
const genResultContainer = el('genResultContainer');
const genResultArea = el('genResultArea');
const copyAllBtn = el('copyAllBtn');
const whatsappShareBtn = el('whatsappShareBtn');
const keysList = el('keysList');
const telegramShareBtn = el('telegramShareBtn');
const filterInput = el('filterInput');
const exportBtn = el('exportBtn');
const exportTxtBtn = el('exportTxtBtn');
const sortSelect = el('sortSelect');
const newUsername = el('newUsername');
const newPassword = el('newPassword');
const newCanRevoke = el('newCanRevoke');
const newAccountDuration = el('newAccountDuration');
const newMaxDays = el('newMaxDays');
const newMaxKeys = el('newMaxKeys');
const createUserBtn = el('createUserBtn');
const founderMsg = el('founderMsg');
const cleanExpiredBtn = el('cleanExpiredBtn');
const expiredCountEl = el('expiredCount');
const updateStatusBtn = el('updateStatusBtn');
const cheatStatusDisplay = el('cheatStatusDisplay');
let currentUser = null;
let cachedKeys = [];
const meUsername = el('meUsername');
const mePassword = el('mePassword');
const updateMeBtn = el('updateMeBtn');
const meMsg = el('meMsg');
const announceInput = el('announceInput');
const saveAnnounceBtn = el('saveAnnounceBtn');
const ownerZone = el('ownerZone');
const securityAlertsList = el('securityAlertsList');
const maintenanceToggle = el('maintenanceToggle');
const liveClock = el('liveClock');
const neonToggleLogin = el('neonToggleLogin');
const warningBadge = el('warningBadge');
const newFounderName = el('newFounderName');
const newFounderPass = el('newFounderPass');
const createFounderBtn = el('createFounderBtn');
const createFounderSection = el('createFounderSection');
const sysUptime = el('sysUptime');
const sysRam = el('sysRam');
const ramBarFill = el('ramBarFill');
const refreshDataBtn = el('refreshDataBtn');
const settingsBtn = el('settingsBtn');
const settingsModal = el('settingsModal');
const closeSettingsBtn = el('closeSettingsBtn');
const soundToggle = el('soundToggle');
const fullscreenBtn = el('fullscreenBtn');
const bulkActionBar = el('bulkActionBar');
const selectedCountEl = el('selectedCount');
const bulkDeleteBtn = el('bulkDeleteBtn');
const bulkResetBtn = el('bulkResetBtn');
const bulkExtendBtn = el('bulkExtendBtn');
const backupBtn = el('backupBtn');
const restoreBtn = el('restoreBtn');
const restoreInput = el('restoreInput');
const logSearchInput = el('logSearchInput');
const copyLogsBtn = el('copyLogsBtn');
const discordWebhookInput = el('discordWebhookInput');
const saveWebhookBtn = el('saveWebhookBtn');
const testWebhookBtn = el('testWebhookBtn');
const banHwidInput = el('banHwidInput');
const banReasonInput = el('banReasonInput');
const banBtn = el('banBtn');
const selectAllKeys = el('selectAllKeys');
const userSearchInput = el('userSearchInput');
const clearLogsBtn = el('clearLogsBtn');
const lowPerfToggle = el('lowPerfToggle');
let keysChart = null;
let currentFilter = 'all';
let currentSort = 'newest';

// Duyuru metinlerini güncelleme fonksiyonu (Giriş ve Panel için)
function setAnnouncement(text) {
  document.querySelectorAll('.announcement-text').forEach(el => el.textContent = text);
}

function saveToken(t){localStorage.setItem('token', t)}
function getToken(){return localStorage.getItem('token')}
function setAuthHeader(h){return { 'Content-Type':'application/json', 'Authorization': 'Bearer '+getToken() }}

async function login(){
  loginError.textContent='';
  if (!username.value.trim()) { loginError.textContent = 'Kullanıcı adı girin'; return; }
  if (!password.value) { loginError.textContent = 'Şifre girin'; return; }
  
  const originalBtnText = loginBtn.textContent;
  loginBtn.textContent = 'Giriş Yapılıyor...';
  loginBtn.disabled = true;

  try {
    const res = await fetch(api.login, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:username.value.trim(), password:password.value.trim()})});
    const j = await res.json().catch(()=>({}));
    if (!res.ok){ loginError.textContent = j.error || 'Giriş hatası'; showToast(j.error || 'Giriş başarısız', 'error'); loginBtn.textContent = originalBtnText; loginBtn.disabled = false; return; }
    if (!j.token || !j.user){ loginError.textContent = 'Sunucu hatası'; return; }
    playAudio('success');
    saveToken(j.token);
    showPanel(j.user);
  } catch (e) {
    console.error('Login error:', e);
    showToast('Sunucuya bağlanılamadı', 'error');
    loginBtn.textContent = originalBtnText;
    loginBtn.disabled = false;
  }
}

function showPanel(user){
  loginCard.classList.add('hidden');
  panelCard.classList.remove('hidden');
  displayName.textContent = user.username;
  // map backend roles to Turkish display names
  const roleMap = { 'founder': 'Yönetici (Kurucu)', 'manager': 'Yönetici', 'admin': 'Admin' };
  roleEl.textContent = roleMap[user.role] || user.role;
  currentUser = user;
  loadConfigAndKeys();
  showFounderControls(user);
  switchTab('keys');
}

async function loadConfigAndKeys(){
  try{
    // Önce güncel kullanıcı bilgisini al (canRevoke vs.)
    const meRes = await fetch(api.me, {headers: setAuthHeader()});
    if (meRes.ok) {
      const meData = await meRes.json();
      if (currentUser) {
        currentUser.canRevoke = meData.canRevoke;
        currentUser.role = meData.role;
        currentUser.maxDays = meData.maxDays;
        currentUser.maxKeys = meData.maxKeys;
        
        // Uyarı kontrolü
        if (meData.warnings && meData.warnings > 0) {
          warningBadge.style.display = 'inline-block';
          warningBadge.textContent = `⚠️ ${meData.warnings}/3 UYARI`;
        }
      }
    }
    // cache: 'no-store' ekleyerek her seferinde sunucudan taze veri almasını sağla
    const confRes = await fetch(api.config, {headers: setAuthHeader(), cache: 'no-store'});
    const conf = await confRes.json();
    if (confRes.ok){
      updateStatusUI(conf.cheatStatus);
      const radio = document.querySelector(`input[name="cheatStatus"][value="${conf.cheatStatus}"]`);
      if (radio) radio.checked = true;
    }
    if(conf.announcement) setAnnouncement(conf.announcement);
    if(announceInput) announceInput.value = conf.announcement || '';
    if(maintenanceToggle) maintenanceToggle.checked = !!conf.maintenance;
    if(discordWebhookInput && conf.discordWebhook) discordWebhookInput.value = conf.discordWebhook;
  }catch(e){}
  refreshKeys();
}

function showFounderControls(user){
  const founderTabs = document.querySelectorAll('.panelTab.founderOnly');
  if (user.role === 'founder'){
    founderTabs.forEach(t => t.classList.add('visible'));
    updateAdminStats();
    loadLogs();
    loadUsers();
    loadBlacklist();
    
    // Security Alerts (All Founders)
    loadOwnerAlerts();
    if(ownerZone) ownerZone.classList.remove('hidden');

    // Create Founder (Quartz Only)
    if (user.username.toLowerCase() === 'quartz') {
      if(createFounderSection) createFounderSection.classList.remove('hidden');
    } else {
      if(createFounderSection) createFounderSection.classList.add('hidden');
    }
    // Show backup buttons in settings
    document.querySelectorAll('.founderOnly').forEach(el => el.classList.remove('hidden'));
  } else {
    founderTabs.forEach(t => t.classList.remove('visible'));
    if(ownerZone) ownerZone.classList.add('hidden');
    document.querySelectorAll('.founderOnly').forEach(el => el.classList.add('hidden'));
  }
}

async function updateAdminStats(){
  try {
    const res = await fetch('/api/admin/stats', {headers:setAuthHeader()});
    if(res.ok){
      const data = await res.json();
      if(expiredCountEl) expiredCountEl.textContent = data.expiredCount;
      const totalUsersEl = document.getElementById('totalUsersCount');
      if(totalUsersEl) totalUsersEl.textContent = data.totalUsers;
      loadDashboardData(); // Grafiği de güncelle
    }
  } catch(e){}
}

function updateStatusUI(status) {
  if (!cheatStatusDisplay) return;
  const map = {
    'SAFE': { text: '🟢 GÜVENLİ', color: '#10b981' },
    'RISK': { text: '🟡 RİSKLİ', color: '#f59e0b' },
    'UPDATE': { text: '🟠 GÜNCELLENİYOR', color: '#f97316' },
    'DETECTED': { text: '🔴 TESPİT EDİLDİ', color: '#ef4444' }
  };
  const s = map[status] || map['SAFE'];
  cheatStatusDisplay.textContent = s.text;
  cheatStatusDisplay.style.color = s.color;
  
  // Giriş ekranındaki badge'i de güncelle (varsa)
  const badge = document.querySelector('.status-badge');
  if(badge) { 
    // Emojiyi temizle, sadece metni al (örn: "🟠 GÜNCELLENİYOR" -> "GÜNCELLENİYOR")
    const textOnly = s.text.includes(' ') ? s.text.split(' ').slice(1).join(' ') : s.text;
    badge.innerHTML = `<span class="status-dot" style="background:${s.color}; box-shadow: 0 0 15px ${s.color}; width:8px; height:8px; border-radius:50%; display:inline-block;"></span>${textOnly}`; 
    badge.style.color = s.color; 
    badge.style.borderColor = s.color + '30'; 
    badge.style.background = `linear-gradient(90deg, ${s.color}05 0%, ${s.color}15 100%)`; // Çok hafif, modern gradient
    badge.style.boxShadow = `0 0 30px -10px ${s.color}30`; // Yumuşak glow
  }
}

function switchTab(tabId){
  document.querySelectorAll('.panelTab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.panelContent').forEach(c=>c.classList.remove('active'));
  const tab = document.querySelector(`.panelTab[data-tab="${tabId}"]`);
  const content = document.getElementById(`tab-${tabId}`);
  if (tab) tab.classList.add('active');
  if (content) content.classList.add('active');
}

async function refreshKeys(){
  const res = await fetch(api.keys, {headers: setAuthHeader(), cache: 'no-store'});
  const j = await res.json();
  cachedKeys = res.ok && Array.isArray(j.keys) ? j.keys : [];
  renderKeys();
  
  // Son 5 Keyi Dashboard'a Yaz
  const lastKeysEl = document.getElementById('lastKeysList');
  if(lastKeysEl && cachedKeys.length > 0) {
    const last5 = cachedKeys.slice(0, 5);
    lastKeysEl.innerHTML = last5.map(k => `<div style="border-bottom:1px solid rgba(255,255,255,0.05); padding:4px 0; display:flex; justify-content:space-between;"><span>${k.key}</span> <span style="color:var(--muted)">${k.days}G</span></div>`).join('');
  } else if(lastKeysEl) {
    lastKeysEl.innerHTML = '<span style="color:var(--muted)">Henüz key yok</span>';
  }
}
function renderKeys(){
  keysList.innerHTML='';
  const statTotalEl = document.getElementById('statTotal');
  const statActiveEl = document.getElementById('statActive');
  const q = (filterInput && filterInput.value || '').toLowerCase();
  const now = Date.now();
  const canEdit = currentUser && (currentUser.role === 'founder' || currentUser.role === 'admin' || (currentUser.role === 'manager' && currentUser.canRevoke));
  
  let arr = cachedKeys.slice();
  if (currentSort === 'newest') arr.reverse();

  arr = arr.filter(k=>{
    // Text Filter
    const matchesText = !q || (k.key||'').toLowerCase().includes(q) || (k.createdBy||'').toLowerCase().includes(q);
    // Status Filter
    if (currentFilter === 'active' && k.expiresAt < now) return false;
    if (currentFilter === 'expired' && k.expiresAt >= now) return false;
    return matchesText;
  });
  arr.forEach(k=>{
      const d = new Date(k.createdAt);
      const expires = new Date(k.expiresAt);
      
      // Progress Bar Calculation
      const totalDuration = k.expiresAt - k.createdAt;
      const elapsed = now - k.createdAt;
      let percent = (elapsed / totalDuration) * 100;
      if(percent > 100) percent = 100;
      if(percent < 0) percent = 0;

      const platformClass = (k.platform || 'ANDROID').toUpperCase();
      const div = document.createElement('div'); div.className=`keyItem platform-${platformClass}`;
      
      // Checkbox logic
      let checkboxHtml = '';
      if (canEdit) {
        checkboxHtml = `<input type="checkbox" class="key-checkbox" data-id="${k.id}">`;
      }

      let actions = `<button class="btn btnGhost copyBtn" title="Kopyala">📋</button>`;
      if (canEdit){
        actions += ` <button class="btn btnGhost resetHwidBtn" data-id="${k.id}" style="color:#f59e0b; border-color:#f59e0b">🔓 HWID</button>`;
      }
      if (canEdit){
        actions += ` <button class="btn btnGhost revokeBtn" data-id="${k.id}" style="color:var(--danger); border-color:var(--danger)">İptal</button>`;
      }
      const createdByText = k.createdByRole ? `${k.createdBy} (${k.createdByRole})` : k.createdBy;
      const noteText = k.note || '';
      const noteHtml = `<div style="display:flex; align-items:center; gap:6px; margin-top:4px;"><span style="color:var(--accent); font-size:12px;">📝 ${noteText || 'Not yok'}</span> <button class="btn btnGhost editNoteBtn" data-id="${k.id}" data-note="${noteText.replace(/"/g,'&quot;')}" style="padding:2px 6px; font-size:10px;">✏️</button></div>`;
      
      div.innerHTML = `
        <div class="keyItem__main"><div style="display:flex;align-items:center">${checkboxHtml}<span class="keyItem__key" data-key="${(k.key||'').replace(/"/g,'&quot;')}">${k.key}</span></div><div class="keyItem__actions">${actions}</div></div>
        <div class="keyItem__meta">${k.platform || 'ANDROID'} • ${k.maxDevices || 1} Cihaz • ${createdByText} • ${d.toLocaleString()} • ${k.days} gün • Bitiş: ${expires.toLocaleDateString()}</div>${noteHtml}
        <div class="key-progress-bg"><div class="key-progress-fill" style="width:${100 - percent}%"></div></div>`;
    keysList.appendChild(div);
  });
  if (statTotalEl) statTotalEl.textContent = cachedKeys.length;
  if (statActiveEl){ const now = Date.now(); statActiveEl.textContent = cachedKeys.filter(k=>k.expiresAt > now).length; }
  document.querySelectorAll('.copyBtn').forEach(b=>{
    b.addEventListener('click', async (ev)=>{ 
      const keyEl = ev.target.closest('.keyItem').querySelector('[data-key]');
      const text = keyEl ? keyEl.getAttribute('data-key') : '';
      try {
        await navigator.clipboard.writeText(text);
        showToast('Key kopyalandı!');
      } catch(e) {
        // Fallback for non-secure contexts
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try { document.execCommand('copy'); showToast('Key kopyalandı!'); } catch (err) { showToast('Kopyalama başarısız', 'error'); }
        document.body.removeChild(textArea);
      }
    });
  });
  document.querySelectorAll('.revokeBtn').forEach(b=>{
    b.addEventListener('click', async (ev)=>{
      const id = ev.target.getAttribute('data-id');
      revokeKey(id);
    });
  });
  document.querySelectorAll('.resetHwidBtn').forEach(b=>{
    b.addEventListener('click', async (ev)=>{
      const id = ev.target.getAttribute('data-id');
      resetHWID(id);
    });
  });
  document.querySelectorAll('.editNoteBtn').forEach(b=>{
    b.addEventListener('click', async (ev)=>{
      const id = ev.target.getAttribute('data-id');
      const oldNote = ev.target.getAttribute('data-note');
      const newNote = prompt('Yeni not girin:', oldNote);
      if(newNote === null) return; // İptal
      try {
        const res = await fetch('/api/update-key-note', { method:'POST', headers: setAuthHeader(), body: JSON.stringify({ id, note: newNote }) });
        if(res.ok) { showToast('Not güncellendi'); refreshKeys(); }
        else showToast('Güncellenemedi', 'error');
      } catch(e){ showToast('Hata', 'error'); }
    });
  });

  // Checkbox Event Listeners
  document.querySelectorAll('.key-checkbox').forEach(cb => {
    cb.addEventListener('change', updateBulkActionUI);
  });
  // Reset bulk UI
  updateBulkActionUI();
}

// Select All Keys Logic
if(selectAllKeys) selectAllKeys.addEventListener('change', (e) => {
  const checked = e.target.checked;
  document.querySelectorAll('.key-checkbox').forEach(cb => {
    cb.checked = checked;
  });
  updateBulkActionUI();
});

if(sortSelect) sortSelect.addEventListener('change', () => {
  currentSort = sortSelect.value;
  renderKeys();
});

// Filter Buttons Logic
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    renderKeys();
  });
});

// --- BULK ACTIONS LOGIC ---
function getSelectedKeyIds() {
  const checkboxes = document.querySelectorAll('.key-checkbox:checked');
  return Array.from(checkboxes).map(cb => cb.getAttribute('data-id'));
}

function updateBulkActionUI() {
  const count = document.querySelectorAll('.key-checkbox:checked').length;
  if (count > 0) {
    bulkActionBar.classList.remove('hidden');
    selectedCountEl.textContent = `${count} seçildi`;
  } else {
    bulkActionBar.classList.add('hidden');
  }
}

async function performBulkAction(action) {
  const ids = getSelectedKeyIds();
  if (ids.length === 0) return;
  
  if (!confirm(`${ids.length} adet key için işlem yapılacak. Emin misin?`)) return;

  try {
    const res = await fetch('/api/bulk-action', {
      method: 'POST',
      headers: setAuthHeader(),
      body: JSON.stringify({ action, ids })
    });
    const j = await res.json();
    if (res.ok) {
      showToast(`İşlem başarılı: ${j.count} key etkilendi`);
      refreshKeys();
    } else {
      showToast(j.error || 'Hata oluştu', 'error');
    }
  } catch (e) { showToast('Bağlantı hatası', 'error'); }
}

if(bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', () => performBulkAction('delete'));
if(bulkResetBtn) bulkResetBtn.addEventListener('click', () => performBulkAction('reset-hwid'));
if(bulkExtendBtn) bulkExtendBtn.addEventListener('click', () => performBulkAction('extend'));

function logout(){ 
  localStorage.removeItem('token'); 
  loginCard.classList.remove('hidden'); 
  panelCard.classList.add('hidden'); 
  loginBtn.disabled = false;
  loginBtn.textContent = 'Giriş Yap';
}

(async function(){
  const token = getToken();
  if (!token) return;
  try{
    const resp = await fetch(api.config, {headers:setAuthHeader()});
    if (!resp.ok){ localStorage.removeItem('token'); return }
    const payload = JSON.parse(atob(token.split('.')[1]));
      const user = { username: payload.username, role: payload.role, canRevoke: !!payload.canRevoke, maxDays: payload.maxDays, maxKeys: payload.maxKeys };
    showPanel(user);
      showFounderControls(user);
  }catch(e){ localStorage.removeItem('token'); }
})();

async function createUser(){
  try {
    // Validation
    if (!newUsername.value || !newUsername.value.trim()) {
      founderMsg.textContent = 'Kullanıcı adı boş bırakılamaz';
      founderMsg.style.color = '#ffb4b4';
      return;
    }
    if (!newPassword.value || newPassword.value.length < 1) {
      founderMsg.textContent = 'Şifre boş bırakılamaz';
      founderMsg.style.color = '#ffb4b4';
      return;
    }
    // Zorunlu alan kontrolleri
    if (!newAccountDuration.value || !newMaxDays.value || !newMaxKeys.value) {
      founderMsg.textContent = 'Lütfen tüm limit alanlarını doldurun (Hesap Süresi, Key Süresi, Key Adedi)';
      founderMsg.style.color = '#ffb4b4';
      return;
    }
    
    // Get selected role from radio button
    const roleRadio = document.querySelector('input[name="role"]:checked');
    const role = roleRadio ? roleRadio.value : 'admin';
    
    founderMsg.textContent = 'İşlem yapılıyor...';
    founderMsg.style.color = 'var(--muted)';
    const body = { username: newUsername.value.trim(), password: newPassword.value.trim(), role, canRevoke: !!(newCanRevoke && newCanRevoke.checked) };
    const ad = Number(newAccountDuration.value);
    if (ad && ad >= 1) body.accountDuration = ad;
    const md = Number(newMaxDays.value) || undefined;
    if (md && md >= 1 && md <= 3650) body.maxDays = md;
    const mk = Number(newMaxKeys.value) || undefined;
    if (mk && mk >= 1 && mk <= 10000) body.maxKeys = mk;
    console.log('[CreateUser] Sending:', body);
    const res = await fetch('/api/users', { method: 'POST', headers: setAuthHeader(), body: JSON.stringify(body) });
    const j = await res.json();
    console.log('[CreateUser] Response:', res.status, j);
    if (!res.ok){ founderMsg.textContent = j.error || 'Hata: '+res.status; founderMsg.style.color = '#ffb4b4'; showToast(j.error, 'error'); return }
    founderMsg.textContent = '✓ Kullanıcı oluşturuldu: ' + newUsername.value; founderMsg.style.color = 'var(--accent)';
    newUsername.value=''; newPassword.value=''; newAccountDuration.value=''; newMaxDays.value=''; newMaxKeys.value='';
    loadUsers();
  } catch (e) {
    console.error('[CreateUser] Error:', e);
    founderMsg.textContent = 'Hata: ' + e.message;
    founderMsg.style.color = '#ffb4b4';
  }
}

async function updateUserMaxDays(username){
  try {
    founderMsg.textContent = 'İşlem yapılıyor...';
    founderMsg.style.color = 'var(--muted)';
    const input = document.querySelector(`.userMaxInput[data-user="${username}"]`);
    if (!input) { founderMsg.textContent = 'Input bulunamadı'; founderMsg.style.color = '#ffb4b4'; return; }
    const maxDays = Number(input.value);
    if (!maxDays || maxDays < 1 || maxDays > 3650) { founderMsg.textContent = 'Gün sayısı 1-3650 arasında olmalı'; founderMsg.style.color = '#ffb4b4'; return; }
    console.log('[UpdateUserMax]', username, 'setting to', maxDays);
    const res = await fetch('/api/update-user-max-days', { method:'POST', headers:setAuthHeader(), body: JSON.stringify({ username, maxDays }) });
    const j = await res.json();
    console.log('[UpdateUserMax] Response:', res.status, j);
    if (!res.ok){ founderMsg.textContent = j.error || 'Hata: '+res.status; founderMsg.style.color = '#ffb4b4'; showToast(j.error, 'error'); return }
    founderMsg.textContent = username + ' için hesaba giriş süresi: ' + j.maxDays + ' gün'; founderMsg.style.color = 'var(--accent)';
    loadUsers();
  } catch (e) {
    console.error('[UpdateUserMax] Error:', e);
    founderMsg.textContent = 'Hata: ' + e.message;
    founderMsg.style.color = '#ffb4b4';
  }
}

async function updateUserMaxKeys(username){
  try {
    founderMsg.textContent = 'İşlem yapılıyor...';
    founderMsg.style.color = 'var(--muted)';
    const input = document.querySelector(`.userMaxKeysInput[data-user="${username}"]`);
    if (!input) { founderMsg.textContent = 'Input bulunamadı'; founderMsg.style.color = '#ffb4b4'; return; }
    const maxKeys = Number(input.value);
    if (!maxKeys || maxKeys < 1 || maxKeys > 10000) { founderMsg.textContent = 'Key sayısı 1-10000 arasında olmalı'; founderMsg.style.color = '#ffb4b4'; return; }
    console.log('[UpdateUserMaxKeys]', username, 'setting to', maxKeys);
    const res = await fetch('/api/update-user-max-keys', { method:'POST', headers:setAuthHeader(), body: JSON.stringify({ username, maxKeys }) });
    const j = await res.json();
    console.log('[UpdateUserMaxKeys] Response:', res.status, j);
    if (!res.ok){ founderMsg.textContent = j.error || 'Hata: '+res.status; founderMsg.style.color = '#ffb4b4'; showToast(j.error, 'error'); return }
    founderMsg.textContent = username + ' için max key: ' + j.maxKeys; founderMsg.style.color = 'var(--accent)';
    loadUsers();
  } catch (e) {
    console.error('[UpdateUserMaxKeys] Error:', e);
    founderMsg.textContent = 'Hata: ' + e.message;
    founderMsg.style.color = '#ffb4b4';
  }
}

async function cleanExpired(){
  if(!confirm('Süresi dolmuş tüm keyleri silmek istediğine emin misin?')) return;
  try {
    const res = await fetch('/api/clean-expired', { method:'POST', headers:setAuthHeader() });
    const j = await res.json();
    if(res.ok){
      showToast(j.deleted + ' adet süresi dolmuş key silindi.');
      updateAdminStats();
      refreshKeys();
    } else {
      showToast('Hata: ' + j.error, 'error');
    }
  } catch (e) {
    showToast('Bağlantı hatası', 'error');
  }
}

async function loadUsers(){
  const el = document.getElementById('usersList');
  if (!el) return;
  el.innerHTML = 'Yükleniyor...';
  const search = userSearchInput ? userSearchInput.value.toLowerCase() : '';
  
  const res = await fetch('/api/users', { headers: setAuthHeader() });
  if (!res.ok){ el.innerHTML = '<div style="color:#ffb4b4">Kullanıcılar yüklenemedi</div>'; return }
  const j = await res.json();
  el.innerHTML = '';
  
  const filteredUsers = j.users.filter(u => !search || u.username.toLowerCase().includes(search));
  
  if (!j.users || j.users.length === 0) {
    el.innerHTML = '<div style="padding:15px; text-align:center; color:var(--muted);">Oluşturulan kullanıcı yok</div>';
    return;
  }
  filteredUsers.forEach(u=>{
    const row = document.createElement('div');
    row.className = 'userRow';
    // don't show reset/toggle for founders unless Quartz
    let right = '';
    const isQuartz = currentUser && currentUser.username.toLowerCase() === 'quartz';
    
    if (isQuartz){
      right = `<input placeholder="Yeni şifre" class="pwInput" data-user="${u.username}" /><button class="btn btnGhost resetBtn" data-user="${u.username}">Şifre Sıfırla</button>`;
    } else {
      right = ``;
    }
    // show canRevoke status and toggle for founders
    let revokeInfo = '';
    if (u.role === 'admin' || u.role === 'manager'){
      revokeInfo = `<span style="color:var(--muted);margin-left:8px">Key İptal Yetkisi: ${u.canRevoke ? 'Evet' : 'Hayır'}</span>`;
      if (currentUser && currentUser.role === 'founder'){
        right += ` <button class="btn btnGhost toggleRevoke" data-user="${u.username}" data-can="${u.canRevoke}">${u.canRevoke ? 'Yetki Kaldır' : 'Yetki Ver'}</button>`;
      }
    }
    // if currentUser is founder, allow deleting non-founders
    let deleteBtn = '';
    if (currentUser && currentUser.role === 'founder' && u.role !== 'founder') deleteBtn = ` <button class="btn btnGhost deleteUser" data-user="${u.username}">Sil</button>`;
    
    // Force Logout Button
    if (currentUser && currentUser.role === 'founder') deleteBtn += ` <button class="btn btnGhost forceLogoutBtn" data-user="${u.username}" title="Oturumları Kapat" style="color:#f59e0b; border-color:#f59e0b">🚪</button>`;
    
    // Max days and max keys edit for non-founders
    let limitsEdit = '';
    if (currentUser && currentUser.role === 'founder' && u.role !== 'founder') {
      limitsEdit = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input type="number" min="1" max="3650" value="${u.maxDays || ''}" placeholder="Gün" class="userMaxInput" data-user="${u.username}" style="width:50px;padding:6px;border-radius:6px;background:var(--bgCard);border:1px solid var(--border);color:inherit;font-size:12px" />
        <button class="btn btnGhost updateMaxBtn" data-user="${u.username}" style="padding:4px 8px;font-size:12px">✓ Gün</button>
        <input type="number" min="1" max="10000" value="${u.maxKeys || ''}" placeholder="Key" class="userMaxKeysInput" data-user="${u.username}" style="width:50px;padding:6px;border-radius:6px;background:var(--bgCard);border:1px solid var(--border);color:inherit;font-size:12px" />
        <button class="btn btnGhost updateMaxKeysBtn" data-user="${u.username}" style="padding:4px 8px;font-size:12px">✓ Key</button>
      </div>`;
    }
    
    let maxInfo = '';
    if (u.maxDays) maxInfo += ` • Hesaba giriş süresi: ${u.maxDays} gün`;
    if (u.maxKeys) maxInfo += ` • Max Key: ${u.maxKeys}`;
    if (u.maxKeys) maxInfo += ` • Oluşturabileceği Key Adedi: ${u.maxKeys}`;
    const roleTr = { founder: 'Kurucu', admin: 'Admin', manager: 'Yönetici' }[u.role] || u.role;
    const keyCountBadge = `<span style="background:rgba(255,255,255,0.1); color:var(--accent); padding:2px 6px; border-radius:4px; font-size:11px; margin-left:6px; font-weight:bold;">🔑 ${u.totalKeys || 0} Key</span>`;
    
    // Last Login Info
    let loginInfo = '';
    if(u.lastLoginAt) {
      loginInfo = `<div style="font-size:11px; color:var(--muted); margin-top:2px;">Son Giriş: ${new Date(u.lastLoginAt).toLocaleString()} (IP: <span class="copy-ip" style="cursor:pointer; text-decoration:underline;" title="Kopyala">${u.lastLoginIp || '?'}</span>)</div>`;
    }
    // Admin Note
    const noteHtml = `<div style="margin-top:4px; font-size:12px; color:var(--accent); cursor:pointer;" class="user-note" data-user="${u.username}" data-note="${u.adminNote || ''}">📝 ${u.adminNote || 'Not ekle...'}</div>`;
    
    row.innerHTML = `<div><strong>${u.username}</strong> ${keyCountBadge} — ${roleTr}${maxInfo} ${revokeInfo}${loginInfo}${noteHtml}</div><div style="display:flex;gap:8px;align-items:center">${limitsEdit}${right}${deleteBtn}</div>`;
    el.appendChild(row);
  });
  document.querySelectorAll('.resetBtn').forEach(b=>{
    b.addEventListener('click', async (ev)=>{
      const username = ev.target.getAttribute('data-user');
      const input = document.querySelector(`.pwInput[data-user="${username}"]`);
      const newPassword = (input.value || prompt('Yeni şifre gir:') || '').trim();
      if (!newPassword) return alert('Şifre boş olamaz');
      const r = await fetch('/api/reset-password', { method:'POST', headers: setAuthHeader(), body: JSON.stringify({ username, newPassword }) });
      if (!r.ok) return showToast('Şifre sıfırlamada hata', 'error');
      showToast('Şifre sıfırlandı'); input.value='';
    });
  });
  document.querySelectorAll('.toggleRevoke').forEach(b=>{
    b.addEventListener('click', async (ev)=>{
      const username = ev.target.getAttribute('data-user');
      const current = ev.target.getAttribute('data-can') === 'true';
      const can = !current;
      const r = await fetch('/api/set-revoke-permission', { method:'POST', headers: setAuthHeader(), body: JSON.stringify({ username, canRevoke: can }) });
      if (!r.ok) return showToast('Yetki değiştirilemedi', 'error');
      showToast('Yetki güncellendi');
      loadUsers();
    });
  });
  document.querySelectorAll('.updateMaxBtn').forEach(b=>{
    b.addEventListener('click', async (ev)=>{
      const username = ev.target.getAttribute('data-user');
      await updateUserMaxDays(username);
    });
  });
  document.querySelectorAll('.updateMaxKeysBtn').forEach(b=>{
    b.addEventListener('click', async (ev)=>{
      const username = ev.target.getAttribute('data-user');
      await updateUserMaxKeys(username);
    });
  });
  document.querySelectorAll('.deleteUser').forEach(b=>{
    b.addEventListener('click', async (ev)=>{
      const username = ev.target.getAttribute('data-user');
      if (!confirm('Kullanıcıyı silmek istediğine emin misin?')) return;
      const r = await fetch('/api/delete-user', { method:'POST', headers: setAuthHeader(), body: JSON.stringify({ username }) });
      if (!r.ok) return showToast('Kullanıcı silinemedi', 'error');
      showToast('Kullanıcı silindi'); loadUsers();
    });
  });
  document.querySelectorAll('.toggleRevoke').forEach(b=>{
    b.addEventListener('click', async (ev)=>{
      const username = ev.target.getAttribute('data-user');
      const current = ev.target.getAttribute('data-can') === 'true';
      const can = !current;
      const r = await fetch('/api/set-revoke-permission', { method:'POST', headers: setAuthHeader(), body: JSON.stringify({ username, canRevoke: can }) });
      if (!r.ok) return showToast('Yetki değiştirilemedi', 'error');
      showToast('Yetki güncellendi');
      loadUsers();
    });
  });
}

async function updateMe(){
  const body = { newUsername: meUsername.value || undefined, newPassword: mePassword.value || undefined };
  const res = await fetch('/api/update-me', { method:'POST', headers: setAuthHeader(), body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok){ meMsg.textContent = j.error || 'Hata'; meMsg.style.color = '#ffb4b4'; return }
  // save new token and update UI
  if (j.token) saveToken(j.token);
  currentUser = j.user;
  displayName.textContent = currentUser.username;
  meMsg.textContent = 'Güncellendi'; meMsg.style.color = 'var(--accent)';
  meUsername.value=''; mePassword.value='';
  loadUsers();
}

async function revokeKey(id){
  if (!confirm('Bu keyi iptal etmek istediğine emin misin?')) return;
  try {
    const res = await fetch(api.revoke, { method:'POST', headers: setAuthHeader(), body: JSON.stringify({ id }) });
    const j = await res.json();
    if (!res.ok) return showToast('İptal edilemedi: ' + (j.error || res.status), 'error');
    showToast('Key iptal edildi');
    refreshKeys();
  } catch (e) {
    showToast('İptal hatası: ' + e.message, 'error');
  }
}

createUserBtn.addEventListener('click', createUser);
if(cleanExpiredBtn) cleanExpiredBtn.addEventListener('click', cleanExpired);
filterInput.addEventListener('input', renderKeys);
exportBtn.addEventListener('click', async ()=>{
  const res = await fetch(api.keys, {headers:setAuthHeader()}); const j = await res.json();
  if (!res.ok) return showToast('Dışa aktarılamadı', 'error');
  const csv = ['key,days,createdBy,createdAt,expiresAt', ...j.keys.map(k=>`"${k.key}",${k.days},${k.createdBy},${new Date(k.createdAt).toISOString()},${new Date(k.expiresAt).toISOString()}`)].join('\n');
  const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'keys.csv'; a.click(); URL.revokeObjectURL(url);
});
if(exportTxtBtn) exportTxtBtn.addEventListener('click', async ()=>{
  const res = await fetch(api.keys, {headers:setAuthHeader()}); const j = await res.json();
  if (!res.ok) return showToast('Dışa aktarılamadı', 'error');
  const txt = j.keys.map(k => k.key).join('\n');
  const blob = new Blob([txt], {type:'text/plain'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'keys.txt'; a.click(); URL.revokeObjectURL(url);
});

// Copy Unused Keys Button (New Feature)
const copyUnusedBtn = document.createElement('button');
copyUnusedBtn.className = 'btn btnGhost';
copyUnusedBtn.textContent = 'Kullanılmayanları Kopyala';
copyUnusedBtn.style.marginLeft = '8px';
copyUnusedBtn.onclick = async () => {
  const res = await fetch(api.keys, {headers:setAuthHeader()});
  const j = await res.json();
  if (!res.ok) return;
  const unused = j.keys.filter(k => !k.hwid).map(k => k.key).join('\n');
  if(!unused) return showToast('Kullanılmamış key yok', 'error');
  await navigator.clipboard.writeText(unused);
  showToast('Kullanılmamış keyler kopyalandı!');
};
// Add button to header
if(exportBtn) exportBtn.parentNode.insertBefore(copyUnusedBtn, exportBtn);

document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  await login();
  if (currentUser) showFounderControls(currentUser);
});

document.querySelectorAll('.panelTab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    const id = tab.getAttribute('data-tab');
    if (id) switchTab(id);
  });
});

updateMeBtn.addEventListener('click', updateMe);

if(updateStatusBtn) updateStatusBtn.addEventListener('click', async () => {
  const selected = document.querySelector('input[name="cheatStatus"]:checked');
  const status = selected ? selected.value : 'SAFE';
  const originalText = updateStatusBtn.textContent;
  updateStatusBtn.textContent = '...';
  try {
    const res = await fetch('/api/set-status', { method:'POST', headers: setAuthHeader(), body: JSON.stringify({ status }) });
    if(res.ok){
      // UI'ı güncelle ve sunucudan teyit et
      await loadConfigAndKeys(); 
      showToast('Durum güncellendi!');
    } else {
      showToast('Hata: Kaydedilemedi.', 'error');
    }
  } finally {
    updateStatusBtn.textContent = originalText;
  }
});

if(saveAnnounceBtn) saveAnnounceBtn.addEventListener('click', async () => {
  const text = announceInput.value;
  const res = await fetch('/api/set-announcement', { method:'POST', headers: setAuthHeader(), body: JSON.stringify({ text }) });
  if(res.ok){
    setAnnouncement(text);
    showToast('Duyuru güncellendi!');
  } else {
    showToast('Duyuru kaydedilemedi', 'error');
  }
});

genBtn.addEventListener('click', async ()=>{
  genResultContainer.classList.add('hidden');
  genResultArea.value = '';
  const originalText = genBtn.textContent;
  genBtn.textContent = '...';
  
  try {
    const days = Number(daysInput.value)||1;
    const count = Number(countInput.value)||1;
    const maxDevices = Number(maxDevicesInput.value)||1;
    const platformInput = document.getElementById('selectedPlatform');
    const platform = platformInput ? platformInput.value : 'ANDROID';
    const prefix = prefixInput ? prefixInput.value.trim() : 'KAPLANVIP';
    const hideDays = hideDaysInput ? hideDaysInput.checked : false;
    const note = noteInput ? noteInput.value.trim() : '';
    
    const res = await fetch(api.generate, {method:'POST', headers: setAuthHeader(), body: JSON.stringify({days, platform, count, maxDevices, note, prefix, hideDays})});
    const j = await res.json();
    
    // Güvenlik İhlali Yakalandıysa
    if (res.status === 403 && j.error === 'ILLEGAL_OPERATION') {
      playAudio('error');
      alert('⚠️ GÜVENLİK UYARISI: ' + j.message + '\n\nSistemden atılıyorsunuz.');
      logout();
      return;
    }

    if (!res.ok){ 
      showToast(j.error || 'Hata: '+res.status, 'error');
      playAudio('error');
      return 
    }
    
    const keysText = j.keys.map(k => k.key).join('\n');
    genResultArea.value = keysText;
    
    // Sonuç kutusunun rengini platforma göre ayarla
    if(platform === 'IOS') genResultArea.style.color = '#3b82f6';
    else if(platform === 'EMU') genResultArea.style.color = '#f59e0b';
    else genResultArea.style.color = '#10b981';

    genResultContainer.classList.remove('hidden');
    
    playAudio('success');
    if(noteInput) noteInput.value = ''; // Notu temizle
    refreshKeys();
  } catch (e) {
    showToast('Hata: ' + e.message, 'error');
  } finally {
    genBtn.textContent = originalText;
  }
});

copyAllBtn.addEventListener('click', () => {
  genResultArea.select();
  document.execCommand('copy');
  const originalText = copyAllBtn.textContent;
  copyAllBtn.textContent = 'Kopyalandı!';
  setTimeout(() => copyAllBtn.textContent = originalText, 1500);
});

if(whatsappShareBtn) whatsappShareBtn.addEventListener('click', () => {
  const text = genResultArea.value;
  if(!text) return;
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
});

if(telegramShareBtn) telegramShareBtn.addEventListener('click', () => {
  const text = genResultArea.value;
  if(!text) return;
  const url = `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
});

if(maintenanceToggle) maintenanceToggle.addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  try {
    const res = await fetch('/api/set-maintenance', { method:'POST', headers: setAuthHeader(), body: JSON.stringify({ enabled }) });
    if(res.ok) showToast(enabled ? 'Bakım modu AÇILDI' : 'Bakım modu KAPATILDI');
    else { e.target.checked = !enabled; showToast('Hata oluştu', 'error'); }
  } catch(err) { e.target.checked = !enabled; }
});

// Live Clock
setInterval(() => {
  if(liveClock) {
    const now = new Date();
    liveClock.textContent = now.toLocaleTimeString('tr-TR');
  }
}, 1000);

// Neon Mode Toggle
if(neonToggleLogin) {
  neonToggleLogin.addEventListener('click', () => {
    document.body.classList.toggle('neon-mode');
    const isNeon = document.body.classList.contains('neon-mode');
    localStorage.setItem('neonMode', isNeon);
  });
  // Load preference
  if(localStorage.getItem('neonMode') === 'true') document.body.classList.add('neon-mode');
}

// Herkese açık durum ve duyuruyu yükle
async function loadPublicStatus() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      if (data.announcement) setAnnouncement(data.announcement);
      if (data.cheatStatus) updateStatusUI(data.cheatStatus);
    }
  } catch (e) {}
}

// Initialize on page load
window.addEventListener('load', async () => {
  loadPublicStatus(); // Giriş yapmadan da duyuruları çek
  const token = getToken();
  if (token) {
    try {
      const testRes = await fetch(api.config, {headers: setAuthHeader()});
      if (testRes.ok) {
        // Token valid, load user from localStorage or decode JWT
        const parts = token.split('.');
        if (parts.length === 3) {
          const decoded = JSON.parse(atob(parts[1]));
          showPanel(decoded);
        }
      } else {
        // Token invalid, clear it
        localStorage.removeItem('token');
      }
    } catch (e) {
      console.error('Token validation failed:', e);
      localStorage.removeItem('token');
    }
  }
});

// Custom Select Logic (Platform)
const platformSelect = document.querySelector('.custom-select');
if (platformSelect) {
    const trigger = platformSelect.querySelector('.custom-select__trigger');
    const options = platformSelect.querySelectorAll('.custom-option');
    const hiddenInput = document.getElementById('selectedPlatform');
    const triggerSpan = trigger.querySelector('span');

    trigger.addEventListener('click', () => {
        platformSelect.classList.toggle('open');
    });

    options.forEach(option => {
        option.addEventListener('click', () => {
            options.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            triggerSpan.textContent = option.textContent;
            hiddenInput.value = option.getAttribute('data-value');
            platformSelect.classList.remove('open');
        });
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!platformSelect.contains(e.target)) {
            platformSelect.classList.remove('open');
        }
    });
}

logoutBtn.addEventListener('click', logout);

// Toast Function
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'error' ? '⚠️' : '✅'}</span> ${message}`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Load Logs
async function loadLogs() {
  const list = document.getElementById('logsList');
  const search = logSearchInput ? logSearchInput.value.toLowerCase() : '';
  if(!list) return;
  try {
    const res = await fetch('/api/logs', {headers:setAuthHeader()});
    const j = await res.json();
    list.innerHTML = '';
    
    const filtered = j.logs.filter(l => 
      !search || 
      (l.username && l.username.toLowerCase().includes(search)) || 
      (l.action && l.action.toLowerCase().includes(search)) ||
      (l.details && l.details.toLowerCase().includes(search))
    );

    filtered.forEach(log => {
      const div = document.createElement('div');
      div.className = 'log-item';
      div.innerHTML = `<strong>${log.username}</strong> ${log.details} <span class="log-time">${new Date(log.timestamp).toLocaleString()}</span>`;
      list.appendChild(div);
    });
  } catch(e){}
}

if(logSearchInput) logSearchInput.addEventListener('input', loadLogs);

if(copyLogsBtn) copyLogsBtn.addEventListener('click', () => {
  const list = document.getElementById('logsList');
  if(list) {
    navigator.clipboard.writeText(list.innerText).then(() => showToast('Loglar kopyalandı'));
  }
});

if(clearLogsBtn) clearLogsBtn.addEventListener('click', async () => {
  if(!confirm('Tüm logları silmek istediğine emin misin?')) return;
  const res = await fetch('/api/admin/clear-logs', { method:'POST', headers:setAuthHeader() });
  if(res.ok) { showToast('Loglar temizlendi'); loadLogs(); }
});

// --- BLACKLIST LOGIC ---
async function loadBlacklist() {
  const container = document.getElementById('blacklistContainer');
  if(!container) return;
  try {
    const res = await fetch('/api/blacklist', {headers:setAuthHeader()});
    const j = await res.json();
    if(!res.ok) return;
    
    if(j.list.length === 0) {
      container.innerHTML = '<div style="padding:10px; color:var(--muted); text-align:center;">Liste boş</div>';
      return;
    }
    
    container.innerHTML = j.list.map(item => `
      <div class="userRow">
        <div>
          <strong style="color:var(--danger)">${item.hwid}</strong>
          <div style="font-size:11px; color:var(--muted)">Sebep: ${item.reason} • Yasaklayan: ${item.bannedBy}</div>
        </div>
        <button class="btn btnGhost" onclick="unbanHwid('${item.hwid}')" style="font-size:11px;">Kaldır</button>
      </div>
    `).join('');
  } catch(e){}
}

if(banBtn) banBtn.addEventListener('click', async () => {
  const hwid = banHwidInput.value.trim();
  const reason = banReasonInput.value.trim();
  if(!hwid) return showToast('HWID girin', 'error');
  
  const res = await fetch('/api/blacklist', { method:'POST', headers:setAuthHeader(), body:JSON.stringify({hwid, reason}) });
  if(res.ok) { showToast('HWID Yasaklandı'); banHwidInput.value=''; loadBlacklist(); }
  else showToast('Hata oluştu', 'error');
});

window.unbanHwid = async (hwid) => {
  if(!confirm('Yasağı kaldırmak istiyor musun?')) return;
  const res = await fetch('/api/blacklist', { method:'DELETE', headers:setAuthHeader(), body:JSON.stringify({hwid}) });
  if(res.ok) { showToast('Yasak kaldırıldı'); loadBlacklist(); }
};

// Load Security Alerts (All Founders)
async function loadOwnerAlerts() {
  if(!ownerZone) return;

  try {
    const res = await fetch('/api/owner/alerts', {headers:setAuthHeader()});
    if(!res.ok) return; // Yetki yoksa sessizce çık
    const data = await res.json();
    
    securityAlertsList.innerHTML = '';
    if (data.alerts && data.alerts.length > 0) {
      data.alerts.forEach(alert => {
        const isBan = !!alert.newPassword;
        const badgeText = isBan ? 'EL KONULDU' : 'LİMİT DOLDU';
        const badgeColor = isBan ? 'var(--danger)' : '#f59e0b';
        const extraInfo = isBan ? `<div style="margin-top:6px; font-family:monospace; background:rgba(255,255,255,0.1); padding:4px 8px; border-radius:4px; display:inline-block; color:var(--accent);">Yeni Şifre: ${alert.newPassword}</div>` : '';

        const div = document.createElement('div');
        div.style.cssText = 'background: rgba(0,0,0,0.3); padding: 12px; margin-bottom: 8px; border-radius: 8px; border-left: 3px solid var(--danger);';
        div.style.cssText = `background: rgba(0,0,0,0.3); padding: 12px; margin-bottom: 8px; border-radius: 8px; border-left: 3px solid ${badgeColor};`;
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:start;">
            <div>
              <strong style="color:#fff">${alert.targetUser}</strong> <span style="color:var(--danger); font-size:12px; font-weight:bold;">EL KONULDU</span>
              <strong style="color:#fff">${alert.targetUser}</strong> <span style="color:${badgeColor}; font-size:12px; font-weight:bold;">${badgeText}</span>
              <div style="font-size:12px; color:var(--muted); margin-top:4px;">${alert.reason}</div>
              <div style="margin-top:6px; font-family:monospace; background:rgba(255,255,255,0.1); padding:4px 8px; border-radius:4px; display:inline-block; color:var(--accent);">
                Yeni Şifre: ${alert.newPassword}
              </div>
              ${extraInfo}
            </div>
            <button class="btn btnGhost" onclick="dismissAlert('${alert.id}')" style="font-size:11px; padding:4px 8px;">Temizle</button>
          </div>
        `;
        securityAlertsList.appendChild(div);
      });
    } else {
      securityAlertsList.innerHTML = '<div style="padding:10px; color:var(--muted); font-size:13px; text-align:center;">Şu an güvenlik uyarısı yok.</div>';
    }
  } catch(e){}
}

window.dismissAlert = async function(id) {
  await fetch('/api/owner/dismiss-alert', { method:'POST', headers:setAuthHeader(), body: JSON.stringify({ id }) });
  loadOwnerAlerts();
}

// Create Founder (Quartz Only)
if(createFounderBtn) createFounderBtn.addEventListener('click', async () => {
  const username = newFounderName.value.trim();
  const password = newFounderPass.value.trim();
  if(!username || !password) return showToast('Bilgileri doldurun', 'error');
  
  const body = { username, password, role: 'founder' }; // Role is explicitly founder
  const res = await fetch('/api/users', { method: 'POST', headers: setAuthHeader(), body: JSON.stringify(body) });
  const j = await res.json();
  if(!res.ok) return showToast(j.error, 'error');
  showToast('Yeni Kurucu Eklendi: ' + username);
  newFounderName.value = ''; newFounderPass.value = '';
});

// Webhook Save
if(saveWebhookBtn) saveWebhookBtn.addEventListener('click', async () => {
  const url = discordWebhookInput.value.trim();
  const res = await fetch('/api/set-webhook', { method:'POST', headers:setAuthHeader(), body:JSON.stringify({url}) });
  if(res.ok) showToast('Webhook kaydedildi');
  else showToast('Hata', 'error');
});

if(testWebhookBtn) testWebhookBtn.addEventListener('click', async () => {
  testWebhookBtn.disabled = true;
  const res = await fetch('/api/test-webhook', { method:'POST', headers:setAuthHeader() });
  testWebhookBtn.disabled = false;
  if(res.ok) showToast('Test mesajı gönderildi');
  else showToast('Hata', 'error');
});

// Quick Generate Actions
document.querySelectorAll('.quickGenAction').forEach(btn => {
  btn.addEventListener('click', async () => {
    const days = Number(btn.getAttribute('data-days'));
    if(!confirm(`${days} Günlük 1 adet key oluşturulsun mu?`)) return;
    
    const res = await fetch(api.generate, {method:'POST', headers: setAuthHeader(), body: JSON.stringify({days, platform:'ANDROID', count:1, maxDevices:1, note:'Hızlı Oluşturma', prefix:'QUICK'})});
    const j = await res.json();
    if(res.ok) {
      showToast('Key oluşturuldu!');
      refreshKeys();
    } else showToast(j.error, 'error');
  });
});

// Dashboard Data & Chart
async function loadDashboardData() {
  if (!getToken()) return; // Giriş yapılmamışsa veri çekme
  try {
    const res = await fetch('/api/admin/dashboard-data', {headers:setAuthHeader()});
    if(!res.ok) return;
    const data = await res.json();
    
    // Sistem Bilgileri
    if(sysRam) sysRam.textContent = `💾 ${data.system.memory} MB`;
    if(ramBarFill) {
      // Assuming 512MB or 1GB as base for visual scale, or just relative
      // Let's cap visual at 500MB for scale
      const percent = Math.min(100, (data.system.memory / 500) * 100);
      ramBarFill.style.width = `${percent}%`;
      // Color change based on load
      if(percent > 80) ramBarFill.style.background = 'var(--danger)';
      else ramBarFill.style.background = 'var(--accent)';
    }
    if(sysUptime) {
      const hrs = Math.floor(data.system.uptime / 3600);
      const mins = Math.floor((data.system.uptime % 3600) / 60);
      sysUptime.textContent = `⚡ ${hrs}s ${mins}dk`;
    }

    // Grafik Çizimi
    const ctx = document.getElementById('keysChart');
    if(ctx) {
      if(keysChart) keysChart.destroy();
      keysChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.chart.labels,
          datasets: [{
            label: 'Günlük Key Üretimi',
            data: data.chart.data,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#10b981'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#94a3b8' } }
          },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', stepSize: 1 } },
            x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
          }
        }
      });
    }
  } catch(e) { console.error(e); }
}

// İlk yüklemede grafiği çek
window.addEventListener('load', () => {
  setTimeout(() => {
    loadDashboardData();
  }, 1000);
});

// --- SETTINGS & AUDIO & FULLSCREEN ---

// Audio Synthesizer (No external files needed)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playAudio(type) {
  if (!soundToggle || !soundToggle.checked) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  
  if (type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'success') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.setValueAtTime(1000, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'error') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.2);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}

// Button Click Sounds
document.addEventListener('click', (e) => {
  if(e.target.tagName === 'BUTTON' || e.target.closest('button')) {
    playAudio('click');
  }
});

// Settings Modal Logic
if(settingsBtn) settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
if(closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

// Backup & Restore Logic
if(backupBtn) backupBtn.addEventListener('click', () => {
  window.location.href = '/api/admin/backup?token=' + getToken(); // Simple download
  // Note: For auth header in GET download, usually cookies or query param is used. 
  // Here we rely on browser session or need a fetch-blob approach.
  // Let's use fetch-blob approach for better auth handling:
  fetch('/api/admin/backup', { headers: setAuthHeader() })
    .then(res => res.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `backup-${Date.now()}.json`; a.click();
    });
});

if(restoreBtn) restoreBtn.addEventListener('click', () => restoreInput.click());
if(restoreInput) restoreInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if(!file) return;
  if(!confirm('DİKKAT: Mevcut veritabanı silinecek ve yedekten geri yüklenecek. Emin misin?')) return;
  
  const formData = new FormData();
  formData.append('backupFile', file);
  
  try {
    const res = await fetch('/api/admin/restore', { method: 'POST', headers: { 'Authorization': 'Bearer '+getToken() }, body: formData });
    if(res.ok) { showToast('Yedek başarıyla yüklendi! Sayfa yenileniyor...'); setTimeout(()=>location.reload(), 2000); }
    else { const j = await res.json(); showToast(j.error, 'error'); }
  } catch(err) { showToast('Yükleme hatası', 'error'); }
});

// Theme Color Logic
const swatches = document.querySelectorAll('.swatch');
swatches.forEach(s => {
  s.addEventListener('click', () => {
    const color = s.getAttribute('data-color');
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accentDim', color + '26'); // 15% opacity hex approx
    localStorage.setItem('themeColor', color);
    
    swatches.forEach(sw => sw.classList.remove('active'));
    s.classList.add('active');
    playAudio('click');
  });
});

// Load Settings
const savedColor = localStorage.getItem('themeColor');
if(savedColor) {
  document.documentElement.style.setProperty('--accent', savedColor);
  document.documentElement.style.setProperty('--accentDim', savedColor + '26');
  const activeSwatch = document.querySelector(`.swatch[data-color="${savedColor}"]`);
  if(activeSwatch) activeSwatch.classList.add('active');
}

// Low Performance Mode
if(lowPerfToggle) {
  lowPerfToggle.addEventListener('change', (e) => {
    document.body.classList.toggle('low-performance', e.target.checked);
    localStorage.setItem('lowPerf', e.target.checked);
  });
  if(localStorage.getItem('lowPerf') === 'true') { lowPerfToggle.checked = true; document.body.classList.add('low-performance'); }
}

// Fullscreen Logic
if(fullscreenBtn) fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(e => console.log(e));
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
});
