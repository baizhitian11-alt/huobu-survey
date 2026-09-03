# -*- coding: utf-8 -*-
"""
DPA 商品名称清洗 + 品牌 Top 消耗商品聚合

输入: ../品牌客户 dpa 商品名称清洗.csv
输出:
  data/products.json      —— 问卷网站使用的数据（品牌 -> Top N 商品）
  data/清洗结果对照.csv    —— 人工复核用：每个聚合后的商品对应哪些原始 DPA 名称

清洗逻辑:
  1. 去掉【】[]（）() 等括号内的营销前缀（如【官方正品】【达人专属】【买一送一】）
  2. 去掉尾部的投放标记（db / zb / wx / koc / xf / m / M / YM / k1 等短码）
     以及 自播 / 直播 / 官方正品 / 正品 / 包邮 等通用词
  3. 完全相同的清洗名直接合并
  4. 剩余的用相似度聚类（同品牌内），把只差几个字的同一款 SPU 合并
  5. 合并后按日均消耗降序，取每个品牌 Top N
"""

import csv
import json
import os
import re
from difflib import SequenceMatcher

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "..", "品牌客户 dpa 商品名称清洗.csv")
OUT_DIR = os.path.join(BASE, "data")

TOP_N = 10           # 每个品牌保留多少个候选商品（问卷默认展示前 5）
SIM_THRESHOLD = 0.72  # 相似度合并阈值

# 括号内容（中英文括号）
BRACKET_RE = re.compile(r"[【\[（(][^】\]）)]*[】\]）)]")
# 尾部投放标记短码
TAIL_CODE_RE = re.compile(r"[A-Za-z0-9]{1,4}$")
TAIL_WORDS = [
    "官方正品", "官方旗舰", "旗舰正品", "正品保障", "自播", "直播", "专拍", "拍1",
    "包邮", "正品", "新品上市", "新品尝鲜", "新品上新", "尝鲜装", "体验装",
    "微信礼物", "送女友", "送妈妈", "送亲朋好友", "可试用可体验",
]
# 尾部空格分隔的投放短码（如 "... ZG GL HZ"、"... db"）
TAIL_SPACE_CODE_RE = re.compile(r"\s+[A-Za-z0-9]{1,3}$")
# 尾部紧贴中文的编码（如 "...美颜膏ZB2-SH2-1"、"...精华棒ZB1JYB4"）
TAIL_MIX_CODE_RE = re.compile(r"[-—_]?[A-Za-z][A-Za-z0-9\-]{0,11}$")
# 规格/数量信息（保留，用于区分不同规格的 SPU）
NORMALIZE_RE = re.compile(r"[^0-9A-Za-z\u4e00-\u9fff]")


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
        rows = list(csv.DictReader(f))

    # ---------- 第一轮：精确清洗名合并 ----------
    brands = {}
    for r in rows:
        brand = (r.get("客户简称") or "").strip()
        raw = (r.get("DPA商品名称") or "").strip()
        if not brand or brand == "整体":
            continue
        if raw in ("", "空", "~"):
            continue

        cost = to_float(r.get("日均消耗(元)"))
        gmv = to_float(r.get("日均下单金额(元)"))
        price = to_float(r.get("下单单价(元)"))
        roi = to_float(r.get("下单ROI"))

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

    # ---------- 第二轮：同品牌内相似度聚类 ----------
    result = {}
    review_rows = []

    for brand, items in brands.items():
        lst = sorted(items.items(), key=lambda kv: -kv[1]["cost"])
        clusters = []  # [{keys:[], data:{}}]
        for key, data in lst:
            hit = None
            for c in clusters:
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
            out.append({
                "rank": idx,
                "name": c["name"],
                "cost": round(c["cost"], 2),
                "gmv": round(c["gmv"], 2),
                "avgPrice": avg_price,
                "roi": roi,
                "mergedCount": len(c["raws"]),
                "rawNames": c["raws"][:30],
            })
            review_rows.append([
                brand, idx, c["name"], round(c["cost"], 2), len(c["raws"]),
                " || ".join(c["raws"][:30]),
            ])
        if out:
            result[brand] = out

    # 品牌按总消耗排序，方便下拉框
    brand_order = sorted(result.keys(), key=lambda b: -sum(i["cost"] for i in result[b]))

    payload = {
        "generatedFrom": os.path.basename(SRC),
        "topN": TOP_N,
        "brands": brand_order,
        "products": result,
    }

    # 精简版：给前端用，去掉 rawNames 以减小体积
    slim = {
        "topN": TOP_N,
        "brands": brand_order,
        "products": {
            b: [{k: v for k, v in p.items() if k != "rawNames"} for p in items]
            for b, items in result.items()
        },
    }

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
        w.writerow(["客户简称", "消耗排名", "清洗后商品名", "日均消耗合计(元)", "合并原始条数", "合并的原始DPA名称"])
        w.writerows(review_rows)

    total_raw = sum(len(v) for v in brands.values())
    print(f"品牌数: {len(result)}")
    print(f"清洗前有效SKU名(精确去重后): {total_raw}")
    print(f"聚类后保留(每品牌Top{TOP_N}): {len(review_rows)}")
    print("已生成: data/products.json、docs/products-data.js")


if __name__ == "__main__":
    main()
