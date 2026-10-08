#!/usr/bin/env bash
# js-bridge.sh 의 _jsb_path: cygpath -m 이 낸 경로가 실제 파일일 때만 쓰고, 아니면(없는 경로·빈 출력·실패) 원래 경로로 node 를 부른다.
# 가짜 node(인자 1 = 모듈 경로를 찍는다)와 가짜 cygpath 만 쓴다. 실제 node·윈도우가 필요 없다(js-w1a 의 compat 없이도 확인 가능).
# 사용법: bash tests/js-bridge-path.sh   (실패가 있으면 종료 코드 1)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
LIB="$(cd "$here/../scripts/lib" && pwd)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/jsb-path-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0
chk() { if [ "$1" = ok ]; then echo "ok   $2"; else echo "FAIL $2${3:+ — $3}"; fail=1; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

mkdir -p "$tmp/bin"
printf '#!/bin/sh\nprintf "%%s" "$1"\n' > "$tmp/bin/node"; chmod +x "$tmp/bin/node"        # 모듈 경로(인자 1)를 그대로 찍는다
cp "$LIB/common.mjs" "$tmp/alt.mjs"                                                          # 「변환한 경로」로 쓸 실제 파일
cyg() { printf '#!/bin/sh\n%s\n' "$1" > "$tmp/bin/cygpath"; chmod +x "$tmp/bin/cygpath"; }
call() { PATH="$tmp/bin:$PATH" bash -c '. "$1/js-bridge.sh"; _jsb_call common coord_q a' _ "$LIB"; }

rm -f "$tmp/bin/cygpath"
eq "cygpath 없음: 원래 경로" "$(call)" "$LIB/common.mjs"
cyg 'printf "C:/mixed/not/there/common.mjs"'
eq "cygpath 가 없는 경로를 내면 원래 경로로 부른다" "$(call)" "$LIB/common.mjs"
cyg 'exit 1'
eq "cygpath 가 실패하면 원래 경로" "$(call)" "$LIB/common.mjs"
cyg ':'
eq "cygpath 가 빈 출력이면 원래 경로" "$(call)" "$LIB/common.mjs"
cyg "printf '%s' '$tmp/alt.mjs'"
eq "cygpath 가 실제 파일을 내면 그 경로를 쓴다" "$(call)" "$tmp/alt.mjs"
cyg '[ "$1" = -m ] && printf "%s" "$2.nope"'
eq "cygpath 변환 결과가 파일이 아니면(뒤에 .nope) 원래 경로" "$(call)" "$LIB/common.mjs"

[ "$fail" = 0 ] && echo "통과 6 · 실패 0" || { echo "실패 있음"; exit 1; }
