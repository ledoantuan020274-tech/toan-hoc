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

function defaultUserState() {
  return {
    points: 0,
    streak: 0,
    lastActiveDate: null,
    courseProgress: { 'pt-bac-nhat': 0 },
    lessonsDone: {
      'be-thuc': false, 'don-thuc': false, 'nhan-don-thuc': false,
      'pt-bac-nhat': false, 'an-o-mau': false, 'bpt-bac-nhat': false, 'he-2an': false
    },
    mastery: { chuyenve: 0, rutgon: 0 }
  };
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

      if (pathname === '/api/logout' && req.method === 'POST') {
        sessions.delete(auth.token);
        return sendJSON(res, 200, { ok: true });
      }

      if (pathname === '/api/me' && req.method === 'GET') {
        return sendJSON(res, 200, { username: auth.username, state: user.state });
      }

      if (pathname === '/api/lesson/complete' && req.method === 'POST') {
        const { lessonId } = await readJSONBody(req);
        const id = lessonId || 'pt-bac-nhat';
        if (id in user.state.lessonsDone && !user.state.lessonsDone[id]) {
          user.state.lessonsDone[id] = true;
          user.state.points += 20;
          if (user.state.courseProgress[id] !== undefined) {
            user.state.courseProgress[id] = Math.min(100, user.state.courseProgress[id] + 8);
          }
        }
        saveDB(db);
        return sendJSON(res, 200, { state: user.state });
      }

      if (pathname === '/api/practice/answer' && req.method === 'POST') {
        const { correct } = await readJSONBody(req);
        if (correct) {
          user.state.points += 10;
          user.state.mastery.chuyenve = Math.min(100, user.state.mastery.chuyenve + 8);
        } else {
          user.state.mastery.chuyenve = Math.max(0, user.state.mastery.chuyenve - 3);
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
