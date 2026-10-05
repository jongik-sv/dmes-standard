#!/usr/bin/env bash
# 사용법: term-send-safe.sh (--handle <h> | --lane <레인>) (--text <글> | --text-file <f>) [--timeout-ms 300000] [--raw] [--dry-run]
#   다른 세션 터미널에 안전하게 글을 넣는다(설계 §2.1·§3.j-3·§3.l-3). 정본 출력: references/contract.md §3.5
#   순서: handle 존재 → 글에 ! 없음 → tui-idle(satisfied) → 화면에 esc to interrupt·확인 창·Compacting 없음
#         → 입력창에 쓰다 만 글 없음(애매하면 보내지 않음) → send --enter --wait-submit 10.
#   stdout: `SENT <h> <turn_started|submitted|accepted>` 또는
#           `REFUSED <h> <stale|not-idle|interrupt-visible|prompt-open|compacting|bang-in-text|draft-in-input>`.
#   --raw: 확인 창 응답용(글은 1 또는 2). tui-idle 검사 없이 확인 창이 보일 때만 Enter 없이 보내고,
#          3초 뒤 다시 읽어 창이 사라졌는지 stderr 로 알린다. 창이 없으면 `REFUSED <h> no-prompt`.
#   --dry-run: 읽기·판정은 실제로 하고, 보내기 직전에 멈춰 stderr 에 DRY 를 찍고 stdout 에 `DRY SENT <h> -`(보냈다면 나올 줄에 DRY 를 붙임).
set -uo pipefail
. "$(dirname "$0")/lib/common.sh"
. "$(dirname "$0")/lib/term.sh"

h="" lane="" text="" textfile="" timeout_ms=300000 raw=0 dry=0 has_text=0
while [ $# -gt 0 ]; do
  case "$1" in
    --handle) h="${2:-}"; shift ;;
    --lane) lane="${2:-}"; shift ;;
    --text) text="${2-}"; has_text=1; shift ;;
    --text-file) textfile="${2:-}"; shift ;;
    --timeout-ms) timeout_ms="${2:-}"; shift ;;
    --raw) raw=1 ;;
    --dry-run) dry=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) coord_die 2 "모르는 인자: $1" ;;
  esac
  shift
done
[ "$dry" = 1 ] && export COORD_DRY=1
case "$timeout_ms" in ''|*[!0-9]*) coord_die 2 "--timeout-ms 는 정수(ms)" ;; esac
if [ -n "$textfile" ]; then
  [ -f "$textfile" ] || coord_die 2 "글 파일이 없다: $textfile"
  text="$(cat "$textfile")"; has_text=1
fi
[ "$has_text" = 1 ] && [ -n "$text" ] || coord_die 2 "--text 또는 --text-file 이 필요하다"
if [ -z "$h" ]; then
  [ -n "$lane" ] || coord_die 2 "--handle 또는 --lane 이 필요하다"
  coord_has_run || coord_die 3 "현재 회차가 없다"
  h="$(coord_lane_get "$lane" .session.handle)"
  [ -n "$h" ] || coord_die 3 "레인 $lane 의 handle 이 상태에 없다"
fi

refuse() { echo "REFUSED $h $1"; [ -n "${2:-}" ] && coord_log "$2"; exit 0; }

# 입력창 상태: empty | draft | unknown. 입력창 = 가로줄 바로 아래에서 ❯ 또는 > 로 시작하는 마지막 줄,
# 그 아래 다음 가로줄까지가 이어지는 줄. 새 세션의 흐린 안내문(❯ Try "…")은 빈 것으로 본다.
input_state() {
  LC_ALL=C sed $'s/\xc2\xa0/ /g' | awk '
    function is_rule(x,   t, n) { t = x; n = gsub(/─/, "", t); return (n >= 10 && t ~ /^[[:space:]]*$/) }
    { line[NR] = $0 }
    END {
      p = 0
      for (i = NR; i >= 2; i--) if (is_rule(line[i-1]) && line[i] ~ /^[[:space:]]*(❯|>)/) { p = i; break }
      if (!p) { print "unknown"; exit }
      s = line[p]; sub(/^[[:space:]]*(❯|>)/, "", s); gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
      if (s ~ /^Try "/) s = ""
      if (s != "") { print "draft"; exit }
      for (j = p + 1; j <= NR; j++) {
        if (is_rule(line[j])) { print "empty"; exit }
        if (line[j] ~ /[^[:space:]]/) { print "draft"; exit }
      }
      print "unknown"
    }'
}
if [ "${TERM_SEND_SAFE_SELFTEST:-}" = 1 ]; then input_state; exit 0; fi

# 1. handle 존재
term_list | cut -f1 | grep -qxF "$h" || refuse stale "터미널 목록에 없다: $h"

screen_has_prompt() { printf '%s\n' "$1" | coord_screen_prompt_kind; }

if [ "$raw" = 1 ]; then
  case "$text" in 1|2) ;; *) coord_die 2 "--raw 는 1 또는 2 만 보낸다" ;; esac
  scr="$(term_read_screen "$h" 40)" || refuse stale "화면 읽기 실패: $h"
  kind="$(screen_has_prompt "$scr")"
  [ -n "$kind" ] || refuse no-prompt "확인 창이 보이지 않아 보내지 않았다"
  [ "$kind" = usage-limit ] && coord_log "주의: 사용 한도 창이다(1/2 의 뜻을 화면에서 확인할 것)"
  if [ "$dry" = 1 ]; then
    coord_log "DRY term_send $h $text (확인 창: $kind, Enter 없음)"
    echo "DRY SENT $h -"; exit 0
  fi
  res="$(term_send "$h" "$text")"
  case "$res" in stale) refuse stale ;; error*) coord_die 4 "보내기 실패: $res" ;; esac
  sleep 3
  scr2="$(term_read_screen "$h" 40)"
  if [ -n "$(screen_has_prompt "$scr2")" ]; then coord_log "확인 창이 아직 보인다(다시 읽어 확인할 것): $h"
  else coord_log "확인 창이 사라졌다: $h"; fi
  echo "SENT $h $res"; exit 0
fi

# 2. 글 검사(기다리기 전에): opencode·Claude 모두 ! 로 시작하면 셸 모드가 된다
case "$text" in *'!'*) refuse bang-in-text "글에 ! 가 있어 보내지 않았다" ;; esac

# 3. tui-idle
w="$(term_wait_idle "$h" "$timeout_ms")"
case "$w" in
  satisfied) ;;
  stale) refuse stale ;;
  *) refuse not-idle "tui-idle 이 ${timeout_ms}ms 안에 오지 않았다($w)" ;;
esac

# 4. 화면 검사
scr="$(term_read_screen "$h" 40)" || refuse stale "화면 읽기 실패: $h"
bottom="$(printf '%s\n' "$scr" | tail -n 20)"
case "$bottom" in *"esc to interrupt"*) refuse interrupt-visible ;; esac
[ -n "$(screen_has_prompt "$scr")" ] && refuse prompt-open "확인 창: $(screen_has_prompt "$scr")"
case "$bottom" in *Compacting*) refuse compacting ;; esac

# 5. 쓰다 만 글
st="$(printf '%s\n' "$scr" | input_state)"
case "$st" in
  empty) ;;
  draft) refuse draft-in-input "입력창에 쓰다 만 글이 있다" ;;
  *) refuse draft-in-input "입력창을 찾지 못해 판정이 애매하다(보내지 않음)" ;;
esac

# 6. 보내기
if [ "$dry" = 1 ]; then
  coord_log "DRY term_send $(coord_q "$h" "$text") --enter --wait-submit 10"
  echo "DRY SENT $h -"; exit 0
fi
res="$(term_send "$h" "$text" --enter --wait-submit 10)"
case "$res" in
  turn_started|submitted|accepted) echo "SENT $h $res" ;;
  stale) refuse stale ;;
  *) coord_die 4 "보내기 실패: $res" ;;
esac
exit 0
