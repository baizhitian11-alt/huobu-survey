/**
 * 问卷数据结构与 Excel 扁平化逻辑 · 浏览器 + Node 通用
 * 前端填写、汇总页、后端导出全部共用这里的定义，保证表头一致。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HBSchema = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 活动定义 ----------
   * key 用于图片文件名等场景（docs/assets/entry-<key>.png）
   */
  var ACTIVITY_DEFS = [
    { name: '金秋满减（全资）', key: 'manjian-quanzi', desc: '跨店满减补贴 · 平台全额出资' },
    { name: '金秋满减（混资）', key: 'manjian-hunzi', desc: '跨店满减补贴 · 平台与商家共同出资' },
    { name: '金秋大场', key: 'dachang', desc: '金秋大促直播大场及跃迁激励' },
    { name: '货补', key: 'huobu', desc: '官方商品补贴（含心智品专项）' },
  ];
  var ACTIVITIES = ACTIVITY_DEFS.map(function (a) { return a.name; });
  var ACTIVITY_KEY = {};
  var ACTIVITY_DESC = {};
  ACTIVITY_DEFS.forEach(function (a) {
    ACTIVITY_KEY[a.name] = a.key;
    ACTIVITY_DESC[a.name] = a.desc;
  });

  var RATE_ITEMS = ['近14天差评率', '近14天品退率', '近14天纠纷率'];
  var UNQUALIFIED_REASONS = ['店铺分不达标', '三率不达标', '类目/资质不符', '其他'];
  var NO_REPORT_REASONS = ['渠道不破价', '价格/利润空间不足', '活动力度/玩法不合适', '其他'];
  var REJECT_REASONS = ['商品质量', '高价'];
  var GOODS_WAYS = ['视频号专属货组', '视频号专供价格'];
  var LIVE_WAYS = ['嘉宾进播', '场景直播'];

  var MAIN_HEADER = [
    '提交ID', '提交时间', '客户名称', '有资格报名的活动', '有资格活动数', '活动',
    '已提报商品进展', '商品填报方式', '填报商品数',
    '提报不符合预期-情况', '提报不符合预期-说明',
    '不提报原因', '不提报-其他说明',
    '过审问题', '是否超7个工作日', '拒审原因', '高价-提报价格', '天猫最低价', '抖音最低价', '快手最低价', '过审-其他说明',
    '是否因平台活动推动组货升级', '组货升级方式',
    '是否因平台活动推动直播玩法', '直播玩法',
    '本活动备注',
    '无资格-原因', '无资格-店铺分', '无资格-三率不达标项', '无资格-三率数值', '无资格-其他说明',
    '整体备注',
  ];

  var DETAIL_HEADER = [
    '提交ID', '提交时间', '客户名称', '活动', '商品来源', '排名', '商品名称',
    '日均消耗(元)', '参考成交单价(元)', '补前价格(元)', '活动报名/最低到手价(元)', '实际到手价(元)',
    '补贴力度(补前-实际到手)', '补贴率(%)',
  ];

  /** 单个活动下的问题块 */
  function newBlock() {
    return {
      progress: '', productSource: 'top', products: [], topCount: 5,
      mismatchChecked: false, mismatchNote: '',
      noReportReasons: [], noReportOther: '',
      audit: '', auditSlow: '', rejectReasons: [],
      highPriceSignup: '', priceTmall: '', priceDouyin: '', priceKuaishou: '', auditOther: '',
      upgradeGoods: '', upgradeGoodsWays: [],
      upgradeLive: '', upgradeLiveWays: [],
      note: '',
    };
  }

  function newState() {
    var s = {
      brand: '',
      remark: '',
      /** Q1：有资格报名的活动（多选，勾选后展开后续问题） */
      qualifiedActivities: [],
      /** 一个都没资格时勾选，展开原因 */
      noneQualified: false,
      unqualifiedReasons: [],
      shopScore: '',
      rateItems: [],
      rateValues: {},
      unqualifiedOther: '',
      activities: {},
    };
    ACTIVITIES.forEach(function (a) { s.activities[a] = newBlock(); });
    return s;
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

  function rateText(s) {
    var rv = s.rateValues || {};
    return Object.keys(rv).filter(function (k) { return rv[k]; })
      .map(function (k) { return k + ':' + rv[k]; }).join('、');
  }

  /** 把若干份问卷展开成两张表 */
  function flatten(list) {
    var main = [MAIN_HEADER.slice()];
    var detail = [DETAIL_HEADER.slice()];

    (list || []).forEach(function (s) {
      if (!s) return;
      var t = fmtTime(s.createdAt);
      var id = s.id || '';
      var qa = s.qualifiedActivities || [];
      var qaText = A(qa);

      // 无资格：只出一行汇总
      if (!qa.length) {
        main.push([
          id, t, S(s.brand), qaText || '（无有资格活动）', 0, '',
          '', '', '',
          '', '',
          '', '',
          '', '', '', '', '', '', '', '',
          '', '',
          '', '',
          '',
          A(s.unqualifiedReasons), S(s.shopScore), A(s.rateItems), rateText(s), S(s.unqualifiedOther),
          S(s.remark),
        ]);
        return;
      }

      qa.forEach(function (act) {
        var b = (s.activities && s.activities[act]) || {};
        var prods = b.products || [];

        main.push([
          id, t, S(s.brand), qaText, qa.length, act,
          S(b.progress),
          b.progress === '主链接已提报' ? (b.productSource === 'manual' ? '客户自主填写' : '系统直拉消耗Top5商品') : '',
          prods.length || '',
          b.mismatchChecked ? '主品在，但主链接不在' : '', S(b.mismatchNote),
          A(b.noReportReasons), S(b.noReportOther),
          S(b.audit), S(b.auditSlow), A(b.rejectReasons),
          N(b.highPriceSignup), N(b.priceTmall), N(b.priceDouyin), N(b.priceKuaishou), S(b.auditOther),
          S(b.upgradeGoods), A(b.upgradeGoodsWays),
          S(b.upgradeLive), A(b.upgradeLiveWays),
          S(b.note),
          A(s.unqualifiedReasons), S(s.shopScore), A(s.rateItems), rateText(s), S(s.unqualifiedOther),
          S(s.remark),
        ]);

        prods.forEach(function (p, i) {
          var pre = N(p.prePrice);
          var actual = N(p.actualPrice);
          var gap = (typeof pre === 'number' && typeof actual === 'number')
            ? Math.round((pre - actual) * 100) / 100 : '';
          var rate = (typeof pre === 'number' && typeof actual === 'number' && pre > 0)
            ? Math.round(((pre - actual) / pre) * 10000) / 100 : '';
          detail.push([
            id, t, S(s.brand), act,
            p.source || (b.productSource === 'manual' ? '自主填写' : '系统直拉'),
            i + 1, S(p.name), N(p.cost), N(p.refPrice),
            pre, N(p.signupPrice), actual, gap, rate,
          ]);
        });
      });
    });

    return { main: main, detail: detail };
  }

  /** 生成 sheet 定义，直接喂给 HBXlsx.buildXlsx */
  function sheets(list) {
    var f = flatten(list);
    return [
      {
        name: '问卷主表',
        cols: MAIN_HEADER.map(function (h) {
          return { w: Math.min(Math.max(h.length * 2.4, 10), 32) };
        }),
        rows: f.main,
      },
      {
        name: '商品报价明细',
        cols: [12, 19, 16, 18, 12, 6, 52, 14, 16, 14, 20, 16, 18, 12].map(function (w) { return { w: w }; }),
        rows: f.detail,
      },
    ];
  }

  return {
    ACTIVITY_DEFS: ACTIVITY_DEFS,
    ACTIVITIES: ACTIVITIES,
    ACTIVITY_KEY: ACTIVITY_KEY,
    ACTIVITY_DESC: ACTIVITY_DESC,
    RATE_ITEMS: RATE_ITEMS,
    UNQUALIFIED_REASONS: UNQUALIFIED_REASONS,
    NO_REPORT_REASONS: NO_REPORT_REASONS,
    REJECT_REASONS: REJECT_REASONS,
    GOODS_WAYS: GOODS_WAYS,
    LIVE_WAYS: LIVE_WAYS,
    MAIN_HEADER: MAIN_HEADER,
    DETAIL_HEADER: DETAIL_HEADER,
    newBlock: newBlock,
    newState: newState,
    flatten: flatten,
    sheets: sheets,
    fmtTime: fmtTime,
  };
}));
