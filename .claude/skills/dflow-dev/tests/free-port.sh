#!/usr/bin/env bash
# free-port.sh 시험 — node 로 빈 포트를 받고, python 은 부르지 않으며, node·lsof·nc 가 모두 없으면 FREE_PORT_UNCHECKED 로 번호를 낸다.
# 사용법: bash tests/free-port.sh   (node 필요. 네트워크·도커를 쓰지 않는다)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
FP="$here/../scripts/free-port.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/free-port-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }
isport() { case "$1" in ''|*[!0-9]*) return 1 ;; esac; [ "$1" -ge 1024 ] && [ "$1" -le 65535 ]; }

grep -q 'python' <(grep -v '^#' "$FP") && chk fail "스크립트 본문에 python 호출이 없다" || chk ok "스크립트 본문에 python 호출이 없다"

p="$(bash "$FP" 2>/dev/null)"; rc=$?
eq "rc 0" "$rc" 0
isport "$p" && chk ok "node 로 받은 번호가 1024~65535 의 숫자($p)" || chk fail "번호" "[$p]"

# python 흉내(번호를 내지만 불리면 표식을 남긴다) 가 PATH 에 있어도 부르지 않는다
mkdir -p "$tmp/py"
for n in python python3; do printf '#!/bin/sh\ntouch "%s/called"\necho 12345\n' "$tmp" > "$tmp/py/$n"; chmod +x "$tmp/py/$n"; done
p="$(PATH="$tmp/py:$PATH" bash "$FP" 2>/dev/null)"
eq "python 이 PATH 에 있어도 부르지 않는다" "$([ -e "$tmp/called" ] && echo called || echo none)" none
[ "$p" != 12345 ] && chk ok "python 이 낸 번호를 쓰지 않는다" || chk fail "python 번호 사용"

# node·lsof·nc 가 모두 없으면 확인 없이 번호를 내고 stderr 에 FREE_PORT_UNCHECKED
mkdir -p "$tmp/min"
for t in tr head cat dirname; do ln -sf "$(command -v "$t")" "$tmp/min/$t"; done
out="$(PATH="$tmp/min" /bin/bash "$FP" 2>"$tmp/err")"; rc=$?
eq "도구가 없어도 rc 0" "$rc" 0
isport "$out" && chk ok "확인 없이 낸 번호가 범위 안($out)" || chk fail "폴백 번호" "[$out]"
eq "stderr 에 FREE_PORT_UNCHECKED" "$(grep -c '^FREE_PORT_UNCHECKED' "$tmp/err")" 1

echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
