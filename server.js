'use strict';
/**
 * 货补摸排问卷 · 本地/内网后端（零依赖）
 *   启动: node server.js         默认 http://localhost:8080
 *   环境变量: PORT / ADMIN_KEY
 *
 * 同时托管 docs/ 静态站，方便本地预览与内网直接使用。
 * 导出逻辑与前端共用 docs/schema.js + docs/xlsx.js，表头不会错位。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const SCH = require('./docs/schema.js');
const { buildXlsx } = require('./docs/xlsx.js');

const PORT = process.env.PORT || 8080;
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin888';
const ROOT = __dirname;
const SITE_DIR = path.join(ROOT, 'docs');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'submissions.json');

/* ---------------- 存储 ---------------- */
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { return []; }
}
function writeDB(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(list, null, 1), 'utf8');
}

/* ---------------- 工具 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Key',
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, Object.assign({ 'Cache-Control': 'no-store' }, CORS, headers));
  res.end(body);
}
function sendJSON(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}
function body(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => {
      buf += c;
      if (buf.length > 8e6) reject(new Error('payload too large'));
    });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

/* ---------------- 路由 ---------------- */
function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath);
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(SITE_DIR, safe);

  // 兼容旧路径：/data/xxx 从项目 data 目录取
  if (safe.startsWith(path.sep + 'data' + path.sep)) file = path.join(ROOT, safe);

  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  send(res, 200, fs.readFileSync(file), {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');

    if (req.method === 'POST' && p === '/api/submit') {
      const data = JSON.parse((await body(req)) || '{}');
      if (!data.brand) return sendJSON(res, 400, { ok: false, msg: '缺少品牌名称' });
      const list = readDB();
      const rec = Object.assign({}, data, {
        id: data.id || 'S' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100),
        createdAt: data.createdAt || new Date().toISOString(),
        ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0],
      });
      list.push(rec);
      writeDB(list);
      return sendJSON(res, 200, { ok: true, id: rec.id });
    }

    if (p.startsWith('/api/admin/')) {
      const key = url.searchParams.get('key') || req.headers['x-admin-key'];
      if (key !== ADMIN_KEY) return sendJSON(res, 401, { ok: false, msg: '管理密钥错误' });

      if (req.method === 'GET' && p === '/api/admin/list') {
        return sendJSON(res, 200, { ok: true, list: readDB() });
      }
      if (req.method === 'GET' && p === '/api/admin/export.xlsx') {
        const buf = Buffer.from(buildXlsx(SCH.sheets(readDB())));
        const name = encodeURIComponent(`货补摸排汇总_${new Date().toISOString().slice(0, 10)}.xlsx`);
        return send(res, 200, buf, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="survey.xlsx"; filename*=UTF-8''${name}`,
        });
      }
      if (req.method === 'POST' && p === '/api/admin/delete') {
        const { id } = JSON.parse((await body(req)) || '{}');
        writeDB(readDB().filter((x) => x.id !== id));
        return sendJSON(res, 200, { ok: true });
      }
      return sendJSON(res, 404, { ok: false, msg: 'no route' });
    }

    if (req.method === 'GET') return serveStatic(req, res, p);
    send(res, 405, 'Method Not Allowed', { 'Content-Type': 'text/plain; charset=utf-8' });
  } catch (e) {
    sendJSON(res, 500, { ok: false, msg: String((e && e.message) || e) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`问卷:     http://localhost:${PORT}/`);
  console.log(`汇总导出: http://localhost:${PORT}/merge.html   (管理密钥: ${ADMIN_KEY})`);
});
