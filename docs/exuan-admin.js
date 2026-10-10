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
          + ' · 大场 ' + esc(p.answers.bigLiveDate || '-') + '</div>'
        : '<span style="color:#c1c8d6">未报规划</span>';

      var vCell = UP_MODS.map(function (m) {
        var got = (g.vouchers[m.key] || []).slice().sort(function (a, b) {
          return String(a.uploadedAt).localeCompare(String(b.uploadedAt));
        });
        var n = got.length;
        return '<div class="vm-line">' + (n ? '<span class="ok">✓</span>' : '<span class="miss">✗</span>')
          + ' <b style="font-weight:600">' + esc(m.name) + '</b> ' + n + '张' + (m.max ? '/最多' + m.max : '') + ' '
          + got.map(function (v, i) {
            return '<a href="' + esc(v.url) + '" target="_blank" title="' + esc(v.name + ' · ' + fmtT(v.uploadedAt)) + '">'
              + (i + 1) + '</a>';
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

    // Sheet1 报规划：一行一个品牌（取最新一次）
    var h1 = ['品牌名称', '提交时间', '是否逾期', '提交次数']
      .concat(XC.questions.map(function (q) { return q.title + (q.unit ? '(' + q.unit + ')' : ''); }))
      .concat(['备注']);
    var r1 = BRANDS.filter(function (g) { return g.plan; }).map(function (g) {
      var p = g.plan;
      return [g.brand, fmtT(p.createdAt), p.late ? '逾期' : '按时', g.planCount]
        .concat(XC.questions.map(function (q) {
          var v = p.answers[q.key];
          if (q.type === 'number' && v !== '' && v != null && isFinite(+v)) return +v;
          return Array.isArray(v) ? v.join('、') : (v == null ? '' : String(v));
        }))
        .concat([p.remark || '']);
    });

    // Sheet2 凭证总览：一行一个品牌，每个排位事项一列「已传数」+ 一列链接
    var h2 = ['品牌名称', '是否报规划'];
    UP_MODS.forEach(function (m) {
      h2.push(m.name + '(张数)', m.name + '凭证链接');
      if (m.extraField) h2.push(m.extraField.label);
    });
    h2.push('投放力', '已传凭证总数');
    var r2 = BRANDS.map(function (g) {
      var row = [g.brand, g.plan ? '是' : '否'], total = 0;
      UP_MODS.forEach(function (m) {
        var got = g.vouchers[m.key] || [];
        total += got.length;
        row.push(got.length, got.map(function (v) { return v.url; }).join('\n'));
        if (m.extraField) row.push(g.extra[m.key] || '');
      });
      row.push('官方校验', total);
      return row;
    });

    // Sheet3 凭证明细：每次上传一行（含被覆盖的历史版本）
    var h3 = ['品牌名称', '排位事项', '文件名', '链接', '大小(KB)', '上传时间', '附加信息'];
    var r3 = [];
    BRANDS.forEach(function (g) {
      g.history.slice().sort(function (a, b) { return String(a.uploadedAt).localeCompare(String(b.uploadedAt)); })
        .forEach(function (v) {
          var ex = v.extra ? Object.keys(v.extra).map(function (k) { return v.extra[k]; }).join('；') : '';
          r3.push([g.brand, v.moduleName || v.module, v.name || '', v.url || '',
            v.size ? Math.round(v.size / 1024) : '', fmtT(v.uploadedAt), ex]);
        });
    });

    var c2 = [16, 11];
    UP_MODS.forEach(function (m) { c2.push(14, 60); if (m.extraField) c2.push(20); });
    c2.push(10, 12);

    window.HBXlsx.downloadXlsx([
      { name: '报规划', rows: [h1].concat(r1), cols: [16, 13, 9, 9].concat(XC.questions.map(function (q) { return q.type === 'multi' ? 30 : 18; })).concat([24]) },
      { name: '凭证总览', rows: [h2].concat(r2), cols: c2 },
      { name: '凭证明细', rows: [h3].concat(r3), cols: [16, 10, 28, 70, 10, 13, 20] },
    ], '鹅选美妆节_' + BRANDS.length + '个品牌_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  $('#exBtnPull').addEventListener('click', pull);
  $('#exBtnExport').addEventListener('click', exportExcel);
  render();
  if (GHUB.readable()) pull();
})();
