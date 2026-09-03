/**
 * 问卷数据结构与 Excel 扁平化 · 浏览器 + Node 通用
 *
 * 每个活动一个独立页面/链接，一份提交 = 一个客户 × 一个活动。
 * 核心流程：选客户 → 拉商品 → 有无资格 →
 *   · 没资格 → 店铺分 + 是否需要沟通
 *   · 有资格 → by 商品选提报情况（已提报 / 择机报 / 未提报）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HBSchema = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 活动定义：新增活动只在这里加一项 + 复制一个 html ---------- */
  var ACTIVITY_DEFS = [
    {
      key: 'manjian',
      name: '金秋满减',
      page: 'manjian.html',
      desc: '金秋大促跨店满减补贴',
      color: '#d4741a',
      /** 该活动下可选的补贴类型（提报时勾选） */
      subTypes: ['跨店满减（全资）', '跨店满减（混资）', '直播大场/跃迁激励'],
    },
    {
      key: 'huobu',
      name: '货补',
      page: 'huobu.html',
      desc: '官方商品补贴（含心智品专项）',
      color: '#1a7a4a',
      subTypes: ['官方补贴', '官方补贴心智品专项'],
    },
  ];

  var ACTIVITY_BY_KEY = {};
  ACTIVITY_DEFS.forEach(function (a) { ACTIVITY_BY_KEY[a.key] = a; });
  var ACTIVITIES = ACTIVITY_DEFS.map(function (a) { return a.name; });

  /* ---------- 选项 ---------- */
  var PRODUCT_STATUS = ['已提报', '择机报', '未提报'];
  var NO_REPORT_REASONS = ['渠道不破价', '价格/利润空间不足', '活动力度/玩法不合适', '库存不足', '其他'];
  var NEED_TALK = ['需要沟通', '暂不需要'];
  var RATE_ITEMS = ['近14天差评率', '近14天品退率', '近14天纠纷率'];
  var UNQUALIFIED_REASONS = ['店铺分不达标', '三率不达标', '类目/资质不符', '不清楚原因', '其他'];

  var MAIN_HEADER = [
    '提交ID', '提交时间', '活动', '客户名称', '填写人',
    '是否有资格', '商品数',
    '已提报数', '择机报数', '未提报数',
    '无资格-原因', '无资格-店铺分', '无资格-三率不达标项', '无资格-三率数值',
    '无资格-其他说明', '是否需要沟通', '沟通诉求',
    '备注',
  ];

  var DETAIL_HEADER = [
    '提交ID', '提交时间', '活动', '客户名称', '排名', '商品名称', '商品来源',
    '消耗(万元)', '参考成交单价(元)',
    '提报情况', '补贴类型',
    '补前价格(元)', '活动报名/最低到手价(元)', '实际到手价(元)',
    '补贴力度(补前-实际到手)', '补贴率(%)',
    '择机报-预计时间', '未提报原因', '未提报-其他说明', '商品备注',
  ];

  /** 未勾选补贴类型时，价格存放在这个 key 下 */
  var DEFAULT_PRICE_KEY = '__default__';

  /** 空价格组 */
  function newPrice() {
    return { prePrice: '', signupPrice: '', actualPrice: '' };
  }

  /** 一个商品行 */
  function newProduct(p) {
    p = p || {};
    return {
      name: p.name || '',
      cost: p.cost === 0 || p.cost ? p.cost : '',
      refPrice: p.refPrice === 0 || p.refPrice ? p.refPrice : '',
      source: p.source || '自主填写',
      status: '',            // 已提报 / 择机报 / 未提报
      subTypes: [],          // 已提报 → 补贴类型（多选）
      /** 价格按补贴类型分开存：{ '跨店满减（全资）': {prePrice,signupPrice,actualPrice}, ... } */
      prices: {},
      planTime: '',          // 择机报 → 预计提报时间
      reasons: [],           // 未提报 → 原因
      reasonOther: '',
      note: '',
    };
  }

  /** 一份提交（单活动） */
  function newState(activityKey) {
    return {
      activityKey: activityKey || ACTIVITY_DEFS[0].key,
      brand: '',
      filler: '',
      qualified: '',          // 有资格 / 没资格
      // 没资格分支
      unqualifiedReasons: [],
      shopScore: '',
      rateItems: [],
      rateValues: {},
      unqualifiedOther: '',
      needTalk: '',
      talkNote: '',
      // 有资格分支
      products: [],
      topCount: 5,
      productSource: 'top',
      remark: '',
    };
  }

  /* ---------- helpers ---------- */
  var A = function (v) { return Array.isArray(v) ? v.filter(Boolean).join('、') : (v || ''); };
  var S = function (v) { return (v === 0 || v) ? String(v) : ''; };
  var N = function (v) { var n = parseFloat(v); return isFinite(n) ? n : ''; };

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function activityName(s) {
    var def = ACTIVITY_BY_KEY[s && s.activityKey];
    return def ? def.name : (s && s.activityName) || '';
  }

  function rateText(s) {
    var rv = s.rateValues || {};
    return Object.keys(rv).filter(function (k) { return rv[k]; })
      .map(function (k) { return k + ':' + rv[k]; }).join('、');
  }

  function countBy(products, status) {
    return (products || []).filter(function (p) { return p.status === status; }).length;
  }

  /** 展开成两张表。已提报且勾了多个补贴类型 → 每个类型一行（价格分开统计） */
  function flatten(list) {
    var main = [MAIN_HEADER.slice()];
    var detail = [DETAIL_HEADER.slice()];

    (list || []).forEach(function (s) {
      if (!s) return;
      var t = fmtTime(s.createdAt);
      var id = s.id || '';
      var act = activityName(s);
      var prods = (s.products || []).filter(function (p) { return p && p.name; });

      main.push([
        id, t, act, S(s.brand), S(s.filler),
        S(s.qualified), prods.length || '',
        countBy(prods, '已提报') || '', countBy(prods, '择机报') || '', countBy(prods, '未提报') || '',
        A(s.unqualifiedReasons), S(s.shopScore), A(s.rateItems), rateText(s),
        S(s.unqualifiedOther), S(s.needTalk), S(s.talkNote),
        S(s.remark),
      ]);

      prods.forEach(function (p, i) {
        // 已提报：按勾选的补贴类型逐行输出；没勾类型则出一行
        var keys;
        if (p.status === '已提报') {
          keys = (p.subTypes || []).length ? p.subTypes.slice() : [DEFAULT_PRICE_KEY];
        } else {
          keys = [DEFAULT_PRICE_KEY];
        }

        keys.forEach(function (key) {
          var pr = (p.prices && p.prices[key]) || {};
          var pre = N(pr.prePrice);
          var actual = N(pr.actualPrice);
          var gap = (typeof pre === 'number' && typeof actual === 'number')
            ? Math.round((pre - actual) * 100) / 100 : '';
          var rate = (typeof pre === 'number' && typeof actual === 'number' && pre > 0)
            ? Math.round(((pre - actual) / pre) * 10000) / 100 : '';

          detail.push([
            id, t, act, S(s.brand), i + 1, S(p.name), S(p.source),
            N(p.cost), N(p.refPrice),
            S(p.status), key === DEFAULT_PRICE_KEY ? '' : key,
            pre, N(pr.signupPrice), actual, gap, rate,
            S(p.planTime), A(p.reasons), S(p.reasonOther), S(p.note),
          ]);
        });
      });
    });

    return { main: main, detail: detail };
  }

  function sheets(list) {
    var f = flatten(list);
    return [
      {
        name: '问卷主表',
        cols: MAIN_HEADER.map(function (h) {
          return { w: Math.min(Math.max(h.length * 2.4, 10), 30) };
        }),
        rows: f.main,
      },
      {
        name: '商品提报明细',
        cols: [12, 18, 12, 14, 6, 50, 10, 12, 15, 10, 22, 12, 20, 14, 18, 11, 16, 24, 18, 20]
          .map(function (w) { return { w: w }; }),
        rows: f.detail,
      },
    ];
  }

  return {
    ACTIVITY_DEFS: ACTIVITY_DEFS,
    ACTIVITY_BY_KEY: ACTIVITY_BY_KEY,
    ACTIVITIES: ACTIVITIES,
    PRODUCT_STATUS: PRODUCT_STATUS,
    NO_REPORT_REASONS: NO_REPORT_REASONS,
    NEED_TALK: NEED_TALK,
    RATE_ITEMS: RATE_ITEMS,
    UNQUALIFIED_REASONS: UNQUALIFIED_REASONS,
    MAIN_HEADER: MAIN_HEADER,
    DETAIL_HEADER: DETAIL_HEADER,
    DEFAULT_PRICE_KEY: DEFAULT_PRICE_KEY,
    newPrice: newPrice,
    newProduct: newProduct,
    newState: newState,
    flatten: flatten,
    sheets: sheets,
    fmtTime: fmtTime,
    activityName: activityName,
  };
}));
