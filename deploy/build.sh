#!/usr/bin/env bash
#
# 从 GitHub 拉某个分支的源码快照并构建镜像。
#
# 为什么不用 git：github.com 的 git 端点在这张网络里不通（HTTPS 直接超时），
# 而 SSH 又只能挂账号级密钥（GitHub 对 fork 仓库禁用了 deploy key）。但
# codeload 的源码包和 api.github.com 都很快（实测整包 5.4MB / 3.3 秒），
# 公开仓库还不需要任何凭据。所以：源码包当构建上下文，api 拿版本信息。
#
# 用法：deploy/build.sh [branch]        默认 tavern
# 最后一行输出镜像 tag。

set -euo pipefail

SLUG=${NEWAPI_REPO_SLUG:-ai-lu-k/new-api}
BRANCH=${1:-tavern}
IMAGE=luk/new-api
API=https://api.github.com/repos/$SLUG

TMP=$(mktemp -d "${TMPDIR:-/tmp}/new-api-build.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

# 一个请求同时拿到 commit sha 和日期，用来生成可读且可排序的版本号。
META=$(curl -fsS -m 20 "$API/commits/$BRANCH" 2>/dev/null | python3 -c '
import json, sys
d = json.load(sys.stdin)
print(d["sha"], d["commit"]["committer"]["date"][:10].replace("-", ""))
' 2>/dev/null || true)
SHA=${META%% *}
DATE=${META##* }
if [ -z "$SHA" ] || [ -z "$DATE" ] || [ "$SHA" = "$DATE" ]; then
  echo "拿不到 $SLUG@$BRANCH 的最新提交（检查网络或分支名）" >&2
  exit 1
fi

VERSION="${DATE}-${SHA:0:7}"
CTX=$TMP/src
mkdir -p "$CTX"

echo "拉取 $SLUG@$BRANCH ($SHA)" >&2
curl -fsSL -m 300 -o "$TMP/src.tar.gz" "https://codeload.github.com/$SLUG/tar.gz/$SHA"
tar -xzf "$TMP/src.tar.gz" -C "$CTX" --strip-components=1

# 版本号进 -ldflags，也进镜像 tag，所以「线上跑的是哪个提交」永远对得上。
printf '%s' "$VERSION" >"$CTX/VERSION"

echo "构建 $IMAGE:$VERSION" >&2
DOCKER_BUILDKIT=1 docker build \
  --build-arg "GOPROXY=${GOPROXY:-https://goproxy.cn,direct}" \
  -t "$IMAGE:$VERSION" "$CTX" >&2

echo "$VERSION"
