/* 运营侧 · 汇总导出：自动拉取远端 + 本地文件导入，合并后导出 Excel */
'use strict';

var SCH = window.HBSchema;
var GHUB = window.HBGitHub;
var CFG = window.HB_CONFIG || {};
var STORE_KEY = 'huobu_merge_list_v4';

var LIST = [];
var FILTER = '';   // 按活动筛选

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
  });
};

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(LIST)); } catch (e) {}
}
function load() {
  try { LIST = JSON.parse(localStorage.getItem(STORE_KEY) || '[]') || []; } catch (e) { LIST = []; }
}

/** 当前筛选后的数据 */
function filtered() {
  if (!FILTER) return LIST;
  return LIST.filter(function (s) { return SCH.activityName(s) === FILTER; });
}

/* ---------- 合并 ---------- */
function addRecords(arr) {
  var seen = {};
  LIST.forEach(function (x) { if (x && x.id) seen[x.id] = true; });
  var added = 0, dup = 0;

  (arr || []).forEach(function (r) {
    if (!r || typeof r !== 'object' || !r.brand) return;
    if (!r.id) r.id = 'S' + Math.random().toString(36).slice(2, 10).toUpperCase();
    if (seen[r.id]) { dup++; return; }
    seen[r.id] = true;
    LIST.push(r);
    added++;
  });

  LIST.sort(function (a, b) {
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
  save();
  render();
  return { added: added, dup: dup };
}

/* ---------- 远端拉取 ---------- */
function pullRemote(silent) {
  var api = (CFG.apiBase || '').replace(/\/+$/, '');
  var btn = $('#btnPull');
  var task;

  if (api) {
    var key = localStorage.getItem('huobu_admin_key') || '';
    if (!key && !silent) {
      key = prompt('请输入管理密钥（后端 ADMIN_KEY）', '') || '';
      if (key) localStorage.setItem('huobu_admin_key', key);
    }
    if (!key) return;
    task = fetch(api + '/api/admin/list?key=' + encodeURIComponent(key))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.msg || '加载失败');
        return j.list || [];
      });
  } else if (GHUB && GHUB.readable()) {
    task = GHUB.list(function (n) { $('#status').textContent = '读取中… ' + n + ' 份'; });
  } else {
    if (!silent) alert('未配置数据源，请在 docs/config.js 里填 github.repo 或 apiBase');
    return;
  }

  btn.disabled = true;
  btn.textContent = '拉取中…';
  $('#status').textContent = '正在读取远端数据…';

  task.then(function (arr) {
    var r = addRecords(arr);
    $('#status').textContent = '远端 ' + arr.length + ' 份'
      + (r.added ? '，新增 ' + r.added : '，无新增')
      + ' · 当前合计 ' + LIST.length + ' 份 · ' + new Date().toLocaleTimeString('zh-CN');
  }).catch(function (e) {
    $('#status').textContent = '拉取失败：' + e.message;
    if (!silent) alert('拉取失败：' + e.message);
  }).finally(function () {
    btn.disabled = false;
    btn.textContent = '刷新数据';
  });
}

/* ---------- 本地文件导入 ---------- */
function readFiles(files) {
  var arr = Array.prototype.slice.call(files || []);
  if (!arr.length) return;
  var pending = arr.length, records = [], bad = 0;

  arr.forEach(function (f) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var j = JSON.parse(fr.result);
        if (Array.isArray(j)) records = records.concat(j);
        else if (j && Array.isArray(j.list)) records = records.concat(j.list);
        else records.push(j);
      } catch (e) { bad++; }
      if (--pending === 0) finish();
    };
    fr.onerror = function () { bad++; if (--pending === 0) finish(); };
    fr.readAsText(f, 'utf-8');
  });

  function finish() {
    var r = addRecords(records);
    $('#status').textContent = '导入 ' + r.added + ' 份'
      + (r.dup ? '，跳过重复 ' + r.dup : '')
      + (bad ? '，失败 ' + bad + ' 个文件' : '')
      + ' · 合计 ' + LIST.length + ' 份';
  }
}

/* ---------- 渲染 ---------- */
function render() {
  renderTabs();
  renderStats();
  renderTable();
  renderPreview();
}

function renderTabs() {
  var counts = {};
  LIST.forEach(function (s) {
    var a = SCH.activityName(s);
    counts[a] = (counts[a] || 0) + 1;
  });
  var tabs = '<button class="xls-tab ' + (FILTER === '' ? 'on' : '') + '" data-filter="">'
    + '全部 <span>' + LIST.length + '</span></button>';
  SCH.ACTIVITY_DEFS.forEach(function (a) {
    tabs += '<button class="xls-tab ' + (FILTER === a.name ? 'on' : '') + '" data-filter="' + esc(a.name) + '">'
      + esc(a.name) + ' <span>' + (counts[a.name] || 0) + '</span></button>';
  });
  $('#actFilter').innerHTML = tabs;
}

function renderStats() {
  var list = filtered();
  var brands = {}, qualified = 0, unqualified = 0, needTalk = 0;
  var st = { '已提报': 0, '择机报': 0, '未提报': 0 };
  var products = 0;

  list.forEach(function (s) {
    brands[s.brand] = 1;
    if (s.qualified === '有资格') qualified++;
    if (s.qualified === '没资格') {
      unqualified++;
      if (s.needTalk === '需要沟通') needTalk++;
    }
    (s.products || []).forEach(function (p) {
      if (!p.name) return;
      products++;
      if (st[p.status] !== undefined) st[p.status]++;
    });
  });

  var cell = function (k, v, cls) {
    return '<div class="stat"><div class="v' + (cls ? ' ' + cls : '') + '">' + v + '</div>'
      + '<div class="k">' + esc(k) + '</div></div>';
  };
  $('#stats').innerHTML = [
    cell('已回收', list.length),
    cell('覆盖客户', Object.keys(brands).filter(Boolean).length),
    cell('有资格', qualified),
    cell('没资格', unqualified),
    cell('需沟通', needTalk, needTalk ? 'warn' : ''),
    cell('商品总数', products),
    cell('已提报', st['已提报'], 'ok'),
    cell('择机报', st['择机报']),
    cell('未提报', st['未提报']),
  ].join('');
}

function renderTable() {
  var list = filtered();
  var rows = [];

  list.slice().reverse().forEach(function (s) {
    var prods = (s.products || []).filter(function (p) { return p.name; });
    var cnt = function (k) { return prods.filter(function (p) { return p.status === k; }).length; };
    var detail = s.qualified === '有资格'
      ? '<span class="badge ok">已提报 ' + cnt('已提报') + '</span> '
        + '<span class="badge">择机 ' + cnt('择机报') + '</span> '
        + '<span class="badge">未报 ' + cnt('未提报') + '</span>'
      : '<span class="badge">' + esc((s.unqualifiedReasons || []).join('、') || '-') + '</span>'
        + (s.needTalk === '需要沟通' ? ' <span class="badge warn">需沟通</span>' : '');

    rows.push('<tr>'
      + '<td>' + esc(SCH.fmtTime(s.createdAt).slice(5, 16)) + '</td>'
      + '<td><span class="badge">' + esc(SCH.activityName(s)) + '</span></td>'
      + '<td><b>' + esc(s.brand) + '</b></td>'
      + '<td>' + esc(s.filler || '-') + '</td>'
      + '<td>' + esc(s.qualified || '-') + '</td>'
      + '<td>' + detail + '</td>'
      + '<td>' + (prods.length || '-') + '</td>'
      + '<td>' + (s.__issueUrl
          ? '<a href="' + esc(s.__issueUrl) + '" target="_blank">#' + esc(s.__issue) + '</a>'
          : esc(s.id)) + '</td>'
      + '<td><button class="row-del" data-id="' + esc(s.id) + '"'
        + (s.__issue ? ' data-issue="' + esc(s.__issue) + '"' : '') + ' title="删除">×</button></td>'
      + '</tr>');
  });

  $('#list tbody').innerHTML = rows.join('')
    || '<tr><td colspan="9" style="color:#7a8399">暂无数据。点「刷新数据」从远端拉取，或拖入回执文件。</td></tr>';
}

function renderPreview() {
  var el = $('#preview');
  if (!el || !window.HBPreview) return;
  var list = filtered();
  if (!list.length) {
    el.innerHTML = '<div class="empty-tip">还没有数据。有数据后这里会显示导出 Excel 的完整内容。</div>';
    return;
  }
  window.HBPreview.render(el, SCH.sheets(list), 0);
}

/* ---------- 导出 ---------- */
function exportExcel() {
  var list = filtered();
  if (!list.length) return alert('当前没有数据');
  window.HBXlsx.downloadXlsx(
    SCH.sheets(list),
    '货补摸排_' + (FILTER || '全部') + '_' + list.length + '份_'
      + new Date().toISOString().slice(0, 10) + '.xlsx'
  );
}

function exportJson() {
  if (!LIST.length) return alert('还没有数据');
  var blob = new Blob([JSON.stringify(LIST, null, 1)], { type: 'application/json;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '货补摸排备份_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}

/* ---------- 事件 ---------- */
var drop = $('#drop');
['dragenter', 'dragover'].forEach(function (ev) {
  drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
});
['dragleave', 'drop'].forEach(function (ev) {
  drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
});
drop.addEventListener('drop', function (e) { readFiles(e.dataTransfer.files); });

$('#btnPick').addEventListener('click', function () { $('#file').click(); });
$('#file').addEventListener('change', function (e) { readFiles(e.target.files); e.target.value = ''; });
$('#btnPull').addEventListener('click', function () { pullRemote(false); });
$('#btnExport').addEventListener('click', exportExcel);
$('#btnExportJson').addEventListener('click', exportJson);
$('#btnClear').addEventListener('click', function () {
  if (!LIST.length || !confirm('清空本机列表里的 ' + LIST.length + ' 份？（远端数据不受影响，可再次拉取）')) return;
  LIST = [];
  save();
  render();
  $('#status').textContent = '已清空本机列表';
});

$('#actFilter').addEventListener('click', function (e) {
  var btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  FILTER = btn.dataset.filter;
  render();
});

$('#list').addEventListener('click', function (e) {
  var btn = e.target.closest('button[data-id]');
  if (!btn) return;
  var issue = btn.dataset.issue;

  if (issue) {
    if (!confirm('删除这份问卷？会同时关闭远端记录 #' + issue + '（可在 GitHub 重新打开找回）')) return;
    if (GHUB && GHUB.enabled()) {
      GHUB.close(issue).catch(function (err) {
        alert('远端关闭失败：' + err.message + '\n（仅从本机移除）');
      });
    }
  } else if (!confirm('从列表移除这份问卷？')) {
    return;
  }

  LIST = LIST.filter(function (x) { return x.id !== btn.dataset.id; });
  save();
  render();
});

/* ---------- init ---------- */
load();
render();

var apiCfg = (CFG.apiBase || '').replace(/\/+$/, '');
if (apiCfg) {
  $('#repoTip').innerHTML = '数据源：<code>' + esc(apiCfg) + '</code>';
} else if (GHUB && GHUB.readable()) {
  $('#repoTip').innerHTML = '数据源：<code>' + esc(GHUB.repo()) + '</code> · '
    + '<a href="https://github.com/' + esc(GHUB.repo()) + '/issues?q=label:survey" target="_blank" style="color:#ffd479">在 GitHub 查看</a>';
} else {
  $('#repoTip').innerHTML = '<span style="color:#ffd479">未配置数据源，只能拖入回执文件</span>';
  $('#btnPull').disabled = true;
}

// 打开页面自动拉一次
if ((GHUB && GHUB.readable()) || apiCfg) pullRemote(true);
