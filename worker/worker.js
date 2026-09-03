/**
 * 货补摸排问卷 · Cloudflare Worker 后端（免费、公网可访问）
 *
 * 部署（约 5 分钟，全程网页操作，不用装任何东西）：
 *  1. dash.cloudflare.com → 左侧 Workers & Pages → Create → Create Worker → 起名 huobu-survey → Deploy
 *  2. 点进 Worker → Edit code → 把本文件内容整个粘贴进去 → Deploy
 *  3. 左侧 Storage & Databases → KV → Create namespace，名字填 HUOBU
 *  4. 回到 Worker → Settings → Bindings → Add → KV namespace
 *     Variable name 填 HUOBU ，选刚建的 namespace → Save
 *  5. Settings → Variables and Secrets → Add → 名字 ADMIN_KEY ，值填你自己的密钥 → Save
 *  6. 拿到地址 https://huobu-survey.<你的子域>.workers.dev
 *     把它填进 docs/config.js 的 apiBase，重新 push 到 GitHub 即可
 *
 * 免费额度：10 万次请求/天，KV 10 万次读/天，几百份问卷完全够用。
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Key',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });

const INDEX_KEY = 'index';

async function listAll(kv) {
  const ids = JSON.parse((await kv.get(INDEX_KEY)) || '[]');
  const out = [];
  for (const id of ids) {
    const v = await kv.get('rec:' + id);
    if (v) {
      try { out.push(JSON.parse(v)); } catch (e) {}
    }
  }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const kv = env.HUOBU;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (!kv) return json({ ok: false, msg: 'KV 未绑定：请在 Worker Settings → Bindings 添加名为 HUOBU 的 KV namespace' }, 500);

    try {
      /* ---------- 提交 ---------- */
      if (request.method === 'POST' && p === '/api/submit') {
        const data = await request.json();
        if (!data || !data.brand) return json({ ok: false, msg: '缺少品牌名称' }, 400);

        const id = data.id || 'S' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
        const rec = {
          ...data,
          id,
          createdAt: data.createdAt || new Date().toISOString(),
          ip: request.headers.get('cf-connecting-ip') || '',
        };

        await kv.put('rec:' + id, JSON.stringify(rec));
        const ids = JSON.parse((await kv.get(INDEX_KEY)) || '[]');
        if (!ids.includes(id)) {
          ids.push(id);
          await kv.put(INDEX_KEY, JSON.stringify(ids));
        }
        return json({ ok: true, id });
      }

      /* ---------- 管理 ---------- */
      if (p.startsWith('/api/admin/')) {
        const key = url.searchParams.get('key') || request.headers.get('x-admin-key');
        if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
          return json({ ok: false, msg: '管理密钥错误' }, 401);
        }

        if (p === '/api/admin/list') {
          return json({ ok: true, list: await listAll(kv) });
        }

        if (p === '/api/admin/delete' && request.method === 'POST') {
          const { id } = await request.json();
          await kv.delete('rec:' + id);
          const ids = JSON.parse((await kv.get(INDEX_KEY)) || '[]');
          await kv.put(INDEX_KEY, JSON.stringify(ids.filter((x) => x !== id)));
          return json({ ok: true });
        }

        // 备份：直接下载全部原始数据
        if (p === '/api/admin/export.json') {
          const list = await listAll(kv);
          return new Response(JSON.stringify(list, null, 1), {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Disposition': 'attachment; filename="huobu-survey-backup.json"',
              ...CORS,
            },
          });
        }

        return json({ ok: false, msg: 'no route' }, 404);
      }

      return json({ ok: true, msg: '货补摸排问卷后端运行中', endpoints: ['/api/submit', '/api/admin/list', '/api/admin/export.json'] });
    } catch (e) {
      return json({ ok: false, msg: String(e && e.message || e) }, 500);
    }
  },
};
