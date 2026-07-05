// ĐƯỜNG SỐ — Máy chủ backend
// Chạy bằng Node.js thuần (không cần npm install / không cần internet).
// Khởi động: node server.js   → mở http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------
// "Database" — một file JSON đơn giản trên đĩa
// ---------------------------------------------------------------
function loadDB() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function saveDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// ---------------------------------------------------------------
// Cấu trúc chương trình — TOÁN THPT QUỐC GIA 2027
// (dùng để khởi tạo tiến độ mặc định cho tài khoản mới)
// ---------------------------------------------------------------
const SUBJECTS = [
  { id: 'ham-so-dao-ham', skills: ['don-dieu', 'cuc-tri', 'gtln-gtnn', 'tiem-can', 'khao-sat'] },
  { id: 'mu-logarit', skills: ['luy-thua-can', 'ham-so-mu', 'ham-so-log', 'pt-mu-log', 'bpt-mu-log'] },
  { id: 'nguyen-ham-tich-phan', skills: ['nguyen-ham', 'tich-phan', 'ung-dung-tich-phan'] },
  { id: 'so-phuc', skills: ['khai-niem-so-phuc', 'phep-toan-so-phuc', 'pt-bac-hai-so-phuc'] },
  { id: 'oxyz', skills: ['he-truc-oxyz', 'pt-mat-phang', 'pt-duong-thang', 'pt-mat-cau', 'goc-khoang-cach'] },
];
const ALL_SKILL_IDS = SUBJECTS.flatMap(s => s.skills);

function defaultUserState() {
  const lessonsDone = {};
  const mastery = {};
  ALL_SKILL_IDS.forEach(id => { lessonsDone[id] = false; mastery[id] = 0; });
  return {
    points: 0,
    streak: 0,
    lastActiveDate: null,
    lessonsDone,
    mastery
  };
}

function ensureUserStateShape(user) {
  if (!user.state.lessonsDone) user.state.lessonsDone = {};
  if (!user.state.mastery) user.state.mastery = {};
  ALL_SKILL_IDS.forEach(id => {
    if (!(id in user.state.lessonsDone)) user.state.lessonsDone[id] = false;
    if (!(id in user.state.mastery)) user.state.mastery[id] = 0;
  });
  if (typeof user.state.points !== 'number') user.state.points = 0;
  if (typeof user.state.streak !== 'number') user.state.streak = 0;
}

function touchStreak(user) {
  const today = new Date().toISOString().slice(0, 10);
  if (!user.state.lastActiveDate) {
    user.state.streak = 1;
  } else if (user.state.lastActiveDate !== today) {
    const prev = new Date(user.state.lastActiveDate);
    const cur = new Date(today);
    const diffDays = Math.round((cur - prev) / 86400000);
    user.state.streak = diffDays === 1 ? user.state.streak + 1 : 1;
  }
  user.state.lastActiveDate = today;
}

// ---------------------------------------------------------------
// Mật khẩu & phiên đăng nhập (session token trong bộ nhớ)
// ---------------------------------------------------------------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
const sessions = new Map(); // token -> username

function getAuthedUsername(req) {
  const header = req.headers['authorization'] || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  return sessions.get(token) ? { token, username: sessions.get(token) } : null;
}

// ---------------------------------------------------------------
// Tiện ích HTTP
// ---------------------------------------------------------------
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJSONBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(new Error('JSON không hợp lệ')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

// ---------------------------------------------------------------
// Server
// ---------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // ============ API ============
  if (pathname.startsWith('/api/')) {
    let db = loadDB();
    try {
      // ---- Đăng ký ----
      if (pathname === '/api/register' && req.method === 'POST') {
        const { username, password } = await readJSONBody(req);
        if (!username || !password || String(password).length < 4) {
          return sendJSON(res, 400, { error: 'Cần tên đăng nhập và mật khẩu (tối thiểu 4 ký tự).' });
        }
        if (db.users[username]) {
          return sendJSON(res, 409, { error: 'Tên đăng nhập đã tồn tại, hãy chọn tên khác.' });
        }
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(password, salt);
        db.users[username] = { salt, passwordHash, state: defaultUserState() };
        touchStreak(db.users[username]);
        saveDB(db);
        const token = crypto.randomBytes(24).toString('hex');
        sessions.set(token, username);
        return sendJSON(res, 200, { token, username, state: db.users[username].state });
      }

      // ---- Đăng nhập ----
      if (pathname === '/api/login' && req.method === 'POST') {
        const { username, password } = await readJSONBody(req);
        const user = db.users[username];
        if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
          return sendJSON(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu.' });
        }
        ensureUserStateShape(user);
        touchStreak(user);
        saveDB(db);
        const token = crypto.randomBytes(24).toString('hex');
        sessions.set(token, username);
        return sendJSON(res, 200, { token, username, state: user.state });
      }

      // ---- Các API bên dưới yêu cầu đăng nhập ----
      const auth = getAuthedUsername(req);
      if (!auth) return sendJSON(res, 401, { error: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.' });
      const user = db.users[auth.username];
      if (!user) return sendJSON(res, 401, { error: 'Tài khoản không tồn tại.' });
      ensureUserStateShape(user);

      if (pathname === '/api/logout' && req.method === 'POST') {
        sessions.delete(auth.token);
        return sendJSON(res, 200, { ok: true });
      }

      if (pathname === '/api/me' && req.method === 'GET') {
        return sendJSON(res, 200, { username: auth.username, state: user.state });
      }

      if (pathname === '/api/lesson/complete' && req.method === 'POST') {
        const { skillId } = await readJSONBody(req);
        if (skillId && skillId in user.state.lessonsDone && !user.state.lessonsDone[skillId]) {
          user.state.lessonsDone[skillId] = true;
          user.state.points += 20;
        }
        saveDB(db);
        return sendJSON(res, 200, { state: user.state });
      }

      if (pathname === '/api/practice/answer' && req.method === 'POST') {
        const { skillId, correct } = await readJSONBody(req);
        const id = (skillId && skillId in user.state.mastery) ? skillId : ALL_SKILL_IDS[0];
        if (correct) {
          user.state.points += 10;
          user.state.mastery[id] = Math.min(100, user.state.mastery[id] + 8);
        } else {
          user.state.mastery[id] = Math.max(0, user.state.mastery[id] - 3);
        }
        saveDB(db);
        return sendJSON(res, 200, { state: user.state });
      }

      return sendJSON(res, 404, { error: 'Không tìm thấy API này.' });
    } catch (err) {
      return sendJSON(res, 500, { error: 'Lỗi máy chủ: ' + err.message });
    }
  }

  // ============ Tệp tĩnh (frontend) ============
  let relPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, relPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — Không tìm thấy trang.');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅  Đường Số đang chạy tại: http://localhost:${PORT}\n`);
});
