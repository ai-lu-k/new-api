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

# SERVICE 既是 compose 里的服务名，也是容器名；两个环境必须不同（见下面的检查）。
case "$ENV" in
  production) DEF_COMPOSE=/www/wwwroot/new-api; DEF_PORT=3000; SERVICE=new-api ;;
  staging) DEF_COMPOSE=/www/wwwroot/new-api-staging; DEF_PORT=3001; SERVICE=new-api-staging ;;
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
docker compose up -d --force-recreate "$SERVICE"

# 测试容器和生产共用一张网络。它在那张网络上要是也叫 `new-api`，审计入口就会把
# 线上流量分给它，所以宁可把它停掉，也不让它顶着这个名字跑。
NET_NAMES=$(docker inspect "$SERVICE" --format \
  '{{range .NetworkSettings.Networks}}{{range .Aliases}}{{println .}}{{end}}{{range .DNSNames}}{{println .}}{{end}}{{end}}' \
  2>/dev/null || true)
if [ "$ENV" = staging ] && grep -qx new-api <<<"$NET_NAMES"; then
  echo "[$ENV] 测试容器在共享网络上占用了 new-api 这个名字，已停掉；检查 compose 里的服务名" >&2
  docker stop "$SERVICE" >/dev/null
  exit 1
fi

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
docker compose logs --tail 40 "$SERVICE" >&2
echo "[$ENV] 回滚到 $PREV" >&2
set_tag "$PREV"
docker compose up -d --force-recreate "$SERVICE"
exit 1
