/* 运营侧 · 鹅选美妆节：按品牌汇总「报规划 + 排位赛凭证」，查看凭证、导出 Excel */
'use strict';

(function () {
  var GHUB = window.HBGitHub;
  var XC = window.HB_EXUAN;
  if (!XC || !GHUB || !document.getElementById('exList')) return;

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var fmtT = function (iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  var UP_MODS = XC.voucher.modules.filter(function (m) { return !m.noUpload; });

  /** BRANDS: [{ brand, plan(最新报规划), planCount, issues:[...], vouchers:{ module: [v...] }, history:[v...] }] */
  var BRANDS = [];

  function answerText(q, v) {
    if (v == null || v === '') return '';
    var t = Array.isArray(v) ? v.join('、') : String(v);
    return q.unit && t ? t + q.unit : t;
  }

  /* ---------- 拉取 & 按品牌合并 ---------- */
  function pull() {
    if (!GHUB.readable()) return;
    var btn = $('#exBtnPull');
    btn.disabled = true;
    btn.textContent = '拉取中…';
    $('#exStatus').textContent = '读取报名记录…';

    GHUB.listByLabel(XC.label).then(function (arr) {
      var done = 0;
      return Promise.all(arr.map(function (rec) {
        return GHUB.listComments(rec.__issue).then(function (cs) {
          rec.vouchers = GHUB.parseVouchers(cs);
        }).catch(function () { rec.vouchers = []; }).then(function () {
          $('#exStatus').textContent = '读取凭证 ' + (++done) + '/' + arr.length + '…';
        });
      })).then(function () { return arr; });
    }).then(function (arr) {
      var map = {};
      arr.forEach(function (r) {
        var b = (r.brand || '').trim() || '(未填品牌)';
        var g = map[b] || (map[b] = { brand: b, plan: null, planCount: 0, issues: [], vouchers: {}, history: [], extra: {} });
        g.issues.push({ no: r.__issue, url: r.__issueUrl });
        if (r.kind !== 'voucherOnly' && r.answers) {
          g.planCount++;
          if (!g.plan || String(r.createdAt) > String(g.plan.createdAt)) g.plan = r;
        }
        (r.vouchers || []).forEach(function (v) {
          g.history.push(v);
          (g.vouchers[v.module] = g.vouchers[v.module] || []).push(v);
          if (v.extra) Object.keys(v.extra).forEach(function (ek) { if (v.extra[ek]) g.extra[v.module] = v.extra[ek]; });
        });
      });
      BRANDS = Object.keys(map).map(function (k) { return map[k]; });
      BRANDS.sort(function (a, b) {
        var ta = a.plan ? a.plan.createdAt : '', tb = b.plan ? b.plan.createdAt : '';
        return String(tb).localeCompare(String(ta));
      });
      render();
      var vc = BRANDS.reduce(function (n, g) { return n + g.history.length; }, 0);
      $('#exStatus').textContent = BRANDS.length + ' 个品牌 · 报规划 '
        + BRANDS.filter(function (g) { return g.plan; }).length + ' 份 · 凭证 ' + vc + ' 张 · '
        + new Date().toLocaleTimeString('zh-CN');
    }).catch(function (e) {
      $('#exStatus').textContent = '拉取失败：' + e.message;
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = '刷新鹅选数据';
    });
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var plans = BRANDS.filter(function (g) { return g.plan; });
    var late = plans.filter(function (g) { return g.plan.late; }).length;
    var withV = BRANDS.filter(function (g) { return g.history.length; }).length;
    var cell = function (k, v, cls) {
      return '<div class="stat"><div class="v' + (cls ? ' ' + cls : '') + '">' + v + '</div><div class="k">' + esc(k) + '</div></div>';
    };
    var stats = [cell('品牌数', BRANDS.length), cell('已报规划', plans.length, 'ok'),
      cell('逾期提交', late, late ? 'warn' : ''), cell('已传凭证品牌', withV, 'ok')];
    UP_MODS.forEach(function (m) {
      stats.push(cell(m.name + '·已传品牌', BRANDS.filter(function (g) { return (g.vouchers[m.key] || []).length; }).length));
    });
    $('#exStats').innerHTML = stats.join('');

    $('#exList tbody').innerHTML = BRANDS.map(function (g, gi) {
      var p = g.plan;
      var planCell = p
        ? (p.late ? '<span class="badge warn">逾期</span> ' : '<span class="badge ok">按时</span> ')
          + esc(fmtT(p.createdAt)) + (g.planCount > 1 ? ' <span class="badge">共' + g.planCount + '次</span>' : '')
          + '<div style="color:#7a8399;font-size:12px;margin-top:3px">日耗 ' + esc(answerText(XC.questions[1], p.answers.dailyCost) || '-')
          + ' · 涨幅 ' + esc(answerText(XC.questions[2], p.answers.growth) || '-')
          + ' · 大场 ' + esc([].concat(p.answers.bigLiveDate || []).join('、') || '-') + '</div>'
        : '<span style="color:#c1c8d6">未报规划</span>';

      var vCell = UP_MODS.map(function (m) {
        var got = (g.vouchers[m.key] || []).slice().sort(function (a, b) {
          return String(a.uploadedAt).localeCompare(String(b.uploadedAt));
        });
        var n = got.length;
        return '<div class="vm-line">' + (n ? '<span class="ok">✓</span>' : '<span class="miss">✗</span>')
          + ' <b style="font-weight:600">' + esc(m.name) + '</b> ' + n + '张' + (m.max ? '/最多' + m.max : '') + ' '
          + got.map(function (v, i) {
            var pf = v.perFile ? Object.keys(v.perFile).map(function (k) { return v.perFile[k]; })
              .filter(Boolean).join(' · ') : '';
            return '<a href="' + esc(v.url) + '" target="_blank" title="'
              + esc(v.name + ' · ' + fmtT(v.uploadedAt) + (pf ? ' · ' + pf : '')) + '">' + (i + 1) + '</a>';
          }).join(' ')
          + (g.extra[m.key] ? ' <i>' + esc((m.extraField || {}).label || '附加') + '：' + esc(g.extra[m.key]) + '</i>' : '')
          + '</div>';
      }).join('');

      return '<tr><td><b>' + esc(g.brand) + '</b><div style="margin-top:4px">'
        + g.issues.map(function (it) { return '<a href="' + esc(it.url) + '" target="_blank">#' + it.no + '</a>'; }).join(' ')
        + '</div></td><td>' + planCell
        + (p ? '<div><button class="link-btn" data-detail="' + gi + '">看全部答案</button></div>' : '')
        + '</td><td>' + vCell + '</td></tr>'
        + '<tr class="ex-detail" id="exd' + gi + '" style="display:none"><td colspan="3">'
        + (p ? XC.questions.map(function (q) {
          return '<div class="cf-row"><span>' + esc(q.title) + '</span><b>' + esc(answerText(q, p.answers[q.key]) || '-') + '</b></div>';
        }).join('') + (p.remark ? '<div class="cf-row"><span>备注</span><b>' + esc(p.remark) + '</b></div>' : '') : '')
        + '</td></tr>';
    }).join('') || '<tr><td colspan="3" style="color:#7a8399">暂无数据</td></tr>';
  }

  $('#exList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-detail]');
    if (!b) return;
    var row = document.getElementById('exd' + b.dataset.detail);
    row.style.display = row.style.display === 'none' ? '' : 'none';
  });

  /* ---------- 导出 Excel ---------- */
  function exportExcel() {
    if (!BRANDS.length) return alert('暂无数据，请先刷新');

    // 凭证明细：每个文件一行；按 品牌 → 排位事项 → 上传时间 排序
    var modOrder = {};
    XC.voucher.modules.forEach(function (m, i) { modOrder[m.key] = i; });
    var items = [];
    BRANDS.forEach(function (g) {
      g.history.forEach(function (v) { items.push({ g: g, v: v }); });
    });
    items.sort(function (a, b) {
      return String(a.g.brand).localeCompare(String(b.g.brand), 'zh')
        || (modOrder[a.v.module] || 0) - (modOrder[b.v.module] || 0)
        || String(a.v.uploadedAt).localeCompare(String(b.v.uploadedAt));
    });

    var btn = $('#exBtnExport');
    btn.disabled = true;
    btn.textContent = '正在打包图片…';
    var done = 0;
    var setProg = function () {
      $('#exStatus').textContent = '正在下载凭证图片 ' + done + '/' + items.length + '（图片会直接嵌进 Excel）…';
    };
    setProg();

    mapLimit(items, 4, function (it) {
      return loadImage(it.v).then(function (img) {
        done++;
        setProg();
        return img;
      });
    }).then(function (imgs) {
      var imgOf = new Map();
      items.forEach(function (it, i) { imgOf.set(it.v, imgs[i]); });
      var failed = items.filter(function (it, i) { return !imgs[i] || (!imgs[i].data && !imgs[i].pdf); }).length;
      var pdfs = items.filter(function (it, i) { return imgs[i] && imgs[i].pdf; }).length;
      var embedded = items.length - failed - pdfs;
      var px2ch = function (px) { return Math.max(10, Math.ceil((px - 5) / 7)); };

      /* ===== Sheet1：报规划 + 凭证缩略图（一行一个品牌，包含只传了凭证没报规划的品牌） ===== */
      var TH = 120, TW_MAX = 180, GAP = 6, PAD = 6;
      var planCols = XC.questions.length;
      var h1 = ['品牌名称', '提交时间', '是否逾期', '提交次数']
        .concat(XC.questions.map(function (q) { return q.title + (q.unit ? '(' + q.unit + ')' : ''); }))
        .concat(['备注']);
      var modCol0 = h1.length;
      UP_MODS.forEach(function (m) {
        h1.push(m.name + '凭证（点图看原图）');
        if (m.extraField) h1.push(m.extraField.label);
      });
      h1.push('投放力', '已传凭证总数');

      var r1 = [], img1 = [], link1 = [], ht1 = {}, colW = {};
      var ordered = BRANDS.slice().sort(function (a, b) { return (b.plan ? 1 : 0) - (a.plan ? 1 : 0); });
      ordered.forEach(function (g, gi) {
        var row = gi + 1, p = g.plan, cells;
        if (p) {
          cells = [g.brand, fmtT(p.createdAt), p.late ? '逾期' : '按时', g.planCount]
            .concat(XC.questions.map(function (q) {
              var v = p.answers[q.key];
              if (q.type === 'number' && v !== '' && v != null && isFinite(+v)) return +v;
              return Array.isArray(v) ? v.join('、') : (v == null ? '' : String(v));
            }))
            .concat([p.remark || '']);
        } else {
          cells = [g.brand, '未报规划', '', 0];
          for (var k = 0; k < planCols; k++) cells.push('');
          cells.push('');
        }
        var col = modCol0, total = 0, rowHasImg = false;
        UP_MODS.forEach(function (m) {
          var got = (g.vouchers[m.key] || []).slice().sort(function (a, b) {
            return String(a.uploadedAt).localeCompare(String(b.uploadedAt));
          });
          total += got.length;
          var x = PAD, notes = [];
          got.forEach(function (v) {
            var im = imgOf.get(v);
            if (im && im.data) {
              var s = Math.min(TH / im.h, TW_MAX / im.w);
              var w = Math.round(im.w * s), h = Math.round(im.h * s);
              img1.push({ row: row, col: col, data: im.data, ext: 'jpeg', w: w, h: h, offX: x, offY: PAD,
                url: v.url, name: g.brand + '-' + m.name });
              x += w + GAP;
              rowHasImg = true;
            } else {
              notes.push(im && im.pdf ? 'PDF' : '图片读取失败');
            }
          });
          var text = '';
          if (!got.length) text = '未上传';
          else if (notes.length) text = notes.length + ' 个' + (notes[0] === 'PDF' ? ' PDF' : '文件读取失败') + '，见「凭证明细」';
          cells.push(text);
          if (notes.length && got.length === 1) link1.push({ row: row, col: col, url: got[0].url });
          colW[col] = Math.max(colW[col] || 0, x + PAD, notes.length ? 190 : 0);
          col++;
          if (m.extraField) { cells.push(g.extra[m.key] || ''); col++; }
        });
        cells.push('官方校验', total);
        r1.push(cells);
        ht1[row] = rowHasImg ? TH + PAD * 2 : 36;
      });

      var cols1 = [16, 13, 9, 9].concat(XC.questions.map(function (q) { return q.type === 'multi' ? 30 : 18; })).concat([24]);
      var cc = modCol0;
      UP_MODS.forEach(function (m) {
        cols1[cc] = px2ch(Math.max(colW[cc] || 0, 150));
        cc++;
        if (m.extraField) { cols1[cc] = 20; cc++; }
      });
      cols1.push(10, 12);

      /* ===== Sheet2：凭证明细（大图，每个文件一行） ===== */
      var BOX_W = 300, BOX_H = 340;
      // 每张凭证单独填的信息（如大场力的 大场时间 / 大场主题）→ 追加成列
      var pfKeys = [];
      items.forEach(function (it) {
        var pf = it.v.perFile || {};
        Object.keys(pf).forEach(function (k) { if (pf[k] && pfKeys.indexOf(k) < 0) pfKeys.push(k); });
      });
      var h2 = ['品牌名称', '排位事项', '凭证图片（点图看原图）', '原图链接', '文件名', '上传时间', '附加信息']
        .concat(pfKeys);
      var r2 = [], img2 = [], link2 = [], ht2 = {};
      items.forEach(function (it, i) {
        var v = it.v, im = imgs[i], row = i + 1, cellText = '';
        var ex = v.extra ? Object.keys(v.extra).map(function (k) { return v.extra[k]; }).join('；') : '';
        if (im && im.data) {
          var s = Math.min(BOX_W / im.w, BOX_H / im.h, 1);
          img2.push({ row: row, col: 2, data: im.data, ext: 'jpeg', w: Math.round(im.w * s), h: Math.round(im.h * s),
            offX: PAD, offY: PAD, url: v.url, name: it.g.brand + '-' + (v.moduleName || v.module) });
          ht2[row] = Math.round(im.h * s) + PAD * 2;
        } else {
          cellText = im && im.pdf ? 'PDF 文件，点右侧链接查看' : '图片读取失败，点右侧链接查看';
          ht2[row] = 40;
        }
        r2.push([it.g.brand, v.moduleName || v.module, cellText, v.url ? '打开原图' : '',
          v.name || '', fmtT(v.uploadedAt), ex]
          .concat(pfKeys.map(function (k) { return (v.perFile || {})[k] || ''; })));
        if (v.url) link2.push({ row: row, col: 3, url: v.url });
      });

      window.HBXlsx.downloadXlsx([
        { name: '报规划及凭证（含图片）', rows: [h1].concat(r1), cols: cols1,
          images: img1, links: link1, rowHeights: ht1, wrap: true },
        { name: '凭证明细（大图）', rows: [h2].concat(r2),
          cols: [16, 10, 44, 11, 26, 13, 20].concat(pfKeys.map(function (k) { return k.length > 6 ? 22 : 14; })),
          images: img2, links: link2, rowHeights: ht2, wrap: true },
      ], '鹅选美妆节_' + BRANDS.length + '个品牌_' + new Date().toISOString().slice(0, 10) + '.xlsx');

      $('#exStatus').textContent = '已导出：' + embedded + ' 张凭证图片已嵌入 Excel（第一张表最右侧各排位事项列）'
        + (pdfs ? '，' + pdfs + ' 个 PDF 保留链接' : '')
        + (failed ? '，' + failed + ' 张读取失败（保留了链接）' : '');
    }).catch(function (e) {
      alert('导出失败：' + e.message);
      $('#exStatus').textContent = '导出失败：' + e.message;
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = '导出鹅选 Excel';
    });
  }

  /** 并发受限的 map：limit 个一起跑，结果按原顺序返回 */
  function mapLimit(arr, limit, fn) {
    var out = new Array(arr.length), idx = 0;
    function worker() {
      if (idx >= arr.length) return Promise.resolve();
      var i = idx++;
      return Promise.resolve(fn(arr[i], i)).then(function (r) { out[i] = r; }, function () { out[i] = null; })
        .then(worker);
    }
    var ws = [];
    for (var k = 0; k < Math.min(limit, arr.length); k++) ws.push(worker());
    return Promise.all(ws).then(function () { return out; });
  }

  /**
   * 下载凭证并统一转成 JPEG（Excel 对 webp/gif 支持差），长边压到 1200px
   * 返回 { data:Uint8Array, w, h } / { pdf:true } / null
   */
  function loadImage(v) {
    var name = v.path || v.name || '';
    if (/\.pdf$/i.test(name)) return Promise.resolve({ pdf: true });
    if (!/\.(png|jpe?g|webp|gif)$/i.test(name)) return Promise.resolve(null);

    var apiUrl = v.path
      ? 'https://api.github.com/repos/' + GHUB.repo() + '/contents/' + v.path.split('/').map(encodeURIComponent).join('/') + '?ref=data'
      : '';
    var get = function (url, headers) {
      return fetch(url, { headers: headers || {}, cache: 'force-cache' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      });
    };
    // 先走 raw 地址；刚上传的文件 CDN 偶尔还没生效，再走 API 兜底
    return get(v.url).catch(function () {
      if (!apiUrl) throw new Error('no api');
      return get(apiUrl, { Accept: 'application/vnd.github.raw' });
    }).then(function (blob) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        var src = URL.createObjectURL(blob);
        img.onload = function () {
          var max = 1200, w = img.naturalWidth, h = img.naturalHeight;
          if (Math.max(w, h) > max) { var s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);   // 透明 PNG 转 JPEG 时垫白底
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(src);
          cv.toBlob(function (b) {
            if (!b) return reject(new Error('转码失败'));
            b.arrayBuffer().then(function (buf) {
              resolve({ data: new Uint8Array(buf), w: w, h: h });
            }, reject);
          }, 'image/jpeg', 0.82);
        };
        img.onerror = function () { URL.revokeObjectURL(src); reject(new Error('图片解码失败')); };
        img.src = src;
      });
    }).catch(function () { return null; });
  }

  $('#exBtnPull').addEventListener('click', pull);
  $('#exBtnExport').addEventListener('click', exportExcel);
  render();
  if (GHUB.readable()) pull();
})();
