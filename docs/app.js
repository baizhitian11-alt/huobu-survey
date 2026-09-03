/* 货补摸排问卷 · 单活动页面逻辑（零依赖）
 * 页面用 window.HB_ACTIVITY = 'manjian' | 'huobu' 指定当前活动
 *
 * 注意：消耗数据仅用于后台排序拉取 Top 商品，前端不向品牌方展示。
 */
'use strict';

var CFG = window.HB_CONFIG || {};
var SCH = window.HBSchema;
var GHUB = window.HBGitHub;

var ACT_KEY = window.HB_ACTIVITY || SCH.ACTIVITY_DEFS[0].key;
var ACT = SCH.ACTIVITY_BY_KEY[ACT_KEY] || SCH.ACTIVITY_DEFS[0];
var DRAFT_KEY = 'huobu_draft_' + ACT_KEY + '_v4';

var DATA = window.HB_PRODUCTS || { brands: [], products: {} };

var state = SCH.newState(ACT_KEY);

/* ---------------- utils ---------------- */
var $ = function (s, r) { return (r || document).querySelector(s); };
var esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

var confirmTimer = null;
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) {}
  if (confirmTimer) clearTimeout(confirmTimer);
  confirmTimer = setTimeout(renderConfirm, 300);
}
function loadDraft() {
  try {
    var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && d.activityKey === ACT_KEY && Array.isArray(d.products)) state = d;
  } catch (e) {}
}

/* ---------------- 客户匹配 ---------------- */
var normBrand = function (s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '')
    .replace(/(旗舰店|官方旗舰店|专营店|官方|品牌|有限公司|股份|集团)/g, '');
};
var BRAND_INDEX = {};
(DATA.brands || []).forEach(function (b) { BRAND_INDEX[normBrand(b)] = b; });

function resolveBrand(input) {
  var raw = String(input || '').trim();
  if (!raw) return '';
  if (DATA.products[raw]) return raw;
  var k = normBrand(raw);
  if (!k) return '';
  if (BRAND_INDEX[k]) return BRAND_INDEX[k];
  var best = '', len = 0;
  Object.keys(BRAND_INDEX).forEach(function (bk) {
    if (bk && (k.indexOf(bk) >= 0 || bk.indexOf(k) >= 0) && bk.length > len) {
      len = bk.length; best = BRAND_INDEX[bk];
    }
  });
  return best;
}

function brandProducts() {
  var std = resolveBrand(state.brand);
  return std ? (DATA.products[std] || []) : [];
}

/** 拉取该客户 Top N 商品（按消耗排序，但不展示消耗），保留已填内容 */
function pullProducts(n) {
  var old = {};
  (state.products || []).forEach(function (p) { if (p.name) old[p.name] = p; });

  state.products = brandProducts().slice(0, n).map(function (p) {
    if (old[p.name]) return old[p.name];
    return SCH.newProduct({
      name: p.name, cost: p.cost, refPrice: p.avgPrice, source: '系统直拉',
    });
  });
  state.topCount = n;
}

/* ---------------- 控件 ---------------- */
function radioGroup(name, cur, options, dataAttr, small) {
  return '<div class="chips' + (small ? ' sm' : '') + '">' + options.map(function (o) {
    var val = typeof o === 'string' ? o : o.v;
    var label = typeof o === 'string' ? o : o.label;
    return '<label class="chip ' + (cur === val ? 'on' : '') + '">'
      + '<input type="radio" name="' + esc(name) + '" value="' + esc(val) + '" ' + dataAttr
      + (cur === val ? ' checked' : '') + '/>' + esc(label) + '</label>';
  }).join('') + '</div>';
}

function checkGroup(cur, options, dataAttr) {
  cur = cur || [];
  return '<div class="chips sm">' + options.map(function (o) {
    return '<label class="chip green ' + (cur.indexOf(o) >= 0 ? 'on' : '') + '">'
      + '<input type="checkbox" value="' + esc(o) + '" ' + dataAttr
      + (cur.indexOf(o) >= 0 ? ' checked' : '') + '/>' + esc(o) + '</label>';
  }).join('') + '</div>';
}


/* ---------------- Step 3：by 商品填报 ---------------- */
/** 一组价格输入（按补贴类型区分，key 为类型名） */
function priceBlock(p, i, key, label) {
  var pr = (p.prices && p.prices[key]) || {};
  var attr = function (f) {
    return 'data-pi="' + i + '" data-pk="' + esc(key) + '" data-pf="' + f + '"';
  };

  var h = '<div class="pblock">';
  if (label) h += '<div class="pblock-tag">' + esc(label) + '</div>';
  h += '<div class="price-row">'
    + '<label class="field"><span class="label">补前价格(元)</span>'
    + '<input type="number" step="0.01" ' + attr('prePrice') + ' value="' + esc(pr.prePrice || '') + '" placeholder="活动前售价"/></label>'
    + '<label class="field"><span class="label">报名/最低到手价(元)</span>'
    + '<input type="number" step="0.01" ' + attr('signupPrice') + ' value="' + esc(pr.signupPrice || '') + '" placeholder="报名承诺价"/></label>'
    + '<label class="field"><span class="label">实际到手价(元)</span>'
    + '<input type="number" step="0.01" ' + attr('actualPrice') + ' value="' + esc(pr.actualPrice || '') + '" placeholder="用户实付"/></label>'
    + '</div>';

  var pre = parseFloat(pr.prePrice), ac = parseFloat(pr.actualPrice);
  if (isFinite(pre) && isFinite(ac) && pre > 0) {
    h += '<div class="calc">补贴力度 <b>' + (Math.round((pre - ac) * 100) / 100)
      + ' 元</b>，补贴率 <b>' + (Math.round(((pre - ac) / pre) * 1000) / 10) + '%</b></div>';
  }
  return h + '</div>';
}

function productCard(p, i) {
  var st = p.status;
  var h = '<div class="pcard' + (st ? ' filled' : '') + '">'
    + '<div class="pcard-head">'
    + '<span class="pidx' + (st ? ' done' : '') + '">' + (st ? '✓' : (i + 1)) + '</span>'
    + '<input class="pname" value="' + esc(p.name) + '" data-pi="' + i + '" data-pf="name" placeholder="商品名称"/>'
    + '<button class="row-del" data-del="' + i + '" title="移除该商品">×</button>'
    + '</div>';

  h += '<div class="pcard-body">'
    + '<div class="q-title sm">提报情况 <span class="req">*</span></div>'
    + radioGroup('st_' + i, st, SCH.PRODUCT_STATUS,
        'data-pi="' + i + '" data-pf="status" data-rerender="products"', true);

  if (st === '已提报') {
    var subNames = ACT.subTypeNames || [];
    var picked = p.subTypes || [];
    // 只有需要填价格的类型才展示价格区
    var priced = picked.filter(function (k) { return SCH.needPrice(ACT_KEY, k); });
    var noPriced = picked.filter(function (k) { return !SCH.needPrice(ACT_KEY, k); });

    h += '<div class="pnest">';

    if (subNames.length) {
      h += '<div class="q-title sm">补贴类型（多选） <span class="req">*</span></div>'
        + checkGroup(picked, subNames, 'data-pi="' + i + '" data-pm="subTypes" data-rerender="products"');
    }

    if (!subNames.length) {
      h += priceBlock(p, i, SCH.DEFAULT_PRICE_KEY, '');
    } else if (!picked.length) {
      h += '<div class="tip-inline">↑ 先选补贴类型</div>';
    } else {
      if (priced.length) {
        h += priced.map(function (k) { return priceBlock(p, i, k, k); }).join('');
      }
      // 大场/跃迁激励类型：小店后台不填补贴价，只需与问卷一致
      noPriced.forEach(function (k) {
        h += '<div class="pblock no-price">'
          + '<div class="pblock-tag">' + esc(k) + '</div>'
          + '<div class="np-tip">该类型走激励逻辑，小店后台无需填补贴价格，勾选即可。</div>'
          + '</div>';
      });
    }

    /* ---- 审核进度 ---- */
    h += '<div class="sub-sec">'
      + '<div class="q-title sm">审核进度 <span class="req">*</span></div>'
      + radioGroup('au_' + i, p.audit, SCH.AUDIT_STATUS,
          'data-pi="' + i + '" data-pf="audit" data-rerender="products"', true);

    if (p.audit === '审核中') {
      h += '<div class="pnest2"><div class="q-title sm">已等待多久？</div>'
        + radioGroup('wait_' + i, p.auditWait, SCH.AUDIT_WAIT,
            'data-pi="' + i + '" data-pf="auditWait"', true)
        + '</div>';
    }

    if (p.audit === '拒审') {
      h += '<div class="pnest2"><div class="q-title sm">拒审原因（多选）</div>'
        + checkGroup(p.rejectReasons, SCH.REJECT_REASONS,
            'data-pi="' + i + '" data-pm="rejectReasons" data-rerender="products"');

      // 商品质量 → 补三率数据
      if ((p.rejectReasons || []).indexOf('商品质量') >= 0) {
        var qr = p.qualityRates || {};
        h += '<div class="q-title sm" style="margin-top:12px">该商品近14天三率（用于核对拒审依据）</div>'
          + '<div class="price-row">' + SCH.RATE_ITEMS.map(function (r) {
            return '<label class="field"><span class="label">' + esc(r) + '</span>'
              + '<input data-pi="' + i + '" data-pq="' + esc(r) + '" value="' + esc(qr[r] || '')
              + '" placeholder="如 2.5%"/></label>';
          }).join('') + '</div>';
      }

      if ((p.rejectReasons || []).indexOf('高价') >= 0) {
        h += '<div class="q-title sm" style="margin-top:12px">价格对比（用于申诉，选填）</div>'
          + '<div class="price-row">'
          + '<label class="field"><span class="label">本次提报价格(元)</span>'
          + '<input type="number" step="0.01" data-pi="' + i + '" data-pf="rejectPrice" value="' + esc(p.rejectPrice) + '" placeholder="被拒的报价"/></label>'
          + '<label class="field"><span class="label">天猫最低价(元)</span>'
          + '<input type="number" step="0.01" data-pi="' + i + '" data-pf="priceTmall" value="' + esc(p.priceTmall) + '"/></label>'
          + '<label class="field"><span class="label">抖音最低价(元)</span>'
          + '<input type="number" step="0.01" data-pi="' + i + '" data-pf="priceDouyin" value="' + esc(p.priceDouyin) + '"/></label>'
          + '<label class="field"><span class="label">快手最低价(元)</span>'
          + '<input type="number" step="0.01" data-pi="' + i + '" data-pf="priceKuaishou" value="' + esc(p.priceKuaishou) + '"/></label>'
          + '</div>';
      }
      if ((p.rejectReasons || []).indexOf('其他') >= 0) {
        h += '<label class="field" style="margin-top:10px"><span class="label">其他拒审原因</span>'
          + '<input data-pi="' + i + '" data-pf="auditOther" value="' + esc(p.auditOther) + '" placeholder="请具体描述"/></label>';
      }
      h += '</div>';
    }

    if (p.audit === '其他') {
      h += '<div class="pnest2"><label class="field"><span class="label">具体情况说明</span>'
        + '<input data-pi="' + i + '" data-pf="auditOther" value="' + esc(p.auditOther) + '" placeholder="如：部分规格过审、需要补资料等"/></label></div>';
    }

    h += '</div>';  // sub-sec
    h += '</div>';  // pnest
  }

  if (st === '择机报') {
    h += '<div class="pnest">'
      + '<label class="field" style="max-width:320px"><span class="label">预计什么时候提报</span>'
      + '<input data-pi="' + i + '" data-pf="planTime" value="' + esc(p.planTime)
      + '" placeholder="如：9月中旬 / 看首轮效果再定"/></label></div>';
  }

  if (st === '未提报') {
    h += '<div class="pnest">'
      + '<div class="q-title sm">不提报的原因（多选） <span class="req">*</span></div>'
      + checkGroup(p.reasons, SCH.NO_REPORT_REASONS,
          'data-pi="' + i + '" data-pm="reasons" data-rerender="products"');

    var rs = p.reasons || [];
    if (rs.indexOf('入选链接非大链接') >= 0) {
      h += '<label class="field" style="margin-top:12px">'
        + '<span class="label">小链接不能提报的原因 <span class="req">*</span></span>'
        + '<textarea rows="2" data-pi="' + i + '" data-pf="smallLinkReason" '
        + 'placeholder="例如：小链接销量不足无法入池 / 小链接价格无法破价 / 主推大链接不在活动池内等">'
        + esc(p.smallLinkReason) + '</textarea></label>';
    }
    if (rs.indexOf('其他') >= 0) {
      h += '<label class="field" style="margin-top:10px"><span class="label">其他原因</span>'
        + '<input data-pi="' + i + '" data-pf="reasonOther" value="' + esc(p.reasonOther) + '" placeholder="请具体描述"/></label>';
    }
    h += '</div>';
  }

  if (st === '无提报资格') {
    var uq = p.unqualifiedReasons || [];
    h += '<div class="pnest">'
      + '<div class="q-title sm">无资格的原因（多选） <span class="req">*</span></div>'
      + checkGroup(uq, SCH.UNQUALIFIED_REASONS,
          'data-pi="' + i + '" data-pm="unqualifiedReasons" data-rerender="products"');

    if (uq.indexOf('店铺分不达标') >= 0) {
      h += '<label class="field" style="margin-top:12px;max-width:260px">'
        + '<span class="label">当前店铺分</span>'
        + '<input data-pi="' + i + '" data-pf="shopScore" value="' + esc(p.shopScore) + '" placeholder="如：4.2"/></label>';
    }

    if (uq.indexOf('商品三率不达标') >= 0) {
      var ur = p.unqualifiedRates || {};
      h += '<div class="q-title sm" style="margin-top:12px">该商品近14天三率</div>'
        + '<div class="price-row">' + SCH.RATE_ITEMS.map(function (r) {
          return '<label class="field"><span class="label">' + esc(r) + '</span>'
            + '<input data-pi="' + i + '" data-pu="' + esc(r) + '" value="' + esc(ur[r] || '')
            + '" placeholder="如 2.5%"/></label>';
        }).join('') + '</div>';
    }

    if (uq.indexOf('其他') >= 0) {
      h += '<label class="field" style="margin-top:10px"><span class="label">其他原因说明</span>'
        + '<input data-pi="' + i + '" data-pf="unqualifiedOther" value="' + esc(p.unqualifiedOther) + '" placeholder="请具体描述"/></label>';
    }

    h += '<div class="sub-sec">'
      + '<div class="q-title sm">是否需要我们协助沟通改善？ <span class="req">*</span></div>'
      + radioGroup('talk_' + i, p.needTalk, SCH.NEED_TALK,
          'data-pi="' + i + '" data-pf="needTalk" data-rerender="products"', true);
    if (p.needTalk === '需要沟通') {
      h += '<label class="field" style="margin-top:10px"><span class="label">具体诉求</span>'
        + '<textarea rows="2" data-pi="' + i + '" data-pf="talkNote" '
        + 'placeholder="例如：希望了解入池条件、想申请特批等">' + esc(p.talkNote) + '</textarea></label>';
    }
    h += '</div></div>';
  }

  return h + '</div></div>';
}

function renderProducts() {
  var wrap = $('#productCard');
  var box = $('#productBox');

  var all = brandProducts();
  if (!state.brand) {
    box.innerHTML = '<div class="empty-tip">请先在第 1 步填写客户名称，系统会自动带出该客户的主推商品。</div>';
    return;
  }

  var h = '';
  if (state.products.length) {
    var done = state.products.filter(function (p) { return p.status; }).length;
    h += '<div class="pbar"><div class="pbar-in" style="width:'
      + Math.round(done / state.products.length * 100) + '%"></div></div>'
      + '<div class="pbar-tip">已填 <b>' + done + '</b> / ' + state.products.length + ' 个商品</div>'
      + state.products.map(productCard).join('');
  } else {
    h += all.length
      ? '<div class="empty-tip">点下方按钮带出该客户的主推商品，或手动添加。</div>'
      : '<div class="empty-tip">未匹配到「' + esc(state.brand) + '」的商品数据，请手动添加。</div>';
  }

  h += '<div class="tbl-actions">'
    + '<button class="link-btn" data-add="1">+ 手动添加商品</button>';
  if (all.length) {
    h += '<button class="link-btn" data-pull="5">带出主推 5 个商品</button>';
    if (all.length > 5) {
      h += '<button class="link-btn" data-pull="' + Math.min(all.length, 10) + '">带出 '
        + Math.min(all.length, 10) + ' 个</button>';
    }
  }
  h += '</div>';

  box.innerHTML = h;
}

/* ---------------- 提交前确认 ---------------- */
function renderConfirm() {
  var el = $('#confirm');
  if (!el) return;
  var miss = validate();

  var h = miss.length
    ? '<div class="sm-miss"><b>还有 ' + miss.length + ' 项待完成：</b><ul>'
      + miss.slice(0, 8).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('')
      + (miss.length > 8 ? '<li>…还有 ' + (miss.length - 8) + ' 项</li>' : '')
      + '</ul></div>'
    : '<div class="sm-ok">✓ 已填完，可以提交了</div>';

  if (!state.brand) {
    el.innerHTML = h;
    return;
  }

  h += '<div class="sm-block">'
    + '<div class="sm-row"><span class="sm-k">活动</span><span class="sm-v">' + esc(ACT.name) + '</span></div>'
    + '<div class="sm-row"><span class="sm-k">客户名称</span><span class="sm-v">' + esc(state.brand) + '</span></div>'
    + '</div>';

  var groups = {};
  state.products.forEach(function (p) {
    if (!p.name) return;
    var k = p.status || '未填写';
    (groups[k] = groups[k] || []).push(p);
  });

  SCH.PRODUCT_STATUS.concat(['未填写']).forEach(function (k) {
    if (!groups[k]) return;
    h += '<div class="sm-block"><div class="sm-title">' + esc(k) + '（' + groups[k].length + ' 个）</div>'
      + '<div class="sm-prods">' + groups[k].map(function (p) {
        var extra = '';

        if (p.status === '已提报') {
          var subs = (p.subTypes || []).length ? p.subTypes : [SCH.DEFAULT_PRICE_KEY];
          extra = subs.map(function (key) {
            var tag = key === SCH.DEFAULT_PRICE_KEY ? '' : '<em>' + esc(key) + '</em> ';
            if (key !== SCH.DEFAULT_PRICE_KEY && !SCH.needPrice(ACT_KEY, key)) {
              return tag + '<span style="color:#7a8399">无需填价格</span>';
            }
            var pr = (p.prices && p.prices[key]) || {};
            var parts = [];
            if (pr.prePrice) parts.push('补前 ' + pr.prePrice);
            if (pr.signupPrice) parts.push('报名 ' + pr.signupPrice);
            if (pr.actualPrice) parts.push('到手 ' + pr.actualPrice);
            return tag + (parts.length ? parts.join(' / ') : '<i>价格未填</i>');
          }).join('<br/>');

          extra += '<br/><span class="au">审核：' + esc(p.audit || '未填')
            + (p.audit === '审核中' && p.auditWait ? '（' + esc(p.auditWait) + '）' : '')
            + (p.audit === '拒审' && (p.rejectReasons || []).length ? ' — ' + esc(p.rejectReasons.join('、')) : '')
            + '</span>';

        } else if (p.status === '择机报') {
          extra = p.planTime ? '预计 ' + esc(p.planTime) : '<i>时间未填</i>';

        } else if (p.status === '未提报') {
          extra = esc((p.reasons || []).join('、')) || '<i>原因未填</i>';
          if ((p.reasons || []).indexOf('入选链接非大链接') >= 0) {
            extra += '<br/><span class="au">小链接原因：'
              + (p.smallLinkReason ? esc(p.smallLinkReason) : '<i>未填</i>') + '</span>';
          }

        } else if (p.status === '无提报资格') {
          extra = esc((p.unqualifiedReasons || []).join('、')) || '<i>原因未填</i>';
          if (p.shopScore) extra += '（店铺分 ' + esc(p.shopScore) + '）';
          extra += '<br/><span class="au">'
            + (p.needTalk === '需要沟通' ? '需要沟通' : (p.needTalk || '<i>未选是否沟通</i>'))
            + (p.talkNote ? '：' + esc(p.talkNote) : '') + '</span>';

        } else {
          extra = '<i>待选择提报情况</i>';
        }

        return '<div class="sm-prod"><b>' + esc(p.name) + '</b><span>' + extra + '</span></div>';
      }).join('') + '</div></div>';
  });

  if (state.remark) {
    h += '<div class="sm-block"><div class="sm-row"><span class="sm-k">备注</span><span class="sm-v">'
      + esc(state.remark) + '</span></div></div>';
  }

  el.innerHTML = h;
}

/* ---------------- 渲染入口 ---------------- */
function renderBrandHint() {
  var el = $('#brandHint');
  if (!state.brand) {
    el.className = 'hint';
    el.innerHTML = '共收录 <b>' + (DATA.brands || []).length + '</b> 个客户，输入两个字即可搜索';
    return;
  }
  var std = resolveBrand(state.brand);
  var list = std ? DATA.products[std] : null;
  if (list && list.length) {
    el.className = 'hint ok';
    el.innerHTML = '✓ 已匹配「<b>' + esc(std) + '</b>」，可自动带出主推商品';
  } else {
    el.className = 'hint warn';
    el.innerHTML = '未匹配到该客户的商品数据，后续需手动填写商品（不影响提交）';
  }
}

function renderAll() {
  renderProducts();
  saveDraft();
}

/* ---------------- 事件 ---------------- */
function applyRerender(kind) {
  if (kind === 'all') renderAll();
  else if (kind === 'products') renderProducts();
  saveDraft();
}

/** 立即切换 chip 的选中样式，避免"点了没反应"的错觉 */
function syncChip(el) {
  var chip = el.closest ? el.closest('.chip') : null;
  if (!chip) return;
  if (el.type === 'radio') {
    var group = chip.parentNode ? chip.parentNode.querySelectorAll('.chip') : [];
    Array.prototype.forEach.call(group, function (c) { c.classList.remove('on'); });
  }
  chip.classList.toggle('on', el.checked);
}

/** 取（或建）某商品某补贴类型的价格组 */
function priceOf(p, key) {
  if (!p.prices) p.prices = {};
  if (!p.prices[key]) p.prices[key] = SCH.newPrice();
  return p.prices[key];
}

function handleChange(e) {
  var el = e.target;
  var pi = el.dataset.pi;

  if (el.type === 'radio' || el.type === 'checkbox') syncChip(el);

  if (pi !== undefined) {
    var p = state.products[+pi];
    if (!p) return;
    if (el.dataset.pm) {
      var arr = p[el.dataset.pm] || (p[el.dataset.pm] = []);
      var i = arr.indexOf(el.value);
      if (el.checked && i < 0) arr.push(el.value);
      if (!el.checked && i >= 0) arr.splice(i, 1);
      // 勾选需要价格的补贴类型时，顺带准备好对应的价格组
      if (el.dataset.pm === 'subTypes' && el.checked && SCH.needPrice(ACT_KEY, el.value)) {
        priceOf(p, el.value);
      }
    } else if (el.dataset.pk) {
      priceOf(p, el.dataset.pk)[el.dataset.pf] = el.value;
    } else if (el.dataset.pq) {
      if (!p.qualityRates) p.qualityRates = {};
      p.qualityRates[el.dataset.pq] = el.value;
    } else if (el.dataset.pu) {
      if (!p.unqualifiedRates) p.unqualifiedRates = {};
      p.unqualifiedRates[el.dataset.pu] = el.value;
    } else if (el.dataset.pf) {
      p[el.dataset.pf] = el.value;
    }
  } else if (el.dataset.m) {
    var a2 = state[el.dataset.m] || (state[el.dataset.m] = []);
    var j = a2.indexOf(el.value);
    if (el.checked && j < 0) a2.push(el.value);
    if (!el.checked && j >= 0) a2.splice(j, 1);
  } else if (el.dataset.f) {
    state[el.dataset.f] = el.value;
  } else {
    return;
  }

  if (el.dataset.rerender) applyRerender(el.dataset.rerender);
  else saveDraft();
}

function handleInput(e) {
  var el = e.target;
  if (el.type === 'radio' || el.type === 'checkbox') return;
  var pi = el.dataset.pi;

  if (pi !== undefined) {
    var p = state.products[+pi];
    if (!p) return;
    if (el.dataset.pk) {
      priceOf(p, el.dataset.pk)[el.dataset.pf] = el.value;
      // 价格变动 → 稍后刷新补贴率显示（延迟避免打断输入）
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (err) {}
      if (confirmTimer) clearTimeout(confirmTimer);
      confirmTimer = setTimeout(function () { renderProducts(); renderConfirm(); }, 900);
      return;
    }
    if (el.dataset.pq) {
      if (!p.qualityRates) p.qualityRates = {};
      p.qualityRates[el.dataset.pq] = el.value;
      saveDraft();
      return;
    }
    if (el.dataset.pu) {
      if (!p.unqualifiedRates) p.unqualifiedRates = {};
      p.unqualifiedRates[el.dataset.pu] = el.value;
      saveDraft();
      return;
    }
    if (el.dataset.pf) p[el.dataset.pf] = el.value;
  } else if (el.dataset.f) {
    state[el.dataset.f] = el.value;
  } else {
    return;
  }
  saveDraft();
}

function handleClick(e) {
  var btn = e.target.closest ? e.target.closest('button') : null;
  if (!btn) return;

  if (btn.dataset.del !== undefined) {
    state.products.splice(+btn.dataset.del, 1);
  } else if (btn.dataset.add) {
    state.products.push(SCH.newProduct({ source: '自主填写' }));
  } else if (btn.dataset.pull) {
    pullProducts(+btn.dataset.pull);
  } else {
    return;
  }
  renderProducts();
  saveDraft();
}

/* ---------------- 校验 & 提交 ---------------- */
function validate() {
  var miss = [];
  if (!state.brand.trim()) miss.push('客户名称');

  var named = state.products.filter(function (p) { return p.name; });
  if (!named.length) miss.push('至少填写 1 个商品');

  named.forEach(function (p) {
    var short = p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name;
    if (!p.status) {
      miss.push('商品「' + short + '」的提报情况');
      return;
    }

    if (p.status === '已提报') {
      if ((ACT.subTypeNames || []).length && !(p.subTypes || []).length) {
        miss.push('商品「' + short + '」的补贴类型');
      }
      if (!p.audit) miss.push('商品「' + short + '」的审核进度');
      if (p.audit === '拒审' && !(p.rejectReasons || []).length) {
        miss.push('商品「' + short + '」的拒审原因');
      }
    }

    if (p.status === '未提报') {
      if (!(p.reasons || []).length) {
        miss.push('商品「' + short + '」的不提报原因');
      } else if ((p.reasons || []).indexOf('入选链接非大链接') >= 0
                 && !String(p.smallLinkReason || '').trim()) {
        miss.push('商品「' + short + '」小链接不能提报的原因');
      }
    }

    if (p.status === '无提报资格') {
      if (!(p.unqualifiedReasons || []).length) {
        miss.push('商品「' + short + '」的无资格原因');
      }
      if (!p.needTalk) miss.push('商品「' + short + '」是否需要协助沟通');
    }
  });

  return miss;
}

function payload() {
  var p = JSON.parse(JSON.stringify(state));
  p.id = 'S' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
  p.createdAt = new Date().toISOString();
  p.activityName = ACT.name;
  p.matchedBrand = resolveBrand(state.brand) || '';
  p.products = (p.products || []).filter(function (x) { return x.name; });
  return p;
}

function downloadReceipt(data) {
  var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ACT.name + '_' + (data.brand || '未填客户') + '_' + data.id + '.hbjson';
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
    $('#confirm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  var data = payload();
  lastSubmitted = data;
  var btn = $('#btnSubmit');
  var api = (CFG.apiBase || '').replace(/\/+$/, '');

  btn.disabled = true;
  btn.textContent = '提交中…';
  var done = function () { btn.disabled = false; btn.textContent = '提交问卷'; };
  var fallback = function (msg) {
    if (confirm('提交失败：' + msg + '\n\n是否下载回执文件，发回给对接同学？')) {
      downloadReceipt(data);
      showDone(data, true);
    }
  };

  if (api) {
    fetch(api + '/api/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.msg || '提交失败');
      showDone(data, false);
    }).catch(function (e) { fallback(e.message); }).finally(done);
    return;
  }

  if (GHUB && GHUB.enabled()) {
    GHUB.submit(data).then(function (r) {
      data.issue = r.issue;
      showDone(data, false);
    }).catch(function (e) { fallback(e.message); }).finally(done);
    return;
  }

  downloadReceipt(data);
  showDone(data, true);
  done();
}

function showDone(data, offline) {
  $('#doneId').innerHTML = '问卷编号：' + esc(data.id)
    + (offline ? '<br/><span style="color:#c47f00">' + esc(CFG.contactTip || '请将下载的回执文件发回给对接同学') + '</span>' : '');

  var other = SCH.ACTIVITY_DEFS.filter(function (a) { return a.key !== ACT_KEY; })[0];
  var btns = '<button class="btn ghost" id="btnAgain">再填一个客户</button>';
  if (other) btns += '<a class="btn primary" href="' + other.page + '">去填「' + esc(other.name) + '」</a>';
  $('#doneBtns').innerHTML = btns;
  $('#btnAgain').addEventListener('click', function () {
    state = SCH.newState(ACT_KEY);
    $('#doneMask').classList.remove('show');
    $('#brand').value = '';
    $('#remark').value = '';
    renderBrandHint();
    renderAll();
    window.scrollTo(0, 0);
  });

  $('#doneMask').classList.add('show');
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}

/* ---------------- 初始化 ---------------- */
function init() {
  document.title = ACT.name + ' · 报名情况摸排';
  $('#actName').textContent = ACT.name;
  $('#actDesc').textContent = ACT.desc;
  document.documentElement.style.setProperty('--act', ACT.color);

  $('#brandList').innerHTML = (DATA.brands || []).map(function (b) {
    return '<option value="' + esc(b) + '"></option>';
  }).join('');

  var online = !!(CFG.apiBase || (GHUB && GHUB.enabled()));
  $('#modeTip').textContent = online ? '提交后直接入库' : '提交后会下载回执文件，请发回给对接同学';

  // 活动切换导航
  $('#actNav').innerHTML = SCH.ACTIVITY_DEFS.map(function (a) {
    return a.key === ACT_KEY
      ? '<span class="act-tab on">' + esc(a.name) + '</span>'
      : '<a class="act-tab" href="' + a.page + '">' + esc(a.name) + '</a>';
  }).join('');

  loadDraft();
  $('#brand').value = state.brand;
  $('#remark').value = state.remark;
  renderBrandHint();
  renderAll();

  $('#brand').addEventListener('input', function (e) {
    var next = e.target.value.trim();
    var changed = resolveBrand(next) !== resolveBrand(state.brand);
    state.brand = next;
    renderBrandHint();
    if (changed) {
      // 换客户时清掉旧商品，重新按新客户带出
      state.products = [];
      if (brandProducts().length) pullProducts(state.topCount || 5);
      renderProducts();
    }
    saveDraft();
  });

  $('#remark').addEventListener('input', function (e) { state.remark = e.target.value; saveDraft(); });

  var form = $('#form');
  form.addEventListener('change', handleChange);
  form.addEventListener('input', handleInput);
  form.addEventListener('click', handleClick);

  $('#btnSubmit').addEventListener('click', submit);
  $('#btnClear').addEventListener('click', function () {
    if (!confirm('确定清空当前填写内容？')) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    state = SCH.newState(ACT_KEY);
    $('#brand').value = '';
    $('#remark').value = '';
    renderBrandHint();
    renderAll();
  });

  // 有资格且已匹配客户时，自动带出商品
  if (!state.products.length && brandProducts().length) {
    pullProducts(5);
    renderProducts();
  }
}

init();
