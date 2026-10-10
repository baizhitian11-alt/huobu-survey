/**
 * 双11鹅选美妆节 · 模块配置
 *
 * ╔══════════════════════════════════════════════════════════╗
 * ║  TODO：上半部分的题目是「占位文案」，等企微文档正文确认后 ║
 * ║  只需要改这个文件里的 questions 数组，页面自动更新。      ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * 题目支持的类型 type：
 *   text     单行输入
 *   textarea 多行输入
 *   single   单选（options 数组）
 *   multi    多选（options 数组）
 * 通用字段：
 *   required   是否必填（默认 true）
 *   allowOther 单选/多选时是否带「其他（可填）」
 *   showWhen   条件显示，如 { key:'join', equals:'参加' } 表示上一题选「参加」才显示
 *   hint       题目下方的灰色小字说明
 */
window.HB_EXUAN = {

  activityName: '双11鹅选美妆节',
  label: 'exuan',            // GitHub issue 标签，不要改

  /* ── 上半部分截止时间 ──────────────────────────────────
   * 填 ISO 时间字符串，例如 '2026-10-15T23:59:59+08:00'
   * 留空 '' 则不显示倒计时。
   * 注意：按需求「不卡死」—— 过了时间仍可提交，但会标记为「逾期提交」。
   */
  deadline: '',

  heroDesc: '请先在下方完成活动报名（上半部分）；扶持凭证可随时在页面底部上传，凭证审核通过后给予进一步扶持。',

  /* ── 上半部分：固定问卷（占位文案，待企微文档正文替换）── */
  questions: [
    {
      key: 'join',
      title: '是否参加「双11鹅选美妆节」？',
      type: 'single',
      options: ['参加', '不参加'],
      required: true,
      hint: '',
    },
    {
      key: 'joinMode',                                    /* TODO: 按文档上半部分替换 */
      title: '意向参与形式',
      type: 'multi',
      options: ['直播大场', '日常店播', '短视频带货', '货架场'],
      allowOther: true,
      required: true,
      showWhen: { key: 'join', equals: '参加' },
      hint: '',
    },
    {
      key: 'mainProducts',                                /* TODO: 按文档上半部分替换 */
      title: '主推商品 / 货盘（每行一个）',
      type: 'textarea',
      required: true,
      showWhen: { key: 'join', equals: '参加' },
      hint: '格式建议：商品名 + 到手价，如「xxx面霜 199元」',
    },
    {
      key: 'expectGmv',                                   /* TODO: 按文档上半部分替换 */
      title: '活动期间预期 GMV',
      type: 'single',
      options: ['10万以下', '10-50万', '50-100万', '100万以上'],
      required: false,
      showWhen: { key: 'join', equals: '参加' },
      hint: '',
    },
    {
      key: 'supportNeed',                                 /* TODO: 按文档上半部分替换 */
      title: '希望获得的扶持 / 资源',
      type: 'multi',
      options: ['流量扶持', '货补支持', '达人撮合', '运营陪跑'],
      allowOther: true,
      required: false,
      showWhen: { key: 'join', equals: '参加' },
      hint: '',
    },
  ],

  /* ── 下半部分：凭证模块 ────────────────────────────────
   * 一个模块 = 一张凭证，各自独立上传、独立审核。
   * TODO: 模块名称/说明是占位文案，按企微文档下半部分替换。
   * 每个模块字段：
   *   key      唯一标识（英文，不要改已有的，改了会跟历史数据对不上）
   *   name     模块名称（给客户看的）
   *   desc     模块说明：要传什么、怎么才算合格
   *   required 是否必传（仅作提示，不强制——凭证随时可传）
   */
  voucher: {
    title: '扶持凭证上传',
    desc: '每个模块单独上传对应的一张凭证，审核通过后给予进一步扶持。支持截图图片（自动压缩）和 PDF，单个文件不超过 5MB，随时可传、可重新上传覆盖。',
    accept: '.png,.jpg,.jpeg,.webp,.gif,.pdf',
    maxMB: 5,
    modules: [
      {
        key: 'signup',
        name: '凭证① 活动报名成功截图',
        desc: 'TODO占位：按文档要求说明，如「报名页显示报名成功的完整截图，需露出店铺名」',
        required: true,
      },
      {
        key: 'live',
        name: '凭证② 直播场次截图',
        desc: 'TODO占位：按文档要求说明',
        required: true,
      },
      {
        key: 'data',
        name: '凭证③ 数据截图',
        desc: 'TODO占位：按文档要求说明',
        required: false,
      },
    ],
  },
};
