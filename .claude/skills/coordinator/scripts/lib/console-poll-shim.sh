#!/usr/bin/env bash
# console-poll.mjs 가 console-input·console-resolve 의 bash 함수를 한 번 부를 때 쓰는 이음매(lib/console-poll-deps.mjs 가 spawn).
# 사용법: bash console-poll-shim.sh <scripts 폴더> <함수> [인자…]   환경: SHIM_GLOBALS(공백으로 나눈 전역 변수 이름들)·SHIM_GLOBALS_FILE(NAME=값\0 …을 쓸 파일)
# W1-a 의 console-input.mjs·console-resolve.mjs 가 머지되면 쓰지 않는다.
SD="$1"; shift
. "$SD/lib/common.sh"; . "$SD/lib/term.sh"; . "$SD/lib/console-resolve.sh"; . "$SD/lib/screen-cache.sh"
. "$SD/lib/console-redact.sh"; . "$SD/lib/console-input.sh"
coord_default_repo
# run_limited·kill_tree·descendants: console-poll.sh 의 것과 같은 글(console-resolve.sh 의 lead-state 호출이 쓴다)
descendants() { compat_descendants "$1"; }
kill_tree() { compat_kill_tree "$1"; }
RL_SEQ=0
run_limited() {
  local secs="$1" out="$2" err="$3" in="$4" pid wd rc mk; shift 4
  RL_SEQ=$((RL_SEQ + 1)); mk="$TMPD/rl.$$.$RL_SEQ.timeout"
  "$@" >"$out" 2>"$err" <"$in" &
  pid=$!; RL_PID="$pid"
  ( trap 'kill "$sp" 2>/dev/null; exit 0' TERM
    sleep "$secs" & sp=$!
    wait "$sp" 2>/dev/null || exit 0
    kill -0 "$pid" 2>/dev/null || exit 0
    trap '' TERM
    : > "$mk"; kill_tree "$pid" ) >/dev/null 2>&1 &
  wd=$!; RL_WD="$wd"
  wait "$pid" 2>/dev/null; rc=$?
  kill "$wd" 2>/dev/null; wait "$wd" 2>/dev/null
  RL_PID=""; RL_WD=""
  if [ -f "$mk" ]; then rm -f "$mk"; rc=124; fi
  return "$rc"
}
RL_PID=""; RL_WD=""
"$@"; _rc=$?
if [ -n "${SHIM_GLOBALS_FILE:-}" ]; then
  for _n in ${SHIM_GLOBALS:-}; do printf '%s=%s\0' "$_n" "${!_n}"; done > "$SHIM_GLOBALS_FILE"
fi
exit "$_rc"
