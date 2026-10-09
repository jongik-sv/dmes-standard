#!/usr/bin/env bash
# 사용법: spawn-lane.sh --name <n> --kind <claude|glm|opencode> [--worktree <경로|선택자>] [--model m] [--effort e]
#                       [--autocompact t] [--prompt-file f] [--dry-run]
#   새 탭에 레인·워커 세션을 띄우고 떴는지 확인한다(설계 §3.e 생성 경로표·GLM 기동 절차·기동 확인).
#   탭 위치: 기본은 조정자가 있는 워크트리(Orca 가 아는 곳)에 탭을 만든다. --worktree 를 안 주면 세션도 그 폴더에서 시작한다.
#     (--worktree 를 안 주면 세션은 조정자의 현재 워크트리 폴더에서 시작한다. 상대경로·~ 는 받지 않는다.)
#     --worktree <절대경로|path:경로>: 세션이 일할 폴더. 그 폴더를 Orca 가 알면 그 워크트리에 탭을 만들고, 모르면(git worktree add 로
#                                    만든 폴더) 조정자의 워크트리에 탭을 만들고 send 로 cd 한다(모르는 폴더에 만든 탭은 화면에 안 보인다).
#     --worktree <name:·branch:·id: 등 선택자>: 그 Orca 워크트리에 탭을 만들고 그 워크트리 폴더에서 시작한다(current·active 는 조정자 폴더를 Orca 가 알 때만).
#   claude  : 빈 탭 terminal create → 셸 대기 → send "cd <폴더> && <launch.claude> -n <n> [--model] [--effort] [--autocompact]" → tui-idle(60초, 안 되면 120초)
#             → ~/.claude/sessions 에 name==<n> 인 새 pid 가 살아 있는지(최대 30초) → --prompt-file 이면 그 경로를 알리는 한 줄을
#             term-send-safe.sh 로 보낸다. (terminal create --command 는 `Timed out waiting for terminal handle` 로 실패한 적이 있어 쓰지 않는다)
#   glm     : glm-preflight.sh 가 ok 여야 하고, 동시 GLM 세션(state kind=glm·state=active) < glm.max_sessions.
#             claude 와 같은 빈 탭 + send "cd <폴더> && <launch.glm> -n <n>" → tui-idle → 화면에 glm-5·API Usage Billing
#             (Claude Max 가 보이면 닫고 실패) → 세션 확인 → 지시 파일 경로 send.
#   opencode: claude 와 같은 빈 탭 + send "cd <폴더> && <launch.opencode>" → tui-idle → 화면 확인 → handle 만 낸다(지시는 조정자가 worker-start 로).
#   stdout: `SPAWNED <n> handle=<h> pid=<pid|-> session_id=<id|->` 또는 `SPAWN_FAIL <n> <wait|process|screen|preflight|glm-cap> <사유>`.
#   성공하면 회차가 있을 때 coord-state.sh lane-add 로 세션 정보(spawned_by: coordinator)를 남긴다. 레인 worktree 는 세션이 일하는 폴더다.
#   --dry-run: 사전 확인(preflight·상한·설정·Orca 워크트리 목록)은 실제로 하고, 터미널 생성부터는 DRY 로 찍고 `DRY SPAWNED <n> handle=- pid=- session_id=-`.
set -uo pipefail
. "$(dirname "$0")/lib/js-bridge.sh"; if _jsb_on SPAWN_LANE; then _jsb_exec "$(dirname "$0")/spawn-lane" "$@"; fi   # node 판(스위치 COORD_JS_SPAWN_LANE)
. "$(dirname "$0")/lib/common.sh"
. "$(dirname "$0")/lib/term.sh"
SD="$(dirname "$0")"

name="" kind="" sel="" model="" effort="" autoc="" pfile="" dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --name) name="${2:-}"; shift ;;
    --kind) kind="${2:-}"; shift ;;
    --worktree) sel="${2:-}"; shift ;;
    --model) model="${2:-}"; shift ;;
    --effort) effort="${2:-}"; shift ;;
    --autocompact) autoc="${2:-}"; shift ;;
    --prompt-file) pfile="${2:-}"; shift ;;
    --dry-run) dry=1 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) coord_die 2 "모르는 인자: $1" ;;
  esac
  shift
done
[ -n "$name" ] && [ -n "$kind" ] || coord_die 2 "--name 과 --kind 가 필요하다"
case "$name" in *[!A-Za-z0-9._-]*) coord_die 2 "이름은 영문·숫자·._- 만: $name" ;; esac
case "$kind" in claude|glm|opencode) ;; *) coord_die 2 "--kind 는 claude|glm|opencode" ;; esac
for v in "$model" "$effort" "$autoc"; do case "$v" in *[!A-Za-z0-9._\[\]-]*) coord_die 2 "값에 쓸 수 없는 글자: $v" ;; esac; done
if [ -n "$pfile" ]; then
  [ -f "$pfile" ] || coord_die 2 "지시 파일이 없다: $pfile"
  pfile="$(cd "$(dirname "$pfile")" && pwd)/$(basename "$pfile")"
fi
[ "$(_term_backend)" = orca ] || coord_die 4 "spawn-lane.sh 는 terminal_backend=orca 만 지원한다"
[ "$dry" = 1 ] && export COORD_DRY=1

fail() { echo "SPAWN_FAIL $name $1 $2"; exit 0; }
SESS_DIR="$(coord_expand "$(coord_cfg .sessions_dir)")"

# name==<n> 이고 살아 있는 세션 pid 들(공백 구분)
live_session_pids() {
  local f p
  for f in "$SESS_DIR"/*.json; do
    [ -f "$f" ] || continue
    p="$(jq -r --arg n "$name" 'select(.name == $n) | .pid // empty' "$f" 2>/dev/null)"
    [ -n "$p" ] && compat_pid_alive "$p" && printf '%s ' "$p"
  done
}
# 생성 전 목록(pre)에 없던 새 세션을 최대 30초 기다린다 → "pid\tsessionId\tsocket"
wait_new_session() {
  local pre="$1" end p f
  end=$(( $(coord_now_epoch) + 30 ))
  while [ "$(coord_now_epoch)" -le "$end" ]; do
    for p in $(live_session_pids); do
      case " $pre " in *" $p "*) continue ;; esac
      f="$SESS_DIR/$p.json"
      [ -f "$f" ] && { jq -r '[.pid, (.sessionId // "-"), (.messagingSocketPath // "")] | @tsv' "$f"; return 0; }
    done
    sleep 2
  done
  return 1
}
orca_create() {  # orca_create <title> [command] → handle
  local out args=(terminal create --worktree "$TAB_SEL" --title "$1" --json)
  [ -n "${2:-}" ] && args+=(--command "$2")
  out="$(orca "${args[@]}" 2>/dev/null)" || true
  [ "$(printf '%s' "$out" | jq -r '.ok // false' 2>/dev/null)" = true ] || { coord_log "terminal create 실패: $(printf '%s' "$out" | head -c 300)"; return 1; }
  printf '%s' "$out" | jq -r '[.. | objects | .handle? | strings | select(startswith("term_"))][0] // empty'
}
orca_known_path() {  # Orca 가 아는 워크트리 폴더인가
  if [ "$COMPAT_WIN" != 1 ]; then
    orca worktree list --json 2>/dev/null | jq -r '.result.worktrees[]?.path' | grep -qxF "$1"; return
  fi
  # Git Bash: Orca 는 C:\x 꼴, 이쪽은 /c/x 꼴일 수 있어 같은 꼴로 맞춰 비교한다
  local w n; n="$(compat_norm_path "$1")"
  while IFS= read -r w; do [ "$(compat_norm_path "$w")" = "$n" ] && return 0; done < <(orca worktree list --json 2>/dev/null | jq -r '.result.worktrees[]?.path')
  return 1
}
# 탭을 만들 워크트리(TAB_SEL)와 세션이 일할 폴더(CD_PATH, 비면 탭 워크트리 폴더)를 정한다.
# 기본 탭 위치: 조정자의 현재 폴더(또는 그 메인 체크아웃) 중 Orca 가 아는 쪽. 둘 다 모르면 active.
# (`current`·`active` 는 현재 폴더가 Orca 가 모르는 git worktree 이면 selector_not_found 가 된다)
resolve_target() {
  local top main p
  TAB_SEL="" CD_PATH=""
  top="$(git rev-parse --show-toplevel 2>/dev/null)"
  main="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"; main="${main%/.git}"
  for p in "$top" "$main"; do
    [ -n "$p" ] && orca_known_path "$p" && { TAB_SEL="path:$(compat_native_path "$p")"; break; }
  done
  [ -n "$TAB_SEL" ] || TAB_SEL=active
  case "$sel" in
    "") CD_PATH="$(cd "${top:-.}" && pwd -P)" ;;   # 탭 위치와 별개로 세션은 조정자의 현재 워크트리에서 시작한다
    ./*|../*|"~"*|.|..) coord_die 2 "--worktree 는 절대경로, path:<경로>, Orca 선택자(name:·branch:·id:·current 등)만 받는다: $sel" ;;
    /*|path:*|[A-Za-z]:[/\\]*)
      # 드라이브 문자 경로는 윈도우에서만 절대 경로다. macOS 는 예전 문구 그대로 거절한다.
      case "$sel" in [A-Za-z]:[/\\]*) [ "$COMPAT_WIN" = 1 ] || coord_die 2 "--worktree 는 절대경로, path:<경로>, Orca 선택자(name:·branch:·id:·current 등)만 받는다: $sel" ;; esac
      p="${sel#path:}"
      compat_is_abs_path "$p" || coord_die 2 "--worktree path: 값은 절대경로만 받는다: $sel"
      [ -d "$p" ] || coord_die 2 "--worktree 폴더가 없다: $p"
      p="$(cd "$p" && pwd -P)"
      CD_PATH="$p"
      orca_known_path "$p" && TAB_SEL="path:$(compat_native_path "$p")" ;;
    current|active|name:*|branch:*|id:*|identity:*|issue:*) TAB_SEL="$sel" ;;
    *) coord_die 2 "--worktree 는 절대경로, path:<경로>, Orca 선택자(name:·branch:·id:·current 등)만 받는다: $sel" ;;
  esac
}
dry_cd() { if [ -n "$CD_PATH" ]; then printf '%s' "$CD_PATH"; else printf '%s' '<그 터미널 worktreePath>'; fi; }
wait_shell() {  # 빈 탭의 셸 프롬프트가 찍힐 때까지(최대 20초). 안 찍혀도 진행한다
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    term_read_screen "$1" 10 2>/dev/null | grep -q '[^[:space:]]' && return 0
    sleep 2
  done
  coord_log "셸 프롬프트가 20초 안에 보이지 않는다 — 그대로 보낸다: $1"
}
# 탭 셸에 보낼 한 줄. 윈도우: 새 탭의 기본 셸이 PowerShell·cmd 일 수 있어 `cd … && …` 를 임시 .sh 파일에 쓰고
# `bash -l "<C:/…/파일.sh>"` 한 줄만 보낸다(작은따옴표 이스케이프 `'\''` 는 PowerShell·cmd 가 풀지 못한다. 큰따옴표 경로는 둘 다 읽는다).
# 파일은 TMPDIR 아래 coord-launch.* 로 남는다(몇 줄이라 따로 지우지 않는다). --dry-run 에서는 파일을 만들지 않는다. 그 밖의 OS 는 그대로.
# bash 가 새 탭의 PATH 에 없으면(Git\cmd 만 PATH 에 든 설치) 이 줄이 실패한다 — 그때는 wait_tui 시간 초과로 SPAWN_FAIL 이 난다.
tab_line() {
  local f
  [ "$COMPAT_WIN" = 1 ] || { printf '%s' "$1"; return 0; }
  if [ "${COORD_DRY:-0}" = 1 ]; then printf 'bash -l "<임시 스크립트>"'; return 0; fi
  f="$(mktemp "${TMPDIR:-/tmp}/coord-launch.XXXXXX")" || { printf '%s' "$1"; return 0; }
  printf '%s\n' "$1" > "$f"
  printf 'bash -l "%s"' "$(compat_native_path "$f")"
}
# 빈 탭을 만들고 "cd <폴더> && <실행 명령>" 을 보낸다. 성공하면 H(handle) 를 채우고 0.
# 1: 탭 생성 실패, 2: 명령 send 실패(탭은 닫는다). 사유는 LAUNCH_ERR.
launch_in_tab() {  # launch_in_tab <title> <실행 명령>
  local r dir cmdline
  H="$(orca_create "$1")" && [ -n "$H" ] || { LAUNCH_ERR="terminal create 결과에서 handle 을 찾지 못했다"; return 1; }
  wait_shell "$H"
  dir="$CD_PATH"; [ -n "$dir" ] || dir="$(worktree_of "$H")"
  cmdline="$(tab_line "cd $(coord_q "${dir:-.}") && $2")"
  r="$(term_send "$H" "$cmdline" --enter)"
  case "$r" in
    stale|error*) LAUNCH_ERR="실행 명령 send 실패: $r handle=$H"; term_close "$H" >/dev/null; return 2 ;;
  esac
  [ -n "$CD_PATH" ] || CD_PATH="$dir"
  return 0
}
wait_tui() {  # 60초, 아니면 한 번 더 120초. 첫 화면의 폴더 신뢰 확인은 auto-answer.sh 로 넘긴다
  local w; w="$(term_wait_idle "$1" 60000)"
  if [ "$(term_read_screen "$1" 40 2>/dev/null | coord_screen_prompt_kind)" = trust ]; then
    coord_log "폴더 신뢰 확인: $(bash "$SD/auto-answer.sh" --handle "$1")"
    w="$(term_wait_idle "$1" 60000)"
  fi
  [ "$w" = satisfied ] && return 0
  coord_log "tui-idle 60초 안 됨($w) — 120초 더 기다린다"
  w="$(term_wait_idle "$1" 120000)"
  [ "$w" = satisfied ]
}
screen_tail() { term_read_screen "$1" "${2:-20}" 2>/dev/null; }
send_prompt_file() {
  [ -n "$pfile" ] || return 0
  local r; r="$(bash "$SD/term-send-safe.sh" --handle "$1" --text "지시 파일을 읽고 진행해 달라: $pfile" --timeout-ms 60000)"
  case "$r" in
    "SENT "*) coord_log "지시 파일 경로를 보냈다: $r" ;;
    *) coord_log "주의: 지시 파일 경로를 보내지 못했다($r) — 조정자가 직접 보낼 것" ;;
  esac
}
worktree_of() { term_list | awk -F'\t' -v h="$1" '$1 == h { print $3; exit }'; }
record_lane() {  # record_lane <handle> <pid|-> <sid|-> <addr>
  local wt win=null; wt="${CD_PATH:-$(worktree_of "$1")}"
  case "$model" in *'[1m]'*) win=1000000 ;; esac
  coord_state_call lane-add "$name" "$(jq -cn --arg n "$name" --arg h "$1" --arg pid "$2" --arg sid "$3" --arg addr "$4" \
    --arg k "$kind" --arg wt "$wt" --argjson win "$win" '
    {session: ({name:$n, handle:$h, kind:$k, spawned_by:"coordinator",
               pid:($pid|tonumber? // 0), session_id:(if $sid == "-" then "" else $sid end),
               addr:(if $addr == "" then "" else "uds:" + $addr end)} + (if $win then {window:$win} else {} end)),
     worktree:$wt, state:"active"}')"
  coord_state_call event spawned "$name" "$(jq -cn --arg h "$1" --arg k "$kind" '{handle:$h, kind:$k}')"
  bash "$SD/office.sh" lane-up "$name" >/dev/null 2>&1 || true   # 에이전트 오피스 표시(실패해도 무시)
}
claude_flags() {
  local f=" -n $name"
  [ -n "$model" ] && f="$f --model $(coord_q "$model")"
  [ -n "$effort" ] && f="$f --effort $(coord_q "$effort")"
  [ -n "$autoc" ] && f="$f --autocompact $(coord_q "$autoc")"
  printf '%s' "$f"
}

resolve_target
case "$kind" in
claude)
  cmd="$(coord_cfg .launch.claude)$(claude_flags)"
  pre="$(live_session_pids)"
  [ -n "$pre" ] && coord_log "같은 이름의 세션이 이미 떠 있다(pid $pre) — 새 pid 만 인정한다"
  if [ "$dry" = 1 ]; then
    coord_log "DRY $(coord_q orca terminal create --worktree "$TAB_SEL" --title "$name" --json)"
    coord_log "DRY term_send <h> $(coord_q "$(tab_line "cd $(dry_cd) && $cmd")") --enter (셸 프롬프트가 보인 뒤)"
    coord_log "DRY orca terminal wait --terminal <h> --for tui-idle --timeout-ms 60000 (아니면 120000)"
    coord_log "DRY $SESS_DIR/*.json 에서 name==$name 인 새 pid 확인(최대 30초)"
    [ -n "$pfile" ] && coord_log "DRY term-send-safe.sh --handle <h> --text '지시 파일을 읽고 진행해 달라: $pfile'"
    coord_state_call lane-add "$name" "{\"session\":{\"kind\":\"claude\",\"spawned_by\":\"coordinator\"},\"state\":\"active\"}"
    echo "DRY SPAWNED $name handle=- pid=- session_id=-"; exit 0
  fi
  launch_in_tab "$name" "$cmd"; rc=$?
  [ "$rc" = 1 ] && coord_die 4 "$LAUNCH_ERR"
  [ "$rc" = 0 ] || fail wait "$LAUNCH_ERR"
  h="$H"
  wait_tui "$h" || fail wait "tui-idle 미충족 handle=$h"
  if ! s="$(wait_new_session "$pre")"; then
    coord_log "--- 화면 발췌($h) ---"; screen_tail "$h" 20 >&2
    fail process "~/.claude/sessions 에 $name 새 세션 없음 handle=$h"
  fi
  IFS=$'\t' read -r pid sid sock <<<"$s"
  send_prompt_file "$h"
  record_lane "$h" "$pid" "$sid" "$sock"
  echo "SPAWNED $name handle=$h pid=$pid session_id=$sid" ;;

glm)
  pf="$(bash "$SD/glm-preflight.sh" 2>/dev/null | head -1)"
  case "$pf" in "ok "*) coord_log "GLM 사전 확인: $pf" ;; *) fail preflight "${pf#fail }" ;; esac
  max="$(coord_cfg .glm.max_sessions)"; max="${max:-1}"
  cnt=0
  coord_has_run && cnt="$(coord_state '[.lanes[]? | select(.session.kind == "glm" and .state == "active")] | length')"
  [ "${cnt:-0}" -lt "$max" ] || fail glm-cap "active=$cnt max=$max"
  launch="$(coord_cfg .launch.glm)"; launch="${launch:-glm}"
  pre="$(live_session_pids)"
  if [ "$dry" = 1 ]; then
    coord_log "DRY $(coord_q orca terminal create --worktree "$TAB_SEL" --title "$name" --json)"
    coord_log "DRY term_send <h> $(coord_q "$(tab_line "cd $(dry_cd) && $launch -n $name")") --enter (셸 프롬프트가 보인 뒤)"
    coord_log "DRY tui-idle 대기 → 화면에 glm-5·API Usage Billing 확인(Claude Max 면 닫고 SPAWN_FAIL screen anthropic-account) → 세션 확인"
    [ -n "$pfile" ] && coord_log "DRY term-send-safe.sh --handle <h> --text '지시 파일을 읽고 진행해 달라: $pfile'"
    coord_state_call lane-add "$name" "{\"session\":{\"kind\":\"glm\",\"spawned_by\":\"coordinator\"},\"state\":\"active\"}"
    echo "DRY SPAWNED $name handle=- pid=- session_id=-"; exit 0
  fi
  launch_in_tab "$name" "$launch -n $name"; rc=$?
  [ "$rc" = 1 ] && coord_die 4 "$LAUNCH_ERR"
  [ "$rc" = 0 ] || fail wait "$LAUNCH_ERR"
  h="$H"
  wait_tui "$h" || fail wait "tui-idle 미충족 handle=$h"
  scr="$(screen_tail "$h" 60)"
  case "$scr" in
    *"Claude Max"*)
      term_close "$h" >/dev/null
      fail screen "anthropic-account" ;;
  esac
  case "$scr" in *glm-5*) ;; *) coord_log "--- 화면 발췌($h) ---"; printf '%s\n' "$scr" | tail -n 20 >&2; fail screen "no-glm-banner handle=$h" ;; esac
  case "$scr" in *"API Usage Billing"*) ;; *) coord_log "--- 화면 발췌($h) ---"; printf '%s\n' "$scr" | tail -n 20 >&2; fail screen "no-api-billing handle=$h" ;; esac
  if ! s="$(wait_new_session "$pre")"; then
    coord_log "--- 화면 발췌($h) ---"; screen_tail "$h" 20 >&2
    fail process "~/.claude/sessions 에 $name 새 세션 없음 handle=$h"
  fi
  IFS=$'\t' read -r pid sid sock <<<"$s"
  send_prompt_file "$h"
  record_lane "$h" "$pid" "$sid" "$sock"
  coord_log "다음: SendMessage 왕복 시험(<브랜치> / glm-ok / <모델>)을 한 번 받을 것(설계 §3.e-4)"
  echo "SPAWNED $name handle=$h pid=$pid session_id=$sid" ;;

opencode)
  cmd="$(coord_cfg .launch.opencode)"; cmd="${cmd:-opencode --standalone}"
  [ -n "$pfile" ] && coord_log "주의: opencode 는 --prompt-file 을 보내지 않는다 — worker-start --spec 으로 넣을 것"
  if [ "$dry" = 1 ]; then
    coord_log "DRY $(coord_q orca terminal create --worktree "$TAB_SEL" --title "$name" --json)"
    coord_log "DRY term_send <h> $(coord_q "$(tab_line "cd $(dry_cd) && $cmd")") --enter (셸 프롬프트가 보인 뒤)"
    coord_log "DRY tui-idle 대기 → 화면이 비어 있지 않은지 확인"
    coord_state_call lane-add "$name" "{\"session\":{\"kind\":\"opencode\",\"spawned_by\":\"coordinator\"},\"state\":\"active\"}"
    echo "DRY SPAWNED $name handle=- pid=- session_id=-"; exit 0
  fi
  launch_in_tab "$name" "$cmd"; rc=$?
  [ "$rc" = 1 ] && coord_die 4 "$LAUNCH_ERR"
  [ "$rc" = 0 ] || fail wait "$LAUNCH_ERR"
  h="$H"
  wait_tui "$h" || fail wait "tui-idle 미충족 handle=$h"
  scr="$(screen_tail "$h" 40)"
  if ! printf '%s' "$scr" | grep -q '[^[:space:]]'; then fail screen "blank handle=$h"; fi
  coord_log "--- 화면 끝($h): 빈 입력창인지 눈으로 확인 ---"; printf '%s\n' "$scr" | tail -n 8 >&2
  coord_log "지시는 조정자가 넣는다: orca orchestration worker-start --terminal $h --worktree current --spec \"<지시>\" --json (지시문에 ! / @ 금지)"
  record_lane "$h" - - ""
  echo "SPAWNED $name handle=$h pid=- session_id=-" ;;
esac
exit 0
