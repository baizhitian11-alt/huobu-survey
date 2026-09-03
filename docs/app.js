/* 货补摸排问卷 · 前端逻辑（零依赖，纯静态可跑） */
'use strict';

var CFG = window.HB_CONFIG || {};
var SCH = window.HBSchema;
var GHUB = window.HBGitHub;
var ACTIVITIES = SCH.ACTIVITIES;
var DRAFT_KEY = 'huobu_survey_draft_v3';

/* 商品数据：内嵌在 products-data.js，不发网络请求 */
var DATA = window.HB_PRODUCTS || { brands: [], products: {}, topN: 10 };

var state = SCH.newState();

/* ---------------- utils ---------------- */
var $ = function (sel, root) { return (root || document).querySelector(sel); };
var esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};
var fmt = function (n) {
  return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) : '-';
};
var blk = function (act) {
  return state.activities[act] || (state.activities[act] = SCH.newBlock());
};

var previewTimer = null;
function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 350);
}

function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) {}
  schedulePreview();
}
function loadDraft() {
  try {
    var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.activities && d.qualifiedActivities) {
      ACTIVITIES.forEach(function (a) { if (!d.activities[a]) d.activities[a] = SCH.newBlock(); });
      state = d;
    }
  } catch (e) {}
}

/* ---------------- 客户名称匹配（模糊） ---------------- */
var normBrand = function (s) {
  return String(s || '').trim().toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(旗舰店|官方旗舰店|专营店|官方|品牌|有限公司|股份|集团)/g, '');
};

var BRAND_INDEX = {};
function buildBrandIndex() {
  BRAND_INDEX = {};
  (DATA.brands || []).forEach(function (b) { BRAND_INDEX[normBrand(b)] = b; });
}

function resolveBrand(input) {
  var raw = String(input || '').trim();
  if (!raw) return '';
  if (DATA.products[raw]) return raw;

  var k = normBrand(raw);
  if (!k) return '';
  if (BRAND_INDEX[k]) return BRAND_INDEX[k];

  var best = '', bestLen = 0;
  Object.keys(BRAND_INDEX).forEach(function (bk) {
    if (!bk) return;
    if ((k.indexOf(bk) >= 0 || bk.indexOf(k) >= 0) && bk.length > bestLen) {
      bestLen = bk.length;
      best = BRAND_INDEX[bk];
    }
  });
  return best;
}

/* ---------------- 通用控件 ---------------- */
function radios(act, field, options, rerender) {
  if (rerender === undefined) rerender = true;
  return '<div class="chips">' + options.map(function (o) {
    return '<label class="chip ' + (blk(act)[field] === o ? 'on' : '') + '">'
      + '<input type="radio" name="' + esc(act) + '__' + field + '" value="' + esc(o) + '"'
      + ' data-act="' + esc(act) + '" data-f="' + field + '"'
      + (rerender ? ' data-rerender="1"' : '')
      + (blk(act)[field] === o ? ' checked' : '') + '/>' + esc(o) + '</label>';
  }).join('') + '</div>';
}

function checks(act, field, options, rerender) {
  if (rerender === undefined) rerender = true;
  var cur = blk(act)[field] || [];
  return '<div class="chips">' + options.map(function (o) {
    return '<label class="chip green ' + (cur.indexOf(o) >= 0 ? 'on' : '') + '">'
      + '<input type="checkbox" value="' + esc(o) + '" data-act="' + esc(act) + '" data-m="' + field + '"'
      + (rerender ? ' data-rerender="1"' : '')
      + (cur.indexOf(o) >= 0 ? ' checked' : '') + '/>' + esc(o) + '</label>';
  }).join('') + '</div>';
}

function textField(act, field, label, ph, type) {
  ph = ph || '';
  type = type || 'text';
  return '<label class="field" style="margin-top:10px">'
    + '<span class="label">' + esc(label) + '</span>'
    + '<input type="' + type + '"' + (type === 'number' ? ' step="0.01"' : '')
    + ' data-act="' + esc(act) + '" data-f="' + field + '"'
    + ' value="' + esc(blk(act)[field]) + '" placeholder="' + esc(ph) + '"/></label>';
}

/* 顶层（不属于某个活动）字段用的控件 */
function topChecks(field, options, rerender) {
  var cur = state[field] || [];
  return '<div class="chips">' + options.map(function (o) {
    return '<label class="chip green ' + (cur.indexOf(o) >= 0 ? 'on' : '') + '">'
      + '<input type="checkbox" value="' + esc(o) + '" data-top-m="' + field + '"'
      + (rerender === false ? '' : ' data-rerender="1"')
      + (cur.indexOf(o) >= 0 ? ' checked' : '') + '/>' + esc(o) + '</label>';
  }).join('') + '</div>';
}

function topTextField(field, label, ph) {
  return '<label class="field" style="margin-top:10px">'
    + '<span class="label">' + esc(label) + '</span>'
    + '<input data-top-f="' + field + '" value="' + esc(state[field] || '') + '" placeholder="' + esc(ph || '') + '"/></label>';
}

/* ---------------- 商品表 ---------------- */
function brandProducts() {
  var std = resolveBrand(state.brand);
  return std ? (DATA.products[std] || []) : [];
}

function topProducts(n) {
  return brandProducts().slice(0, n).map(function (p) {
    return {
      name: p.name, cost: p.cost, refPrice: p.avgPrice, source: '系统直拉',
      prePrice: '', signupPrice: '', actualPrice: '',
    };
  });
}

function syncTopProducts(act) {
  var b = blk(act);
  if (b.productSource !== 'top') return;
  var fresh = topProducts(b.topCount || 5);
  var old = {};
  (b.products || []).forEach(function (p) { if (p && p.name) old[p.name] = p; });
  b.products = fresh.map(function (p) {
    var o = old[p.name] || {};
    p.prePrice = o.prePrice || '';
    p.signupPrice = o.signupPrice || '';
    p.actualPrice = o.actualPrice || '';
    return p;
  });
}

function productTable(act) {
  var b = blk(act);
  var isTop = b.productSource === 'top';
  var all = brandProducts();

  if (isTop && !all.length) {
    return '<div class="empty-tip">'
      + '未匹配到「' + esc(state.brand || '（未填写）') + '」的投放商品数据。<br/>'
      + '可以：① 回到上方核对客户名称（输入框里能看到候选列表）；② 或切换为「客户自主填写」手动录入商品。'
      + '</div>';
  }

  var rows = (b.products || []).map(function (p, i) {
    return '<tr>'
      + '<td><span class="rank ' + (i < 3 ? 'top' : '') + '">' + (i + 1) + '</span></td>'
      + '<td class="name"><input value="' + esc(p.name) + '" data-act="' + esc(act) + '" data-pi="' + i + '" data-pf="name" placeholder="商品名称"/></td>'
      + '<td class="metric">' + (p.cost ? fmt(p.cost) : '-') + '</td>'
      + '<td class="metric">' + (p.refPrice ? fmt(p.refPrice) : '-') + '</td>'
      + '<td><input class="num" type="number" step="0.01" value="' + esc(p.prePrice) + '" data-act="' + esc(act) + '" data-pi="' + i + '" data-pf="prePrice" placeholder="补前价"/></td>'
      + '<td><input class="num" type="number" step="0.01" value="' + esc(p.signupPrice) + '" data-act="' + esc(act) + '" data-pi="' + i + '" data-pf="signupPrice" placeholder="报名/最低到手"/></td>'
      + '<td><input class="num" type="number" step="0.01" value="' + esc(p.actualPrice) + '" data-act="' + esc(act) + '" data-pi="' + i + '" data-pf="actualPrice" placeholder="实际到手"/></td>'
      + '<td><button class="row-del" data-act="' + esc(act) + '" data-del="' + i + '" title="删除">×</button></td>'
      + '</tr>';
  }).join('');

  return '<div class="tbl-wrap"><table class="tbl"><thead><tr>'
    + '<th>#</th><th>商品名称（已清洗合并，可修改）</th><th>日均消耗(元)</th><th>参考成交单价(元)</th>'
    + '<th>补前价格</th><th>活动报名/最低到手价</th><th>实际到手价</th><th></th>'
    + '</tr></thead><tbody>'
    + (rows || '<tr><td colspan="8" style="color:#7a8399">暂无商品，点击下方「添加一行」</td></tr>')
    + '</tbody></table></div>'
    + '<div class="tbl-actions">'
    + '<button class="link-btn" data-act="' + esc(act) + '" data-add="1">+ 添加一行</button>'
    + (isTop && all.length > (b.topCount || 5)
        ? '<button class="link-btn" data-act="' + esc(act) + '" data-more="1">展开 Top' + Math.min(all.length, 10) + '</button>' : '')
    + (isTop ? '<button class="link-btn" data-act="' + esc(act) + '" data-reset="1">重新拉取 Top' + (b.topCount || 5) + '</button>' : '')
    + '<span class="hint">日均消耗、参考单价来自近期投放数据，仅用于对齐商品，无需修改。</span>'
    + '</div>';
}

/* ---------------- 活动入口示意图 ----------------
 * 把截图命名为 assets/entry-<key>.png 放进 docs/assets/ 即自动显示；
 * 文件不存在时自动隐藏（onerror），不影响填写。
 */
function entryImage(act) {
  var key = SCH.ACTIVITY_KEY[act];
  if (!key) return '';
  var src = 'assets/entry-' + key + '.png';
  return '<div class="entry-box" data-entrybox>'
    + '<div class="entry-head">📍 报名入口示意 —— ' + esc(act) + '</div>'
    + '<img class="entry-img" src="' + src + '" alt="' + esc(act) + ' 报名入口"'
    + ' onerror="this.closest(\'[data-entrybox]\').style.display=\'none\'"'
    + ' onclick="window.open(this.src)" title="点击查看大图"/>'
    + '</div>';
}

/* ---------------- 活动问题块 ---------------- */
function renderBlock(act, i) {
  var b = blk(act);
  var others = state.qualifiedActivities.filter(function (a) { return a !== act; });

  var h = '<section class="card act-card" data-actcard="' + esc(act) + '">'
    + '<div class="act-head">'
    + '<h2><span class="idx">' + (i + 1) + '</span>' + esc(act)
    + ' <span class="tag">' + esc(SCH.ACTIVITY_DESC[act] || '') + '</span></h2>'
    + (others.length
        ? '<label class="copy-sel">复制自 <select data-copyto="' + esc(act) + '"><option value="">选择活动…</option>'
          + others.map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('')
          + '</select></label>'
        : '')
    + '</div>'
    + entryImage(act);

  /* Q · 提报进展 */
  h += '<div class="q"><div class="q-title"><span class="n">Q1</span>已提报商品进展</div>'
    + radios(act, 'progress', ['主链接已提报', '提报不符合预期', '不提报']);

  if (b.progress === '主链接已提报') {
    h += '<div class="nest"><div class="q-title">商品填报方式</div><div class="chips">'
      + '<label class="chip ' + (b.productSource === 'top' ? 'on' : '') + '">'
      + '<input type="radio" name="' + esc(act) + '__ps" value="top" data-act="' + esc(act) + '" data-f="productSource" data-rerender="1"'
      + (b.productSource === 'top' ? ' checked' : '') + '/>系统直拉消耗 Top5 商品</label>'
      + '<label class="chip ' + (b.productSource === 'manual' ? 'on' : '') + '">'
      + '<input type="radio" name="' + esc(act) + '__ps" value="manual" data-act="' + esc(act) + '" data-f="productSource" data-rerender="1"'
      + (b.productSource === 'manual' ? ' checked' : '') + '/>客户自主填写</label></div>'
      + '<div class="q-desc" style="margin-top:10px">请按商品填写：补前价格 / 活动报名（最低）到手价 / 实际到手价，单位：元。</div>'
      + productTable(act) + '</div>';
  }
  if (b.progress === '提报不符合预期') {
    h += '<div class="nest"><div class="chips">'
      + '<label class="chip green ' + (b.mismatchChecked ? 'on' : '') + '">'
      + '<input type="checkbox" data-act="' + esc(act) + '" data-f="mismatchChecked" data-bool="1" data-rerender="1"'
      + (b.mismatchChecked ? ' checked' : '') + '/>主品在，但主链接不在</label></div>'
      + textField(act, 'mismatchNote', '补充说明（哪些主品 / 缺失的主链接）', '选填') + '</div>';
  }
  if (b.progress === '不提报') {
    h += '<div class="nest"><div class="q-title">不提报原因（多选）</div>'
      + checks(act, 'noReportReasons', SCH.NO_REPORT_REASONS);
    if ((b.noReportReasons || []).indexOf('其他') >= 0) {
      h += textField(act, 'noReportOther', '其他原因说明', '请具体描述');
    }
    h += '</div>';
  }
  h += '</div>';

  /* Q · 过审 */
  h += '<div class="q"><div class="q-title"><span class="n">Q2</span>过审问题</div>'
    + radios(act, 'audit', ['暂无问题', '审核中', '拒审', '其他']);
  if (b.audit === '审核中') {
    h += '<div class="nest"><div class="q-title">是否过审较慢（超过 7 个工作日）？</div>'
      + radios(act, 'auditSlow', ['是', '否'], false) + '</div>';
  }
  if (b.audit === '拒审') {
    h += '<div class="nest"><div class="q-title">拒审原因（多选）</div>'
      + checks(act, 'rejectReasons', SCH.REJECT_REASONS);
    if ((b.rejectReasons || []).indexOf('高价') >= 0) {
      h += '<div class="grid2" style="margin-top:12px">'
        + textField(act, 'highPriceSignup', '本次提报价格(元)', '', 'number')
        + textField(act, 'priceTmall', '天猫最低价(元)', '', 'number')
        + textField(act, 'priceDouyin', '抖音最低价(元)', '', 'number')
        + textField(act, 'priceKuaishou', '快手最低价(元)', '', 'number')
        + '</div>';
    }
    h += '</div>';
  }
  if (b.audit === '其他') {
    h += '<div class="nest">' + textField(act, 'auditOther', '其他过审问题说明', '请具体描述') + '</div>';
  }
  h += '</div>';

  /* Q · 玩法 */
  h += '<div class="q"><div class="q-title"><span class="n">Q3</span>客户玩法</div>'
    + '<div class="q-desc">3.1 是否会因平台活动推动组货升级？</div>'
    + radios(act, 'upgradeGoods', ['是', '暂无考虑']);
  if (b.upgradeGoods === '是') {
    h += '<div class="nest"><div class="q-title">升级方向（多选）</div>'
      + checks(act, 'upgradeGoodsWays', SCH.GOODS_WAYS, false) + '</div>';
  }
  h += '<div class="q-desc" style="margin-top:16px">3.2 是否会因平台活动推动直播玩法升级？</div>'
    + radios(act, 'upgradeLive', ['是', '暂无考虑']);
  if (b.upgradeLive === '是') {
    h += '<div class="nest"><div class="q-title">玩法方向（多选）</div>'
      + checks(act, 'upgradeLiveWays', SCH.LIVE_WAYS, false) + '</div>';
  }
  h += '</div>';

  h += '<div class="q"><label class="field"><span class="label">本活动备注</span>'
    + '<textarea rows="2" data-act="' + esc(act) + '" data-f="note" placeholder="选填">' + esc(b.note) + '</textarea></label></div>';

  return h + '</section>';
}

/* ---------------- Q1：有资格报名的活动 ---------------- */
function renderQ1() {
  var picked = state.qualifiedActivities || [];

  var h = '<div class="chips big">' + SCH.ACTIVITY_DEFS.map(function (a) {
    var on = picked.indexOf(a.name) >= 0;
    return '<label class="chip act ' + (on ? 'on' : '') + '">'
      + '<input type="checkbox" data-actpick="' + esc(a.name) + '"' + (on ? ' checked' : '') + '/>'
      + '<span><b>' + esc(a.name) + '</b><em>' + esc(a.desc) + '</em></span></label>';
  }).join('') + '</div>';

  h += '<div class="chips" style="margin-top:12px">'
    + '<label class="chip none ' + (state.noneQualified ? 'on' : '') + '">'
    + '<input type="checkbox" data-none="1"' + (state.noneQualified ? ' checked' : '') + '/>'
    + '以上都没有资格</label></div>';

  if (state.noneQualified) {
    h += '<div class="nest"><div class="q-title">不符合资格的原因（多选）</div>'
      + topChecks('unqualifiedReasons', SCH.UNQUALIFIED_REASONS);
    if ((state.unqualifiedReasons || []).indexOf('店铺分不达标') >= 0) {
      h += topTextField('shopScore', '当前店铺分', '如：4.2');
    }
    if ((state.unqualifiedReasons || []).indexOf('三率不达标') >= 0) {
      h += '<div style="margin-top:12px"><div class="q-title">具体哪一项不达标（多选，可填当前数值）</div>'
        + topChecks('rateItems', SCH.RATE_ITEMS);
      if ((state.rateItems || []).length) {
        h += '<div class="grid2" style="margin-top:10px">' + state.rateItems.map(function (r) {
          return '<label class="field"><span class="label">' + esc(r) + ' 当前值</span>'
            + '<input value="' + esc((state.rateValues || {})[r] || '') + '" data-top-rate="' + esc(r) + '" placeholder="如 2.5%"/></label>';
        }).join('') + '</div>';
      }
      h += '</div>';
    }
    if ((state.unqualifiedReasons || []).indexOf('其他') >= 0) {
      h += topTextField('unqualifiedOther', '其他原因说明', '请具体描述');
    }
    h += '</div>';
  }

  $('#q1Box').innerHTML = h;
}

function renderActivities() {
  state.qualifiedActivities.forEach(syncTopProducts);
  var box = $('#activityBlocks');

  if (!state.qualifiedActivities.length) {
    box.innerHTML = state.noneQualified
      ? '<section class="card"><div class="empty-tip">已选择「以上都没有资格」，补充完原因后即可直接提交，无需填写后续内容。</div></section>'
      : '<section class="card"><div class="empty-tip">请先在上方勾选<b>有资格报名的活动</b>，勾选后会展开对应的填写项。</div></section>';
    return;
  }
  box.innerHTML = '<div class="section-title">按活动填写（共 ' + state.qualifiedActivities.length + ' 个）</div>'
    + state.qualifiedActivities.map(renderBlock).join('');
}

function renderBase() {
  $('#brand').value = state.brand;
  $('#remark').value = state.remark;
  updateBrandHint();
}

function updateBrandHint() {
  var el = $('#brandHint');
  if (!state.brand) {
    el.className = 'hint';
    el.innerHTML = '共收录 <b>' + (DATA.brands || []).length + '</b> 个客户，输入两个字即可搜索；没有的可直接手填';
    return;
  }
  var std = resolveBrand(state.brand);
  var list = std ? DATA.products[std] : null;
  if (list && list.length) {
    el.className = 'hint ok';
    el.innerHTML = '✓ 已匹配「<b>' + esc(std) + '</b>」，共 <b>' + list.length
      + '</b> 个商品，填写商品时会自动带出消耗 Top5';
  } else {
    el.className = 'hint warn';
    el.innerHTML = '未匹配到该客户的投放数据，商品需要手动填写（不影响提交）';
  }
}

function renderAll() {
  renderQ1();
  renderActivities();
  saveDraft();
}

/* ---------------- 提交前确认（品牌方视角的可读摘要） ---------------- */
function summaryRow(k, v) {
  if (v === '' || v === null || v === undefined) return '';
  return '<div class="sm-row"><span class="sm-k">' + esc(k) + '</span>'
    + '<span class="sm-v">' + esc(v) + '</span></div>';
}

function renderPreview() {
  var el = $('#preview');
  if (!el) return;

  if (!state.brand && !state.qualifiedActivities.length && !state.noneQualified) {
    el.innerHTML = '<div class="empty-tip">填写后这里会汇总您填的内容，方便提交前核对。</div>';
    return;
  }

  var miss = validate();
  var h = '';

  h += '<div class="sm-block">'
    + summaryRow('客户名称', state.brand || '（未填）')
    + summaryRow('有资格报名的活动',
        state.qualifiedActivities.length ? state.qualifiedActivities.join('、')
          : (state.noneQualified ? '以上都没有资格' : '（未选）'))
    + '</div>';

  if (state.noneQualified) {
    h += '<div class="sm-block"><div class="sm-title">无资格原因</div>'
      + summaryRow('原因', (state.unqualifiedReasons || []).join('、') || '（未填）')
      + summaryRow('店铺分', state.shopScore)
      + summaryRow('三率不达标项', (state.rateItems || []).join('、'))
      + summaryRow('三率数值', Object.keys(state.rateValues || {})
          .filter(function (k) { return state.rateValues[k]; })
          .map(function (k) { return k + ' ' + state.rateValues[k]; }).join('；'))
      + summaryRow('其他说明', state.unqualifiedOther)
      + '</div>';
  }

  state.qualifiedActivities.forEach(function (act) {
    var b = blk(act);
    h += '<div class="sm-block"><div class="sm-title">' + esc(act) + '</div>'
      + summaryRow('提报进展', b.progress || '（未填）');

    if (b.progress === '主链接已提报') {
      var prods = (b.products || []).filter(function (p) { return p.name; });
      h += summaryRow('商品数', prods.length + ' 个');
      if (prods.length) {
        h += '<div class="sm-prods">' + prods.map(function (p) {
          var parts = [];
          if (p.prePrice) parts.push('补前 ' + p.prePrice);
          if (p.signupPrice) parts.push('报名 ' + p.signupPrice);
          if (p.actualPrice) parts.push('实际到手 ' + p.actualPrice);
          var priced = parts.length ? parts.join(' / ') : '<i>价格未填</i>';
          return '<div class="sm-prod"><b>' + esc(p.name) + '</b><span>' + priced + '</span></div>';
        }).join('') + '</div>';
      }
    }
    if (b.progress === '提报不符合预期') {
      h += summaryRow('情况', b.mismatchChecked ? '主品在，但主链接不在' : '');
      h += summaryRow('说明', b.mismatchNote);
    }
    if (b.progress === '不提报') {
      h += summaryRow('不提报原因', (b.noReportReasons || []).join('、'));
      h += summaryRow('其他说明', b.noReportOther);
    }

    h += summaryRow('过审问题', b.audit || '（未填）');
    if (b.audit === '审核中') h += summaryRow('是否超7个工作日', b.auditSlow);
    if (b.audit === '拒审') {
      h += summaryRow('拒审原因', (b.rejectReasons || []).join('、'));
      var pr = [];
      if (b.highPriceSignup) pr.push('提报 ' + b.highPriceSignup);
      if (b.priceTmall) pr.push('天猫 ' + b.priceTmall);
      if (b.priceDouyin) pr.push('抖音 ' + b.priceDouyin);
      if (b.priceKuaishou) pr.push('快手 ' + b.priceKuaishou);
      h += summaryRow('价格对比', pr.join(' / '));
    }
    if (b.audit === '其他') h += summaryRow('说明', b.auditOther);

    h += summaryRow('推动组货升级', b.upgradeGoods
      + ((b.upgradeGoodsWays || []).length ? '（' + b.upgradeGoodsWays.join('、') + '）' : ''));
    h += summaryRow('推动直播玩法', b.upgradeLive
      + ((b.upgradeLiveWays || []).length ? '（' + b.upgradeLiveWays.join('、') + '）' : ''));
    h += summaryRow('备注', b.note);
    h += '</div>';
  });

  if (state.remark) {
    h += '<div class="sm-block">' + summaryRow('整体备注', state.remark) + '</div>';
  }

  if (miss.length) {
    h = '<div class="sm-miss"><b>还有 ' + miss.length + ' 项待完成：</b><ul>'
      + miss.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('')
      + '</ul></div>' + h;
  } else {
    h = '<div class="sm-ok">✓ 必填项已全部完成，可以提交了</div>' + h;
  }

  el.innerHTML = h;
}

/* ---------------- 事件 ---------------- */
function handleChange(e) {
  var el = e.target;

  /* Q1 活动多选 */
  if (el.dataset.actpick !== undefined) {
    var a = el.dataset.actpick;
    if (el.checked) {
      if (state.qualifiedActivities.indexOf(a) < 0) state.qualifiedActivities.push(a);
      state.qualifiedActivities.sort(function (x, y) { return ACTIVITIES.indexOf(x) - ACTIVITIES.indexOf(y); });
      state.noneQualified = false;
    } else {
      state.qualifiedActivities = state.qualifiedActivities.filter(function (x) { return x !== a; });
    }
    return renderAll();
  }

  if (el.dataset.none !== undefined) {
    state.noneQualified = el.checked;
    if (el.checked) state.qualifiedActivities = [];
    return renderAll();
  }

  /* 顶层字段 */
  if (el.dataset.topM) {
    var arr0 = state[el.dataset.topM] || (state[el.dataset.topM] = []);
    var i0 = arr0.indexOf(el.value);
    if (el.checked && i0 < 0) arr0.push(el.value);
    if (!el.checked && i0 >= 0) arr0.splice(i0, 1);
    saveDraft();
    return renderQ1();
  }
  if (el.dataset.topF) { state[el.dataset.topF] = el.value; return saveDraft(); }
  if (el.dataset.topRate) {
    (state.rateValues || (state.rateValues = {}))[el.dataset.topRate] = el.value;
    return saveDraft();
  }

  if (el.dataset.copyto) {
    if (el.value) {
      state.activities[el.dataset.copyto] = JSON.parse(JSON.stringify(state.activities[el.value]));
      renderAll();
    }
    return;
  }

  var act = el.dataset.act;
  if (!act) return;
  var b = blk(act);

  if (el.dataset.m) {
    var arr = b[el.dataset.m] || (b[el.dataset.m] = []);
    var i = arr.indexOf(el.value);
    if (el.checked && i < 0) arr.push(el.value);
    if (!el.checked && i >= 0) arr.splice(i, 1);
  } else if (el.dataset.f) {
    b[el.dataset.f] = el.dataset.bool ? el.checked : el.value;
    if (el.dataset.f === 'productSource') {
      if (el.value === 'top') { b.topCount = 5; syncTopProducts(act); }
      else if (!b.products.length) {
        b.products = [{ name: '', source: '自主填写', prePrice: '', signupPrice: '', actualPrice: '' }];
      }
    }
  } else if (el.dataset.pi !== undefined) {
    b.products[+el.dataset.pi][el.dataset.pf] = el.value;
  }

  saveDraft();
  if (el.dataset.rerender) renderActivities();
}

function handleInput(e) {
  var el = e.target;

  if (el.dataset.topF) { state[el.dataset.topF] = el.value; return saveDraft(); }
  if (el.dataset.topRate) {
    (state.rateValues || (state.rateValues = {}))[el.dataset.topRate] = el.value;
    return saveDraft();
  }

  var act = el.dataset.act;
  if (!act) return;
  var b = blk(act);
  if (el.dataset.pi !== undefined) b.products[+el.dataset.pi][el.dataset.pf] = el.value;
  else if (el.dataset.f && !el.dataset.bool && el.type !== 'radio') b[el.dataset.f] = el.value;
  saveDraft();
}

function handleClick(e) {
  var el = e.target.closest ? e.target.closest('button') : null;
  if (!el || !el.dataset.act) return;
  var act = el.dataset.act;
  var b = blk(act);
  if (el.dataset.del !== undefined) b.products.splice(+el.dataset.del, 1);
  else if (el.dataset.add) b.products.push({ name: '', source: '自主填写', prePrice: '', signupPrice: '', actualPrice: '' });
  else if (el.dataset.more) { b.topCount = Math.min(brandProducts().length, 10); syncTopProducts(act); }
  else if (el.dataset.reset) { b.products = []; syncTopProducts(act); }
  else return;
  saveDraft();
  renderActivities();
}

/* ---------------- 校验 & 提交 ---------------- */
function validate() {
  var miss = [];
  if (!state.brand.trim()) miss.push('客户名称');

  if (!state.qualifiedActivities.length && !state.noneQualified) {
    miss.push('有资格报名的活动（或勾选「以上都没有资格」）');
  }
  if (state.noneQualified && !(state.unqualifiedReasons || []).length) {
    miss.push('不符合资格的原因');
  }
  state.qualifiedActivities.forEach(function (a) {
    var b = blk(a);
    if (!b.progress) miss.push(a + ' · Q1 已提报商品进展');
    if (!b.audit) miss.push(a + ' · Q2 过审问题');
  });
  return miss;
}

function makeId() {
  return 'S' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
}

function payload() {
  var p = JSON.parse(JSON.stringify(state));
  p.id = p.id || makeId();
  p.createdAt = new Date().toISOString();
  p.matchedBrand = resolveBrand(state.brand) || '';
  // 只保留有资格活动的数据，减小体积
  var keep = {};
  (p.qualifiedActivities || []).forEach(function (a) { keep[a] = p.activities[a]; });
  p.activities = keep;
  return p;
}

/** 离线模式下的回执文件：客户回传用，非 Excel */
function downloadReceipt(data) {
  var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '货补摸排_' + (data.brand || '未填客户') + '_' + data.id + '.hbjson';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}

var lastSubmitted = null;

function submit() {
  var miss = validate();
  if (miss.length) {
    alert('还有必填项未完成：\n\n· ' + miss.join('\n· '));
    return;
  }

  var data = payload();
  lastSubmitted = data;
  var btn = $('#btnSubmit');
  var api = (CFG.apiBase || '').replace(/\/+$/, '');

  function ok(offline) { showDone(data, offline); }
  function fallback(msg) {
    if (confirm('提交到服务器失败：' + msg + '\n\n是否改为下载回执文件，发回给对接同学？')) {
      downloadReceipt(data);
      ok(true);
    }
  }

  btn.disabled = true;
  btn.textContent = '提交中…';
  var done = function () { btn.disabled = false; btn.textContent = '提交问卷'; };

  /* 优先级：自建后端 → GitHub Issues → 离线回执 */
  if (api) {
    fetch(api + '/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.msg || '提交失败');
      data.id = j.id || data.id;
      ok(false);
    }).catch(function (e) { fallback(e.message); }).finally(done);
    return;
  }

  if (GHUB && GHUB.enabled()) {
    GHUB.submit(data).then(function (r) {
      data.issue = r.issue;
      ok(false);
    }).catch(function (e) { fallback(e.message); }).finally(done);
    return;
  }

  downloadReceipt(data);
  ok(true);
  done();
}

function showDone(data, offline) {
  $('#doneId').innerHTML = '问卷编号：' + esc(data.id)
    + (data.issue ? '（已入库 #' + data.issue + '）' : '')
    + (offline ? '<br/><span style="color:#c47f00">' + esc(CFG.contactTip || '请将下载的回执文件发回给对接同学') + '</span>' : '');

  // 离线模式才需要"重新下载回执"，在线模式只留"再填一份"
  var btns = $('#doneBtns');
  var again = '<button class="btn primary" id="btnAgain">再填一份</button>';
  btns.innerHTML = offline
    ? '<button class="btn ghost" id="btnReceipt">重新下载回执</button>' + again
    : again;
  $('#btnAgain').addEventListener('click', resetForm);
  if (offline) {
    $('#btnReceipt').addEventListener('click', function () {
      downloadReceipt(lastSubmitted || payload());
    });
  }

  $('#doneMask').classList.add('show');
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}

function resetForm() {
  state = SCH.newState();
  $('#doneMask').classList.remove('show');
  renderBase();
  renderAll();
  window.scrollTo(0, 0);
}

/* ---------------- 初始化 ---------------- */
function init() {
  if (CFG.title) { document.title = CFG.title; $('#heroTitle').textContent = CFG.title; }
  if (CFG.subtitle) $('#heroTag').textContent = CFG.subtitle;

  buildBrandIndex();
  $('#brandList').innerHTML = (DATA.brands || []).map(function (b) {
    return '<option value="' + esc(b) + '"></option>';
  }).join('');

  var online = !!(CFG.apiBase || (GHUB && GHUB.enabled()));
  $('#modeTip').innerHTML = online
    ? '提交后直接入库，无需其他操作'
    : '提交后会自动下载回执文件，' + esc(CFG.contactTip || '请发回给对接同学');

  loadDraft();
  renderBase();
  renderAll();

  $('#brand').addEventListener('input', function (e) {
    state.brand = e.target.value.trim();
    updateBrandHint();
    state.qualifiedActivities.forEach(function (a) {
      var b = blk(a);
      b.topCount = b.topCount || 5;
      if (b.productSource === 'top') b.products = [];
      syncTopProducts(a);
    });
    renderActivities();
    saveDraft();
  });
  $('#remark').addEventListener('input', function (e) { state.remark = e.target.value; saveDraft(); });

  var root = document.getElementById('form');
  root.addEventListener('change', handleChange);
  root.addEventListener('input', handleInput);
  root.addEventListener('click', handleClick);

  $('#btnSubmit').addEventListener('click', submit);

  $('#btnClear').addEventListener('click', function () {
    if (!confirm('确定清空当前填写内容？')) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    state = SCH.newState();
    renderBase();
    renderAll();
  });
}

init();
