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

  /* ---------- 活动定义：新增活动只在这里加一项 + 复制一个 html ----------
   * subTypes[].needPrice：该补贴类型是否需要填补贴价格。
   *   大场/跃迁激励走的是激励逻辑，小店后台不填补贴价，因此为 false。
   */
  var ACTIVITY_DEFS = [
    {
      key: 'manjian',
      name: '金秋满减',
      page: 'manjian.html',
      desc: '金秋大促跨店满减补贴',
      color: '#d4741a',
      subTypes: [
        { name: '跨店满减（全资）', needPrice: true },
        { name: '跨店满减（混资）', needPrice: true },
        { name: '直播大场/跃迁激励', needPrice: false },
      ],
    },
    {
      key: 'huobu',
      name: '货补',
      page: 'huobu.html',
      desc: '官方商品补贴（含心智品专项）',
      color: '#1a7a4a',
      subTypes: [
        { name: '官方补贴', needPrice: true },
        { name: '官方补贴心智品专项', needPrice: true },
      ],
    },
  ];

  var ACTIVITY_BY_KEY = {};
  ACTIVITY_DEFS.forEach(function (a) {
    ACTIVITY_BY_KEY[a.key] = a;
    // 便捷索引：类型名 -> 是否需要价格
    a.needPriceOf = {};
    a.subTypeNames = a.subTypes.map(function (s) {
      a.needPriceOf[s.name] = s.needPrice;
      return s.name;
    });
  });
  var ACTIVITIES = ACTIVITY_DEFS.map(function (a) { return a.name; });

  /** 某活动下某补贴类型是否需要填价格 */
  function needPrice(activityKey, subTypeName) {
    var a = ACTIVITY_BY_KEY[activityKey];
    if (!a) return true;
    return a.needPriceOf[subTypeName] !== false;
  }

  /* ---------- 选项 ---------- */
  /** 商品提报情况。资格是"品"的维度：有些品在池、有些不在 */
  var PRODUCT_STATUS = ['已提报', '择机报', '未提报', '无提报资格'];

  /** 无提报资格的原因（商品维度） */
  var UNQUALIFIED_REASONS = [
    '商品不在活动池',
    '类目/资质不符',
    '商品三率不达标',
    '店铺分不达标',
    '历史违规限制',
    '不清楚原因',
    '其他',
  ];

  /** 未提报原因。needDetail 的选项需要补充说明 */
  var NO_REPORT_REASONS = [
    '渠道不破价',
    '价格/利润空间不足',
    '活动力度/玩法不合适',
    '库存不足',
    '商品不在池',
    '主链接不在池',
    '入选链接非大链接',
    '其他',
  ];
  /** 选中后需要额外补充原因的选项 */
  var NO_REPORT_NEED_DETAIL = {
    '入选链接非大链接': '小链接不能提报的原因',
    '其他': '其他原因',
  };

  var NEED_TALK = ['需要沟通', '暂不需要'];
  var RATE_ITEMS = ['近14天差评率', '近14天品退率', '近14天纠纷率'];

  /* 已提报 → 审核进度 */
  var AUDIT_STATUS = ['已过审', '审核中', '拒审', '其他'];
  /** 审核中 → 已等待时长 */
  var AUDIT_WAIT = ['7 天内', '7-14 天', '超过半个月仍未通过'];
  var REJECT_REASONS = ['商品质量', '高价', '资质不符', '其他'];

  var MAIN_HEADER = [
    '提交ID', '提交时间', '活动', '客户名称', '商品数',
    '已提报数', '择机报数', '未提报数', '无资格数',
    '过审数', '审核中数', '拒审数',
    '需沟通商品数',
    '备注',
  ];

  var DETAIL_HEADER = [
    '提交ID', '提交时间', '活动', '客户名称', '排名', '商品名称', '商品来源',
    '消耗(万元)', '参考成交单价(元)',
    '提报情况', '补贴类型',
    '补前价格(元)', '活动报名/最低到手价(元)', '实际到手价(元)',
    '补贴力度(补前-实际到手)', '补贴率(%)',
    '审核进度', '审核已等待时长', '拒审原因',
    '商品质量-差评率', '商品质量-品退率', '商品质量-纠纷率',
    '拒审-提报价格', '天猫最低价', '抖音最低价', '快手最低价', '审核-其他说明',
    '择机报-预计时间',
    '未提报原因', '小链接不能提报原因', '未提报-其他说明',
    '无资格-原因', '无资格-店铺分', '无资格-三率数值', '无资格-其他说明',
    '是否需要沟通', '沟通诉求',
    '商品备注',
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
      status: '',            // 已提报 / 择机报 / 未提报 / 无提报资格
      subTypes: [],          // 已提报 → 补贴类型（多选）
      /** 价格按补贴类型分开存（仅 needPrice 的类型才有） */
      prices: {},
      // 已提报 → 审核进度
      audit: '',             // 已过审 / 审核中 / 拒审 / 其他
      auditWait: '',         // 审核中 → 已等待时长
      rejectReasons: [],     // 拒审 → 原因
      qualityRates: {},      // 拒审·商品质量 → 三率数据
      rejectPrice: '',       // 拒审·高价 → 本次提报价格
      priceTmall: '',
      priceDouyin: '',
      priceKuaishou: '',
      auditOther: '',        // 其他情况说明
      planTime: '',          // 择机报 → 预计提报时间
      reasons: [],           // 未提报 → 原因（多选）
      smallLinkReason: '',   // 未提报·入选链接非大链接 → 小链接不能提报的原因
      reasonOther: '',
      // 无提报资格（商品维度）
      unqualifiedReasons: [],
      shopScore: '',
      unqualifiedRates: {},  // 三率数值
      unqualifiedOther: '',
      needTalk: '',          // 是否需要协助沟通
      talkNote: '',
      note: '',
    };
  }

  /** 一份提交（单活动） */
  function newState(activityKey) {
    return {
      activityKey: activityKey || ACTIVITY_DEFS[0].key,
      brand: '',
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

  function rateText(obj) {
    var rv = obj || {};
    return Object.keys(rv).filter(function (k) { return rv[k]; })
      .map(function (k) { return k + ':' + rv[k]; }).join('、');
  }

  function countBy(products, status) {
    return (products || []).filter(function (p) { return p.status === status; }).length;
  }

  function countAudit(products, audit) {
    return (products || []).filter(function (p) {
      return p.status === '已提报' && p.audit === audit;
    }).length;
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
        id, t, act, S(s.brand), prods.length || '',
        countBy(prods, '已提报') || '', countBy(prods, '择机报') || '',
        countBy(prods, '未提报') || '', countBy(prods, '无提报资格') || '',
        countAudit(prods, '已过审') || '', countAudit(prods, '审核中') || '', countAudit(prods, '拒审') || '',
        prods.filter(function (p) { return p.needTalk === '需要沟通'; }).length || '',
        S(s.remark),
      ]);

      prods.forEach(function (p, i) {
        // 已提报：按勾选的补贴类型逐行输出；其他状态出一行
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
          var qr = p.qualityRates || {};

          detail.push([
            id, t, act, S(s.brand), i + 1, S(p.name), S(p.source),
            N(p.cost), N(p.refPrice),
            S(p.status), key === DEFAULT_PRICE_KEY ? '' : key,
            pre, N(pr.signupPrice), actual, gap, rate,
            S(p.audit), S(p.auditWait), A(p.rejectReasons),
            S(qr['近14天差评率']), S(qr['近14天品退率']), S(qr['近14天纠纷率']),
            N(p.rejectPrice), N(p.priceTmall), N(p.priceDouyin), N(p.priceKuaishou), S(p.auditOther),
            S(p.planTime),
            A(p.reasons), S(p.smallLinkReason), S(p.reasonOther),
            A(p.unqualifiedReasons), S(p.shopScore), rateText(p.unqualifiedRates), S(p.unqualifiedOther),
            S(p.needTalk), S(p.talkNote),
            S(p.note),
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
        cols: [12, 18, 12, 14, 6, 50, 10, 12, 15, 11, 22, 12, 20, 14, 18, 11,
               12, 16, 20, 14, 14, 14, 15, 13, 13, 13, 22, 16,
               30, 26, 18, 24, 13, 26, 20, 13, 24, 20]
          .map(function (w) { return { w: w }; }),
        rows: f.detail,
      },
    ];
  }

  return {
    ACTIVITY_DEFS: ACTIVITY_DEFS,
    ACTIVITY_BY_KEY: ACTIVITY_BY_KEY,
    ACTIVITIES: ACTIVITIES,
    needPrice: needPrice,
    PRODUCT_STATUS: PRODUCT_STATUS,
    NO_REPORT_REASONS: NO_REPORT_REASONS,
    NO_REPORT_NEED_DETAIL: NO_REPORT_NEED_DETAIL,
    NEED_TALK: NEED_TALK,
    RATE_ITEMS: RATE_ITEMS,
    UNQUALIFIED_REASONS: UNQUALIFIED_REASONS,
    AUDIT_STATUS: AUDIT_STATUS,
    AUDIT_WAIT: AUDIT_WAIT,
    REJECT_REASONS: REJECT_REASONS,
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
