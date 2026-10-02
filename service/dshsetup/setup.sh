#!/bin/sh
# Points the DSH client at this gateway: one provider entry with every model
# the account can call, and the API key.
#
#   curl -fsSL __BASE_URL__/api/dsh_setup/setup.sh | sh -s -- <setup code>
#
# The setup code comes from the website, works once and expires after ten
# minutes. It is exchanged for the configuration only after this script has
# made sure it can write to the DSH home, so a run that is refused (by a
# sandbox, say) does not use the code up.
#
# Two files under the DSH home are edited, both in place and both backed up
# first: settings.yaml gets the provider entries, .credentials.yaml gets the
# key. Everything else in them is left as it was.
set -eu

BASE_URL='__BASE_URL__'
SITE='__SITE_NAME__'

fail() {
	printf '%s\n' "$*" >&2
	exit 1
}

code=${1:-${LUK_SETUP_CODE:-}}
[ -n "$code" ] || fail "缺少配置码。请回到 $SITE 的「快速开始」页面，重新复制完整的命令。"
case $code in
*[!A-Za-z0-9_-]*) fail "配置码的格式不对。请回到 $SITE 的「快速开始」页面，重新复制完整的命令。" ;;
esac

command -v curl >/dev/null 2>&1 || fail "这台机器上没有 curl，无法继续。"
command -v awk >/dev/null 2>&1 || fail "这台机器上没有 awk，无法继续。"

dsh_home=${DSH_HOME:-}
[ -n "$dsh_home" ] || dsh_home="$HOME/.dsh"
settings="$dsh_home/settings.yaml"
credentials="$dsh_home/.credentials.yaml"

umask 077
unwritable="无法写入 $dsh_home 。如果这条命令是让 DSH 代为执行的，请允许它在工作区之外写入，然后原样再运行一次；配置码还没有被用掉。"
mkdir -p "$dsh_home" 2>/dev/null || fail "$unwritable"
probe="$dsh_home/.luk-setup-probe.$$"
(: >"$probe") 2>/dev/null || fail "$unwritable"
rm -f "$probe"
for existing in "$settings" "$credentials"; do
	if [ -e "$existing" ] && [ ! -w "$existing" ]; then
		fail "$unwritable"
	fi
done

work=$(mktemp -d "${TMPDIR:-/tmp}/luk-dsh-setup.XXXXXX") || fail "无法创建临时目录。"
trap 'rm -rf "$work"' EXIT
trap 'exit 1' INT TERM HUP

status=$(curl -sS -o "$work/payload" -w '%{http_code}' -X POST \
	-H "X-Setup-Code: $code" "$BASE_URL/api/dsh_setup/redeem") ||
	fail "连不上 $BASE_URL 。请检查网络后重试；如果之后提示配置码无效，回到网页重新生成一条命令即可。"
case $status in
200) ;;
404) fail "配置码无效、已经用过或已过期（生成后 10 分钟内有效，只能用一次）。回到网页重新生成一条命令即可。" ;;
429) fail "尝试次数太多，请稍后再试。" ;;
*) fail "服务器返回了 $status，暂时无法完成配置，没有改动任何文件。请稍后重试。" ;;
esac

[ "$(sed -n 1p "$work/payload")" = 'luk-dsh-setup 1' ] ||
	fail "服务器的响应不是预期的格式，没有改动任何文件。"
awk -v dir="$work" '
	NR == 1 { next }
	/^@@providers$/ { out = dir "/providers"; next }
	/^@@default-model$/ { out = dir "/default"; next }
	/^@@end$/ { out = ""; next }
	out != "" { print > out; next }
	/^(ref|key|ids) / { name = $1; sub(/^[a-z]+ /, ""); print > (dir "/" name) }
' "$work/payload"
ref=$(cat "$work/ref" 2>/dev/null || true)
key=$(cat "$work/key" 2>/dev/null || true)
ids=$(cat "$work/ids" 2>/dev/null || true)
if [ -z "$ref" ] || [ -z "$key" ] || [ -z "$ids" ] || [ ! -s "$work/providers" ] || [ ! -s "$work/default" ]; then
	fail "服务器的响应不完整，没有改动任何文件。"
fi
case $key in
*[!A-Za-z0-9_-]*) fail "服务器的响应不是预期的格式，没有改动任何文件。" ;;
esac

# A line-based editor for the block-style YAML that DSH itself writes. It only
# ever replaces the mapping entries it is told to manage and refuses, without
# output, any layout it does not fully understand.
cat >"$work/edit.awk" <<'AWK'
function indent_of(s,    i) {
	i = 1
	while (substr(s, i, 1) == " ") i++
	return i - 1
}
function is_blank(s) {
	return s ~ /^[ \t]*(#.*)?$/
}
function pad(count,    s) {
	s = ""
	while (count-- > 0) s = s " "
	return s
}
# key_of returns the key of a block-style "key: ..." line and leaves whatever
# follows the colon in REST. Anything else yields "".
function key_of(s,    t, c, e, j, len, name) {
	REST = ""
	t = substr(s, indent_of(s) + 1)
	c = substr(t, 1, 1)
	if (c == "\"" || c == "'") {
		e = index(substr(t, 2), c)
		if (e == 0 || substr(t, e + 2, 1) != ":") return ""
		REST = substr(t, e + 3)
		if (REST != "" && REST !~ /^[ \t]/) return ""
		return substr(t, 2, e - 1)
	}
	if (c == "" || index("#-[{?:&*!|>%@`", c) > 0) return ""
	len = length(t)
	for (j = 1; j <= len; j++) {
		if (substr(t, j, 1) != ":") continue
		if (j == len || substr(t, j + 1, 1) == " " || substr(t, j + 1, 1) == "\t") {
			REST = substr(t, j + 1)
			name = substr(t, 1, j - 1)
			sub(/[ \t]+$/, "", name)
			return name
		}
	}
	return ""
}
# check_top_level refuses a document that is not a plain block mapping: one
# that is written as JSON, holds several documents, or starts with a list.
# A document that is nothing but "{}" is how an emptied one is written; that
# line is dropped so the document can be treated as the empty one it is.
function check_top_level(    i, filled, empty_map, seen_key) {
	filled = 0
	empty_map = 0
	seen_key = 0
	for (i = 1; i <= n; i++) {
		if (is_blank(line[i])) continue
		filled++
		if (indent_of(line[i]) > 0) continue
		if (key_of(line[i]) != "") {
			seen_key = 1
			continue
		}
		if (line[i] ~ /^---[ \t]*$/ && !seen_key && filled == 1) continue
		if (line[i] ~ /^\{\}[ \t]*(#.*)?$/) {
			empty_map = i
			continue
		}
		refuse("文件不是普通的逐行 YAML 写法")
	}
	if (!empty_map) return
	if (filled > 1) refuse("文件不是普通的逐行 YAML 写法")
	line[empty_map] = ""
}
# inline_value is what a key line carries after its colon, comment removed.
function inline_value(rest) {
	sub(/^[ \t]+/, "", rest)
	if (substr(rest, 1, 1) == "#") return ""
	sub(/[ \t]+#.*$/, "", rest)
	sub(/[ \t]+$/, "", rest)
	return rest
}
function is_empty_value(v) {
	return v == "" || v == "{}" || v == "null" || v == "~"
}
# block_end is the last line of the block that starts at FROM and whose lines
# sit deeper than DEPTH. Trailing blank lines are left outside the block.
function block_end(from, limit, depth,    i, last) {
	last = from - 1
	for (i = from; i <= limit; i++) {
		if (is_blank(line[i])) continue
		if (indent_of(line[i]) <= depth) break
		last = i
	}
	return last
}
function first_indent(from, to, fallback,    i) {
	for (i = from; i <= to; i++) {
		if (!is_blank(line[i])) return indent_of(line[i])
	}
	return fallback
}
function refuse(why) {
	print why
	exit 3
}
function emit(s) {
	out[++total] = s
}
function emit_file(file, depth,    text) {
	while ((getline text < file) > 0) emit(text == "" ? "" : pad(depth) text)
	close(file)
}
function emit_section_break() {
	if (total > 0 && out[total] != "") emit("")
}

function edit_settings(    i, j, name, count, parts, managed, top, top_rest, has_default, block_last, child, providers, providers_rest, value, providers_last, depth, after, header, drop, entry_last) {
	count = split(ids, parts, " ")
	for (i = 1; i <= count; i++) managed[parts[i]] = 1

	top = 0
	has_default = 0
	for (i = 1; i <= n; i++) {
		if (is_blank(line[i]) || indent_of(line[i]) > 0) continue
		name = key_of(line[i])
		if (name == "agent-default-model") has_default = 1
		if (name != "llm-pi-ai") continue
		if (top) refuse("llm-pi-ai 出现了两次")
		top = i
		top_rest = REST
	}

	if (!top) {
		for (i = 1; i <= n; i++) emit(line[i])
		emit_section_break()
		emit("llm-pi-ai:")
		emit("  providers:")
		emit_file(block_file, 4)
	} else {
		value = inline_value(top_rest)
		if (!is_empty_value(value)) refuse("llm-pi-ai 写成了单行")
		if (value != "") line[top] = "llm-pi-ai:"
		block_last = block_end(top + 1, n, 0)
		child = first_indent(top + 1, block_last, 2)

		providers = 0
		for (i = top + 1; i <= block_last; i++) {
			if (is_blank(line[i]) || indent_of(line[i]) != child) continue
			if (key_of(line[i]) != "providers") continue
			if (providers) refuse("providers 出现了两次")
			providers = i
			providers_rest = REST
		}

		header = ""
		if (!providers) {
			after = block_last
			depth = child + child
			header = pad(child) "providers:"
		} else {
			value = inline_value(providers_rest)
			if (!is_empty_value(value)) refuse("providers 写成了单行")
			if (value != "") line[providers] = pad(child) "providers:"
			providers_last = block_end(providers + 1, block_last, child)
			depth = first_indent(providers + 1, providers_last, child + child)
			for (i = providers + 1; i <= providers_last; i++) {
				if (is_blank(line[i]) || indent_of(line[i]) != depth) continue
				if (!(key_of(line[i]) in managed)) continue
				entry_last = block_end(i + 1, providers_last, depth)
				for (j = i; j <= entry_last; j++) drop[j] = 1
				i = entry_last
			}
			after = providers_last
		}

		for (i = 1; i <= n; i++) {
			if (!(i in drop)) emit(line[i])
			if (i != after) continue
			if (header != "") emit(header)
			emit_file(block_file, depth)
		}
	}

	if (!has_default) {
		emit_section_break()
		emit_file(default_file, 0)
	}
}

function edit_credentials(    i, name, entry, filled, version, refs, refs_rest, value, refs_last, child, found) {
	entry = ref ": \"" ENVIRON["LUK_SETUP_KEY"] "\""

	filled = 0
	version = 0
	refs = 0
	for (i = 1; i <= n; i++) {
		if (is_blank(line[i])) continue
		filled++
		if (indent_of(line[i]) > 0) continue
		name = key_of(line[i])
		if (name == "version") {
			if (inline_value(REST) != "1") refuse("version 不是 1")
			version = i
		}
		if (name != "refs") continue
		if (refs) refuse("refs 出现了两次")
		refs = i
		refs_rest = REST
	}

	if (filled == 0) {
		for (i = 1; i <= n; i++) emit(line[i])
		emit("version: 1")
		emit("refs:")
		emit("  " entry)
		return
	}
	if (!version) refuse("没有 version")
	if (!refs) {
		for (i = 1; i <= n; i++) emit(line[i])
		emit("refs:")
		emit("  " entry)
		return
	}

	value = inline_value(refs_rest)
	if (!is_empty_value(value)) refuse("refs 写成了单行")
	if (value != "") line[refs] = "refs:"
	refs_last = block_end(refs + 1, n, 0)
	child = first_indent(refs + 1, refs_last, 2)
	found = 0
	for (i = refs + 1; i <= refs_last; i++) {
		if (is_blank(line[i]) || indent_of(line[i]) != child) continue
		if (key_of(line[i]) != ref) continue
		if (found) refuse("同名的密钥引用出现了两次")
		if (block_end(i + 1, refs_last, child) > i) refuse("同名的密钥引用占了多行")
		line[i] = pad(child) entry
		found = 1
	}
	for (i = 1; i <= n; i++) {
		emit(line[i])
		if (i == refs && !found) emit(pad(child) entry)
	}
}

{
	sub(/\r$/, "")
	line[NR] = $0
}
END {
	n = NR
	total = 0
	for (i = 1; i <= n; i++) {
		if (line[i] ~ /^ *\t/) refuse("用了 Tab 缩进")
	}
	check_top_level()
	if (mode == "settings") edit_settings()
	else edit_credentials()
	for (i = 1; i <= total; i++) print out[i]
}
AWK

stamp=$(date +%Y%m%d-%H%M%S)
backed_up=0

# put_file replaces $2 with the contents of $1, keeping a copy of what was there.
put_file() {
	if [ -e "$2" ] && cmp -s "$1" "$2"; then
		return 0
	fi
	if [ -e "$2" ]; then
		cp -p "$2" "$2.luk-backup-$stamp"
		backed_up=1
	fi
	if [ -L "$2" ]; then
		cat "$1" >"$2"
		return 0
	fi
	if [ -e "$2" ]; then
		cp -p "$2" "$2.luk-new.$$"
	fi
	cat "$1" >"$2.luk-new.$$"
	mv -f "$2.luk-new.$$" "$2"
}

source_of() {
	if [ -e "$1" ]; then
		printf '%s' "$1"
	else
		printf '%s' /dev/null
	fi
}

had_default=0
if [ -e "$settings" ] && grep -q '^agent-default-model:' "$settings"; then
	had_default=1
fi

settings_done=0
if awk -f "$work/edit.awk" -v mode=settings -v ids="$ids" \
	-v block_file="$work/providers" -v default_file="$work/default" \
	"$(source_of "$settings")" >"$work/settings.new"; then
	put_file "$work/settings.new" "$settings"
	settings_done=1
fi

credentials_done=0
if LUK_SETUP_KEY=$key awk -f "$work/edit.awk" -v mode=credentials -v ref="$ref" \
	"$(source_of "$credentials")" >"$work/credentials.new"; then
	put_file "$work/credentials.new" "$credentials"
	chmod 600 "$credentials"
	credentials_done=1
fi

models=$(grep -c '^ *- id:' "$work/providers" || true)

if [ "$settings_done" = 1 ]; then
	printf '%s\n' "已写入 $SITE 的提供方和 $models 个模型：$settings"
else
	printf '%s\n' "没有改动 $settings ：它现有的写法这个脚本不敢动（$(sed -n 1p "$work/settings.new")）。"
	printf '%s\n' "请把下面这段放到 llm-pi-ai 的 providers 下面，替换掉其中同名的条目："
	printf '\n'
	sed 's/^/    /' "$work/providers"
	printf '\n'
fi
if [ "$credentials_done" = 1 ]; then
	printf '%s\n' "已保存密钥：$credentials"
else
	printf '%s\n' "没有改动 $credentials ：它现有的写法这个脚本不敢动（$(sed -n 1p "$work/credentials.new")）。"
	printf '%s\n' "请打开 DSH 的 设置 → 模型，在 $SITE 那一栏里粘贴密钥；密钥在 $SITE 控制台的「API 密钥」里，名称是 DSH。"
fi
if [ "$backed_up" = 1 ]; then
	printf '%s\n' "改动前的文件已备份在同一目录，文件名以 .luk-backup-$stamp 结尾。"
fi

if [ "$settings_done" = 1 ] && [ "$credentials_done" = 1 ]; then
	if [ "$had_default" = 1 ]; then
		printf '%s\n' "DSH 不用重启。新建一个会话，在模型列表里选 $SITE 下的模型就能用了。"
	else
		printf '%s\n' "DSH 不用重启，默认模型也已经设好，新建一个会话就能用了。"
	fi
	exit 0
fi
exit 2
