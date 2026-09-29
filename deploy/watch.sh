#!/usr/bin/env bash
#
# 盯着 GitHub 上某个分支的最新提交；变了就自动部署到测试环境。
#
# 这就是「监测 GitHub 的提交」那一环：由 systemd timer 每两分钟拉起一次，
# 用 flock 保证同一时间只有一个实例。生产**不**走这条路 —— 生产只接受人工
# `promote.sh`，这样实验性改动不会自己跑上去。
#
# 用法：deploy/watch.sh [branch]       默认 staging

set -euo pipefail

SLUG=${NEWAPI_REPO_SLUG:-ai-lu-k/new-api}
BRANCH=${1:-staging}
ENV=${NEWAPI_ENV:-staging}
SELF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
STATE_DIR=${NEWAPI_STATE_DIR:-/var/lib/new-api-watch}
STATE=$STATE_DIR/$ENV

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/$ENV.lock"
flock -n 9 || { echo "已有实例在跑，跳过"; exit 0; }

SHA=$(curl -fsS -m 20 "https://api.github.com/repos/$SLUG/commits/$BRANCH" 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha"])' 2>/dev/null || true)
if [ -z "$SHA" ]; then
  echo "拿不到 $SLUG@$BRANCH 的最新提交" >&2
  exit 1
fi

LAST=$(cat "$STATE" 2>/dev/null || true)
if [ "$SHA" = "$LAST" ]; then
  echo "$BRANCH 无新提交（$SHA）"
  exit 0
fi

echo "$BRANCH 有新提交 ${SHA:0:7}（上次 ${LAST:0:7}），部署到 $ENV"
# 部署成功后才记状态，失败的话下一轮会重试。
NEWAPI_ENV=$ENV bash "$SELF_DIR/release.sh" "$BRANCH"
printf '%s' "$SHA" >"$STATE"
echo "已记录 $SHA"
