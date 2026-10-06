#!/usr/bin/env bash
# 사용법: term-send-safe.sh (--handle <h> | --lane <레인>) (--text <글> | --text-file <f>) [--timeout-ms 300000] [--raw [--expect-sha <sha>]] [--allow-busy] [--dry-run]
#   다른 세션 터미널에 안전하게 글을 넣는다(설계 §2.1·§3.j-3·§3.l-3). 정본 출력: references/contract.md §3.5
#   순서: handle 존재 → 글에 ! 없음 → tui-idle(satisfied) → 화면에 esc to interrupt·확인 창·Compacting 없음
#         → 입력창에 쓰다 만 글 없음(애매하면 보내지 않음) → send --enter --wait-submit 10.
#   stdout: `SENT <h> <turn_started|submitted|accepted>` 또는
#           `REFUSED <h> <stale|not-idle|interrupt-visible|prompt-open|compacting|bang-in-text|draft-in-input>`.
#   --raw: 확인 창 응답용(글은 1 또는 2). tui-idle 검사 없이 확인 창이 보일 때만 Enter 없이 보내고,
#          3초 뒤 다시 읽어 창이 사라졌는지 stderr 로 알린다. 창이 없으면 `REFUSED <h> no-prompt`.
#          --raw 와 함께 쓰는 선택 옵션(조정자가 판단 올리기 뒤 직접 답할 때, approvals.md §3):
#          --lane <레인>  핸들 찾기에 더해 폴러·auto-answer 와 같은 레인 단위 잠금($DFLOW_CONSOLE_DIR/lock/lane-<레인>)을 쥐고 보낸다.
#                         못 얻으면 `REFUSED <h> lane-busy`. 방금 다른 답이 들어간 같은 창(보낸 표식)이면 `REFUSED <h> prompt-changed`.
#                         보낸 직후 잠금을 쥔 채 보낸 표식을 남기고, 입력 요청 기록이 보낸 창(잠금 안에서 확인한 창 지문)과 같으면
#                         handled(coordinator)·소비 (since, 발췌 sha)·(since, full) 를 직접 남긴다(console_input_mark_handled — 다음 창
#                         기록은 건드리지 않는다). office 알림은 폴러 다음 주기 또는 부른 쪽의
#                         `console-poll.sh input-handled --lane <레인> --by coordinator --expect-full <지문>`.
#          --expect-sha <지문>  판단 시점 화면의 창 지문(`console-poll.sh judge-sha --lane <레인>` 의 JUDGE 셋째 값). **--lane 이 있을 때만**
#                         받는다(없으면 사용법 오류 종료 코드 2 — 잠금 없이 보내지 않게). 잠금 안에서 다시 읽은 화면의 지문이 다르거나 지문을
#                         만들지 못하면(창 머리가 밀림) 보내지 않고 `REFUSED <h> prompt-changed`.
#          --lane 을 주면 화면을 41줄 읽는다(judge-sha 와 같은 입력). 옵션이 없을 때의 동작·출력은 그대로다.
#   --allow-busy: 작업 중인 세션에도 넣는다(Claude Code 가 작업 중 입력을 다음 차례로 받아 둔다). tui-idle 대기와 `esc to interrupt` 거절
#          (not-idle·interrupt-visible)을 건너뛴다. stale·bang-in-text·prompt-open·compacting·draft-in-input 판정은 그대로다.
#          옵션이 없을 때의 동작·출력은 불변. 바쁜 세션의 입력창은 화면이 계속 바뀌므로 draft 판정은 입력창 모양만 본다.
#          대신 입력창 틀(가로줄·입력줄·가로줄)이 화면 끝(닫는 가로줄 아래 글 줄 6개 이하, `claude --resume` 안내 없음)에
#          있어야 한다 — 아니면 `REFUSED <h> draft-in-input`(셸로 돌아간 탭에 넣지 않게).
#   --dry-run: 읽기·판정은 실제로 하고, 보내기 직전에 멈춰 stderr 에 DRY 를 찍고 stdout 에 `DRY SENT <h> -`(보냈다면 나올 줄에 DRY 를 붙임).
set -uo pipefail
. "$(dirname "$0")/lib/common.sh"
. "$(dirname "$0")/lib/term.sh"

h="" lane="" text="" textfile="" timeout_ms=300000 raw=0 busy=0 dry=0 has_text=0 expect=""
while [ $# -gt 0 ]; do
  case "$1" in
    --handle) h="${2:-}"; shift ;;
    --lane) lane="${2:-}"; shift ;;
    --expect-sha) expect="${2:-}"; shift ;;
    --text) text="${2-}"; has_text=1; shift ;;
    --text-file) textfile="${2:-}"; shift ;;
    --timeout-ms) timeout_ms="${2:-}"; shift ;;
    --raw) raw=1 ;;
    --allow-busy) busy=1 ;;
    --dry-run) dry=1 ;;
    -h|--help) sed -n '2,/^set -uo/p' "$0" | sed '$d'; exit 0 ;;
    *) coord_die 2 "모르는 인자: $1" ;;
  esac
  shift
done
[ "$dry" = 1 ] && export COORD_DRY=1
[ -z "$expect" ] || [ "$raw" = 1 ] || coord_die 2 "--expect-sha 는 --raw 와 함께만 쓴다"
[ -z "$expect" ] || [ -n "$lane" ] || coord_die 2 "--expect-sha 는 --lane 과 함께만 쓴다(레인 잠금 없이 보내지 않는다)"
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
    # 가로줄: ─ 가 10개 이상이고 줄 맨 앞과 끝이 ─ 이다. `claude -n <이름>` 으로 띄우면 상단 줄에 이름이 붙으므로
    # (예: ─────── kitfix-probe ─) 줄 전체가 ─ 뿐이어야 한다는 조건은 쓰지 않는다.
    function is_rule(x,   t, n) { if (x !~ /^[[:space:]]*─/ || x !~ /─[[:space:]]*$/) return 0; t = x; n = gsub(/─/, "", t); return (n >= 10) }
    { line[NR] = $0 }
    END {
      p = 0
      for (i = NR; i >= 2; i--) if (is_rule(line[i-1]) && line[i] ~ /^[[:space:]]*(❯|>)/) { p = i; break }
      if (!p) { print "unknown"; exit }
      s = line[p]; sub(/^[[:space:]]*(❯|>)/, "", s); gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
      if (s ~ /^Try "[^"]*("|…)$/) s = ""   # 안내 문구 전체 모양일 때만(`Try "x" 로 다시 해 줘` 같은 글은 draft)
      if (s != "") { print "draft"; exit }
      for (j = p + 1; j <= NR; j++) {
        if (is_rule(line[j])) { print "empty"; exit }
        if (line[j] ~ /[^[:space:]]/) { print "draft"; exit }
      }
      print "unknown"
    }'
}
if [ "${TERM_SEND_SAFE_SELFTEST:-}" = 1 ]; then input_state; exit 0; fi

# --allow-busy 전용: 입력창 틀이 화면 끝에 있는지(Claude Code 가 떠 있는지). 입력창을 닫는 가로줄 아래에 글 있는 줄이
# FRAME_TAIL_MAX 개 이하이고, 그 아래에 Claude Code 를 끝낸 뒤 나오는 안내(`claude --resume`·`Resume this session`)가 없으면 ok.
# 끝난 세션의 마지막 화면 위에 셸 프롬프트가 이어진 탭(레인 세션이 죽어 셸로 돌아감)에 넣지 않게 한다.
# 프롬프트 문자(%·$ 등)는 보지 않는다(사용자 상태 줄에 흔히 들어간다).
FRAME_TAIL_MAX=6
frame_at_end() {
  LC_ALL=C sed $'s/\xc2\xa0/ /g' | awk -v max="$FRAME_TAIL_MAX" '
    function is_rule(x,   t, n) { if (x !~ /^[[:space:]]*─/ || x !~ /─[[:space:]]*$/) return 0; t = x; n = gsub(/─/, "", t); return (n >= 10) }
    { line[NR] = $0 }
    END {
      p = 0
      for (i = NR; i >= 2; i--) if (is_rule(line[i-1]) && line[i] ~ /^[[:space:]]*(❯|>)/) { p = i; break }
      if (!p) { print "no"; exit }
      e = 0
      for (j = p + 1; j <= NR; j++) if (is_rule(line[j])) { e = j; break }
      if (!e) { print "no"; exit }
      n = 0
      for (j = e + 1; j <= NR; j++) {
        if (line[j] ~ /claude --resume|Resume this session/) { print "no"; exit }
        if (line[j] ~ /[^[:space:]]/) n++
      }
      print (n <= max) ? "ok" : "no"
    }'
}

# 1. handle 존재
term_list | cut -f1 | grep -qxF "$h" || refuse stale "터미널 목록에 없다: $h"

screen_has_prompt() { printf '%s\n' "$1" | coord_screen_prompt_kind; }

if [ "$raw" = 1 ]; then
  case "$text" in 1|2) ;; *) coord_die 2 "--raw 는 1 또는 2 만 보낸다" ;; esac
  rlock="" rsha="-" rfull="" nread=40
  if [ -n "$lane" ]; then
    # 잠금·화면 일치 확인은 폴러·auto-answer 와 같은 라이브러리로 한다(없으면 확인할 수 없으므로 보내지 않는다)
    { [ -f "$COORD_LIB_DIR/console-redact.sh" ] && [ -f "$COORD_LIB_DIR/console-input.sh" ] \
      && . "$COORD_LIB_DIR/console-redact.sh" 2>/dev/null && . "$COORD_LIB_DIR/console-input.sh" 2>/dev/null; } \
      || coord_die 4 "가림·입력 요청 라이브러리가 없어 --lane·--expect-sha 를 확인할 수 없다"
    [ -z "$expect" ] || printf '%s' "$expect" | grep -Eqx '[0-9a-f]{64}' || coord_die 2 "--expect-sha 는 64자 소문자 hex"
    nread=41
  fi
  if [ -n "$lane" ]; then
    console_input_ref_ok "$lane" || coord_die 2 "레인 이름 형식 오류: $lane"
    console_lane_lock "$lane" || refuse lane-busy "레인 잠금을 얻지 못했다(폴러·auto-answer 가 답하는 중): $lane"
    rlock="$lane"
    trap '[ -n "$rlock" ] && console_lane_unlock "$rlock"' EXIT
  fi
  scr="$(term_read_screen "$h" "$nread")" || refuse stale "화면 읽기 실패: $h"
  kind="$(screen_has_prompt "$scr")"
  [ -n "$kind" ] || refuse no-prompt "확인 창이 보이지 않아 보내지 않았다"
  [ "$kind" = usage-limit ] && coord_log "주의: 사용 한도 창이다(1/2 의 뜻을 화면에서 확인할 것)"
  if [ -n "$lane" ]; then
    tf="$(umask 077; mktemp "${TMPDIR:-/tmp}/tss-scr.XXXXXX")" || coord_die 4 "임시 파일을 만들지 못했다"
    printf '%s\n' "$scr" > "$tf"; console_input_snapshot "$tf"; src=$?; rm -f "$tf"
    [ "$src" = 0 ] || refuse prompt-changed "화면 발췌를 만들지 못해 보내지 않았다"
    rsha="$CI_SHA"; rfull="$CI_FULL"
    if [ -n "$expect" ]; then
      [ -n "$rfull" ] || refuse prompt-changed "창 머리를 찾지 못해 지문을 만들지 못했다(보내지 않음)"
      [ "$rfull" = "$expect" ] || refuse prompt-changed "판단한 화면과 지금 화면이 달라 보내지 않았다"
    fi
    if console_lane_recent_send "$rlock" "$rsha"; then
      refuse prompt-changed "방금 다른 답이 들어간 같은 창이라 보내지 않았다"
    fi
  fi
  if [ "$dry" = 1 ]; then
    coord_log "DRY term_send $h $text (확인 창: $kind, Enter 없음)"
    echo "DRY SENT $h -"; exit 0
  fi
  # 보낸 직후(잠금 안): 보낸 표식 + 기록이 보낸 창(rfull)이면 handled·소비. 넣었을 수 있는 오류에도 남긴다(같은 창 재전송 방지)
  sent_mark() {
    [ -n "$rlock" ] || return 0
    console_lane_mark_sent "$rlock" "$rsha"
    if [ -n "$rfull" ]; then
      console_input_mark_handled "coord_lane_$rlock" coordinator "$rfull"
      case "$?" in
        0) console_input_notify "coord_lane_$rlock"; [ "$CI_MH_CONS" = 1 ] || coord_log "소비 목록 쓰기 실패(coord_lane_$rlock)" ;;
        1|2) coord_log "입력 요청 기록이 없거나 이미 다음 창이라 처리됨 표시를 남기지 않음(coord_lane_$rlock)" ;;
        *) coord_log "입력 요청 기록 잠금·쓰기 실패(coord_lane_$rlock)" ;;
      esac
    fi
    console_lane_unlock "$rlock"; rlock=""
  }
  res="$(term_send "$h" "$text")"
  case "$res" in stale) refuse stale ;; error*) sent_mark; coord_die 4 "보내기 실패: $res" ;; esac
  sent_mark
  sleep 3
  scr2="$(term_read_screen "$h" 40)"
  if [ -n "$(screen_has_prompt "$scr2")" ]; then coord_log "확인 창이 아직 보인다(다시 읽어 확인할 것): $h"
  else coord_log "확인 창이 사라졌다: $h"; fi
  echo "SENT $h $res"; exit 0
fi

# 2. 글 검사(기다리기 전에): opencode·Claude 모두 ! 로 시작하면 셸 모드가 된다
case "$text" in *'!'*) refuse bang-in-text "글에 ! 가 있어 보내지 않았다" ;; esac

# 3. tui-idle
if [ "$busy" = 1 ]; then :   # --allow-busy: 작업 중이어도 넣는다(stale 은 위 1 단계에서 이미 걸렀다)
else
  w="$(term_wait_idle "$h" "$timeout_ms")"
  case "$w" in
    satisfied) ;;
    stale) refuse stale ;;
    *) refuse not-idle "tui-idle 이 ${timeout_ms}ms 안에 오지 않았다($w)" ;;
  esac
fi

# 4. 화면 검사
scr="$(term_read_screen "$h" 40)" || refuse stale "화면 읽기 실패: $h"
bottom="$(printf '%s\n' "$scr" | tail -n 20)"
[ "$busy" = 1 ] || case "$bottom" in *"esc to interrupt"*) refuse interrupt-visible ;; esac
[ -n "$(screen_has_prompt "$scr")" ] && refuse prompt-open "확인 창: $(screen_has_prompt "$scr")"
case "$bottom" in *Compacting*) refuse compacting ;; esac

# 5. 쓰다 만 글
st="$(printf '%s\n' "$scr" | input_state)"
case "$st" in
  empty) ;;
  draft) refuse draft-in-input "입력창에 쓰다 만 글이 있다" ;;
  *) refuse draft-in-input "입력창을 찾지 못해 판정이 애매하다(보내지 않음)" ;;
esac
# --allow-busy 는 tui-idle 을 보지 않으므로 Claude Code 가 떠 있는지를 입력창 틀 위치로 한 번 더 본다(옵션 없는 동작은 그대로)
if [ "$busy" = 1 ] && [ "$(printf '%s\n' "$scr" | frame_at_end)" != ok ]; then
  refuse draft-in-input "입력창 틀이 화면 끝에 없다(세션이 끝나 셸로 돌아갔을 수 있음, 보내지 않음)"
fi

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
