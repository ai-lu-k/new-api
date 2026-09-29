#!/usr/bin/env bash
#
# 同步 checkout 到某个 ref、构建、部署，并在新容器不响应 /api/status 时自动回滚。
#
# 前置：本地已 `git push server tavern`（server = ssh://root@…/opt/new-api.git）。
#
# 用法：deploy/release.sh [ref]      默认 origin/tavern

set -euo pipefail

SRC=${NEWAPI_SRC:-/opt/new-api-src}
COMPOSE_DIR=${NEWAPI_COMPOSE_DIR:-/www/wwwroot/new-api}
ENV_FILE=$COMPOSE_DIR/.env
REF=${1:-origin/tavern}
SMOKE_URL=${NEWAPI_SMOKE_URL:-http://127.0.0.1:3000/api/status}

cd "$SRC"
git fetch -q --tags origin
git reset -q --hard "$REF"

PREV=$(grep -E '^NEWAPI_TAG=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)

# 改写或追加 NEWAPI_TAG，保持 .env 其余行原样（里面是 DSN / 密钥）。
set_tag() {
  local tag=$1
  if grep -qE '^NEWAPI_TAG=' "$ENV_FILE"; then
    sed -i "s|^NEWAPI_TAG=.*|NEWAPI_TAG=${tag}|" "$ENV_FILE"
  else
    printf 'NEWAPI_TAG=%s\n' "$tag" >>"$ENV_FILE"
  fi
}

TAG=$(bash "$SRC/deploy/build.sh" HEAD | tail -n 1)
echo "已构建 $TAG（上一个：${PREV:-无}）"

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
  echo "OK：$TAG 已上线"
  exit 0
fi

echo "冒烟检查失败，输出最后 40 行日志：" >&2
docker compose logs --tail 40 new-api >&2
if [ -n "$PREV" ]; then
  echo "回滚到 $PREV" >&2
  set_tag "$PREV"
  docker compose up -d --force-recreate new-api
else
  echo "没有可回滚的上一个 tag，请人工处理" >&2
fi
exit 1
