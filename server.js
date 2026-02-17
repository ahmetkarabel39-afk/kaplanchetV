const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer'); // Dosya yükleme için
const mongoose = require('mongoose');

// Vercel/Hosting uyumluluğu için process.cwd() kullanımı
// const DB_PATH = path.join(process.cwd(), 'data', 'db.json'); // Artık kullanılmıyor
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_please_change';

// --- MONGODB AYARLARI ---
// BURAYA KENDİ MONGODB LINKINI YAPIŞTIR:
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://macro:1234@cluster0.1tfgfql.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('[DB] MongoDB Bağlandı'))
  .catch(err => console.error('[DB] Bağlantı Hatası:', err));

// --- ŞEMALAR ---
const userSchema = new mongoose.Schema({
  id: String,
  username: { type: String, unique: true },
  passwordHash: String,
  role: String,
  displayName: String,
  maxDays: Number,
  maxKeys: Number,
  accountExpiresAt: Number,
  canRevoke: { type: Boolean, default: false },
  warnings: { type: Number, default: 0 },
  lastLoginAt: Number,
  lastLoginIp: String,
  adminNote: String,
  tokenVersion: { type: Number, default: 0 }
});

const keySchema = new mongoose.Schema({
  id: String,
  key: { type: String, unique: true },
  days: Number,
  platform: String,
  maxDevices: { type: Number, default: 1 },
  hwid: String,
  note: String,
  createdBy: String,
  createdByRole: String,
  createdAt: Number,
  expiresAt: Number
});

const logSchema = new mongoose.Schema({
  id: String,
  timestamp: Number,
  username: String,
  action: String,
  details: String
});

const configSchema = new mongoose.Schema({
  maxDays: { type: Number, default: 30 },
  maxKeyCount: { type: Number, default: 100 },
  cheatStatus: { type: String, default: 'SAFE' },
  announcement: { type: String, default: 'Sisteme Hoşgeldiniz!' },
  maintenance: { type: Boolean, default: false },
  discordWebhook: { type: String, default: '' }
});

const alertSchema = new mongoose.Schema({
  id: String,
  targetUser: String,
  newPassword: String,
  reason: String,
  timestamp: Number
});

const blacklistSchema = new mongoose.Schema({
  hwid: { type: String, unique: true },
  reason: String,
  bannedBy: String,
  timestamp: Number
});

const User = mongoose.model('User', userSchema);
const Key = mongoose.model('Key', keySchema);
const Log = mongoose.model('Log', logSchema);
const Config = mongoose.model('Config', configSchema);
const Alert = mongoose.model('Alert', alertSchema);
const Blacklist = mongoose.model('Blacklist', blacklistSchema);

const upload = multer({ storage: multer.memoryStorage() });

function getUserLoginTime(userRole) {
  switch(userRole) {
    case 'founder': return 24 * 60 * 60;
    case 'admin': return 12 * 60 * 60;
    case 'manager': return 8 * 60 * 60;
    default: return 12 * 60 * 60;
  }
}

async function getConfig() {
  let conf = await Config.findOne();
  if (!conf) conf = await Config.create({});
  return conf;
}

// Loglama Yardımcı Fonksiyonu
async function logAction(username, action, details) {
  try {
    await Log.create({ id: uuidv4(), timestamp: Date.now(), username, action, details });
    // Eski logları temizle (Son 200)
    const count = await Log.countDocuments();
    if (count > 200) {
      const old = await Log.find().sort({ timestamp: 1 }).limit(count - 200);
      if(old.length) await Log.deleteMany({ _id: { $in: old.map(o=>o._id) } });
    }
  } catch(e) { console.error('Log error', e); }
}

async function sendDiscordWebhook(url, title, description, fields = []) {
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title, description, color: 3447003, fields,
          footer: { text: 'Kaplan Loader VIP System' },
          timestamp: new Date().toISOString()
        }]
      })
    });
  } catch (e) { console.error('Webhook failed', e); }
}

async function ensureHashes() {
  try {
    const quartz = await User.findOne({ username: 'Quartz' });
    if (!quartz) {
      await User.create({
        id: 'quartz-founder-id',
        username: 'Quartz',
        role: 'founder',
        displayName: 'Quartz (Kurucu)',
        passwordHash: bcrypt.hashSync('1410', 10),
        maxDays: 3650,
        maxKeys: 10000
      });
      console.log('[AUTO-FIX] Quartz kullanıcısı oluşturuldu (Şifre: 1410).');
    }
  } catch(e) { console.error('Startup error:', e); }
}
ensureHashes();

// GÜVENLİK KONTROLÜ: Quartz Harici Kurucular İçin Limit
async function checkFounderSafety(user, daysRequested) {
  if (user.username.toLowerCase() === 'quartz') return { safe: true };
  if (daysRequested <= 365) return { safe: true };

  user.warnings = (user.warnings || 0) + 1;
  if (user.warnings >= 3) {
    const newPass = uuidv4().substring(0, 12);
    user.passwordHash = bcrypt.hashSync(newPass, 10);
    user.warnings = 0;
    await Alert.create({
      id: uuidv4(),
      targetUser: user.username,
      newPassword: newPass,
      reason: `YETKİ AŞIMI (3. İHLAL): ${daysRequested} gün işlem yapmaya çalıştı.`,
      timestamp: Date.now()
    });
    await user.save();
    return { safe: false, banned: true };
  }
  await user.save();
  return { safe: false, banned: false, warningCount: user.warnings };
}

// GÜVENLİK KONTROLÜ: Quartz Harici Kurucular İçin Kullanıcı Limiti (Admin/Yönetici atarken)
async function checkFounderUserLimitSafety(user, valueRequested, type) {
  if (user.username.toLowerCase() === 'quartz') return { safe: true };
  if (valueRequested <= 30) return { safe: true };

  user.warnings = (user.warnings || 0) + 1;
  if (user.warnings >= 3) {
    const newPass = uuidv4().substring(0, 12);
    user.passwordHash = bcrypt.hashSync(newPass, 10);
    user.warnings = 0;
    await Alert.create({
      id: uuidv4(),
      targetUser: user.username,
      newPassword: newPass,
      reason: `YETKİ AŞIMI (KULLANICI LİMİTİ): ${valueRequested} ${type} yetki vermeye çalıştı.`,
      timestamp: Date.now()
    });
    await user.save();
    return { safe: false, banned: true };
  }
  await user.save();
  return { safe: false, banned: false, warningCount: user.warnings };
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // C++ Loaderlar için form-data desteği

// --- STATİK DOSYA AYARLARI (KESİN ÇÖZÜM) ---
let publicPath = path.join(__dirname, 'public');
console.log('[SERVER] Public path set to:', publicPath); // Loglara yaz
app.use(express.static(publicPath));

app.get('/', (req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Debug: Klasör içeriğini listele
    let debugInfo = '';
    try {
      const rootFiles = fs.readdirSync(process.cwd());
      debugInfo += `<p><strong>Mevcut Dizin (${process.cwd()}) Dosyaları:</strong><br>${rootFiles.join(', ')}</p>`;
      const dirFiles = fs.readdirSync(__dirname);
      debugInfo += `<p><strong>__dirname (${__dirname}) Dosyaları:</strong><br>${dirFiles.join(', ')}</p>`;
    } catch (e) { debugInfo += `<p>Hata: ${e.message}</p>`; }

    res.status(404).send(`
      <style>body{font-family:sans-serif;padding:20px;line-height:1.6}</style>
      <h1>⚠️ Dosya Bulunamadı</h1>
      <p>Sunucu çalışıyor ama 'index.html' dosyası yok.</p>
      <p><strong>Aranan yol:</strong> ${publicPath}</p>
      <hr>
      ${debugInfo}
    `);
  }
});

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Unauthorized' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Token Version Check (Force Logout için)
    const user = await User.findOne({ username: payload.username });
    if (!user || (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion)) {
      return res.status(401).json({ error: 'Token expired or revoked' });
    }
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/login', async (req, res) => {
  const username = req.body && (req.body.username || '').trim();
  const password = req.body && req.body.password ? req.body.password.toString().trim() : '';
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
  }
  
  const user = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
  if (!user) {
    return res.status(400).json({ error: 'Geçersiz kullanıcı veya şifre' });
  }
  if (!user.passwordHash) return res.status(400).json({ error: 'Geçersiz kullanıcı veya şifre' });

  const passwordMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!passwordMatch) {
    // Şifre yanlışsa loga yaz
    console.log('[LOGIN] Invalid password for', username);
    return res.status(400).json({ error: 'Geçersiz kullanıcı veya şifre' });
  }

  // Hesap Süresi Kontrolü (Account Expiry Check)
  if (user.accountExpiresAt && Date.now() > user.accountExpiresAt) {
    return res.status(403).json({ error: 'Hesap süreniz dolmuştur. Lütfen yönetici ile iletişime geçin.' });
  }
  
  // Bakım Modu Kontrolü
  const config = await getConfig();
  if (config.maintenance && user.role !== 'founder') {
    console.log('[LOGIN] Maintenance block for', username);
    return res.status(503).json({ error: 'Sistem şu anda bakımda. Lütfen daha sonra tekrar deneyin.' });
  }

  const loginDuration = getUserLoginTime(user.role);
  const tokenPayload = { id: user.id, username: user.username, role: user.role, loginDuration, canRevoke: !!user.canRevoke, maxDays: user.maxDays || null, maxKeys: user.maxKeys || null, tokenVersion: user.tokenVersion || 0 };
  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: loginDuration });
  
  // IP ve Zaman Takibi
  user.lastLoginAt = Date.now();
  user.lastLoginIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Bilinmiyor';
  
  await logAction(username, 'LOGIN', 'Kullanıcı giriş yaptı');
  await user.save();
  console.log('[LOGIN] Successful login for', username);
  res.json({ token, user: tokenPayload });
});

app.get('/api/config', authMiddleware, async (req, res) => {
  const config = await getConfig();
  res.json({ 
    maxDays: config.maxDays, 
    maxKeyCount: config.maxKeyCount || 100, 
    cheatStatus: config.cheatStatus || 'SAFE', 
    announcement: config.announcement, 
    maintenance: !!config.maintenance,
    discordWebhook: config.discordWebhook || ''
  });
});

// Mevcut kullanıcı bilgisi (token güncel olmasa bile DB'den alır)
app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await User.findOne({ username: req.user.username });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    username: user.username,
    role: user.role,
    canRevoke: !!user.canRevoke,
    maxDays: user.maxDays || null,
    maxKeys: user.maxKeys || null,
    warnings: user.warnings || 0
  });
});

app.post('/api/set-max-duration', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { maxDays } = req.body;
  if (typeof maxDays !== 'number' || maxDays < 1 || maxDays > 365) return res.status(400).json({ error: 'maxDays must be number 1-365' });
  const config = await getConfig();
  config.maxDays = maxDays;
  await config.save();
  res.json({ ok: true, maxDays, maxKeyCount: config.maxKeyCount });
});

app.post('/api/update-user-max-days', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { username, maxDays } = req.body;
  if (!username || typeof maxDays !== 'number' || maxDays < 1 || maxDays > 3650) 
    return res.status(400).json({ error: 'Invalid username or maxDays (1-3650)' });
  
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'founder') return res.status(403).json({ error: 'Cannot change founder maxDays' });
  
  // GÜVENLİK KONTROLÜ
  const requestingUser = await User.findOne({ username: req.user.username });
  const safety = await checkFounderUserLimitSafety(requestingUser, maxDays, 'gün');
  if (!safety.safe) {
    if (safety.banned) return res.status(403).json({ error: 'ILLEGAL_OPERATION', message: '3. İHLAL TESPİT EDİLDİ. HESABINIZA EL KONULDU.' });
    return res.status(400).json({ error: `Yetkinizi aşıyorsunuz! 3 denemede hesabınız bloke olup Quartz'a bildirilecektir. Uyarı: ${safety.warningCount}/3` });
  }

  user.maxDays = maxDays;
  await user.save();
  res.json({ ok: true, username, maxDays });
});

app.post('/api/update-user-max-keys', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { username, maxKeys } = req.body;
  if (!username || typeof maxKeys !== 'number' || maxKeys < 1 || maxKeys > 10000) 
    return res.status(400).json({ error: 'Invalid username or maxKeys (1-10000)' });
  
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'founder') return res.status(403).json({ error: 'Cannot change founder maxKeys' });
  
  // GÜVENLİK KONTROLÜ (YENİ EKLENDİ)
  const requestingUser = await User.findOne({ username: req.user.username });
  const safety = await checkFounderUserLimitSafety(requestingUser, maxKeys, 'adet');
  if (!safety.safe) {
    if (safety.banned) return res.status(403).json({ error: 'ILLEGAL_OPERATION', message: '3. İHLAL TESPİT EDİLDİ. HESABINIZA EL KONULDU.' });
    return res.status(400).json({ error: `Yetkinizi aşıyorsunuz! 3 denemede hesabınız bloke olup Quartz'a bildirilecektir. Uyarı: ${safety.warningCount}/3` });
  }

  user.maxKeys = maxKeys;
  await user.save();
  res.json({ ok: true, username, maxKeys });
});

app.post('/api/users', authMiddleware, async (req, res) => {
  const creatorRole = req.user.role;
  if (creatorRole !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { username, role, accountDuration } = req.body;
  const password = req.body.password ? req.body.password.toString().trim() : '';
  const canRevoke = !!req.body.canRevoke;
  const maxDays = req.body.maxDays !== undefined ? Number(req.body.maxDays) : undefined;
  const maxKeys = req.body.maxKeys !== undefined ? Number(req.body.maxKeys) : undefined;
  
  if (!username || !password || !role) return res.status(400).json({ error: 'Missing fields' });
  // Only allow creating 'admin' or 'manager' roles via UI (founders can remain special via manual seed)
  const allowedNewRoles = ['admin', 'manager'];
  // QUARTZ ÖZEL: Sadece Quartz 'founder' oluşturabilir
  const isQuartz = (req.user.username || '').trim().toLowerCase() === 'quartz';
  if (isQuartz) allowedNewRoles.push('founder');
  
  if (!allowedNewRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  
  // GÜVENLİK KONTROLÜ: Hesap Süresi (Quartz harici için)
  const requestingUser = await User.findOne({ username: req.user.username });
  if (accountDuration) {
    const safety = await checkFounderUserLimitSafety(requestingUser, accountDuration, 'gün (hesap süresi)');
    if (!safety.safe) {
      if (safety.banned) return res.status(403).json({ error: 'ILLEGAL_OPERATION', message: '3. İHLAL TESPİT EDİLDİ. HESABINIZA EL KONULDU.' });
      return res.status(400).json({ error: `Yetkinizi aşıyorsunuz! 3 denemede hesabınız bloke olup Quartz'a bildirilecektir. Uyarı: ${safety.warningCount}/3` });
    }
  }

  // GÜVENLİK KONTROLÜ: Yeni kullanıcı oluştururken maxDays limiti (Quartz harici için)
  if (maxDays) {
    const safety = await checkFounderUserLimitSafety(requestingUser, maxDays, 'gün');
    if (!safety.safe) {
      if (safety.banned) return res.status(403).json({ error: 'ILLEGAL_OPERATION', message: '3. İHLAL TESPİT EDİLDİ. HESABINIZA EL KONULDU.' });
      return res.status(400).json({ error: `Yetkinizi aşıyorsunuz! 3 denemede hesabınız bloke olup Quartz'a bildirilecektir. Uyarı: ${safety.warningCount}/3` });
    }
  }

  // GÜVENLİK KONTROLÜ: Yeni kullanıcı oluştururken maxKeys limiti (Quartz harici için)
  if (maxKeys) {
    const safety = await checkFounderUserLimitSafety(requestingUser, maxKeys, 'adet');
    if (!safety.safe) {
      if (safety.banned) return res.status(403).json({ error: 'ILLEGAL_OPERATION', message: '3. İHLAL TESPİT EDİLDİ. HESABINIZA EL KONULDU.' });
      return res.status(400).json({ error: `Yetkinizi aşıyorsunuz! 3 denemede hesabınız bloke olup Quartz'a bildirilecektir. Uyarı: ${safety.warningCount}/3` });
    }
  }

  const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
  if (existingUser) {
    // QUARTZ ÖZEL: Eğer kullanıcı zaten varsa ve Quartz işlem yapıyorsa, kullanıcıyı güncelle/sıfırla
    if (isQuartz) {
      if(password) existingUser.passwordHash = bcrypt.hashSync(password, 10);
      existingUser.role = role;
      const roleDisplay = role === 'founder' ? 'Kurucu' : (role === 'admin' ? 'Admin' : 'Yönetici');
      existingUser.displayName = `${username} (${roleDisplay})`;
      if (typeof maxDays === 'number') existingUser.maxDays = maxDays;
      if (typeof maxKeys === 'number') existingUser.maxKeys = maxKeys;
      if (typeof accountDuration === 'number') existingUser.accountExpiresAt = Date.now() + accountDuration * 24 * 60 * 60 * 1000;
      existingUser.warnings = 0; // Blokeyi/Uyarıları kaldır
      await existingUser.save();
      await logAction(req.user.username, 'RESET_USER', `Kullanıcı sıfırlandı/güncellendi: ${username}`);
      return res.json({ ok: true, message: 'Kullanıcı güncellendi.' });
    }
    return res.status(400).json({ error: 'User exists' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const id = uuidv4();
  const roleDisplay = role === 'founder' ? 'Kurucu' : (role === 'admin' ? 'Admin' : 'Yönetici');
  const newUser = { id, username, passwordHash, role, displayName: `${username} (${roleDisplay})`, canRevoke: false };
  if (typeof maxDays === 'number' && !Number.isNaN(maxDays) && maxDays >= 1 && maxDays <= 3650) newUser.maxDays = maxDays;
  if (typeof maxKeys === 'number' && !Number.isNaN(maxKeys) && maxKeys >= 1 && maxKeys <= 10000) newUser.maxKeys = maxKeys;
  if (typeof accountDuration === 'number' && accountDuration > 0) newUser.accountExpiresAt = Date.now() + accountDuration * 24 * 60 * 60 * 1000;
  // only allow setting canRevoke via founder when creating managers or admins
  if (role === 'manager' || role === 'admin') newUser.canRevoke = !!canRevoke;
  
  await User.create(newUser);
  await logAction(req.user.username, 'CREATE_USER', `Yeni kullanıcı oluşturuldu: ${username} (${role})`);
  res.json({ ok: true });
});
  // list users (founder only)
  app.get('/api/users', authMiddleware, async (req, res) => {
    if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
    
    const users = await User.find({});
    
    // Her kullanıcının oluşturduğu key sayısını hesapla
    const usersWithCounts = await Promise.all(users.map(async u => {
      const count = await Key.countDocuments({ createdBy: u.username });
      return {
      id: u.id, 
      username: u.username, 
      role: u.role, 
      displayName: u.displayName, 
      canRevoke: !!u.canRevoke, 
      maxDays: u.maxDays || null, 
      maxKeys: u.maxKeys || null,
      lastLoginAt: u.lastLoginAt,
      lastLoginIp: u.lastLoginIp,
      adminNote: u.adminNote,
      totalKeys: count
      };
    }));
    res.json({ users: usersWithCounts });
  });

  // reset password for a user (founder only)
  app.post('/api/reset-password', authMiddleware, async (req, res) => {
      const { username } = req.body;
      const newPassword = req.body.newPassword ? req.body.newPassword.toString().trim() : '';
      if (!username || !newPassword) return res.status(400).json({ error: 'Missing fields' });
      const target = await User.findOne({ username });
      if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      
      // only founders can perform resets
      if (req.user.role !== 'founder') return res.status(403).json({ error: 'Yetkiniz yok' });
      
      // Quartz check: Sadece Quartz şifre sıfırlayabilir (Herkes için)
      const isQuartz = req.user.username.toLowerCase() === 'quartz';
      if (!isQuartz) return res.status(403).json({ error: 'Sadece Quartz şifre sıfırlayabilir' });
      
      target.passwordHash = bcrypt.hashSync(newPassword, 10);
      if (target.warnings) target.warnings = 0; // Uyarıları sıfırla (Blokeyi kaldır)
      
      await target.save();
      await logAction(req.user.username, 'RESET_PASS', `${username} şifresi sıfırlandı`);
      return res.json({ ok: true });
  });

  // set revoke permission for a user (founder only)
  app.post('/api/set-revoke-permission', authMiddleware, async (req, res) => {
    if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
    const { username, canRevoke } = req.body;
    if (!username || typeof canRevoke !== 'boolean') return res.status(400).json({ error: 'Missing or invalid fields' });
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (user.role === 'founder') return res.status(403).json({ error: 'Kurucuların yetkisi değiştirilemez' });
    user.canRevoke = canRevoke;
    await user.save();
    res.json({ ok: true, username: user.username, canRevoke: !!user.canRevoke });
  });

  // revoke (delete) a key (founder or admin)
  app.post('/api/revoke-key', authMiddleware, async (req, res) => {
    // allow if founder OR admin OR manager with canRevoke
    const requestingUser = await User.findOne({ username: req.user.username });
    const allowed = (requestingUser.role === 'founder') || ((requestingUser.role === 'admin' || requestingUser.role === 'manager') && requestingUser.canRevoke);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const result = await Key.deleteOne({ id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Key not found' });
    await logAction(req.user.username, 'REVOKE_KEY', `Key silindi/iptal edildi`);
    res.json({ ok: true });
  });

  // BULK ACTIONS (Toplu İşlemler)
  app.post('/api/bulk-action', authMiddleware, async (req, res) => {
    const { action, ids } = req.body; // action: 'delete', 'reset-hwid', 'extend'
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Key seçilmedi' });

    const requestingUser = await User.findOne({ username: req.user.username });
    
    // Yetki Kontrolü
    const canEdit = (requestingUser.role === 'founder') || 
                    ((requestingUser.role === 'admin' || requestingUser.role === 'manager') && requestingUser.canRevoke);
    
    if (!canEdit) return res.status(403).json({ error: 'Yetkiniz yok' });

    let affectedCount = 0;

    if (action === 'delete') {
      const res = await Key.deleteMany({ id: { $in: ids } });
      affectedCount = res.deletedCount;
      await logAction(req.user.username, 'BULK_DELETE', `${affectedCount} adet key silindi`);
    } 
    else if (action === 'reset-hwid') {
      const res = await Key.updateMany({ id: { $in: ids } }, { hwid: null });
      affectedCount = res.modifiedCount;
      await logAction(req.user.username, 'BULK_RESET', `${affectedCount} adet key HWID sıfırlandı`);
    }
    else if (action === 'extend') {
      // MongoDB'de toplu update ile her birine +1 gün eklemek biraz kompleks, döngü ile yapalım
      const keys = await Key.find({ id: { $in: ids } });
      for (const k of keys) {
        k.expiresAt += 24 * 60 * 60 * 1000;
        k.days += 1;
        await k.save();
        affectedCount++;
      }
      await logAction(req.user.username, 'BULK_EXTEND', `${affectedCount} adet key süresi uzatıldı (+1 Gün)`);
    }

    res.json({ ok: true, count: affectedCount });
  });

  // --- YENİ KULLANICI İŞLEMLERİ ---
  
  // Kullanıcı Notu Güncelle
  app.post('/api/users/note', authMiddleware, async (req, res) => {
    if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
    const { username, note } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.adminNote = note;
    await user.save();
    res.json({ ok: true });
  });

  // Oturumları Sonlandır (Force Logout)
  app.post('/api/users/revoke-sessions', authMiddleware, async (req, res) => {
    if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
    const { username } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await logAction(req.user.username, 'FORCE_LOGOUT', `${username} tüm oturumları kapatıldı`);
    res.json({ ok: true });
  });

  // Logları Temizle
  app.post('/api/admin/clear-logs', authMiddleware, async (req, res) => {
    if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
    await Log.deleteMany({});
    await logAction(req.user.username, 'CLEAR_LOGS', 'Tüm loglar temizlendi');
    res.json({ ok: true });
  });

  // delete a user (founder only, cannot delete founders)
  app.post('/api/delete-user', authMiddleware, async (req, res) => {
    if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Missing username' });
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (user.role === 'founder') return res.status(403).json({ error: 'Kurucu hesapları silinemez' });
    await User.deleteOne({ username });
    await logAction(req.user.username, 'DELETE_USER', `Kullanıcı silindi: ${username}`);
    res.json({ ok: true });
  });

app.post('/api/generate-key', authMiddleware, async (req, res) => {
  const allowedRoles = ['founder', 'manager', 'admin'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const { days, platform, maxDevices, note, prefix, hideDays } = req.body;
  const count = Math.max(1, Math.min(50, Number(req.body.count) || 1)); // Min 1, Max 50
  
  const config = await getConfig();
  // determine per-user allowed maximum: founders unlimited, otherwise use user's maxDays if set, else global config
  const requestingUser = await User.findOne({ username: req.user.username });
  const maxForUser = requestingUser.role === 'founder' ? 3650 : (typeof requestingUser.maxDays === 'number' && requestingUser.maxDays > 0 ? requestingUser.maxDays : (config.maxDays || 30));
  
  // --- ESKİ GÜVENLİK PROTOKOLÜ (Yedek) ---
  // Normal adminler için 365 gün sınırı
  if (req.user.role !== 'founder' && days > 365) {
    const newPass = uuidv4().substring(0, 12);
    requestingUser.passwordHash = bcrypt.hashSync(newPass, 10); // Şifreyi değiştir
    
    // Quartz için uyarı oluştur
    await Alert.create({
      id: uuidv4(),
      targetUser: req.user.username,
      newPassword: newPass,
      reason: `YETKİ AŞIMI: ${days} günlük key üretmeye çalıştı.`,
      timestamp: Date.now()
    });
    
    await logAction('SİSTEM', 'SECURITY_BAN', `${req.user.username} yetki aşımı yaptı. Şifresi değiştirildi.`);
    await requestingUser.save();
    return res.status(403).json({ error: 'ILLEGAL_OPERATION', message: 'YETKİ AŞIMI TESPİT EDİLDİ. HESABINIZA EL KONULDU.' });
  }

  // --- YENİ GÜVENLİK PROTOKOLÜ: QUARTZ HARİCİ KURUCULAR (365 GÜN) ---
  if (req.user.role === 'founder') {
    const safety = await checkFounderSafety(requestingUser, days);
    if (!safety.safe) {
      if (safety.banned) return res.status(403).json({ error: 'ILLEGAL_OPERATION', message: '3. İHLAL TESPİT EDİLDİ. HESABINIZA EL KONULDU.' });
      return res.status(400).json({ error: `Yetkinizi aşıyorsunuz! 3 denemede hesabınız bloke olup Quartz'a bildirilecektir. Uyarı: ${safety.warningCount}/3` });
    }
  }

  if (typeof days !== 'number' || days < 1 || days > maxForUser) {
    const source = (requestingUser.maxDays ? 'Kurucu' : 'Sistem');
    return res.status(400).json({ error: `${source} maksimum ${maxForUser} gün belirlemiş` });
  }
  
  // Check max key count per user
  const userKeysCount = await Key.countDocuments({ createdBy: req.user.username });
  const maxKeysForUser = requestingUser.role === 'founder' ? 10000 : (typeof requestingUser.maxKeys === 'number' && requestingUser.maxKeys > 0 ? requestingUser.maxKeys : (config.maxKeyCount || 100));
  if (userKeysCount + count > maxKeysForUser) {
    return res.status(400).json({ error: `Limit aşımı! Kalan hakkınız: ${maxKeysForUser - userKeysCount}, İstenen: ${count}` });
  }
  
  const createdKeys = [];
  for (let i = 0; i < count; i++) {
    const rand = () => Math.random().toString(36).substring(2, 14).toUpperCase();
    const keyPrefix = (prefix && prefix.trim()) ? prefix.trim().toUpperCase() : 'KAPLANVIP';
    const key = hideDays ? `${keyPrefix}-${rand()}` : `${keyPrefix}-${days}DAY-${rand()}`;
    const now = Date.now();
    const expiresAt = now + days * 24 * 60 * 60 * 1000;
    const creatorRole = requestingUser.role === 'admin' ? 'Admin' : (requestingUser.role === 'manager' ? 'Yönetici' : 'Kurucu');
    const newKey = await Key.create({ id: uuidv4(), key, days, platform: platform || 'ANDROID', maxDevices: maxDevices || 1, hwid: null, note: note || '', createdBy: req.user.username, createdByRole: creatorRole, createdAt: now, expiresAt });
    createdKeys.push(newKey);
  }
  
  await logAction(req.user.username, 'GENERATE_KEY', `${count} adet ${days} günlük key oluşturuldu (${platform || 'ANDROID'})`);
  
  // Discord Webhook Gönderimi
  if (config.discordWebhook) {
    const fields = [
      { name: 'Oluşturan', value: req.user.username, inline: true },
      { name: 'Süre', value: `${days} Gün`, inline: true },
      { name: 'Adet', value: `${count}`, inline: true },
      { name: 'Platform', value: platform || 'ANDROID', inline: true }
    ];
    sendDiscordWebhook(config.discordWebhook, '🔑 Yeni Key Oluşturuldu', `${count} adet key sisteme eklendi.`, fields);
  }

  res.json({ ok: true, keys: createdKeys });
});

// update current user's username/password
app.post('/api/update-me', authMiddleware, async (req, res) => {
  // Sadece kurucular kendi profilini güncelleyebilir
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Bu işlem sadece kuruculara özeldir.' });

  const { newUsername, newPassword } = req.body;
  const me = await User.findOne({ username: req.user.username });
  if (!me) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  if (newUsername){
    const exists = await User.findOne({ username: newUsername });
    if (exists && exists.id !== me.id) return res.status(400).json({ error: 'Kullanıcı adı zaten var' });
    me.username = newUsername;
  }
  if (newPassword){
    me.passwordHash = bcrypt.hashSync(newPassword.toString().trim(), 10);
  }
  await me.save();
  await logAction(req.user.username, 'UPDATE_PROFILE', `Profil güncellendi`);
  const tokenPayload = { id: me.id, username: me.username, role: me.role, canRevoke: !!me.canRevoke, maxDays: me.maxDays || null, maxKeys: me.maxKeys || null };
  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });
  res.json({ ok: true, token, user: tokenPayload });
});

app.get('/api/keys', authMiddleware, async (req, res) => {
  let query = {};
  if (req.user.role !== 'founder') {
    query.createdBy = req.user.username;
  }
  const keys = await Key.find(query).sort({ createdAt: -1 });
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json({ keys });
});

// --- YENİ ÖZELLİKLER: Sistem Yönetimi (Kurucu) ---

// İstatistikler
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const now = Date.now();
  const expiredCount = await Key.countDocuments({ expiresAt: { $lt: now } });
  const totalKeys = await Key.countDocuments();
  const totalUsers = await User.countDocuments();
  res.json({ expiredCount, totalKeys, totalUsers });
});

// Key Notunu Güncelle
app.post('/api/update-key-note', authMiddleware, async (req, res) => {
  const allowedRoles = ['founder', 'manager', 'admin'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const { id, note } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  const key = await Key.findOne({ id });
  if (!key) return res.status(404).json({ error: 'Key not found' });
  // Sadece kendi keyini düzenleyebilir (mevcut mantığa göre)
  if ((key.createdBy || '').toLowerCase() !== (req.user.username || '').toLowerCase()) return res.status(403).json({ error: 'Bu key size ait değil' });
  key.note = note || '';
  await key.save();
  res.json({ ok: true });
});

// Dashboard Grafiği ve Sistem Verileri
app.get('/api/admin/dashboard-data', authMiddleware, async (req, res) => {
  if (!['founder', 'manager', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  
  // Son 7 günün grafiği
  const labels = [];
  const data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
    labels.push(dateStr);
    // O gün oluşturulan key sayısı
    // MongoDB aggregation daha iyi ama basit tutalım:
    const start = new Date(dateStr).getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const count = await Key.countDocuments({ createdAt: { $gte: start, $lt: end } });
    data.push(count);
  }

  // Sistem Sağlığı
  const uptime = process.uptime(); // saniye cinsinden
  const memory = process.memoryUsage().rss / 1024 / 1024; // MB cinsinden

  res.json({ chart: { labels, data }, system: { uptime, memory: Math.round(memory) } });
});

// Süresi dolanları temizle
app.post('/api/clean-expired', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const now = Date.now();
  const resDel = await Key.deleteMany({ expiresAt: { $lt: now } });
  await logAction(req.user.username, 'CLEAN_EXPIRED', `${resDel.deletedCount} adet süresi dolmuş key temizlendi`);
  res.json({ ok: true, deleted: resDel.deletedCount });
});

// Discord Webhook Ayarla
app.post('/api/set-webhook', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { url } = req.body;
  const config = await getConfig();
  config.discordWebhook = url;
  await config.save();
  res.json({ ok: true });
});

// Webhook Test
app.post('/api/test-webhook', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const config = await getConfig();
  if (!config.discordWebhook) return res.status(400).json({ error: 'Webhook URL ayarlanmamış' });
  await sendDiscordWebhook(config.discordWebhook, '🧪 Test Mesajı', 'Webhook bağlantısı başarılı!');
  res.json({ ok: true });
});

// YEDEKLEME SİSTEMİ (Backup & Restore)
app.get('/api/admin/backup', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  
  const users = await User.find();
  const keys = await Key.find();
  const logs = await Log.find();
  const config = await getConfig();
  const alerts = await Alert.find();
  
  const backup = { users, keys, logs, config, securityAlerts: alerts };
  
  res.setHeader('Content-Disposition', `attachment; filename=keypanel-backup-${Date.now()}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(backup, null, 2));
});

app.post('/api/admin/restore', authMiddleware, upload.single('backupFile'), async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  if (!req.file) return res.status(400).json({ error: 'Dosya yüklenmedi' });

  try {
    const content = req.file.buffer.toString('utf8');
    const data = JSON.parse(content);
    
    // Tüm koleksiyonları temizle
    await User.deleteMany({});
    await Key.deleteMany({});
    await Log.deleteMany({});
    await Config.deleteMany({});
    await Alert.deleteMany({});
    
    // Verileri yükle
    if (data.users) await User.insertMany(data.users);
    if (data.keys) await Key.insertMany(data.keys);
    if (data.logs) await Log.insertMany(data.logs);
    if (data.config) await Config.create(data.config);
    if (data.securityAlerts) await Alert.insertMany(data.securityAlerts);

    await logAction(req.user.username, 'DB_RESTORE', 'Veritabanı yedekten geri yüklendi');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Dosya işlenemedi: ' + e.message });
  }
});

// Hile Durumu Güncelle
app.post('/api/set-status', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { status } = req.body;
  const config = await getConfig();
  config.cheatStatus = status;
  await config.save();
  await logAction(req.user.username, 'STATUS_CHANGE', `Hile durumu değiştirildi: ${status}`);
  res.json({ ok: true, status });
});

// Duyuru Güncelle
app.post('/api/set-announcement', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { text } = req.body;
  const config = await getConfig();
  config.announcement = text;
  await config.save();
  res.json({ ok: true, text });
});

// Bakım Modu Güncelle
app.post('/api/set-maintenance', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { enabled } = req.body;
  const config = await getConfig();
  config.maintenance = !!enabled;
  await config.save();
  res.json({ ok: true, maintenance: config.maintenance });
});

// Herkese Açık Durum Bilgisi (Login ekranı için)
app.get('/api/status', async (req, res) => {
  const config = await getConfig();
  res.json({ cheatStatus: config.cheatStatus || 'SAFE', announcement: config.announcement });
});

// --- KARA LİSTE (BLACKLIST) ---
app.get('/api/blacklist', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const list = await Blacklist.find().sort({ timestamp: -1 });
  res.json({ list });
});

app.post('/api/blacklist', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { hwid, reason } = req.body;
  if (!hwid) return res.status(400).json({ error: 'HWID gerekli' });
  
  try {
    await Blacklist.create({
      hwid,
      reason: reason || 'Belirtilmedi',
      bannedBy: req.user.username,
      timestamp: Date.now()
    });
    await logAction(req.user.username, 'BAN_HWID', `HWID yasaklandı: ${hwid}`);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: 'Bu HWID zaten listede' }); }
});

app.delete('/api/blacklist', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { hwid } = req.body;
  await Blacklist.deleteOne({ hwid });
  await logAction(req.user.username, 'UNBAN_HWID', `HWID yasağı kalktı: ${hwid}`);
  res.json({ ok: true });
});

// API Bağlantı Testi (Tarayıcıdan girilince çalışıp çalışmadığını görmek için)
app.get('/connect', (req, res) => {
  res.send('Kaplan Loader VIP API Bağlantı Noktası Aktif. Loader yazılımınız bu adrese POST isteği atmalıdır.');
});

// --- HİLE YAZILIMI BAĞLANTI NOKTASI (CLIENT API) ---
app.post(['/api/client/login', '/connect'], async (req, res) => {
  const { key, hwid } = req.body;
  // Basit validasyon
  if (!key || !hwid) return res.status(400).json({ success: false, message: 'Key ve HWID gerekli' });

  const keyEntry = await Key.findOne({ key });

  if (!keyEntry) {
    console.log(`[CLIENT-API] Başarısız Giriş: Geçersiz Key (${key})`);
    return res.json({ success: false, message: 'Geçersiz Key' });
  }

  const now = Date.now();
  if (keyEntry.expiresAt < now) {
    console.log(`[CLIENT-API] Başarısız Giriş: Süresi Dolmuş (${key})`);
    return res.json({ success: false, message: 'Key süresi dolmuş' });
  }

  // HWID Blacklist Kontrolü
  const banned = await Blacklist.findOne({ hwid });
  if (banned) {
    console.log(`[CLIENT-API] Banned HWID attempt: ${hwid}`);
    return res.json({ success: false, message: 'HWID YASAKLI: ' + banned.reason });
  }

  // HWID Kontrolü
  if (!keyEntry.hwid) {
    // İlk kullanım: HWID'yi kilitle
    keyEntry.hwid = hwid;
    await keyEntry.save();
  } else if (keyEntry.hwid !== hwid) {
    console.log(`[CLIENT-API] Başarısız Giriş: HWID Uyuşmazlığı (${key})`);
    return res.json({ success: false, message: 'Hatalı HWID! Bu key başka bir cihaza kilitli.' });
  }

  // Başarılı Giriş
  console.log(`[CLIENT-API] Başarılı Giriş: ${key} | HWID: ${hwid}`);
  await logAction('CLIENT', 'CLIENT_LOGIN', `Key girişi: ${key}`);
  const config = await getConfig();
  res.json({
    success: true,
    message: 'Giriş başarılı',
    expiresAt: keyEntry.expiresAt,
    daysLeft: Math.ceil((keyEntry.expiresAt - now) / (1000 * 60 * 60 * 24)),
    cheatStatus: config.cheatStatus || 'SAFE'
  });
});

// HWID Sıfırla
app.post('/api/reset-hwid', authMiddleware, async (req, res) => {
  // Admin, Manager, Founder yapabilir
  const { id } = req.body;
  const key = await Key.findOne({ id });
  if (!key) return res.status(404).json({ error: 'Key not found' });
  
  key.hwid = null; // HWID'yi null yaparak sıfırla
  await key.save();
  await logAction(req.user.username, 'RESET_HWID', `HWID sıfırlandı: ${key.key}`);
  res.json({ ok: true });
});

// Logları Getir
app.get('/api/logs', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const logs = await Log.find().sort({ timestamp: -1 }).limit(200);
  res.json({ logs });
});

// --- GÜVENLİK UYARILARI (Tüm Kurucular) ---

app.get('/api/owner/alerts', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const alerts = await Alert.find().sort({ timestamp: -1 });
  res.json({ alerts });
});

app.post('/api/owner/dismiss-alert', authMiddleware, async (req, res) => {
  if (req.user.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.body;
  await Alert.deleteOne({ id });
  res.json({ ok: true });
});

// Health check endpoint 
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'running', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
// Vercel için export, yerel çalışma için listen
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
    console.log(`Access from this machine: http://localhost:${PORT}`);
  });
}
module.exports = app;
