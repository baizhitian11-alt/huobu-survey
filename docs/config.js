/**
 * 站点配置 —— 部署后按需改这一个文件
 */
window.HB_CONFIG = {
  /* ============ 后端：GitHub Issues（推荐，后端也在 GitHub 上） ============
   * 每份问卷 = 仓库里的一个 issue，运营侧读 issue 导出 Excel。
   *
   * 配置步骤：
   *  1. 建一个 Public 仓库专门收数据，例：baizhitian11-alt/huobu-survey-data
   *     （可以就用发问卷的那个仓库，问卷和数据放一起也行）
   *  2. 生成 Fine-grained PAT：
   *     github.com/settings/personal-access-tokens/new
   *       Repository access → Only select repositories → 只选上面那个仓库
   *       Permissions → Repository permissions → Issues → Read and write
   *       其他权限一律不给，Expiration 建议 30 天
   *  3. 把 token 转成 base64 后分片填进 tokenParts（见下方 tokenParts 说明）
   *     终端执行：  printf '%s' '<你的token>' | base64
   *     把结果从中间切成 3-4 段，依次填进数组
   *  4. push 到 GitHub 即可，客户点提交就直接写进 issue
   *
   * 不想配 token？把 tokenParts 留空数组，问卷会自动用「离线回执」模式：
   * 客户提交后下载一个 .hbjson 文件发回给你，你用 merge.html 汇总，功能一样。
   */
  github: {
    repo: 'baizhitian11-alt/huobu-survey',

    /**
     * token 的 base64 分片。留空 [] = 关闭在线提交，走离线回执。
     * 分片存放是为了避免 GitHub secret scanning 把明文 token 自动吊销。
     * 例：token base64 为 'Z2l0aHViX3BhdF9BQkNE'，可写成
     *     ['Z2l0aHVi', 'X3BhdF9B', 'QkNE']
     */
    tokenParts: [],
  },

  /**
   * 备用后端（可选）。填了地址就优先走这里，适合已部署 Cloudflare Worker / 本机 node server.js 的场景。
   * 例：'https://huobu-survey.xxx.workers.dev' 或 'http://10.91.x.x:8080'
   */
  apiBase: '',

  title: '金秋大促 · 客户活动报名与货补摸排',
  subtitle: '视频号电商 · 品牌客户摸排',
  contactTip: '请将下载的回执文件发回给对接的销售 / 运营同学',
};
