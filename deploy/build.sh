#!/usr/bin/env bash
#
# 从某个已提交的 ref 构建 luk/new-api 镜像。
#
# 构建上下文是该 commit 的干净导出（git archive），不是工作区，因此镜像内容
# 永远等于某个真实存在于 git 里的提交；工作区脏不脏、有没有别的会话在改同一
# 棵树，都不会污染产物。
#
# VERSION 用该 commit 的 `git describe` 写入，最终同时出现在两处：二进制的
# -ldflags，以及镜像 tag。因此「线上跑的是哪个 commit」可以直接从镜像名读出。
#
# 用法：deploy/build.sh [ref]        默认 HEAD
# 最后一行输出镜像 tag。

set -euo pipefail

REPO=luk/new-api
SRC=${NEWAPI_SRC:-/opt/new-api-src}
REF=${1:-HEAD}

cd "$SRC"
SHA=$(git rev-parse --verify "${REF}^{commit}")
VERSION=$(git describe --tags --always "$SHA")

CTX=$(mktemp -d "${TMPDIR:-/tmp}/new-api-ctx.XXXXXX")
trap 'rm -rf "$CTX"' EXIT

git archive "$SHA" | tar -x -C "$CTX"
printf '%s' "$VERSION" >"$CTX/VERSION"

# 只打不可变的 $VERSION tag，不动 :tavern —— :tavern 是旧脚本在用的移动 tag，
# 保留它以免两边互相覆盖。
DOCKER_BUILDKIT=1 docker build \
  --build-arg "GOPROXY=${GOPROXY:-https://goproxy.cn,direct}" \
  -t "$REPO:$VERSION" "$CTX"

echo "$VERSION"
