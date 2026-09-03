#!/usr/bin/env bash
# 一键发布到 GitHub Pages
#
# 首次：  bash deploy-github.sh https://github.com/baizhitian11-alt/huobu-survey.git
# 之后：  bash deploy-github.sh

set -e
cd "$(dirname "$0")"

REPO="${1:-}"
DEFAULT_REPO="https://github.com/baizhitian11-alt/huobu-survey.git"

if [ ! -d .git ]; then
  if [ -z "$REPO" ]; then
    REPO="$DEFAULT_REPO"
    echo "未指定仓库，使用默认：$REPO"
    echo "（如果还没建，先去 https://github.com/new 建一个名为 huobu-survey 的 Public 仓库）"
    echo ""
  fi
  git init
  git branch -M main
  git remote add origin "$REPO"
elif [ -n "$REPO" ]; then
  git remote set-url origin "$REPO"
fi

# 回收到的问卷数据不上传
cat > .gitignore <<'EOF'
data/submissions.json
node_modules/
.DS_Store
*.log
EOF

git add -A
git commit -m "publish: 货补摸排问卷 $(date '+%Y-%m-%d %H:%M')" || echo "没有新变更"
git push -u origin main

ORIGIN=$(git remote get-url origin)
SLUG=$(echo "$ORIGIN" | sed -E 's#.*github.com[:/]([^/]+)/([^/.]+)(\.git)?#\1/\2#')
USER=$(echo "$SLUG" | cut -d/ -f1)
NAME=$(echo "$SLUG" | cut -d/ -f2)

cat <<EOF

================================================================
推送完成：$SLUG

首次发布还需在网页上做两件事（各一次）：

【1】开启 Pages
   https://github.com/$SLUG/settings/pages
   Source 选 Deploy from a branch
   Branch 选 main ，文件夹选 /docs  → Save

【2】如果要客户在线提交（后端也在 GitHub）
   生成 fine-grained token（只给这个仓库的 Issues 读写权限）：
   https://github.com/settings/personal-access-tokens/new
   然后本地执行：
     python3 set_token.py <你的token>
     bash deploy-github.sh
   不配也能用，客户提交会下载回执文件发回给你。

等 1-2 分钟后地址：
   问卷（发客户）  https://$USER.github.io/$NAME/
   汇总导出（自用） https://$USER.github.io/$NAME/merge.html
   数据（issues）  https://github.com/$SLUG/issues?q=label:survey
================================================================
EOF
