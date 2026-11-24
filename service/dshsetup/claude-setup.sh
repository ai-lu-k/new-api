#!/bin/sh
# Points Claude Code at this gateway: the base URL, the API key and a model go
# into the "env" block of ~/.claude/settings.json.
#
#   curl -fsSL __BASE_URL__/api/dsh_setup/setup.sh?client=claude | sh -s -- <setup code>
#
# The setup code comes from the website, works once and expires after ten
# minutes. It is exchanged for the key only after this script has made sure it
# can write to the Claude Code settings, so a run that is refused (by a
# sandbox, say) does not use the code up.
#
# The file is edited in place and backed up first: only the three keys under
# "env" are merged and everything else in it is left as it was. Merging JSON
# needs node; without it nothing is written and the block to paste is printed
# instead. --dry-run prints the result and writes nothing.
#
# The key is never printed as it was handed out: what is printed shows its
# first three characters and its last four. Pass --show-key (or set
# NEW_API_SETUP_SHOW_KEY=1) to print it whole, which only makes sense on a machine
# nobody else can see.
set -eu

BASE_URL='__BASE_URL__'
SITE='__SITE_NAME__'

fail() {
	printf '%s\n' "$*" >&2
	exit 1
}

dry_run=0
show_key=0
if [ "${NEW_API_SETUP_SHOW_KEY:-}" = 1 ]; then
	show_key=1
fi
code=''
for argument in "$@"; do
	case $argument in
	--dry-run) dry_run=1 ;;
	--show-key) show_key=1 ;;
	*) code=$argument ;;
	esac
done
[ -n "$code" ] || code=${NEW_API_SETUP_CODE:-}
[ -n "$code" ] || fail "缺少配置码。请回到 $SITE 的「快速开始」页面，重新复制命令。"
case $code in
*[!A-Za-z0-9_-]*) fail "配置码的格式不对。请回到 $SITE 的「快速开始」页面，重新复制命令。" ;;
esac

command -v curl >/dev/null 2>&1 || fail "这台机器上没有 curl，无法继续。"
command -v awk >/dev/null 2>&1 || fail "这台机器上没有 awk，无法继续。"

claude_home=${CLAUDE_CONFIG_DIR:-}
[ -n "$claude_home" ] || claude_home="$HOME/.claude"
settings="$claude_home/settings.json"

umask 077
unwritable="无法写入 $claude_home 。如果这条命令是让 Claude Code 代为执行的，请允许它在工作区之外写入，然后原样再运行一次；配置码还没有被用掉。"
# A dry run changes nothing, so it neither creates nor probes anything.
if [ "$dry_run" = 0 ]; then
	mkdir -p "$claude_home" 2>/dev/null || fail "$unwritable"
	probe="$claude_home/.new-api-setup-probe.$$"
	(: >"$probe") 2>/dev/null || fail "$unwritable"
	rm -f "$probe"
	if [ -e "$settings" ] && [ ! -w "$settings" ]; then
		fail "$unwritable"
	fi
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/new-api-claude-setup.XXXXXX") || fail "无法创建临时目录。"
trap 'rm -rf "$work"' EXIT
trap 'exit 1' INT TERM HUP

status=$(curl -sS -o "$work/payload" -w '%{http_code}' -X POST \
	-H "X-Setup-Code: $code" "$BASE_URL/api/dsh_setup/redeem") ||
	fail "连不上 $BASE_URL 。请检查网络后重试；如果之后提示配置码无效，回到 $SITE 的「快速开始」页面重新复制命令即可。"
case $status in
200) ;;
404) fail "配置码无效、已经用过或已过期（生成后 10 分钟内有效，只能用一次）。回到 $SITE 的「快速开始」页面重新复制命令即可。" ;;
409) fail "这个账号的 API 密钥数量已达上限，没有改动任何文件。请先在 $SITE 的「API 密钥」页面删掉一把不用的，再回到「快速开始」页面重新复制命令。" ;;
429) fail "尝试次数太多，请稍后再试。" ;;
*) fail "服务器返回了 $status，暂时无法完成配置，没有改动任何文件。请稍后重试。" ;;
esac

[ "$(sed -n 1p "$work/payload")" = 'new-api-dsh-setup 1' ] ||
	fail "服务器的响应不是预期的格式，没有改动任何文件。"

# The payload holds the key on a line of its own and one block per protocol
# with the models that protocol serves. Claude Code speaks the Messages API, so
# its base URL and its models are the ones in that block, and the site's
# default model is used when that block carries it.
awk '
	NR == 1 { next }
	/^key / && token == "" { token = substr($0, 5); next }
	/^@@providers$/ { in_providers = 1; next }
	/^@@default-model$/ { in_providers = 0; in_default = 1; next }
	in_default && /^  provider: / { default_provider = $2; next }
	in_default && /^  model: / { default_model = $2; gsub(/"/, "", default_model); next }
	!in_providers { next }
	/^[A-Za-z0-9_-]+:$/ { provider = $0; sub(/:$/, "", provider); api = ""; next }
	/^  api: / { api = $2; next }
	/^  baseURL: / && api == "anthropic-messages" && endpoint == "" {
		endpoint = $2
		gsub(/"/, "", endpoint)
		next
	}
	/^    - id: / && api == "anthropic-messages" {
		id = $0
		sub(/^    - id: /, "", id)
		gsub(/"/, "", id)
		served[id] = 1
		if (anthropic_provider == "") anthropic_provider = provider
		if (first_model == "") first_model = id
		if (first_claude == "" && id ~ /^claude/) first_claude = id
	}
	END {
		model = first_claude
		if (model == "" && default_provider == anthropic_provider && (default_model in served)) model = default_model
		if (model == "") model = first_model
		print token
		print endpoint
		print model
	}
' "$work/payload" >"$work/fields"

token=$(sed -n 1p "$work/fields")
endpoint=$(sed -n 2p "$work/fields")
model=$(sed -n 3p "$work/fields")
[ -n "$endpoint" ] || endpoint=$BASE_URL
if [ -z "$model" ]; then
	fail "这个账号现在没有 Claude Code 能用的模型：它只认 Anthropic Messages 协议的模型。没有改动任何文件。请先用别的客户端，或者联系站点管理员。"
fi
if [ -z "$token" ]; then
	fail "服务器的响应不完整，没有改动任何文件。"
fi
case $token in
*[!A-Za-z0-9_-]*) fail "服务器的响应不是预期的格式，没有改动任何文件。" ;;
esac
case $endpoint in
*[!A-Za-z0-9:/._~-]*) fail "服务器的响应不是预期的格式，没有改动任何文件。" ;;
esac
case $model in
*[!A-Za-z0-9._:/@+-]*) fail "服务器的响应不是预期的格式，没有改动任何文件。" ;;
esac

# masked_key keeps the first three characters and the last four, which is
# enough to tell keys apart and useless to anyone who reads the screen.
masked_key() {
	if [ "${#token}" -gt 8 ]; then
		printf '%s…%s' "${token%${token#???}}" "${token#"${token%????}"}"
	else
		printf '…'
	fi
}

# printed_key is what may be shown: the key itself only when asked for.
printed_key() {
	if [ "$show_key" = 1 ]; then
		printf '%s' "$token"
	else
		masked_key
	fi
}

# The three keys as JSON. Each value was checked above to need no escaping, so
# this cannot produce a broken document.
print_env() {
	printf '    "ANTHROPIC_BASE_URL": "%s",\n' "$endpoint"
	printf '    "ANTHROPIC_AUTH_TOKEN": "%s",\n' "$(printed_key)"
	printf '    "ANTHROPIC_MODEL": "%s"\n' "$model"
}

# by_hand stops after printing the keys for the user to merge: it is used when
# the file cannot be merged here, and it writes nothing.
by_hand() {
	printf '%s\n' "$1" >&2
	if [ "$show_key" = 1 ]; then
		printf '%s\n' "下面打印了完整密钥，注意别贴到别人能看到的地方。" >&2
	else
		printf '%s\n' "完整密钥没有打印。请到 $SITE 控制台的「API 密钥」页面复制它，替换下面这个打码值。" >&2
	fi
	printf '%s\n' "请把下面这些键合并进 $settings 的 env ：文件里已经有 env 就只加这三个键、别的字段原样保留，文件不存在就整段贴进去。" >&2
	printf '\n'
	printf '{\n  "env": {\n'
	print_env
	printf '  }\n}\n'
	printf '\n'
	exit 2
}

cat >"$work/merge.js" <<'NODE'
const fs = require('node:fs')

const target = process.argv[2]
const endpoint = process.env.NEW_API_SETUP_ENDPOINT
const token = process.env.NEW_API_SETUP_KEY
const model = process.env.NEW_API_SETUP_MODEL

function refuse(reason) {
  process.stderr.write(reason + '\n')
  process.exit(3)
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

let text = ''
try {
  text = fs.readFileSync(target, 'utf8')
} catch (error) {
  if (error.code !== 'ENOENT') refuse(`读不了 ${target}：${error.message}`)
}

let settings = {}
if (text.trim() !== '') {
  try {
    settings = JSON.parse(text)
  } catch (error) {
    refuse(`${target} 不是有效的 JSON：${error.message}`)
  }
}
if (!isPlainObject(settings)) refuse(`${target} 的内容不是 JSON 对象`)
if (settings.env !== undefined && !isPlainObject(settings.env)) {
  refuse(`${target} 里的 env 不是 JSON 对象`)
}

settings.env = {
  ...(settings.env ?? {}),
  ANTHROPIC_BASE_URL: endpoint,
  ANTHROPIC_AUTH_TOKEN: token,
  ANTHROPIC_MODEL: model,
}
process.stdout.write(JSON.stringify(settings, null, 2) + '\n')
NODE

command -v node >/dev/null 2>&1 ||
	by_hand "这台机器上没有 node，无法安全地合并 JSON，没有改动任何文件。请先装上 node（https://nodejs.org ）再回到 $SITE 的「快速开始」页面复制一条新命令：这条配置码已经用掉了。"

node_status=0
NEW_API_SETUP_ENDPOINT=$endpoint NEW_API_SETUP_KEY=$token NEW_API_SETUP_MODEL=$model \
	node "$work/merge.js" "$settings" >"$work/settings.new" 2>"$work/node.err" || node_status=$?
if [ "$node_status" = 3 ]; then
	by_hand "$(sed -n 1p "$work/node.err") 没有改动任何文件。"
fi
[ "$node_status" = 0 ] || fail "node 运行出错（退出码 $node_status），没有改动任何文件。"
[ -s "$work/settings.new" ] || fail "node 没有给出结果，没有改动任何文件。"

if [ "$dry_run" = 1 ]; then
	if [ "$show_key" = 1 ]; then
		printf '%s\n' "将要写入 $settings 的内容，没有改动任何文件：" >&2
		cat "$work/settings.new"
	else
		printf '%s\n' "将要写入 $settings 的内容，没有改动任何文件（密钥已打码，加 --show-key 可以看到完整值）：" >&2
		sed "s|\"ANTHROPIC_AUTH_TOKEN\": \"[^\"]*\"|\"ANTHROPIC_AUTH_TOKEN\": \"$(masked_key)\"|" "$work/settings.new"
	fi
	exit 0
fi

stamp=$(date +%Y%m%d-%H%M%S)
backed_up=0
if [ -e "$settings" ] && cmp -s "$work/settings.new" "$settings"; then
	printf '%s\n' "$settings 里已经是这三个键，没有改动。"
	exit 0
fi
if [ -e "$settings" ]; then
	cp -p "$settings" "$settings.new-api-backup-$stamp" ||
		fail "无法备份 $settings ，没有改动任何文件。"
	backed_up=1
fi
if [ -L "$settings" ]; then
	cat "$work/settings.new" >"$settings"
else
	if [ -e "$settings" ]; then
		cp -p "$settings" "$work/settings.keep"
	else
		: >"$work/settings.keep"
	fi
	cat "$work/settings.new" >"$work/settings.keep"
	mv -f "$work/settings.keep" "$settings" ||
		fail "无法写入 $settings ，没有改动任何文件。"
fi

printf '%s\n' "已写入 $settings ：env 下的 ANTHROPIC_BASE_URL、ANTHROPIC_AUTH_TOKEN、ANTHROPIC_MODEL 三个键，文件的其它内容都保留着。"
if [ "$backed_up" = 1 ]; then
	printf '%s\n' "改动前的文件已备份在同一目录，文件名以 .new-api-backup-$stamp 结尾。"
fi
printf '%s\n' "请重启 Claude Code（或重新打开一个终端）后才生效：之后 Claude Code 会通过 $SITE 调用模型。"
