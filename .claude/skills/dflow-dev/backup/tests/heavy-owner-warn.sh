#!/usr/bin/env bash
# heavy.sh 의 윈도우 소유자 경고(HEAVY_WARN) 시험 — CLAUDE_PID·DFLOW_HEAVY_OWNER 가 없을 때만 stderr 한 줄을 내고, 값(소유자)은 바꾸지 않는다.
# 사용법: bash tests/heavy-owner-warn.sh   (슬롯 폴더는 임시 폴더. 네트워크·도커를 쓰지 않는다)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
HEAVY="$here/../scripts/heavy.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/heavy-warn-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2${3:+ — $3}"; fi; }
cnt() { printf '%s\n' "$1" | grep -c "HEAVY_WARN"; }

run() { # run <OS 강제> <환경 추가…> -- <heavy 인자…>  → stderr 만
  local os="$1"; shift
  env -u CLAUDE_PID -u DFLOW_HEAVY_OWNER -u DFLOW_HEAVY_HELD DFLOW_HEAVY_DIR="$tmp/slots" COMPAT_FORCE_OS="$os" "$@" 2>&1 >/dev/null
}

out="$(run windows bash "$HEAVY" release)"
[ "$(cnt "$out")" = 1 ] && chk ok "윈도우·소유자 없음: release 는 경고 1줄" || chk fail "release 경고" "$out"
out="$(run windows bash "$HEAVY" acquire t1)"
[ "$(cnt "$out")" = 1 ] && chk ok "윈도우·소유자 없음: acquire 는 경고 1줄" || chk fail "acquire 경고" "$out"
run windows bash "$HEAVY" release >/dev/null
out="$(run windows CLAUDE_PID=4242 bash "$HEAVY" release)"
[ "$(cnt "$out")" = 0 ] && chk ok "CLAUDE_PID 가 있으면 경고 없음" || chk fail "CLAUDE_PID 경고" "$out"
out="$(run windows DFLOW_HEAVY_OWNER=77 bash "$HEAVY" release)"
[ "$(cnt "$out")" = 0 ] && chk ok "DFLOW_HEAVY_OWNER 가 있으면 경고 없음" || chk fail "OWNER 경고" "$out"
out="$(run linux bash "$HEAVY" release)"
[ "$(cnt "$out")" = 0 ] && chk ok "윈도우가 아니면 경고 없음" || chk fail "비윈도우 경고" "$out"
mkdir -p "$tmp/held"
out="$(run windows DFLOW_HEAVY_HELD="$tmp/held" bash "$HEAVY" acquire t2)"
[ "$(cnt "$out")" = 0 ] && chk ok "감싼 실행 안의 acquire 는 경고 없음" || chk fail "HELD 경고" "$out"

echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
