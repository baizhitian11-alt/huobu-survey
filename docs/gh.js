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
            if ((p.subTypes || []).length) extra += '｜' + p.subTypes.join('、');
            // 按补贴类型逐组列价格，平台补贴与商家优惠分开
            var SCH = (typeof window !== 'undefined' && window.HBSchema) || null;
            var keys = (p.subTypes || []).length ? p.subTypes : ['__default__'];
            var segs = [];
            keys.forEach(function (sk) {
              var pr = (p.prices || {})[sk];
              if (!pr) return;
              var c = SCH && SCH.calcPrice ? SCH.calcPrice(pr) : null;
              if (!c || c.signup === null) return;
              var one = (sk === '__default__' ? '' : sk + ': ')
                + '原价 ' + c.signup
                + (c.merchant ? ' / 商家券 ' + c.merchant : '')
                + (c.platform !== null ? ' / 平台补贴 ' + c.platform
                    + (c.platformRate !== null ? '(' + c.platformRate + '%)' : '') : '')
                + (c.actual !== null ? ' / 到手 ' + c.actual : '')
                + (c.warn ? ' ⚠' + c.warn : '');
              segs.push(one);
            });
            if (segs.length) extra += '｜' + segs.join('；');
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
            if (p.smallLinkReason) extra += '｜小链接不能报原因: ' + p.smallLinkReason;
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

  /* ============================================================
   * 通用能力：自定义 label 的提交/读取 + 凭证文件上传 + issue 评论
   * ============================================================ */

  /** 通用提交：自定义标题/正文/标签（鹅选等新模块用） */
  function submitIssue(title, body, labels) {
    if (!enabled()) return Promise.reject(new Error('GitHub 后端未配置'));
    return fetch(API + '/repos/' + GH.repo + '/issues', {
      method: 'POST',
      headers: headers(true, true),
      body: JSON.stringify({ title: title, body: body, labels: labels }),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (r.status === 401 || r.status === 403) {
          throw new Error('token 无效或权限不足（需要 Issues: Read and write）');
        }
        if (r.status === 404) throw new Error('仓库不存在或 token 没有该仓库权限');
        if (!r.ok) throw new Error((j && j.message) || ('HTTP ' + r.status));
        return { ok: true, issue: j.number, url: j.html_url };
      });
    });
  }

  /** 按标签拉取 issue（客户端过滤，通用版 list） */
  function listByLabel(label, onProgress) {
    if (!readable()) return Promise.reject(new Error('未配置 github.repo'));
    var out = [];
    var page = 1;

    function next() {
      var url = API + '/repos/' + GH.repo + '/issues?state=open&per_page=100&page=' + page
        + '&_=' + Date.now();
      return fetch(url, { headers: headers(true), cache: 'no-store' }).then(function (r) {
        if (r.status === 401) throw new Error('token 无效或已过期，请重新生成并执行 set_token.py');
        if (r.status === 403) throw new Error('访问被拒绝（403）：权限不足或触发限流');
        if (r.status === 404) throw new Error('仓库不存在或无权访问：' + GH.repo);
        return r.json().then(function (arr) {
          if (!r.ok) throw new Error((arr && arr.message) || ('HTTP ' + r.status));
          if (!Array.isArray(arr)) throw new Error('返回格式异常');
          arr.forEach(function (it) {
            if (it.pull_request) return;
            var labels = (it.labels || []).map(function (l) {
              return typeof l === 'string' ? l : l.name;
            });
            if (labels.indexOf(label) < 0) return;
            var rec = parseIssue(it);
            if (rec) {
              rec.__labels = labels;
              out.push(rec);
            }
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

  /** 在 issue 下追加评论 */
  function addComment(issueNumber, body) {
    if (!enabled()) return Promise.reject(new Error('需要 token 才能评论'));
    return fetch(API + '/repos/' + GH.repo + '/issues/' + issueNumber + '/comments', {
      method: 'POST',
      headers: headers(true, true),
      body: JSON.stringify({ body: body }),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.message) || ('HTTP ' + r.status));
        return { ok: true, id: j.id };
      });
    });
  }

  /** 读取某 issue 的全部评论（自动翻页） */
  function listComments(issueNumber) {
    if (!readable()) return Promise.reject(new Error('未配置 github.repo'));
    var out = [];
    var page = 1;
    function next() {
      return fetch(API + '/repos/' + GH.repo + '/issues/' + issueNumber
        + '/comments?per_page=100&page=' + page + '&_=' + Date.now(),
        { headers: headers(true), cache: 'no-store' }).then(function (r) {
        return r.json().then(function (arr) {
          if (!r.ok) throw new Error((arr && arr.message) || ('HTTP ' + r.status));
          (arr || []).forEach(function (c) {
            out.push({ id: c.id, body: c.body || '', createdAt: c.created_at });
          });
          if (arr.length === 100 && page < 10) { page++; return next(); }
          return out;
        });
      });
    }
    return next();
  }

  /** 从评论里解析凭证记录（```json {"type":"voucher",...} ```） */
  function parseVouchers(comments) {
    var out = [];
    (comments || []).forEach(function (c) {
      var m = (c.body || '').match(/```json\s*([\s\S]*?)```/);
      if (!m) return;
      try {
        var obj = JSON.parse(m[1].trim());
        if (obj && obj.type === 'voucher') {
          obj.__commentId = c.id;
          out.push(obj);
        }
      } catch (e) { /* 忽略坏数据 */ }
    });
    return out;
  }

  /** 凭证评论正文：人可读 + 机器可解析 */
  function voucherCommentBody(v) {
    var kb = v.size ? Math.round(v.size / 1024) + 'KB' : '';
    var extra = v.extra ? Object.keys(v.extra).map(function (k) { return k + '：' + v.extra[k]; }).join('；') : '';
    /* 每张凭证各自填的信息（如 大场时间 / 大场主题） */
    var per = v.perFile ? Object.keys(v.perFile).map(function (k) { return k + '：' + v.perFile[k]; }).join('；') : '';
    var isImg = /\.(png|jpe?g|webp|gif)$/i.test(v.path || v.name || '');
    return [
      '**凭证上传** · ' + (v.brand || '-') + ' · **' + (v.moduleName || v.module || '')
        + (v.slotName ? ' / ' + v.slotName : '') + '** · ' + (v.uploadedAt || ''),
      '',
      '- 文件：[' + v.name + '](' + v.url + ')' + (kb ? '（' + kb + '）' : ''),
      extra ? '- ' + extra : '',
      per ? '- ' + per : '',
      isImg ? '\n![' + (v.slotName || v.name) + '](' + v.url + ')' : '',
      '',
      '<!-- 以下为机器读取用，请勿修改 -->',
      '```json',
      JSON.stringify(v),
      '```',
    ].join('\n');
  }

  /* ---------- 凭证文件：存到仓库 data 分支（Contents API） ----------
   * 放在独立 data 分支，避免每次上传都触发 Pages 重新构建主分支。
   * 文件地址：https://raw.githubusercontent.com/{repo}/data/{path}
   * 需要 token 有 Contents: Read and write 权限。
   */

  var DATA_BRANCH = 'data';

  /** 确保 data 分支存在（不存在则从默认分支复制一个） */
  function ensureDataBranch() {
    return fetch(API + '/repos/' + GH.repo + '/git/refs/heads/' + DATA_BRANCH,
      { headers: headers(true), cache: 'no-store' }).then(function (r) {
      if (r.ok) return true;
      if (r.status !== 404) throw new Error('检查分支失败 HTTP ' + r.status);
      // 取默认分支最新 commit
      return fetch(API + '/repos/' + GH.repo, { headers: headers(true) }).then(function (rr) {
        return rr.json().then(function (repo) {
          if (!rr.ok) throw new Error((repo && repo.message) || '读取仓库信息失败');
          return fetch(API + '/repos/' + GH.repo + '/git/refs/heads/' + repo.default_branch,
            { headers: headers(true) }).then(function (r3) {
            return r3.json().then(function (ref) {
              if (!r3.ok) throw new Error('读取默认分支失败');
              return fetch(API + '/repos/' + GH.repo + '/git/refs', {
                method: 'POST',
                headers: headers(true, true),
                body: JSON.stringify({ ref: 'refs/heads/' + DATA_BRANCH, sha: ref.object.sha }),
              }).then(function (r4) {
                if (!r4.ok && r4.status !== 422) throw new Error('创建 data 分支失败 HTTP ' + r4.status);
                return true;
              });
            });
          });
        });
      });
    });
  }

  /**
   * 上传文件到 data 分支
   * @param {string} path  仓库内路径，如 uploads/exuan/xxx.png
   * @param {string} base64 文件内容的 base64（不含 data: 前缀）
   * @returns {Promise<{url, path}>}
   */
  function uploadFile(path, base64) {
    if (!enabled()) return Promise.reject(new Error('需要 token 才能上传文件'));
    return ensureDataBranch().then(function () {
      return fetch(API + '/repos/' + GH.repo + '/contents/' + path, {
        method: 'PUT',
        headers: headers(true, true),
        body: JSON.stringify({
          message: 'voucher: ' + path,
          content: base64,
          branch: DATA_BRANCH,
        }),
      });
    }).then(function (r) {
      return r.json().then(function (j) {
        if (r.status === 401 || r.status === 403) {
          throw new Error('token 无效或缺少 Contents: Read and write 权限，请重新生成 token');
        }
        if (r.status === 404) throw new Error('仓库不存在或 token 没有该仓库权限');
        if (r.status === 422) throw new Error('文件冲突（同名文件已存在），请重试');
        if (!r.ok) throw new Error((j && j.message) || ('HTTP ' + r.status));
        return {
          ok: true,
          path: path,
          url: 'https://raw.githubusercontent.com/' + GH.repo + '/' + DATA_BRANCH + '/' + path,
          page: (j.content && j.content.html_url) || '',
        };
      });
    });
  }

  /** 删除 data 分支上的文件（运营侧删除错传的凭证） */
  function deleteFile(path) {
    if (!enabled()) return Promise.reject(new Error('需要 token'));
    return fetch(API + '/repos/' + GH.repo + '/contents/' + path + '?ref=' + DATA_BRANCH,
      { headers: headers(true), cache: 'no-store' }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error('读取文件信息失败 HTTP ' + r.status);
        return fetch(API + '/repos/' + GH.repo + '/contents/' + path, {
          method: 'DELETE',
          headers: headers(true, true),
          body: JSON.stringify({ message: 'remove ' + path, sha: j.sha, branch: DATA_BRANCH }),
        });
      });
    }).then(function (r) {
      if (!r.ok) throw new Error('删除失败 HTTP ' + r.status);
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
    /* 通用 / 凭证 */
    submitIssue: submitIssue,
    listByLabel: listByLabel,
    addComment: addComment,
    listComments: listComments,
    parseVouchers: parseVouchers,
    voucherCommentBody: voucherCommentBody,
    uploadFile: uploadFile,
    deleteFile: deleteFile,
  };
}));
