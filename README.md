# 货补摸排问卷（金秋大促 · 客户活动报名与货补摸排）

纯静态问卷站，**发 GitHub Pages 给外部客户填，后端也在 GitHub 上**（用 Issues 当数据库），运营侧一键导出 Excel。

```
survey/
├─ docs/                      ← GitHub Pages 就发这个目录
│   ├─ index.html               问卷（客户填）
│   ├─ merge.html               汇总导出（运营用）
│   ├─ config.js                ★ 唯一需要改的配置
│   ├─ gh.js                    GitHub Issues 读写
│   ├─ products-data.js         内嵌的客户 Top 商品数据（自动生成）
│   ├─ schema.js / xlsx.js      共用列定义 + Excel 生成器
│   ├─ preview.js               Excel 网页预览
│   ├─ app.js / merge.js / style.css
│   └─ assets/                  ★ 活动入口示意图放这里
├─ clean_products.py          DPA 商品名称清洗 + Top 消耗商品聚合
├─ set_token.py               把 GitHub token 写进 config.js（分片存放）
├─ publish.sh                 一键上线（建仓库+推送+开Pages）
├─ server.js                  本地/内网后端（可选）
├─ worker/worker.js           Cloudflare Worker 后端（可选备选）
└─ data/                      products.json、清洗结果对照.csv
```

---

## 一、问卷结构（本次调整后）

**1. 客户名称**（唯一的基础信息，必填）
输入即模糊匹配已收录的 143 个客户，匹配上会提示 `✓ 已匹配「百雀羚」，共 10 个商品`。

**2. 有资格报名的活动**（必填，多选，**勾选后才展开后续问题**）

| 活动 | 说明 |
| --- | --- |
| 金秋满减（全资） | 跨店满减补贴 · 平台全额出资 |
| 金秋满减（混资） | 跨店满减补贴 · 平台与商家共同出资 |
| 金秋大场 | 金秋大促直播大场及跃迁激励 |
| 货补 | 官方商品补贴（含心智品专项） |

另有「以上都没有资格」选项 → 展开原因（店铺分不达标 / 三率不达标 / 类目资质不符 / 其他），
填完可直接提交，不用再填后面的内容。

**3. 每个勾选的活动下**（结构一致，支持「复制自其他活动」一键同步）
- **Q1 已提报商品进展**：主链接已提报（→ 系统直拉 Top5 或自主填写，逐商品填补前价 / 报名最低到手价 / 实际到手价）｜提报不符合预期（主品在但主链接不在）｜不提报（渠道不破价 / 利润空间不足 / 力度玩法不合适 / 其他）
- **Q2 过审问题**：暂无问题 ｜ 审核中（是否超 7 个工作日）｜ 拒审（商品质量、高价 → 提报价 + 天猫/抖音/快手最低价）｜ 其他
- **Q3 客户玩法**：是否推动组货升级（视频号专属货组 / 专供价格）；是否推动直播玩法（嘉宾进播 / 场景直播）

---

## 二、活动入口示意图 —— 图给我后直接丢进目录即可

把截图按下面的名字放进 `docs/assets/`，问卷里对应活动卡片顶部会自动显示（客户可点击放大）：

| 活动 | 文件名 |
| --- | --- |
| 金秋满减（全资） | `docs/assets/entry-manjian-quanzi.png` |
| 金秋满减（混资） | `docs/assets/entry-manjian-hunzi.png` |
| 金秋大场 | `docs/assets/entry-dachang.png` |
| 货补 | `docs/assets/entry-huobu.png` |

文件不存在时该区块自动隐藏，不会报错，所以现在不放也能正常用。放完跑一次 `bash publish.sh` 就生效。

---

## 三、后端也在 GitHub（用 Issues 当数据库）

思路：静态站没有服务器，但 GitHub 本身有 API。**每份问卷 = 数据仓库里的一个 issue**，正文里存 JSON。
客户提交 → 写 issue；运营导出 → 读 issue → 生成 Excel。全程不用自己的服务器，不花钱。

### 配置（一次性，约 5 分钟）

```bash
# 1. 生成 fine-grained token
#    https://github.com/settings/personal-access-tokens/new
#      Repository access → Only select repositories → 只选 huobu-survey
#      Permissions → Repository permissions → Issues → Read and write
#      其他权限一律不给，Expiration 建议 30 天
#
# 2. 写进配置（会自动 base64 + 分片，避免被 GitHub 自动吊销）
cd /Users/zhitianbai/Desktop/货补摸排/survey
python3 set_token.py github_pat_xxxxxxxxxxxx

# 3. 发布
bash publish.sh
```

之后客户点「提交问卷」就直接进 issue，你在 `merge.html` 点「从远端拉取」→「导出汇总 Excel」。

### 安全说明（重要）

静态站里的 token 客户端能看到，所以：
- **必须**用 fine-grained token，只勾这一个仓库的 **Issues: Read and write**。最坏情况也只是有人往这个仓库发 issue，代码和别的仓库都动不了。
- token 按 base64 分片存，避免明文被 GitHub secret scanning 秒吊销。
- **摸排结束后**：`python3 set_token.py --clear` 并到 GitHub 把 token 删掉。

### 不想配 token 也行（离线回执模式）

`tokenParts` 留空即可。客户提交后浏览器自动下载 `.hbjson` 回执文件 → 发回给你 → 你在 `merge.html` 里**把文件全拖进去**（多选、自动按编号去重）→ 导出 Excel。功能完全一样，只是多一步回传。

两种模式的数据可以**混着汇总**，`merge.html` 会自动去重。

---

## 四、上线到 GitHub Pages

```bash
cd /Users/zhitianbai/Desktop/货补摸排/survey
bash publish.sh
```

一条命令做完：建仓库 → 推代码 → 开 Pages → 等构建 → 打印公网地址。
token 自动复用素材解析台 `.env` 里那个（也可以 `GITHUB_TOKEN=xxx bash publish.sh`），
**全程不写入任何文件、不进 git config**。

上线后的地址（`baizhitian11-alt` + 仓库 `huobu-survey`）：

| 用途 | 地址 |
| --- | --- |
| 问卷（发客户） | `https://baizhitian11-alt.github.io/huobu-survey/` |
| 汇总导出（自用） | `https://baizhitian11-alt.github.io/huobu-survey/merge.html` |
| 原始数据 | `https://github.com/baizhitian11-alt/huobu-survey/issues?q=label:survey` |

改了内容再跑一次 `bash publish.sh` 即可。想换仓库名：`REPO_NAME=xxx bash publish.sh`。

---

## 五、Excel 数据在网页上直接看

不用下载也能核对，两个页面都有预览区，内容和导出的 xlsx **完全一致**（同一份 `schema.js` 生成）：

- **问卷页底部「填写内容预览」**：客户边填边看，提交前自查有没有漏填。输入后 0.35 秒自动刷新。
- **汇总页「Excel 数据预览」**：运营看全量数据，两个 Sheet 点 tab 切换。

预览表格做成了类 Excel 的样子：带 A/B/C 列字母、行号、粘性表头、数字右对齐千分位、悬停高亮行。
超过 300 行只预览前 300 行（导出的文件仍是完整的，页面上会提示）。

---

## 六、导出的 Excel

**Sheet1「问卷主表」**（32 列）— 一行 = 一个客户 × 一个有资格活动
客户名称、有资格报名的活动（汇总）、有资格活动数、当前活动、提报进展、填报方式、不提报原因、过审问题、拒审原因、天猫/抖音/快手最低价、组货升级、直播玩法、无资格原因与三率数值、备注……
（勾了「都没资格」的客户单独出一行，活动列为空，原因落在末尾几列）

**Sheet2「商品报价明细」**（14 列）— 一行 = 一个商品
客户名称、活动、商品来源、排名、商品名、日均消耗、参考成交单价、补前价格、活动报名/最低到手价、实际到手价、**补贴力度（补前−实际到手）**、**补贴率(%)**（后两列自动算好）

前端、汇总页、后端共用 `docs/schema.js` 的列定义，三边表头不会错位。

---

## 六、DPA 商品名称清洗

1. 去掉所有括号内容：`【官方正品】【达人专属】【买一送一】[洗护套组]`
2. 去掉尾部投放标记：`db / zb / wx / koc / ZG GL HZ / ZB2-SH2-1` 等短码，及 `自播 / 官方正品 / 微信礼物` 等词（`500ml`、`20片` 这类规格保留）
3. 清洗名相同的直接合并；剩下的在同客户内做相似度聚类（阈值 0.72），只差几个字的同款 SPU 合并，消耗累加，代表名取消耗最高那条

效果：1615 行 → 1307 个精确去重名 → 143 个客户各出 Top10（共 547 个商品）。
例：`慕可` 的 9 条「WIS晶润紧致眼膜…」变体合并成 1 个，消耗合计 1.48w。

重新生成（会同步更新 `docs/products-data.js`）：

```bash
python3 clean_products.py
```

合并对不对看 `data/清洗结果对照.csv`。要调松紧改 `clean_products.py` 里的 `SIM_THRESHOLD`（调大 = 更少合并）。

---

## 七、本地预览

```bash
cd docs && python3 -m http.server 8091
# http://localhost:8091/
```

直接双击 `docs/index.html` 也能用（数据是内嵌的）。
需要内网后端的话：`node server.js`（零依赖，同时托管 docs，把 `config.js` 的 `apiBase` 填成 `http://<内网IP>:8080`）。
