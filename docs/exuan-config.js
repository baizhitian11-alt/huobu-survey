/**
 * 腾讯营销 × 鹅选美妆节 · 双11大促招募令 —— 模块配置
 * 内容来源：企微文档《腾讯营销 × 鹅选美妆节》（w3_AWMAzwa2AM0CNbzB52HJXRBmXN6As）
 *
 * 改题目 / 改凭证要求，只需要改这个文件。
 *
 * 题目类型 type：
 *   text     单行文本        number   数字（可带 unit 单位）
 *   date     日期（可带 min/max）    dates   多个日期（可带 min/max）
 *   single   单选            multi    多选
 * options 可以是字符串，也可以是 { label, desc, url }（url 会显示为「介绍」链接）
 * 通用字段：required（默认 true）、hint、showWhen: { key, equals }
 */
window.HB_EXUAN = {

  activityName: '腾讯营销 × 鹅选美妆节',
  logo: 'assets/exuan/logo.jpg',
  subTitle: '双11大促招募令',
  label: 'exuan',            // GitHub issue 标签，不要改

  /* ── 活动说明（页面顶部） ── */
  intro: {
    time: '活动时间：10.12 - 11.15',
    rights: [
      { name: '基础腾飞权益', desc: '小店全资/混资补贴 & 分享券 + 广告腾飞扶持 + 大场激励 + 广告审核放宽' },
      { name: '加码腾飞权益', desc: '落地起量建议，并上传凭证等待官方校验，排位赛瓜分加码激励' },
    ],
  },

  /* ── 上半部分：盘直播，报规划，获基础腾飞 ──
   * 截止 10.13，全部必填。按需求「不卡死」：过了时间仍可提交，标记为「逾期提交」。
   */
  part1: {
    title: '一、盘直播，报规划，获基础腾飞！',
    timeTip: '填写时间：10.13日前【全部为必填】',
  },
  deadline: '2026-10-13T23:59:59+08:00',

  questions: [
    // 1、品牌名称 → 页面上的「品牌名称」输入框（带联想），不在此数组里
    { key: 'sales', title: '对接腾讯销售', type: 'text', placeholder: '销售姓名' },
    { key: 'dailyCost', title: '日耗预估', type: 'number', unit: '万元', placeholder: '如：5' },
    { key: 'growth', title: '预估涨幅', type: 'number', unit: '%', placeholder: '如：30', hint: '相对日常的预估涨幅，填 30 即 +30%' },
    {
      key: 'bigLiveDate', title: '双十一大场日期', type: 'dates',
      min: '2026-10-12', max: '2026-11-15',
      hint: '10.12-11.15 期间，可选多个日期；核心填预估大场日，无需填周期',
    },
    { key: 'tengfeiId', title: '腾飞账户ID', type: 'text', placeholder: '广告账户 ID' },
    {
      key: 'manjianCoupon', title: '是否已提报微信小店「双11满减券」活动',
      type: 'single', options: ['是', '否'],
    },
    {
      key: 'manjianType', title: '满减为全资 or 混资？',
      type: 'single', options: ['全资', '混资'],
      hint: '全资 -「好店」标识商家；混资 - 非好店商家，1:1 出资',
    },
    {
      key: 'bigLiveIncentive', title: '是否已提报微信小店「直播大场及跃迁激励」活动',
      type: 'single', options: ['是', '否'],
    },
    {
      key: 'shareCoupon', title: '是否已提报微信小店「主播分享券」活动',
      type: 'single', options: ['是', '否'],
    },
    {
      key: 'star', title: '是否有明星素材',
      type: 'single', options: ['≥3个明星', '2个明星', '1个明星', '暂无明星但在谈', '无明星计划'],
    },
    {
      key: 'anchor', title: '节点主播形式', type: 'multi',
      options: ['明星进播', '总裁进播', 'IP主播进播', 'TOP店播主播', '普通店播主播'],
      hint: '可多选',
    },
    {
      key: 'goods', title: '节点货盘是否有变化', type: 'multi',
      options: ['日常价+节点限时加赠品', '节点特供礼盒or套装', '双SKU囤货装（日常价SKU+囤货装SKU）', '日常机制无调整'],
      hint: '可多选',
    },
    {
      key: 'scene', title: '节点直播场景创新', type: 'multi',
      options: ['展会', '仓库', '商场柜台', '户外', '照日播暂无改变'],
      hint: '可多选',
    },
    {
      key: 'expo',
      title: '是否有意愿到场参加以下展会直播（腾讯出资展位，邀请商家到展直播，要求日消耗3w+）',
      type: 'multi',
      options: [
        { label: '10.29-10.31，杭州，电商零售博览会', desc: '2026中国(杭州)电商新零售品牌博览会', url: 'https://mp.weixin.qq.com/s/3_yqUvM7idvzMst08HtmOQ' },
        { label: '11.4-11.8，广州，国际美妆周', desc: '第四届广州国际美妆周官宣，向世界发出“美丽邀约”！', url: 'https://mp.weixin.qq.com/s/0bhVtkwtiXuCUCbjMPQokQ' },
        { label: '11.10-11.12，上海，华礼展', desc: '兼顾体面与潮流！11月10-12日来上海华礼展，承包你全年终礼赠~', url: 'https://mp.weixin.qq.com/s/MLEvC5NoL9lM3l-z1zZ-iA' },
        '暂无参展意愿',
      ],
      hint: '可多选；点「介绍」查看展会详情',
    },
    { key: 'decoration', title: '直播间是否有主题装修', type: 'single', options: ['是', '否'] },
    { key: 'bidUp', title: '是否接受出价提高', type: 'single', options: ['是', '否'] },
  ],

  /* ── 下半部分：排位赛，传凭证，领加码激励 ──
   * 每个排位事项一行，行内自带上传入口，可多张、随时传。
   * showSticker：在标准说明下展示贴片预览图 + 下载链接
   * max：数量上限提示（如大场力最多 6 场），仅提示不强制
   * extraField：该事项需附带填写的信息（如素材力的上线账户ID）
   * noUpload：无需上传，官方校验（只展示标准）
   * examples：示例图（docs/assets/exuan/ 下）
   */
  voucher: {
    title: '二、排位赛，传凭证，领加码激励！',
    timeTip: '填写时间：11.4日前【选填，支持周期内上传】',
    totalScore: '美力值【总30分】',
    rankTip: '周榜单更新：每周三更新榜单排名，时间：10.21、10.28、11.4、11.11',
    accept: '.png,.jpg,.jpeg,.webp,.gif,.heic,.pdf',
    maxMB: 25,            // 单个文件上限（图片会先在浏览器压缩，原图再大也能传）

    /* 双11鹅选美妆节直播间贴片：在「张贴贴片」的事项下展示预览图 + 下载链接 */
    sticker: {
      title: '双11鹅选美妆节贴片',
      previews: ['assets/exuan/logo.jpg', 'assets/exuan/sticker-white.jpg'],
      download: { text: '下载贴片（11.11美妆节直播间贴片 · 微盘）', url: 'https://drive.weixin.qq.com/s?k=AJEAIQdfAAohv75xy4' },
    },
    modules: [
      {
        key: 'goods',
        name: '商品力',
        score: '0-2分',
        standard: ['提报微信小店双11补贴：微信小店后台 - 营销中心 - 平台活动'],
        uploadTip: '上传「提报补贴成功」截图',
        examples: ['assets/exuan/goods-subsidy.jpg'],
      },
      {
        key: 'bigLive',
        name: '大场力',
        score: '0-6分',
        standard: ['① 人 / 货 / 场任一维度升级', '② 张贴双11鹅选美妆节贴片'],
        showSticker: true,
        uploadTip: '上传「大场」截图（最多 6 场）',
        max: 6,
        examples: ['assets/exuan/live-upgrade.jpg'],
      },
      {
        key: 'material',
        name: '素材力',
        score: '0-8分',
        standard: ['四类高eco内容素材各上线 20 条+，提升3秒完播率 + 平均播放时长'],
        uploadTip: '上传「高eco素材」截图，并填写上线账户ID',
        extraField: { key: 'accountId', label: '素材上线账户ID', placeholder: '多个用逗号分隔', required: true },
        examples: ['assets/exuan/eco-material.jpg'],
      },
      {
        key: 'ads',
        name: '投放力',
        score: '0-10分',
        standard: [
          '全店托管投放双11补贴商品 > 5 个',
          'ADQ 投放主页原生素材 > 200 条',
          '潜客优投广告占比 > 30%',
          '创意优投广告占比 > 10%',
          '非视频号版位占比 > 30%',
        ],
        noUpload: true,
        uploadTip: '无需上传，官方校验',
        examples: [
          'assets/exuan/ads-tuoguan.jpg',
          'assets/exuan/ads-adq-native.jpg',
          'assets/exuan/ads-qianke.jpg',
          'assets/exuan/ads-chuangyi.jpg',
        ],
      },
      {
        key: 'local',
        name: '本土力',
        score: '0-2分',
        standard: ['① 视频号单开直播间', '② 张贴双11鹅选美妆节贴片'],
        showSticker: true,
        uploadTip: '上传「单开直播间」截图',
        examples: [],
      },
      {
        key: 'biz',
        name: '经营力',
        score: '0-2分',
        standard: ['成功入驻经营号'],
        uploadTip: '上传「经营号入驻成功界面」截图',
        guide: {
          text: '对客：腾讯营销【经营户】入驻指南',
          url: 'https://doc.weixin.qq.com/doc/w3_ACoA4QbEACcCNa3hYMLM1RJSMbyZl?scode=AJEAIQdfAAoPrbU4k3AR0AEAZ-ADE',
        },
        examples: ['assets/exuan/jingying.jpg'],
      },
    ],
  },
};
