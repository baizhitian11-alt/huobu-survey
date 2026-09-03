# -*- coding: utf-8 -*-
"""
DPA 商品名称清洗 + 客户 Top 消耗商品聚合

输入: ../消耗 by 商品 8 月.csv   （可用 SRC_FILE 环境变量指定其他文件）
输出:
  data/products.json         问卷网站用的完整数据（含原始名对照）
  docs/products-data.js      内嵌给前端的精简版
  data/清洗结果对照.csv       人工复核：每个聚合后的商品合并了哪些原始 DPA 名称

清洗逻辑:
  1. 去掉【】[]（）() 等括号内的营销前缀（如【官方正品】【达人专属】【买一送一】）
  2. 去掉尾部的投放标记（db / zb / wx / koc / ZG GL HZ / ZB2-SH2-1 等短码）
     以及 自播 / 直播 / 官方正品 / 微信礼物 等通用词
  3. 完全相同的清洗名直接合并
  4. 剩余的用相似度聚类（同客户内），把只差几个字的同一款 SPU 合并
  5. 合并后按消耗降序，取每个客户 Top N

列名自动识别：兼容"消耗(万元)"与旧版"日均消耗(元)"两种表头。
"""

import csv
import json
import os
import re
from difflib import SequenceMatcher

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("SRC_FILE") or os.path.join(BASE, "..", "消耗 by 商品 8 月.csv")
OUT_DIR = os.path.join(BASE, "data")

TOP_N = 10            # 每个客户保留多少候选商品（问卷默认展示前 5）
SIM_THRESHOLD = 0.72  # 相似度合并阈值

# ---- 列名候选（按优先级匹配，兼容不同版本的导出表） ----
COL_BRAND = ["客户简称", "客户名称", "品牌", "广告主"]
COL_NAME = ["DPA商品名称", "商品名称", "商品名"]
COL_COST = ["消耗(万元)", "消耗（万元）", "日均消耗(元)", "消耗(元)", "消耗"]
COL_PRICE = ["下单单价(元)", "下单单价", "成交单价(元)", "客单价(元)"]
COL_ROI = ["下单ROI", "下单roi", "ROI"]
COL_GMV = ["日均下单金额(元)", "下单金额(元)", "下单金额(万元)"]

# 括号内容（中英文括号）
BRACKET_RE = re.compile(r"[【\[（(][^】\]）)]*[】\]）)]")
# 尾部投放标记短码
TAIL_CODE_RE = re.compile(r"[A-Za-z0-9]{1,4}$")
TAIL_WORDS = [
    "官方正品", "官方旗舰", "旗舰正品", "正品保障", "自播", "直播", "专拍", "拍1",
    "包邮", "正品", "新品上市", "新品尝鲜", "新品上新", "尝鲜装", "体验装",
    "微信礼物", "送女友", "送妈妈", "送亲朋好友", "可试用可体验",
]
# 尾部空格分隔的投放短码（如 "... ZG GL HZ"、"... db"、"... ZGDH"）
TAIL_SPACE_CODE_RE = re.compile(r"\s+[A-Za-z0-9]{1,5}$")
# 尾部紧贴中文的编码（如 "...美颜膏ZB2-SH2-1"、"...精华棒ZB1JYB4"）
TAIL_MIX_CODE_RE = re.compile(r"[-—_]?[A-Za-z][A-Za-z0-9\-]{0,11}$")
# 规格/数量信息（保留，用于区分不同规格的 SPU）
NORMALIZE_RE = re.compile(r"[^0-9A-Za-z\u4e00-\u9fff]")

# 品类互斥词：分属不同组的商品不允许合并，避免"面膜"和"精华液"被并成一条。
# 组内是同义/近义写法，可安全视作同类。
CATEGORY_GROUPS = [
    ("面膜", "膜贴", "敷膜", "膜布"),
    ("次抛", "精华液", "精华油", "安瓶"),
    ("精华棒", "固态精华", "美颜膏"),
    ("喷雾", "冰喷", "爽肤水", "柔肤水", "化妆水"),
    ("面霜", "乳霜", "晚霜", "日霜"),
    ("乳液", "身体乳"),
    ("眼霜", "眼膜", "眼部"),
    ("洁面", "洗面奶", "卸妆", "洗颜"),
    ("洗发水", "护发素", "发膜", "洗发露"),
    ("沐浴露", "身体乳", "护手霜"),
    ("防晒", "隔离"),
    ("粉底液", "气垫", "散粉", "粉饼", "定妆"),
    ("口红", "唇釉", "唇膏", "唇泥"),
    ("眼影", "眼线", "睫毛", "眉笔"),
    ("套装", "礼盒", "套组", "3件套", "水乳"),
]


def category_tags(key: str):
    """返回该商品名命中的品类组下标集合"""
    tags = set()
    for i, group in enumerate(CATEGORY_GROUPS):
        for w in group:
            if w in key:
                tags.add(i)
                break
    return tags


def category_conflict(a: str, b: str) -> bool:
    """两个商品名是否属于互斥品类（都能识别品类且完全不重叠）"""
    ta, tb = category_tags(a), category_tags(b)
    if not ta or not tb:
        return False
    return not (ta & tb)


def pick_col(fieldnames, candidates):
    """在表头里找第一个匹配的列名"""
    fn = [f.strip() for f in (fieldnames or [])]
    for c in candidates:
        if c in fn:
            return c
    # 退化：模糊包含
    for c in candidates:
        for f in fn:
            if c.replace("(", "（").replace(")", "）") == f or c in f:
                return f
    return None


def to_float(v):
    if v is None:
        return 0.0
    v = str(v).strip()
    if v in ("", "~", "-", "空", "null", "None"):
        return 0.0
    try:
        return float(v)
    except ValueError:
        return 0.0



def clean_name(raw: str) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    # 反复去括号（存在嵌套/多组的情况）
    for _ in range(4):
        new = BRACKET_RE.sub(" ", s)
        if new == s:
            break
        s = new
    s = re.sub(r"\s+", " ", s).strip()

    # 去掉尾部通用词 + 短码，循环去，直到稳定
    for _ in range(8):
        before = s
        for w in TAIL_WORDS:
            if s.endswith(w) and len(s) > len(w) + 3:
                s = s[: -len(w)].strip()
        m2 = TAIL_SPACE_CODE_RE.search(s)
        if m2 and m2.start() > 6:
            s = s[: m2.start()].strip()
        m = TAIL_CODE_RE.search(s)
        if m and len(s) - len(m.group()) > 6:
            # 仅当短码前面是中文时才认为是投放标记（避免砍掉 "500ml" "20片" "2.4g"）
            prev = s[m.start() - 1] if m.start() > 0 else ""
            if "\u4e00" <= prev <= "\u9fff":
                s = s[: m.start()].strip()
        m3 = TAIL_MIX_CODE_RE.search(s)
        if m3 and m3.start() > 6:
            prev = s[m3.start() - 1] if m3.start() > 0 else ""
            if "\u4e00" <= prev <= "\u9fff":
                s = s[: m3.start()].strip()
        if s == before:
            break
    return re.sub(r"\s+", " ", s).strip()


def norm_key(s: str) -> str:
    return NORMALIZE_RE.sub("", s).lower()


def similar(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a in b or b in a:
        short, long = (a, b) if len(a) <= len(b) else (b, a)
        return max(0.9, len(short) / len(long))
    return SequenceMatcher(None, a, b).ratio()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(SRC, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fields = reader.fieldnames

    c_brand = pick_col(fields, COL_BRAND)
    c_name = pick_col(fields, COL_NAME)
    c_cost = pick_col(fields, COL_COST)
    c_price = pick_col(fields, COL_PRICE)
    c_roi = pick_col(fields, COL_ROI)
    c_gmv = pick_col(fields, COL_GMV)

    if not (c_brand and c_name and c_cost):
        raise SystemExit(
            "× 表头识别失败。需要客户、商品名、消耗三列。\n  实际表头: %s" % fields
        )

    # 消耗单位：表头带"万元"就是万元，否则按元处理
    cost_unit = "万元" if "万" in c_cost else "元"
    cost_label = "消耗(%s)" % cost_unit

    print("· 数据源: %s" % os.path.basename(SRC))
    print("· 列映射: 客户=%s | 商品=%s | 消耗=%s(%s) | 单价=%s | ROI=%s"
          % (c_brand, c_name, c_cost, cost_unit, c_price or "-", c_roi or "-"))

    # ---------- 第一轮：精确清洗名合并 ----------
    brands = {}
    skipped_empty = 0
    for r in rows:
        brand = (r.get(c_brand) or "").strip()
        raw = (r.get(c_name) or "").strip()
        if not brand or brand in ("整体", "合计", "总计"):
            continue
        if raw in ("", "空", "~", "-"):
            skipped_empty += 1
            continue

        cost = to_float(r.get(c_cost))
        price = to_float(r.get(c_price)) if c_price else 0.0
        roi = to_float(r.get(c_roi)) if c_roi else 0.0
        gmv = to_float(r.get(c_gmv)) if c_gmv else (cost * roi if roi > 0 else 0.0)

        name = clean_name(raw)
        if not name:
            name = raw
        key = norm_key(name)
        if not key:
            continue

        b = brands.setdefault(brand, {})
        item = b.setdefault(key, {
            "name": name, "cost": 0.0, "gmv": 0.0,
            "price_num": 0.0, "price_den": 0.0, "roi_num": 0.0,
            "raws": [], "best_cost": -1.0,
        })
        item["cost"] += cost
        item["gmv"] += gmv
        if price > 0:
            item["price_num"] += price * max(cost, 1e-9)
            item["price_den"] += max(cost, 1e-9)
        if roi > 0:
            item["roi_num"] += roi * max(cost, 1e-9)
        item["raws"].append(raw)
        # 代表名取消耗最高的那条
        if cost > item["best_cost"]:
            item["best_cost"] = cost
            item["name"] = name

    # ---------- 第二轮：同客户内相似度聚类 ----------
    result = {}
    review_rows = []

    for brand, items in brands.items():
        lst = sorted(items.items(), key=lambda kv: -kv[1]["cost"])
        clusters = []  # [{keys:[], data:{}}]
        for key, data in lst:
            hit = None
            for c in clusters:
                if category_conflict(key, c["key"]):
                    continue  # 品类不同，不合并（如"面膜" vs "精华液"）
                if similar(key, c["key"]) >= SIM_THRESHOLD:
                    hit = c
                    break
            if hit is None:
                clusters.append({
                    "key": key,
                    "name": data["name"],
                    "cost": data["cost"],
                    "gmv": data["gmv"],
                    "price_num": data["price_num"],
                    "price_den": data["price_den"],
                    "roi_num": data["roi_num"],
                    "raws": list(data["raws"]),
                })
            else:
                hit["cost"] += data["cost"]
                hit["gmv"] += data["gmv"]
                hit["price_num"] += data["price_num"]
                hit["price_den"] += data["price_den"]
                hit["roi_num"] += data["roi_num"]
                hit["raws"].extend(data["raws"])

        clusters.sort(key=lambda c: -c["cost"])
        out = []
        for idx, c in enumerate(clusters[:TOP_N], 1):
            avg_price = round(c["price_num"] / c["price_den"], 2) if c["price_den"] else 0
            roi = round(c["roi_num"] / c["price_den"], 2) if c["price_den"] else 0
            # 消耗保留合适精度：万元保留 2 位，元保留整数
            cost_v = round(c["cost"], 2) if cost_unit == "万元" else round(c["cost"], 0)
            out.append({
                "rank": idx,
                "name": c["name"],
                "cost": cost_v,
                "gmv": round(c["gmv"], 2),
                "avgPrice": avg_price,
                "roi": roi,
                "mergedCount": len(c["raws"]),
                "rawNames": c["raws"][:30],
            })
            review_rows.append([
                brand, idx, c["name"], cost_v, avg_price, len(c["raws"]),
                " || ".join(c["raws"][:30]),
            ])
        if out:
            result[brand] = out

    # 客户按总消耗排序，方便下拉框
    brand_order = sorted(result.keys(), key=lambda b: -sum(i["cost"] for i in result[b]))

    meta = {
        "generatedFrom": os.path.basename(SRC),
        "costUnit": cost_unit,
        "costLabel": cost_label,
        "topN": TOP_N,
    }

    payload = dict(meta, brands=brand_order, products=result)

    # 精简版：给前端用，去掉 rawNames 以减小体积
    slim = dict(meta, brands=brand_order, products={
        b: [{k: v for k, v in p.items() if k != "rawNames"} for p in items]
        for b, items in result.items()
    })

    with open(os.path.join(OUT_DIR, "products.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    # 内嵌为 JS：GitHub Pages / 本地直接双击打开都能用，不依赖 fetch
    js = "window.HB_PRODUCTS = " + json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + ";\n"
    target = os.path.join(BASE, "docs", "products-data.js")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w", encoding="utf-8") as f:
        f.write(js)

    with open(os.path.join(OUT_DIR, "清洗结果对照.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["客户简称", "消耗排名", "清洗后商品名", cost_label, "下单单价(元)",
                    "合并原始条数", "合并的原始DPA名称"])
        w.writerows(review_rows)

    total_raw = sum(len(v) for v in brands.values())
    total_cost = sum(i["cost"] for items in result.values() for i in items)
    print("· 客户数: %d" % len(result))
    print("· 原始行 %d → 精确去重 %d → 聚类后保留 %d（每客户 Top%d）"
          % (len(rows), total_raw, len(review_rows), TOP_N))
    if skipped_empty:
        print("· 跳过无商品名行: %d" % skipped_empty)
    print("· Top%d 商品消耗合计: %.1f %s" % (TOP_N, total_cost, cost_unit))
    print("✓ 已生成 data/products.json、docs/products-data.js、data/清洗结果对照.csv")


if __name__ == "__main__":
    main()
