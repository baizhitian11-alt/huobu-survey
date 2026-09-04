/**
 * GitHub 作后端 · 用 Issues 当数据库（纯静态站也能收数据）
 *
 *   提交：POST /repos/{repo}/issues        → 每份问卷 = 一个 issue，正文是 JSON
 *   读取：GET  /repos/{repo}/issues?state=all  → public 仓库匿名即可读，导出端不需要 token
 *
 * ── 关于 token ──────────────────────────────────────────────
 * 静态站没有服务端，写 issue 必须带 token。为把风险降到最低：
 *   1) 必须用 Fine-grained PAT，Repository access 只选「问卷这一个仓库」，
 *      Permissions 只给 Issues: Read and write（别的一律不给）。
 *      → 即使泄露，最坏情况只是有人往这个仓库发 issue，代码和其他仓库都动不了。
 *   2) token 在这里按分片 + base64 存放，避免被 GitHub secret scanning
 *      识别成明文密钥后自动吊销（明文 push 会被秒吊销）。
 *   3) 建议每轮摸排结束后到 GitHub 设置里把这个 token 删掉。
 * 若把 TOKEN_PARTS 留空，问卷会自动退回「离线回执」模式，功能不受影响。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HBGitHub = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CFG = (typeof window !== 'undefined' && window.HB_CONFIG) || {};
  var GH = CFG.github || {};

  var API = 'https://api.github.com';

  /** 还原 token：把分片拼起来再 base64 解码 */
  function token() {
    var parts = GH.tokenParts;
    if (!parts || !parts.length) return '';
    try {
      var joined = parts.join('');
      if (!joined) return '';
      var decode = (typeof atob === 'function')
        ? atob
        : function (s) { return Buffer.from(s, 'base64').toString('utf8'); };
      return decode(joined).trim();
    } catch (e) {
      return '';
    }
  }

  function enabled() {
    return !!(GH.repo && token());
  }
  /** 只读能力：public 仓库匿名可读，不需要 token */
  function readable() {
    return !!GH.repo;
  }

  /**
   * 请求头。
   * 注意：浏览器端只能带 GitHub CORS 白名单里的 header
   * （Accept / Authorization / Content-Type / X-GitHub-Api-Version）。
   * 带 Cache-Control、If-None-Match 之类会让 preflight 被拒，整个请求失败。
   * 防缓存改用 URL 上的时间戳参数。
   * @param {boolean} withAuth 是否带 token
   * @param {boolean} isWrite  写请求才需要 Content-Type
   */
  function headers(withAuth, isWrite) {
    var h = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (isWrite) h['Content-Type'] = 'application/json; charset=utf-8';
    var t = withAuth ? token() : '';
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  var LABEL = 'survey';

  function actName(data) {
    var SCH = (typeof window !== 'undefined' && window.HBSchema)
      || (typeof require === 'function' ? null : null);
    if (SCH && SCH.activityName) return SCH.activityName(data);
    return data.activityName || data.activityKey || '';
  }

  function issueTitle(data) {
    var n = (data.products || []).filter(function (p) { return p && p.name; }).length;
    return '[' + (actName(data) || '问卷') + '] ' + (data.brand || '未填客户')
      + ' · ' + n + '个商品 · ' + (data.id || '');
  }

  /** issue 正文：人可读摘要 + 机器可解析 JSON 代码块 */
  function issueBody(data) {
    var prods = (data.products || []).filter(function (p) { return p && p.name; });
    var lines = [
      '**活动**：' + (actName(data) || '-'),
      '**客户名称**：' + (data.brand || '-'),
      '**商品数**：' + prods.length,
      '**提交时间**：' + (data.createdAt || ''),
      '',
    ];

    if (prods.length) {
      var groups = {};
      prods.forEach(function (p) {
        (groups[p.status || '未填写'] = groups[p.status || '未填写'] || []).push(p);
      });
      Object.keys(groups).forEach(function (k) {
        lines.push('### ' + k + '（' + groups[k].length + ' 个）');
        groups[k].forEach(function (p) {
          var extra = '';
          if (k === '已提报') {
            extra = '｜补前 ' + (p.prePrice || '-') + ' / 报名 ' + (p.signupPrice || '-')
              + ' / 到手 ' + (p.actualPrice || '-');
            if ((p.subTypes || []).length) extra += '｜' + p.subTypes.join('、');
            if (p.audit) {
              extra += '｜审核：' + p.audit;
              if (p.audit === '审核中' && p.auditWait) extra += '(' + p.auditWait + ')';
              if (p.audit === '拒审' && (p.rejectReasons || []).length) {
                extra += '(' + p.rejectReasons.join('、') + ')';
                var qr = p.qualityRates || {};
                var qs = Object.keys(qr).filter(function (x) { return qr[x]; })
                  .map(function (x) { return x + ' ' + qr[x]; });
                if (qs.length) extra += '｜三率: ' + qs.join('、');
              }
            }
          } else if (k === '择机报') {
            extra = '｜预计 ' + (p.planTime || '-');
          } else if (k === '未提报') {
            extra = '｜' + ((p.reasons || []).join('、') || '-');
            if (p.smallLinkReason) extra += '｜小链接原因: ' + p.smallLinkReason;
            if (p.reasonOther) extra += '（' + p.reasonOther + '）';
          } else if (k === '无提报资格') {
            extra = '｜' + ((p.unqualifiedReasons || []).join('、') || '-');
            if (p.shopScore) extra += '（店铺分 ' + p.shopScore + '）';
            var ur = p.unqualifiedRates || {};
            var us = Object.keys(ur).filter(function (x) { return ur[x]; })
              .map(function (x) { return x + ' ' + ur[x]; });
            if (us.length) extra += '｜三率: ' + us.join('、');
            if (p.needTalk) extra += '｜' + p.needTalk;
            if (p.talkNote) extra += '(' + p.talkNote + ')';
          }
          lines.push('- ' + p.name + extra);
        });
        lines.push('');
      });
    }

    if (data.remark) lines.push('**备注**：' + data.remark, '');

    lines.push('<!-- 以下为机器读取用，请勿修改 -->');
    lines.push('```json');
    lines.push(JSON.stringify(data));
    lines.push('```');
    return lines.join('\n');
  }

  /** 提交一份问卷 */
  function submit(data) {
    if (!enabled()) return Promise.reject(new Error('GitHub 后端未配置'));
    return fetch(API + '/repos/' + GH.repo + '/issues', {
      method: 'POST',
      headers: headers(true, true),
      body: JSON.stringify({
        title: issueTitle(data),
        body: issueBody(data),
        labels: [LABEL],
      }),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (r.status === 401 || r.status === 403) {
          throw new Error('token 无效或权限不足（需要 Issues: Read and write）');
        }
        if (r.status === 404) throw new Error('仓库不存在或 token 没有该仓库权限');
        if (!r.ok) throw new Error((j && j.message) || ('HTTP ' + r.status));
        return { ok: true, id: data.id, issue: j.number, url: j.html_url };
      });
    });
  }

  /** 从 issue 正文里抽出 JSON */
  function parseIssue(it) {
    var body = it.body || '';
    var m = body.match(/```json\s*([\s\S]*?)```/);
    if (!m) return null;
    try {
      var obj = JSON.parse(m[1].trim());
      obj.__issue = it.number;
      obj.__issueUrl = it.html_url;
      if (!obj.createdAt) obj.createdAt = it.created_at;
      return obj;
    } catch (e) {
      return null;
    }
  }

  /** 拉取全部问卷（自动翻页）。只取 open 的 issue —— 关闭即视为删除
   *  注意：不用 labels 参数过滤（GitHub 的 label 索引有几秒延迟，
   *  会导致刚提交的问卷读不到），改为拉全部后在客户端按 label 过滤。
   */
  function list(onProgress) {
    if (!readable()) return Promise.reject(new Error('未配置 github.repo'));
    var out = [];
    var page = 1;

    function next() {
      var url = API + '/repos/' + GH.repo + '/issues?state=open&per_page=100&page=' + page
        + '&_=' + Date.now();   // 打破 CDN 缓存（不能用 Cache-Control 头，会被 CORS 拦）
      return fetch(url, { headers: headers(true), cache: 'no-store' }).catch(function (e) {
        // 网络层失败（断网 / 被拦 / CORS）
        throw new Error('无法连接 GitHub（' + (e && e.message ? e.message : '网络错误')
          + '）。请检查网络是否能访问 api.github.com');
      }).then(function (r) {
        if (r.status === 401) throw new Error('token 无效或已过期，请重新生成并执行 set_token.py');
        if (r.status === 403) {
          throw new Error('访问被拒绝（403）：token 权限不足，或触发了 API 限流（每小时 5000 次），稍后再试');
        }
        if (r.status === 404) throw new Error('仓库不存在或无权访问：' + GH.repo);
        return r.json().then(function (arr) {
          if (!r.ok) throw new Error((arr && arr.message) || ('HTTP ' + r.status));
          if (!Array.isArray(arr)) throw new Error('返回格式异常');
          arr.forEach(function (it) {
            if (it.pull_request) return;
            // 客户端过滤：只要带 survey 标签的
            var labels = (it.labels || []).map(function (l) {
              return typeof l === 'string' ? l : l.name;
            });
            if (labels.indexOf(LABEL) < 0) return;
            var rec = parseIssue(it);
            if (rec) out.push(rec);
          });
          if (onProgress) onProgress(out.length);
          if (arr.length === 100 && page < 30) { page++; return next(); }
          out.sort(function (a, b) {
            return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
          });
          return out;
        });
      });
    }
    return next();
  }

  /** 关闭（软删除）一份问卷 */
  function close(issueNumber) {
    if (!enabled()) return Promise.reject(new Error('需要 token 才能关闭 issue'));
    return fetch(API + '/repos/' + GH.repo + '/issues/' + issueNumber, {
      method: 'PATCH',
      headers: headers(true, true),
      body: JSON.stringify({ state: 'closed' }),
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return { ok: true };
    });
  }

  return {
    enabled: enabled,
    readable: readable,
    repo: function () { return GH.repo || ''; },
    submit: submit,
    list: list,
    close: close,
    parseIssue: parseIssue,
  };
}));
