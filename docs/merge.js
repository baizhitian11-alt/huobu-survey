/* 运营侧 · 汇总导出：GitHub Issues 拉取 + 本地文件导入，合并后导出 Excel */
'use strict';

var SCH = window.HBSchema;
var GHUB = window.HBGitHub;
var CFG = window.HB_CONFIG || {};
var STORE_KEY = 'huobu_merge_list_v3';

var LIST = [];

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

/* ---------- 合并 ---------- */
function addRecords(arr) {
  var seen = {};
  LIST.forEach(function (x) { if (x && x.id) seen[x.id] = true; });
  var added = 0, dup = 0;

  (arr || []).forEach(function (r) {
    if (!r || typeof r !== 'object') return;
    if (!r.qualifiedActivities && !r.activities) return;
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

/* ---------- 远端拉取（自建后端优先，否则 GitHub Issues） ---------- */
function pullRemote() {
  var api = (CFG.apiBase || '').replace(/\/+$/, '');
  var btn = $('#btnPull');
  btn.disabled = true;
  btn.textContent = '拉取中…';

  var task;
  if (api) {
    var key = prompt('请输入管理密钥（后端 ADMIN_KEY）', localStorage.getItem('huobu_admin_key') || '');
    if (key === null) { btn.disabled = false; btn.textContent = '从远端拉取'; return; }
    localStorage.setItem('huobu_admin_key', key);
    $('#status').textContent = '正在从 ' + api + ' 读取…';
    task = fetch(api + '/api/admin/list?key=' + encodeURIComponent(key))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.msg || '加载失败');
        return j.list || [];
      });
  } else if (GHUB && GHUB.readable()) {
    $('#status').textContent = '正在从 ' + GHUB.repo() + ' 读取…';
    task = GHUB.list(function (n) { $('#status').textContent = '已读取 ' + n + ' 份…'; });
  } else {
    btn.disabled = false;
    btn.textContent = '从远端拉取';
    return alert('未配置数据源。请在 docs/config.js 里填 github.repo 或 apiBase');
  }

  task.then(function (arr) {
    var r = addRecords(arr);
    $('#status').textContent = '远端共 ' + arr.length + ' 份，新增 ' + r.added
      + (r.dup ? '，已存在 ' + r.dup : '') + ' · 当前合计 ' + LIST.length + ' 份';
  }).catch(function (e) {
    $('#status').textContent = '拉取失败：' + e.message;
    alert('拉取失败：' + e.message
      + '\n\n若 GitHub 仓库是 Private，需要在 config.js 里配置 token 才能读取。');
  }).finally(function () {
    btn.disabled = false;
    btn.textContent = '从远端拉取';
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
    $('#status').textContent = '本次导入 ' + r.added + ' 份'
      + (r.dup ? '，跳过重复 ' + r.dup + ' 份' : '')
      + (bad ? '，解析失败 ' + bad + ' 个文件' : '')
      + ' · 当前合计 ' + LIST.length + ' 份';
  }
}

/* ---------- 渲染 ---------- */
function render() {
  var rows = [];
  LIST.slice().reverse().forEach(function (s) {
    var qa = s.qualifiedActivities || [];
    var acts = qa.length ? qa : ['（无资格）'];
    acts.forEach(function (a, i) {
      var b = (s.activities || {})[a] || {};
      var head = i === 0;
      rows.push('<tr>'
        + '<td>' + (head ? esc(SCH.fmtTime(s.createdAt).slice(5, 16)) : '') + '</td>'
        + '<td>' + (head ? '<b>' + esc(s.brand) + '</b>' : '') + '</td>'
        + '<td>' + (head ? esc(qa.length ? qa.length + ' 个' : '0') : '') + '</td>'
        + '<td><span class="badge">' + esc(a) + '</span></td>'
        + '<td>' + esc(b.progress || '-') + '</td>'
        + '<td>' + esc(b.audit || '-') + '</td>'
        + '<td>' + ((b.products || []).length || '-') + '</td>'
        + '<td>' + (head ? (s.__issueUrl
            ? '<a href="' + esc(s.__issueUrl) + '" target="_blank">#' + esc(s.__issue) + '</a>'
            : esc(s.id)) : '') + '</td>'
        + '<td>' + (head
            ? '<button class="row-del" data-id="' + esc(s.id) + '"'
              + (s.__issue ? ' data-issue="' + esc(s.__issue) + '"' : '')
              + ' title="' + (s.__issue ? '删除（同时关闭 GitHub 上的记录）' : '从列表移除') + '">×</button>'
            : '') + '</td>'
        + '</tr>');
    });
  });

  $('#list tbody').innerHTML = rows.join('')
    || '<tr><td colspan="9" style="color:#7a8399">还没有数据，点上方「从远端拉取」或拖入回执文件</td></tr>';

  stats();
  renderPreview();
}

/* ---------- Excel 数据预览（内容与导出文件一致） ---------- */
function renderPreview() {
  var el = $('#preview');
  if (!el || !window.HBPreview) return;
  if (!LIST.length) {
    el.innerHTML = '<div class="empty-tip">还没有数据。导入或拉取问卷后，这里会显示导出 Excel 的完整内容。</div>';
    return;
  }
  window.HBPreview.render(el, SCH.sheets(LIST), 0);
}

function stats() {
  var brands = {}, actCount = {}, progress = {}, products = 0, none = 0, auditIssue = 0;
  LIST.forEach(function (s) {
    brands[s.brand] = 1;
    var qa = s.qualifiedActivities || [];
    if (!qa.length) none++;
    qa.forEach(function (a) {
      actCount[a] = (actCount[a] || 0) + 1;
      var b = (s.activities || {})[a] || {};
      if (b.progress) progress[b.progress] = (progress[b.progress] || 0) + 1;
      if (b.audit && b.audit !== '暂无问题') auditIssue++;
      products += (b.products || []).length;
    });
  });

  var cell = function (k, v, hint) {
    return '<div class="stat"><div class="v">' + v + '</div><div class="k">' + esc(k)
      + (hint ? ' <span style="opacity:.6">' + esc(hint) + '</span>' : '') + '</div></div>';
  };

  var cells = [
    cell('已汇总问卷', LIST.length),
    cell('覆盖客户', Object.keys(brands).filter(Boolean).length),
    cell('商品报价条数', products),
    cell('主链接已提报', progress['主链接已提报'] || 0),
    cell('不提报', progress['不提报'] || 0),
    cell('有过审问题', auditIssue),
    cell('无资格客户', none),
  ];
  SCH.ACTIVITIES.forEach(function (a) {
    cells.push(cell(a, actCount[a] || 0, '报名'));
  });
  $('#stats').innerHTML = cells.join('');
}

/* ---------- 导出 ---------- */
function exportExcel() {
  if (!LIST.length) return alert('还没有数据');
  window.HBXlsx.downloadXlsx(
    SCH.sheets(LIST),
    '货补摸排汇总_' + LIST.length + '份_' + new Date().toISOString().slice(0, 10) + '.xlsx'
  );
}

function exportJson() {
  if (!LIST.length) return alert('还没有数据');
  var blob = new Blob([JSON.stringify(LIST, null, 1)], { type: 'application/json;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '货补摸排汇总_' + new Date().toISOString().slice(0, 10) + '.json';
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
$('#btnPull').addEventListener('click', pullRemote);
$('#btnExport').addEventListener('click', exportExcel);
$('#btnExportJson').addEventListener('click', exportJson);
$('#btnClear').addEventListener('click', function () {
  if (!LIST.length || !confirm('确定清空本机列表里的 ' + LIST.length + ' 份问卷？（GitHub 上的数据不会被删）')) return;
  LIST = [];
  save();
  render();
  $('#status').textContent = '已清空本机列表';
});
$('#list').addEventListener('click', function (e) {
  var btn = e.target.closest('button[data-id]');
  if (!btn) return;
  var issue = btn.dataset.issue;

  if (issue) {
    if (!confirm('删除这份问卷？\n\n会同时关闭 GitHub 上的记录 #' + issue + '（可在 GitHub 上重新打开找回）。')) return;
    if (GHUB && GHUB.enabled()) {
      GHUB.close(issue).catch(function (err) {
        alert('GitHub 上关闭失败：' + err.message + '\n（仅从本机列表移除）');
      });
    } else {
      alert('未配置 token，只能从本机列表移除；GitHub 上的记录仍保留。');
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
  $('#repoTip').innerHTML = '数据源：自建后端 <code>' + esc(apiCfg) + '</code>';
} else if (GHUB && GHUB.readable()) {
  $('#repoTip').innerHTML = '数据源：GitHub Issues <code>' + esc(GHUB.repo()) + '</code>'
    + ' · <a href="https://github.com/' + esc(GHUB.repo()) + '/issues?q=label:survey" target="_blank" style="color:#ffd479">在 GitHub 上查看</a>';
} else {
  $('#repoTip').innerHTML = '<span style="color:#ffd479">未配置数据源，当前只能用拖拽导入回执文件</span>';
  $('#btnPull').disabled = true;
}
if (LIST.length) $('#status').textContent = '已从本机恢复 ' + LIST.length + ' 份';
