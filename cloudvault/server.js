'use strict';
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { Storage } = require('megajs');

// ════════════════════════════════════════════════════════
//  DATABASE ABSTRACTION — lowdb (local) OR postgres (cloud)
// ════════════════════════════════════════════════════════
const DATABASE_URL = process.env.DATABASE_URL || '';
let db;   // unified db interface

async function initDB() {
  if (DATABASE_URL) {
    // ── PostgreSQL ────────────────────────────────────────
    console.log('🐘 Using PostgreSQL:', DATABASE_URL.replace(/:([^:@]+)@/, ':***@'));
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    });

    // Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_color TEXT DEFAULT '#00d4ff',
        bio TEXT DEFAULT '',
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mega_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        alias TEXT NOT NULL,
        email TEXT NOT NULL,
        password TEXT NOT NULL,
        color TEXT DEFAULT '#00d4ff',
        created_at BIGINT NOT NULL
      );
    `);

    db = {
      type: 'pg',
      pool,
      // users
      async findUser(where) {
        const keys = Object.keys(where);
        const vals = Object.values(where);
        const conds = keys.map((k,i) => `${k === 'id' ? 'id' : k === 'email' ? 'email' : k} = $${i+1}`).join(' AND ');
        const { rows } = await pool.query(`SELECT * FROM users WHERE ${conds} LIMIT 1`, vals);
        return rows[0] ? pgUserToObj(rows[0]) : null;
      },
      async createUser(u) {
        await pool.query(
          `INSERT INTO users(id,username,email,password_hash,avatar_color,bio,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [u.id, u.username, u.email, u.passwordHash, u.avatarColor||'#00d4ff', u.bio||'', u.createdAt]
        );
        return u;
      },
      async updateUser(id, fields) {
        const cols = [], vals = [];
        if (fields.username)      { cols.push(`username=$${vals.length+1}`);      vals.push(fields.username); }
        if (fields.passwordHash)  { cols.push(`password_hash=$${vals.length+1}`); vals.push(fields.passwordHash); }
        if (fields.avatarColor)   { cols.push(`avatar_color=$${vals.length+1}`);  vals.push(fields.avatarColor); }
        if (fields.bio !== undefined) { cols.push(`bio=$${vals.length+1}`);       vals.push(fields.bio); }
        if (!cols.length) return;
        vals.push(id);
        await pool.query(`UPDATE users SET ${cols.join(',')} WHERE id=$${vals.length}`, vals);
      },
      // mega accounts
      async getMegaAccounts(userId) {
        const { rows } = await pool.query('SELECT * FROM mega_accounts WHERE user_id=$1 ORDER BY created_at ASC', [userId]);
        return rows.map(pgAcctToObj);
      },
      async findMegaAccount(id, userId) {
        const { rows } = await pool.query('SELECT * FROM mega_accounts WHERE id=$1 AND user_id=$2 LIMIT 1', [id, userId]);
        return rows[0] ? pgAcctToObj(rows[0]) : null;
      },
      async createMegaAccount(a) {
        await pool.query(
          `INSERT INTO mega_accounts(id,user_id,alias,email,password,color,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [a.id, a.userId, a.alias, a.email, a.password, a.color||'#00d4ff', a.createdAt]
        );
        return a;
      },
      async deleteMegaAccount(id, userId) {
        await pool.query('DELETE FROM mega_accounts WHERE id=$1 AND user_id=$2', [id, userId]);
      },
    };
    function pgUserToObj(r) {
      return { id: r.id, username: r.username, email: r.email, passwordHash: r.password_hash, avatarColor: r.avatar_color, bio: r.bio, createdAt: Number(r.created_at) };
    }
    function pgAcctToObj(r) {
      return { id: r.id, userId: r.user_id, alias: r.alias, email: r.email, password: r.password, color: r.color, createdAt: Number(r.created_at) };
    }
  } else {
    // ── lowdb (local JSON) ────────────────────────────────
    console.log('📂 Using local JSON database');
    const low = require('lowdb');
    const FileSync = require('lowdb/adapters/FileSync');
    const DATA_DIR = path.join(__dirname, 'data');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const _db = low(new FileSync(path.join(DATA_DIR, 'db.json')));
    _db.defaults({ users: [], megaAccounts: [] }).write();

    db = {
      type: 'lowdb',
      // users
      async findUser(where) {
        return _db.get('users').find(where).value() || null;
      },
      async createUser(u) {
        _db.get('users').push(u).write(); return u;
      },
      async updateUser(id, fields) {
        _db.get('users').find({ id }).assign(fields).write();
      },
      // mega accounts
      async getMegaAccounts(userId) {
        return _db.get('megaAccounts').filter({ userId }).value();
      },
      async findMegaAccount(id, userId) {
        return _db.get('megaAccounts').find({ id, userId }).value() || null;
      },
      async createMegaAccount(a) {
        _db.get('megaAccounts').push(a).write(); return a;
      },
      async deleteMegaAccount(id, userId) {
        _db.get('megaAccounts').remove({ id, userId }).write();
      },
    };
  }
}

// ── JWT Secret ───────────────────────────────────────────
const DATA_DIR2 = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR2)) fs.mkdirSync(DATA_DIR2, { recursive: true });
const SECRET_FILE = path.join(DATA_DIR2, '.secret');
let JWT_SECRET;
try {
  JWT_SECRET = fs.existsSync(SECRET_FILE)
    ? fs.readFileSync(SECRET_FILE, 'utf8').trim()
    : (() => { const s = require('crypto').randomBytes(48).toString('hex'); fs.writeFileSync(SECRET_FILE, s); return s; })();
} catch(e) { JWT_SECRET = process.env.JWT_SECRET || 'cloudvault-fallback'; }

// ── Mega session pool ────────────────────────────────────
const sessions = new Map();

// ── Constants ────────────────────────────────────────────
const VIDEO_EXTS = new Set(['mp4','mkv','avi','mov','webm','m4v','flv','wmv','ts','mpg','mpeg','3gp','ogv']);
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico']);
const AUDIO_EXTS = new Set(['mp3','wav','ogg','flac','aac','m4a','wma']);
const MIME_MAP = {
  mp4:'video/mp4',mkv:'video/x-matroska',webm:'video/webm',avi:'video/x-msvideo',
  mov:'video/quicktime',m4v:'video/x-m4v',flv:'video/x-flv',wmv:'video/x-ms-wmv',
  ts:'video/mp2t',mpg:'video/mpeg',mpeg:'video/mpeg','3gp':'video/3gpp',
  mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',flac:'audio/flac',
  jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',
};
const extOf  = n => (n||'').split('.').pop().toLowerCase();
const mimeOf = n => MIME_MAP[extOf(n)] || 'application/octet-stream';
const fmtSz  = b => !b?'—':b>=1e9?(b/1e9).toFixed(2)+' GB':b>=1e6?(b/1e6).toFixed(1)+' MB':(b/1e3).toFixed(0)+' KB';
const mkId   = () => require('crypto').randomBytes(12).toString('hex');
const COLORS = ['#00d4ff','#00e87a','#b06aff','#ff9d42','#ffd742','#ff4d6a','#00ffe0','#ff6eb4'];

function fileType(name) {
  const e = extOf(name);
  if (VIDEO_EXTS.has(e)) return 'video';
  if (IMAGE_EXTS.has(e)) return 'image';
  if (AUDIO_EXTS.has(e)) return 'audio';
  if (e === 'pdf')        return 'pdf';
  if (['zip','rar','7z','tar','gz'].includes(e)) return 'archive';
  return 'file';
}

// ── App ──────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Disable timeouts for large file uploads
app.use('/api/accounts/:id/upload', (req, res, next) => {
  req.setTimeout(0);
  res.setTimeout(0);
  next();
});

// ── Auth middleware ──────────────────────────────────────
function authMW(req, res, next) {
  const h = req.headers.authorization;
  const raw = (h?.startsWith('Bearer ') ? h.slice(7) : null) || req.query.token || null;
  if (!raw) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(raw, JWT_SECRET); next(); }
  catch(e) { res.status(401).json({ error: 'Invalid token — please log in again' }); }
}

// ── Mega helpers ─────────────────────────────────────────
async function connectMega(accountId, email, password) {
  const existing = sessions.get(accountId);
  if (existing?.status === 'ready') return existing;
  const sess = { status: 'connecting', storage: null, error: null };
  sessions.set(accountId, sess);
  return new Promise(resolve => {
    const storage = new Storage({ email, password, autologin: false });
    const timer = setTimeout(() => { sess.status='error'; sess.error='Timeout'; resolve(sess); }, 30000);
    storage.login(err => {
      clearTimeout(timer);
      if (err) { sess.status='error'; sess.error=err.message; }
      else     { sess.status='ready'; sess.storage=storage; }
      resolve(sess);
    });
  });
}
async function getAccountInfo(storage) {
  return new Promise(resolve => {
    storage.getAccountInfo((err, info) => {
      if (err||!info) return resolve(null);
      resolve({ used:info.spaceUsed, total:info.spaceTotal, free:info.spaceTotal-info.spaceUsed,
        usedFormatted:fmtSz(info.spaceUsed), totalFormatted:fmtSz(info.spaceTotal),
        freeFormatted:fmtSz(info.spaceTotal-info.spaceUsed),
        pct:Math.round((info.spaceUsed/info.spaceTotal)*100) });
    });
  });
}
function parseDir(node, accountId, accountAlias) {
  return (node.children||[]).map(c => ({
    id:c.nodeId, nodeId:c.nodeId, name:c.name,
    type: c.directory?'folder':fileType(c.name),
    size: c.directory?null:c.size,
    sizeFormatted: c.directory?'—':fmtSz(c.size),
    accountId, accountAlias,
    isDir: c.directory, parentId: node.nodeId||null,
    modifiedAt: c.timestamp ? c.timestamp*1000 : null,
  })).sort((a,b) => { if(a.isDir&&!b.isDir)return -1;if(!a.isDir&&b.isDir)return 1;return a.name.localeCompare(b.name); });
}
function walkTree(storage, accountId, accountAlias) {
  const files=[], folders=[];
  function walk(node) {
    for (const c of (node.children||[])) {
      const base = { id:c.nodeId, nodeId:c.nodeId, name:c.name, accountId, accountAlias, parentId:node.nodeId||null, modifiedAt: c.timestamp?c.timestamp*1000:null };
      if (c.directory) { folders.push({...base,isDir:true,type:'folder'}); walk(c); }
      else { files.push({...base,isDir:false,type:fileType(c.name),size:c.size,sizeFormatted:fmtSz(c.size)}); }
    }
  }
  walk(storage.root);
  return { files, folders };
}
async function getSession(userId, accountId) {
  const account = await db.findMegaAccount(accountId, userId);
  if (!account) return { error: 'Account not found' };
  let sess = sessions.get(accountId);
  if (!sess||sess.status==='error') sess = await connectMega(accountId, account.email, account.password);
  if (sess.status!=='ready') return { error: sess.error||'Not connected' };
  return { sess, account };
}

// ════════════════════════════════════════════════════════
//  AUTH — Single-user mode
//  ADMIN_USERNAME / ADMIN_PASSWORD come from env / GitHub Secrets.
//  On first login the user row is auto-created so profile &
//  Mega accounts persist across restarts via the DB.
// ════════════════════════════════════════════════════════
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || '').trim();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '').trim();

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_USERNAME / ADMIN_PASSWORD env vars not set — all logins will fail!');
}

// Registration disabled in single-user mode
app.post('/api/auth/register', (_req, res) =>
  res.status(403).json({ error: 'Registration is disabled on this deployment.' })
);

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD)
    return res.status(503).json({ error: 'Server credentials not configured' });

  // Compare against static env-var credentials
  const usernameOk = username.trim().toLowerCase() === ADMIN_USERNAME.toLowerCase();
  const passwordOk = password === ADMIN_PASSWORD;
  if (!usernameOk || !passwordOk)
    return res.status(401).json({ error: 'Invalid username or password' });

  // Auto-create the persistent user row on first login
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || `${ADMIN_USERNAME}@cloudvault.local`;
  let user = await db.findUser({ email: ADMIN_EMAIL });
  if (!user) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD + '_stored', 10);
    user = { id: mkId(), username: ADMIN_USERNAME, email: ADMIN_EMAIL,
             passwordHash: hash, avatarColor: COLORS[0], bio: '', createdAt: Date.now() };
    await db.createUser(user);
    console.log('👤 Admin user row created');
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, user: { id: user.id, username: user.username,
    email: user.email, avatarColor: user.avatarColor, bio: user.bio } });
});

app.get('/api/auth/me', authMW, async (req, res) => {
  const user = await db.findUser({ id:req.user.id });
  if (!user) return res.status(404).json({ error:'User not found' });
  res.json({ user:{ id:user.id, username:user.username, email:user.email, avatarColor:user.avatarColor, bio:user.bio, createdAt:user.createdAt } });
});

app.patch('/api/auth/profile', authMW, async (req, res) => {
  const { username, bio, avatarColor } = req.body||{};
  const fields = {};
  if (username?.trim()) fields.username = username.trim();
  if (bio !== undefined) fields.bio = bio;
  if (avatarColor) fields.avatarColor = avatarColor;
  if (!Object.keys(fields).length) return res.status(400).json({ error:'Nothing to update' });
  await db.updateUser(req.user.id, fields);
  res.json({ ok:true, fields });
});

app.post('/api/auth/change-password', authMW, async (req, res) => {
  const { currentPassword, newPassword } = req.body||{};
  if (!currentPassword||!newPassword) return res.status(400).json({ error:'Both passwords required' });
  if (newPassword.length<6) return res.status(400).json({ error:'New password must be 6+ characters' });
  const user = await db.findUser({ id:req.user.id });
  if (!user||!(await bcrypt.compare(currentPassword, user.passwordHash)))
    return res.status(401).json({ error:'Current password is incorrect' });
  const hash = await bcrypt.hash(newPassword, 10);
  await db.updateUser(req.user.id, { passwordHash:hash });
  res.json({ ok:true });
});

// ════════════════════════════════════════════════════════
//  MEGA ACCOUNTS
// ════════════════════════════════════════════════════════
app.get('/api/accounts', authMW, async (req, res) => {
  const accounts = await db.getMegaAccounts(req.user.id);
  res.json({ accounts: accounts.map(a => {
    const sess = sessions.get(a.id);
    return { id:a.id, alias:a.alias, email:a.email, color:a.color, createdAt:a.createdAt, status:sess?.status||'disconnected', error:sess?.error||null };
  })});
});

app.post('/api/accounts', authMW, async (req, res) => {
  const { email, password, alias } = req.body||{};
  if (!email||!password) return res.status(400).json({ error:'Email and password required' });
  const result = await new Promise(resolve => {
    const storage = new Storage({ email, password, autologin:false });
    const timer = setTimeout(()=>resolve({ ok:false, error:'Connection timed out' }), 25000);
    storage.login(err => {
      clearTimeout(timer);
      if (err) resolve({ ok:false, error:err.message.includes('-9')?'Invalid Mega credentials':err.message });
      else resolve({ ok:true, storage });
    });
  });
  if (!result.ok) return res.status(401).json({ error:result.error });
  const existing = await db.getMegaAccounts(req.user.id);
  const accountId = mkId();
  const accountAlias = alias||email.split('@')[0];
  const color = COLORS[existing.length % COLORS.length];
  await db.createMegaAccount({ id:accountId, userId:req.user.id, email, password, alias:accountAlias, color, createdAt:Date.now() });
  sessions.set(accountId, { status:'ready', storage:result.storage, error:null });
  res.json({ account:{ id:accountId, alias:accountAlias, email, color, createdAt:Date.now(), status:'ready' } });
});

// View mega account credentials (for profile page)
app.get('/api/accounts/:id/credentials', authMW, async (req, res) => {
  const acct = await db.findMegaAccount(req.params.id, req.user.id);
  if (!acct) return res.status(404).json({ error:'Not found' });
  res.json({ email:acct.email, password:acct.password });
});

app.delete('/api/accounts/:id', authMW, async (req, res) => {
  const acct = await db.findMegaAccount(req.params.id, req.user.id);
  if (!acct) return res.status(404).json({ error:'Not found' });
  try { sessions.get(req.params.id)?.storage?.close(); } catch(e) {}
  sessions.delete(req.params.id);
  await db.deleteMegaAccount(req.params.id, req.user.id);
  res.json({ ok:true });
});

app.post('/api/accounts/:id/connect', authMW, async (req, res) => {
  const acct = await db.findMegaAccount(req.params.id, req.user.id);
  if (!acct) return res.status(404).json({ error:'Not found' });
  sessions.delete(req.params.id);
  const sess = await connectMega(req.params.id, acct.email, acct.password);
  res.json({ status:sess.status, error:sess.error });
});

app.get('/api/accounts/:id/storage', authMW, async (req, res) => {
  const { error, sess } = await getSession(req.user.id, req.params.id);
  if (error) return res.status(400).json({ error });
  const info = await getAccountInfo(sess.storage);
  res.json({ storage:info });
});

// ════════════════════════════════════════════════════════
//  SMART UPLOAD ROUTING
// ════════════════════════════════════════════════════════
app.get('/api/upload-route', authMW, async (req, res) => {
  const fileSize = parseInt(req.query.size||'0');
  const accounts = await db.getMegaAccounts(req.user.id);
  const results = [];
  await Promise.all(accounts.map(async acct => {
    const { error, sess } = await getSession(req.user.id, acct.id);
    if (error) return;
    const info = await getAccountInfo(sess.storage);
    if (info) results.push({ accountId:acct.id, alias:acct.alias, email:acct.email, color:acct.color, free:info.free, freeFormatted:info.freeFormatted, total:info.total, totalFormatted:info.totalFormatted, used:info.used, usedFormatted:info.usedFormatted, pct:info.pct, canFit:info.free>fileSize });
  }));
  results.sort((a,b)=>b.free-a.free);
  const suggested = results.find(r=>r.canFit)||results[0]||null;
  res.json({ accounts:results, suggested:suggested?.accountId||null });
});

// ════════════════════════════════════════════════════════
//  FILE BROWSER
// ════════════════════════════════════════════════════════
app.get('/api/accounts/:id/files', authMW, async (req, res) => {
  const { nodeId } = req.query;
  const { error, sess, account } = await getSession(req.user.id, req.params.id);
  if (error) return res.status(400).json({ error });
  const node = nodeId ? sess.storage.files[nodeId] : sess.storage.root;
  if (!node) return res.status(404).json({ error:'Folder not found' });
  const items = parseDir(node, account.id, account.alias);
  const storageInfo = !nodeId ? await getAccountInfo(sess.storage) : null;
  res.json({ items, storageInfo, nodeName:node.name||'Root', nodeId:node.nodeId||null });
});

app.get('/api/files/all', authMW, async (req, res) => {
  const accounts = await db.getMegaAccounts(req.user.id);
  const allFiles=[], allFolders=[];
  await Promise.all(accounts.map(async acct => {
    const { error, sess } = await getSession(req.user.id, acct.id);
    if (error) return;
    const { files, folders } = walkTree(sess.storage, acct.id, acct.alias);
    allFiles.push(...files); allFolders.push(...folders);
  }));
  res.json({ files:allFiles, folders:allFolders });
});

app.get('/api/accounts/:id/tree', authMW, async (req, res) => {
  const { error, sess, account } = await getSession(req.user.id, req.params.id);
  if (error) return res.status(400).json({ error });
  function buildTree(node) {
    return { id:node.nodeId||'root', name:node.name||'Root', children:(node.children||[]).filter(c=>c.directory).map(buildTree) };
  }
  res.json({ tree:buildTree(sess.storage.root), accountId:account.id, alias:account.alias });
});

// ════════════════════════════════════════════════════════
//  FILE OPERATIONS
// ════════════════════════════════════════════════════════
app.post('/api/accounts/:id/mkdir', authMW, async (req, res) => {
  const { name, parentNodeId } = req.body||{};
  if (!name) return res.status(400).json({ error:'Folder name required' });
  const { error, sess } = await getSession(req.user.id, req.params.id);
  if (error) return res.status(400).json({ error });
  const parent = parentNodeId ? sess.storage.files[parentNodeId] : sess.storage.root;
  if (!parent) return res.status(404).json({ error:'Parent not found' });
  try {
    const folder = await new Promise((resolve,reject)=>parent.mkdir(name,(err,f)=>err?reject(err):resolve(f)));
    res.json({ folder:{ id:folder.nodeId, nodeId:folder.nodeId, name:folder.name, isDir:true } });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.patch('/api/accounts/:id/files/:nodeId/rename', authMW, async (req, res) => {
  const { name } = req.body||{};
  if (!name) return res.status(400).json({ error:'Name required' });
  const { error, sess } = await getSession(req.user.id, req.params.id);
  if (error) return res.status(400).json({ error });
  const node = sess.storage.files[req.params.nodeId];
  if (!node) return res.status(404).json({ error:'File not found' });
  try { await new Promise((r,j)=>node.rename(name,err=>err?j(err):r())); res.json({ ok:true, name }); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

app.patch('/api/accounts/:id/files/:nodeId/move', authMW, async (req, res) => {
  const { targetNodeId } = req.body||{};
  const { error, sess } = await getSession(req.user.id, req.params.id);
  if (error) return res.status(400).json({ error });
  const node   = sess.storage.files[req.params.nodeId];
  const target = targetNodeId ? sess.storage.files[targetNodeId] : sess.storage.root;
  if (!node)   return res.status(404).json({ error:'File not found' });
  if (!target) return res.status(404).json({ error:'Destination not found' });
  try { await new Promise((r,j)=>node.moveTo(target,err=>err?j(err):r())); res.json({ ok:true }); }
  catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/accounts/:id/files', authMW, async (req, res) => {
  const ids = Array.isArray(req.body?.nodeIds) ? req.body.nodeIds : [req.body?.nodeId].filter(Boolean);
  if (!ids.length) return res.status(400).json({ error:'No files specified' });
  const { error, sess } = await getSession(req.user.id, req.params.id);
  if (error) return res.status(400).json({ error });
  const results = [];
  for (const nodeId of ids) {
    const node = sess.storage.files[nodeId];
    if (!node) { results.push({ nodeId, ok:false, error:'Not found' }); continue; }
    try { await new Promise((r,j)=>node.delete(false,err=>err?j(err):r())); results.push({ nodeId, ok:true }); }
    catch(e) { results.push({ nodeId, ok:false, error:e.message }); }
  }
  res.json({ results });
});

// ── Upload with real two-phase SSE progress ───────────────
// Phase 1 (0–50%):  browser → server  (tracked by bytes received into temp file)
// Phase 2 (50–100%): server → Mega    (tracked by bytes read from temp file)
// Progress events streamed as SSE so the browser bar is always accurate.
app.post('/api/accounts/:id/upload', authMW, async (req, res) => {
  const { error, sess } = await getSession(req.user.id, req.params.id);
  if (error) return res.status(400).json({ error });

  const Busboy = require('busboy');
  const parent = req.query.parentNodeId
    ? sess.storage.files[req.query.parentNodeId]
    : sess.storage.root;
  if (!parent) return res.status(404).json({ error: 'Parent folder not found' });

  // SSE setup
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send   = obj => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); };
  const finish = obj => { send(obj); if (!res.writableEnded) res.end(); };

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  const bb = Busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024 * 1024 } });

  bb.on('file', (field, stream, info) => {
    const name = decodeURIComponent(info.filename);
    console.log(`⬆  ${name}  →  ${parent.name || 'Root'}`);

    const tmpPath = path.join(os.tmpdir(), `cv_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const tmpWrite = fs.createWriteStream(tmpPath);
    const cleanup  = () => { try { fs.unlinkSync(tmpPath); } catch(_) {} };

    let receivedBytes = 0, lastPct = -1;
    const emitPct = pct => {
      const c = Math.min(100, Math.max(0, Math.round(pct)));
      if (c !== lastPct) { lastPct = c; send({ type: 'progress', pct: c, name }); }
    };

    // Phase 1: browser → server (maps to 0–50%)
    stream.on('data', chunk => {
      receivedBytes += chunk.length;
      if (contentLength > 0) emitPct((receivedBytes / contentLength) * 50);
    });

    stream.pipe(tmpWrite);

    tmpWrite.on('finish', () => {
      let fileSize;
      try { fileSize = fs.statSync(tmpPath).size; }
      catch(e) { cleanup(); return finish({ type: 'error', name, error: 'Stat failed' }); }

      emitPct(50); // phase 1 done
      console.log(`   → Mega  ${name}  (${fmtSz(fileSize)})`);

      // Phase 2: server → Mega (maps to 50–100%)
      const readStream = fs.createReadStream(tmpPath);
      let sentBytes = 0;
      readStream.on('data', chunk => {
        sentBytes += chunk.length;
        emitPct(50 + (sentBytes / fileSize) * 49); // hold 100 for 'complete'
      });

      const megaUp = parent.upload({ name, size: fileSize });

      megaUp.on('complete', f => {
        cleanup();
        emitPct(100);
        console.log(`   ✓ ${name}`);
        finish({ type: 'done', name: f.name, id: f.nodeId, size: f.size, sizeFormatted: fmtSz(f.size), fileType: fileType(f.name) });
      });
      megaUp.on('error', e => { cleanup(); finish({ type: 'error', name, error: e.message }); });
      readStream.on('error', e => { cleanup(); finish({ type: 'error', name, error: 'Read: ' + e.message }); });

      readStream.pipe(megaUp);
    });

    tmpWrite.on('error', e => { cleanup(); finish({ type: 'error', name, error: 'Write: ' + e.message }); });
    stream.on('error', e => { tmpWrite.destroy(); cleanup(); finish({ type: 'error', name, error: 'Stream: ' + e.message }); });
  });

  bb.on('error', e => finish({ type: 'error', name: '?', error: e.message }));
  req.pipe(bb);
});

// ════════════════════════════════════════════════════════
//  STREAM & DOWNLOAD
// ════════════════════════════════════════════════════════
app.get('/api/accounts/:id/stream/:nodeId', authMW, async (req, res) => {
  const { error, sess } = await getSession(req.user.id, req.params.id);
  if (error) return res.status(400).json({ error });
  const node = sess.storage.files[req.params.nodeId];
  if (!node) return res.status(404).json({ error:'Not found' });
  const fileSize=node.size, rangeHdr=req.headers.range;
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Type',mimeOf(node.name));
  let start=0, end=fileSize-1;
  if (rangeHdr) {
    const m=rangeHdr.match(/bytes=(\d+)-(\d*)/);if(!m)return res.status(416).end();
    start=parseInt(m[1],10);end=m[2]?Math.min(parseInt(m[2],10),fileSize-1):fileSize-1;
    if(start>end||start>=fileSize)return res.status(416).setHeader('Content-Range',`bytes */${fileSize}`).end();
    res.setHeader('Content-Range',`bytes ${start}-${end}/${fileSize}`);res.setHeader('Content-Length',String(end-start+1));res.status(206);
  } else { res.setHeader('Content-Length',String(fileSize));res.status(200); }
  let s;try{s=node.download({start,end});}catch(e){return res.status(500).json({error:e.message});}
  s.on('error',e=>{if(!res.headersSent)res.status(500).end();else res.end();});
  req.on('close',()=>{try{s.destroy();}catch(_){}});
  s.pipe(res);
});

app.get('/api/accounts/:id/download/:nodeId', authMW, async (req, res) => {
  const { error, sess } = await getSession(req.user.id, req.params.id);
  if (error) return res.status(400).json({ error });
  const node = sess.storage.files[req.params.nodeId];
  if (!node) return res.status(404).json({ error:'Not found' });
  res.setHeader('Content-Type','application/octet-stream');
  res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(node.name)}`);
  res.setHeader('Content-Length',String(node.size));
  const s=node.download();
  s.on('error',e=>{if(!res.headersSent)res.status(500).end();else res.end();});
  s.pipe(res);
});

// ── Health ───────────────────────────────────────────────
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

// ── Boot ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDB().then(()=>{
  const server = app.listen(PORT, ()=>{
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log(`║  ☁️  CloudVault  →  http://localhost:${PORT}      ║`);
    console.log(`║  DB: ${db.type==='pg'?'PostgreSQL 🐘':'Local JSON 📂'}                         ║`);
    console.log('╚══════════════════════════════════════════════╝\n');
  });
  // Allow large uploads to take as long as needed
  server.keepAliveTimeout = 0;
  server.headersTimeout   = 0;
  server.timeout          = 0;
}).catch(e=>{ console.error('DB init failed:', e.message); process.exit(1); });

// Note: server.js ends here — last line guard
