/**
 * Excel 数据前端预览 —— 把 schema 生成的表格直接渲染成网页表格
 * 和导出的 xlsx 用同一份数据（SCH.sheets），所见即所得。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HBPreview = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_ROWS = 300; // 超过则截断，避免页面卡

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function colLabel(n) {
    var s = '';
    n += 1;
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  /** 单个 sheet 渲染成 <table> */
  function sheetTable(sheet) {
    var rows = sheet.rows || [];
    if (rows.length <= 1) {
      return '<div class="empty-tip">该表暂无数据</div>';
    }

    var header = rows[0];
    var bodyRows = rows.slice(1);
    var truncated = bodyRows.length > MAX_ROWS;
    var show = truncated ? bodyRows.slice(0, MAX_ROWS) : bodyRows;

    var h = '<div class="xls-wrap"><table class="xls">';

    // Excel 列字母行，方便和导出的文件对照
    h += '<thead><tr class="xls-collabel"><th></th>'
      + header.map(function (_, i) { return '<th>' + colLabel(i) + '</th>'; }).join('')
      + '</tr><tr class="xls-head"><th class="xls-rownum">#</th>'
      + header.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('')
      + '</tr></thead><tbody>';

    show.forEach(function (row, ri) {
      h += '<tr><td class="xls-rownum">' + (ri + 2) + '</td>';
      for (var i = 0; i < header.length; i++) {
        var v = row[i];
        var isNum = typeof v === 'number' && isFinite(v);
        var empty = (v === null || v === undefined || v === '');
        h += '<td class="' + (isNum ? 'num' : '') + (empty ? ' empty' : '') + '">'
          + (empty ? '' : esc(isNum ? v.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : v))
          + '</td>';
      }
      h += '</tr>';
    });

    h += '</tbody></table></div>';

    h = '<div class="xls-meta">共 <b>' + bodyRows.length + '</b> 行 × <b>'
      + header.length + '</b> 列'
      + (truncated ? ' · 下方仅预览前 ' + MAX_ROWS + ' 行，导出的 Excel 是完整的' : '')
      + '</div>' + h;

    return h;
  }

  /**
   * 渲染预览
   * @param {HTMLElement} el   容器
   * @param {Array} sheets     SCH.sheets(list) 的结果
   * @param {number} activeIdx 当前显示第几个 sheet
   */
  function render(el, sheets, activeIdx) {
    if (!el) return;
    activeIdx = activeIdx || 0;

    if (!sheets || !sheets.length) {
      el.innerHTML = '<div class="empty-tip">暂无数据可预览</div>';
      return;
    }

    var tabs = '<div class="xls-tabs">' + sheets.map(function (s, i) {
      var n = Math.max((s.rows || []).length - 1, 0);
      return '<button class="xls-tab ' + (i === activeIdx ? 'on' : '') + '" data-sheet="' + i + '">'
        + esc(s.name) + ' <span>' + n + '</span></button>';
    }).join('') + '</div>';

    el.innerHTML = tabs + sheetTable(sheets[activeIdx]);

    el.querySelectorAll('.xls-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        render(el, sheets, +btn.dataset.sheet);
      });
    });
  }

  return { render: render, MAX_ROWS: MAX_ROWS };
}));
