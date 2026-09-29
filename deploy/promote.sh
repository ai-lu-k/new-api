#!/usr/bin/env bash
#
# 把一个已经在测试环境验证过的镜像 tag 提升到生产。
#
# 提升不重新构建：生产拿到的是测试环境跑过的同一个镜像 digest，所以"测试过的
# 就是上线的那个"。这是 tag 固定方案存在的意义 —— 先 `deploy/release.sh` 到测试
# 环境看效果，确认后再把同一个 tag 指给生产。
#
# 用法：deploy/promote.sh <image tag>
#   例如：deploy/promote.sh baseline-live-2026-09-27-11-g91260d8

set -euo pipefail

TAG=${1:?用法: deploy/promote.sh <image tag>}
REPO=luk/new-api
PROD_DIR=${NEWAPI_COMPOSE_DIR:-/www/wwwroot/new-api}
ENV_FILE=$PROD_DIR/.env
SMOKE_URL=${NEWAPI_SMOKE_URL:-http://127.0.0.1:3000/api/status}

if ! docker image inspect "$REPO:$TAG" >/dev/null 2>&1; then
  echo "本机没有这个镜像：$REPO:$TAG" >&2
  echo "先在测试环境构建并验证它，再提升。" >&2
  exit 1
fi

PREV=$(grep -E '^NEWAPI_TAG=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
[ -n "$PREV" ] || PREV=tavern

set_tag() {
  local tag=$1
  if grep -qE '^NEWAPI_TAG=' "$ENV_FILE"; then
    sed -i "s|^NEWAPI_TAG=.*|NEWAPI_TAG=${tag}|" "$ENV_FILE"
  else
    printf 'NEWAPI_TAG=%s\n' "$tag" >>"$ENV_FILE"
  fi
}

echo "提升 $TAG（当前生产：$PREV）"
set_tag "$TAG"
cd "$PROD_DIR"
docker compose up -d --force-recreate new-api

smoke() {
  local i
  for i in $(seq 1 30); do
    if curl -fsS -m 5 -o /dev/null "$SMOKE_URL"; then return 0; fi
    sleep 2
  done
  return 1
}

if smoke; then
  echo "OK：$TAG 已上生产"
  exit 0
fi

echo "冒烟检查失败，输出最后 40 行日志：" >&2
docker compose logs --tail 40 new-api >&2
echo "回滚到 $PREV" >&2
set_tag "$PREV"
docker compose up -d --force-recreate new-api
exit 1
