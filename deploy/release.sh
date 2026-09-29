#!/usr/bin/env bash
#
# 把某个分支在 GitHub 上的最新提交构建并部署到指定环境。
#
# 用法：NEWAPI_ENV=staging|production deploy/release.sh [branch]
#
# 生产一般不直接用它，而是先发测试环境、看过之后再 `promote.sh <tag>`。

set -euo pipefail

BRANCH=${1:-tavern}
ENV=${NEWAPI_ENV:-production}

case "$ENV" in
  production) DEF_COMPOSE=/www/wwwroot/new-api; DEF_PORT=3000 ;;
  staging) DEF_COMPOSE=/www/wwwroot/new-api-staging; DEF_PORT=3001 ;;
  *) echo "未知环境：$ENV（只能是 production 或 staging）" >&2; exit 1 ;;
esac

COMPOSE_DIR=${NEWAPI_COMPOSE_DIR:-$DEF_COMPOSE}
ENV_FILE=$COMPOSE_DIR/.env
SMOKE_URL=${NEWAPI_SMOKE_URL:-http://127.0.0.1:$DEF_PORT/api/status}
SELF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

PREV=$(grep -E '^NEWAPI_TAG=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
# 首次部署时还没有 NEWAPI_TAG，回滚目标退回 compose 的默认值。
[ -n "$PREV" ] || PREV=tavern

set_tag() {
  local tag=$1
  if grep -qE '^NEWAPI_TAG=' "$ENV_FILE"; then
    sed -i "s|^NEWAPI_TAG=.*|NEWAPI_TAG=${tag}|" "$ENV_FILE"
  else
    printf 'NEWAPI_TAG=%s\n' "$tag" >>"$ENV_FILE"
  fi
}

TAG=$(bash "$SELF_DIR/build.sh" "$BRANCH" | tail -n 1)
echo "[$ENV] 已构建 $TAG（上一个：$PREV）"

set_tag "$TAG"
cd "$COMPOSE_DIR"
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
  echo "[$ENV] OK：$TAG 已上线"
  exit 0
fi

echo "[$ENV] 冒烟检查失败，输出最后 40 行日志：" >&2
docker compose logs --tail 40 new-api >&2
echo "[$ENV] 回滚到 $PREV" >&2
set_tag "$PREV"
docker compose up -d --force-recreate new-api
exit 1
