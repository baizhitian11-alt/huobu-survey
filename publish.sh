#!/usr/bin/env bash
# ============================================================
# 一条命令上线：建仓库 → 推代码 → 开 GitHub Pages → 输出公网地址
#
#   bash publish.sh
#
# token 来源（按顺序自动找，全程不写入任何文件、不进 git config）：
#   1) 环境变量 GITHUB_TOKEN
#   2) ~/Desktop/素材解析台-v2/.env 里的 GITHUB_TOKEN
#   3) 交互式输入
#
# 需要的 token 权限：classic PAT 勾 repo，或 fine-grained 给
# Administration:write + Contents:write + Pages:write
# ============================================================

set -e
cd "$(dirname "$0")"

REPO_NAME="${REPO_NAME:-huobu-survey}"

# ---------- 取 token ----------
TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f "$HOME/Desktop/素材解析台-v2/.env" ]; then
  TOKEN=$(grep '^GITHUB_TOKEN=' "$HOME/Desktop/素材解析台-v2/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
  [ -n "$TOKEN" ] && echo "· 复用素材解析台里已配置的 GITHUB_TOKEN"
fi
if [ -z "$TOKEN" ]; then
  printf "请粘贴 GitHub token（输入不回显）: "
  read -rs TOKEN
  echo ""
fi
[ -z "$TOKEN" ] && { echo "× 没有 token，无法自动上线"; exit 1; }

API() { # API <method> <path> [json]
  local m="$1" p="$2" d="${3:-}"
  if [ -n "$d" ]; then
    curl -s -X "$m" -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      -d "$d" "https://api.github.com$p"
  else
    curl -s -X "$m" -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com$p"
  fi
}

JGET() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('$1','') or '')" 2>/dev/null; }

# ---------- 1. 确认账号 ----------
OWNER=$(API GET /user | JGET login)
[ -z "$OWNER" ] && { echo "× token 无效或网络不通"; exit 1; }
echo "· 账号：$OWNER"
SLUG="$OWNER/$REPO_NAME"

# ---------- 2. 建仓库（已存在则跳过） ----------
EXIST=$(API GET "/repos/$SLUG" | JGET full_name)
if [ -n "$EXIST" ]; then
  echo "· 仓库已存在：$SLUG"
else
  echo "· 创建仓库 $SLUG …"
  CREATED=$(API POST /user/repos \
    "{\"name\":\"$REPO_NAME\",\"description\":\"金秋大促 · 客户活动报名与货补摸排问卷\",\"private\":false,\"has_issues\":true}" \
    | JGET full_name)
  [ -z "$CREATED" ] && { echo "× 建仓库失败，请确认 token 有 repo / Administration:write 权限"; exit 1; }
  echo "  ✓ $CREATED"
fi

# ---------- 3. 推代码 ----------
cat > .gitignore <<'EOF'
data/submissions.json
node_modules/
.DS_Store
*.log
EOF

if [ ! -d .git ]; then
  git init -q
  git branch -M main
fi
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$SLUG.git"

git add -A
git -c user.email="${GIT_EMAIL:-survey@local}" -c user.name="${GIT_NAME:-$OWNER}" \
  commit -q -m "publish: 货补摸排问卷 $(date '+%Y-%m-%d %H:%M')" || echo "· 没有新变更"

echo "· 推送到 $SLUG …"
# token 只出现在这一次命令的 URL 里，不写进 .git/config
git push -q --force "https://x-access-token:$TOKEN@github.com/$SLUG.git" main
git branch --set-upstream-to=origin/main main 2>/dev/null || true
echo "  ✓ 已推送"

# ---------- 4. 开启 Pages ----------
PAGE_URL=$(API GET "/repos/$SLUG/pages" | JGET html_url)
if [ -z "$PAGE_URL" ]; then
  echo "· 开启 GitHub Pages（main / docs）…"
  PAGE_URL=$(API POST "/repos/$SLUG/pages" \
    '{"source":{"branch":"main","path":"/docs"}}' | JGET html_url)
fi
if [ -z "$PAGE_URL" ]; then
  # 已存在但需要改 source 的情况
  API PUT "/repos/$SLUG/pages" '{"source":{"branch":"main","path":"/docs"}}' > /dev/null
  sleep 2
  PAGE_URL=$(API GET "/repos/$SLUG/pages" | JGET html_url)
fi
[ -z "$PAGE_URL" ] && PAGE_URL="https://$OWNER.github.io/$REPO_NAME/"
echo "  ✓ Pages: $PAGE_URL"

# ---------- 5. 等站点生效 ----------
echo -n "· 等待站点构建"
for i in $(seq 1 40); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "$PAGE_URL")
  if [ "$CODE" = "200" ]; then echo " ✓ 已上线"; break; fi
  echo -n "."
  sleep 6
done
echo ""

cat <<EOF
================================================================
上线完成 🎉

问卷（发给客户）
  $PAGE_URL

汇总导出（自己用，可预览+导出 Excel）
  ${PAGE_URL}merge.html

原始数据（客户在线提交后进这里）
  https://github.com/$SLUG/issues?q=label:survey

------------------------------------------------
如果要让客户"点提交就直接入库"，再做一步：
  1. 生成 fine-grained token（只给 $SLUG 的 Issues: Read and write）
     https://github.com/settings/personal-access-tokens/new
  2. python3 set_token.py <那个token>
  3. bash publish.sh        # 重新发布
不做这步也能用：客户提交会下载回执文件，发回给你，
在 merge.html 里拖进去即可汇总。
================================================================
EOF
