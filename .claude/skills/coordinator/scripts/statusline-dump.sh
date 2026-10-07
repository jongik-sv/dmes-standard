#!/usr/bin/env bash
# 사용법: statusLine 명령으로 건다(stdin = Claude Code statusLine JSON). 설계 §3.j-1 (A).
#   `{at, session_id, context_window, rate_limits}` 를 <state_dir>/ctx/<session_id>.json 에 임시 파일 → mv 로 쓴다.
#   환경 변수 COORD_STATUSLINE_NEXT 가 있으면 같은 stdin 을 그 명령(bash -c)에 넘겨 출력을 그대로 낸다(없으면 아무것도 안 냄).
#   statusline 을 깨지 않도록 어떤 실패에도 exit 0. common.sh 는 하위 셸에서만 읽는다(그 안의 exit 가 여기까지 오지 않게).
case "${COMPAT_FORCE_OS:-$(uname -s)}" in windows|MINGW*|MSYS*|CYGWIN*) _sb=$(cd "$(dirname "$0")/../../_shared/bin" 2>/dev/null && pwd) && PATH="$_sb:$PATH" ;; esac   # 윈도우: 동봉 jq(_shared/bin) 우선
set -uo pipefail

in="$(cat 2>/dev/null)"
{
  sd="$( ( . "$(dirname "$0")/lib/common.sh" && coord_state_root ) 2>/dev/null )"
  [ -n "$sd" ] || sd="$HOME/.coord"
  sid="$(printf '%s' "$in" | jq -r '.session_id // empty' 2>/dev/null)"
  case "$sid" in ''|*[!A-Za-z0-9._-]*) sid="" ;; esac
  if [ -n "$sid" ] && mkdir -p "$sd/ctx" 2>/dev/null; then
    s="$(date +%Y-%m-%dT%H:%M:%S%z)"; at="${s%??}:${s: -2}"
    tmp="$sd/ctx/.$sid.json.$$"
    if printf '%s' "$in" | jq -c --arg at "$at" \
         '{at:$at, session_id:.session_id, context_window:(.context_window // null), rate_limits:(.rate_limits // null)}' \
         > "$tmp" 2>/dev/null; then
      mv -f "$tmp" "$sd/ctx/$sid.json" 2>/dev/null || rm -f "$tmp"
    else
      rm -f "$tmp"
    fi
  fi
} 2>/dev/null

if [ -n "${COORD_STATUSLINE_NEXT:-}" ]; then
  printf '%s' "$in" | bash -c "$COORD_STATUSLINE_NEXT" 2>/dev/null
fi
exit 0
