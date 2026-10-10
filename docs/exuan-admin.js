/* 运营侧 · 双11鹅选美妆节模块：报名列表 + 凭证查看 + Excel 导出 */
'use strict';

(function () {
  var GHUB = window.HBGitHub;
  var XC = window.HB_EXUAN;
  if (!XC || !GHUB) return;

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };
  var fmtT = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return String(iso).slice(0, 16);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  var EX_LIST = [];   // [{...rec, vouchers:[...]}]

  /* ---------- 答案格式化 ---------- */
  function answerText(rec, q) {
    var v = (rec.answers || {})[q.key];
    if (v === undefined) return '';
    var other = (rec.answers || {})[q.key + '__other'];
    if (Array.isArray(v)) {
      return v.map(function (x) {
        return x === '其他' ? '其他(' + (other || '未说明') + ')' : x;
      }).join('、');
    }
    if (v === '其他') return '其他(' + (other || '未说明') + ')';
    return String(v || '');
  }

  /* ---------- 拉取：issue 列表 + 每个 issue 的凭证评论 ---------- */
  function pull() {
    if (!GHUB.readable()) {
      alert('未配置 GitHub 仓库');
      return;
    }
    var btn = $('#exBtnPull');
    btn.disabled = true;
    btn.textContent = '拉取中…';
    $('#exStatus').textContent = '读取报名记录…';

    GHUB.listByLabel(XC.label, function (n) {
      $('#exStatus').textContent = '已读取 ' + n + ' 份报名…';
    }).then(function (arr) {
      $('#exStatus').textContent = '读取凭证评论（共 ' + arr.length + ' 份）…';
      var done = 0;
      var chain = Promise.resolve();
      arr.forEach(function (rec) {
        chain = chain.then(function () {
          return GHUB.listComments(rec.__issue).then(function (cs) {
            rec.vouchers = GHUB.parseVouchers(cs);
            done++;
            $('#exStatus').textContent = '读取凭证评论 ' + done + '/' + arr.length + '…';
          }).catch(function () { rec.vouchers = []; done++; });
        });
      });
      return chain.then(function () { return arr; });
    }).then(function (arr) {
      EX_LIST = arr;
      render();
      var v = arr.reduce(function (n, r) { return n + (r.vouchers || []).length; }, 0);
      $('#exStatus').textContent = '共 ' + arr.length + ' 份报名 · ' + v + ' 份凭证 · '
        + new Date().toLocaleTimeString('zh-CN');
    }).catch(function (e) {
      $('#exStatus').textContent = '拉取失败：' + e.message;
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = '拉取鹅选数据';
    });
  }

  /** 每个模块取最新一份凭证 */
  function latestByModule(rec) {
    var out = {};
    (rec.vouchers || []).forEach(function (v) {
      var k = v.module || '__unknown';
      if (!out[k] || String(v.uploadedAt) > String(out[k].uploadedAt)) out[k] = v;
    });
    return out;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var rows = [];
    EX_LIST.slice().reverse().forEach(function (r) {
      var latest = latestByModule(r);
      var vCount = Object.keys(latest).length;
      var vHtml;
      if (!vCount) {
        vHtml = '<span style="color:#b3bac9">未上传</span>';
      } else {
        // 一个模块一行：✓ 看链接 / ✗ 缺
        vHtml = XC.voucher.modules.map(function (m) {
          var v = latest[m.key];
          return '<div class="vm-line">'
            + (v
              ? '<span class="ok">✓</span> <a href="' + esc(v.url) + '" target="_blank">'
                + esc(m.name) + '</a> <i>' + esc(fmtT(v.uploadedAt)) + '</i>'
              : '<span class="miss">✗</span> <span class="miss">' + esc(m.name) + '</span>')
            + '</div>';
        }).join('');
      }

      var summary = r.voucherOnly
        ? '<span class="badge">仅传凭证，未报名</span>'
        : XC.questions.slice(0, 2).map(function (q) {
          var t = answerText(r, q);
          return t ? '<span class="badge">' + esc(t.length > 18 ? t.slice(0, 18) + '…' : t) + '</span>' : '';
        }).join(' ');

      rows.push('<tr>'
        + '<td>' + esc(fmtT(r.createdAt)) + '</td>'
        + '<td><b>' + esc(r.brand || '-') + '</b></td>'
        + '<td>' + (r.late ? '<span class="badge warn">逾期</span>' : '<span class="badge ok">按时</span>') + '</td>'
        + '<td>' + summary + '</td>'
        + '<td>' + vHtml + '</td>'
        + '<td>' + (r.__issueUrl
            ? '<a href="' + esc(r.__issueUrl) + '" target="_blank">#' + esc(r.__issue) + '</a>'
            : esc(r.id || '')) + '</td>'
        + '</tr>');
    });

    $('#exList tbody').innerHTML = rows.join('')
      || '<tr><td colspan="6" style="color:#7a8399">暂无数据，点「拉取鹅选数据」。</td></tr>';
  }

  /* ---------- 导出 Excel ---------- */
  function exportExcel() {
    if (!EX_LIST.length) return alert('请先拉取鹅选数据');
    var head1 = ['编号', '提交时间', '是否逾期', '客户名称', '类型'];
    XC.questions.forEach(function (q) { head1.push(q.title); });
    head1.push('备注', '已传凭证模块', 'Issue');

    var rows1 = EX_LIST.map(function (r) {
      var row = [
        r.id || '', fmtT(r.createdAt), r.late ? '逾期' : '按时', r.brand || '',
        r.voucherOnly ? '仅传凭证' : '活动报名',
      ];
      XC.questions.forEach(function (q) { row.push(answerText(r, q)); });
      row.push(r.remark || '',
        Object.keys(latestByModule(r)).length + '/' + XC.voucher.modules.length,
        r.__issueUrl || '');
      return row;
    });

    /* Sheet2：凭证透视 —— 一行一个客户，一列一个模块，格子里是凭证链接 */
    var head2 = ['客户名称', '是否逾期'].concat(XC.voucher.modules.map(function (m) { return m.name; })).concat(['已传模块数', 'Issue']);
    var rows2 = EX_LIST.map(function (r) {
      var latest = latestByModule(r);
      var cnt = 0;
      var row = [r.brand || '', r.late ? '逾期' : '按时'];
      XC.voucher.modules.forEach(function (m) {
        var v = latest[m.key];
        if (v) cnt++;
        row.push(v ? v.url : '');
      });
      row.push(cnt + '/' + XC.voucher.modules.length, r.__issueUrl || '');
      return row;
    });

    /* Sheet3：凭证上传明细（含历史版本） */
    var head3 = ['客户名称', '凭证模块', '文件名', '链接', '大小(KB)', '上传时间', 'Issue'];
    var rows3 = [];
    EX_LIST.forEach(function (r) {
      (r.vouchers || []).forEach(function (v) {
        rows3.push([
          r.brand || v.brand || '', v.moduleName || v.module || '', v.name || '', v.url || '',
          v.size ? Math.round(v.size / 1024) : '', fmtT(v.uploadedAt), r.__issueUrl || '',
        ]);
      });
    });

    window.HBXlsx.downloadXlsx([
      {
        name: '鹅选报名',
        rows: [head1].concat(rows1),
        cols: [12, 15, 9, 14, 10]
          .concat(XC.questions.map(function () { return 26; }))
          .concat([20, 8, 40]),
      },
      {
        name: '凭证透视',
        rows: [head2].concat(rows2),
        cols: [14, 9].concat(XC.voucher.modules.map(function () { return 50; })).concat([11, 40]),
      },
      { name: '凭证明细', rows: [head3].concat(rows3), cols: [14, 22, 28, 55, 10, 15, 40] },
    ], '鹅选美妆节_' + EX_LIST.length + '份_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  /* ---------- init ---------- */
  $('#exBtnPull').addEventListener('click', pull);
  $('#exBtnExport').addEventListener('click', exportExcel);
  render();
  if (GHUB.readable()) pull();
})();
