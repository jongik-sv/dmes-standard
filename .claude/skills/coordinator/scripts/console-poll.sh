#!/usr/bin/env bash
# 사용법: console-poll.sh start | stop | status | --once [--dry-run] | run
#         console-poll.sh handle-record team --agent <신원>/<host>/lead --repo <MAIN> [--slots n] [--busy n] [--until-label 글] [--project id]
#         console-poll.sh handle-clear team --repo <MAIN>
#         console-poll.sh input-handled (--lane <레인> | --lead <세션8>) --by <coordinator|auto> [--expect-full <창 지문>]
#         console-poll.sh judge-sha --lane <레인>   `JUDGE <h> <kind> <창 지문>` · `NONE <h>` · `STALE <h>` · `NOFP <h>`(창 머리를 못 찾아
#                                                  지문 없음 — 직접 답하지 않는다)(조정자가 판단 올리기 전에 기억했다가
#                                                  term-send-safe.sh --raw --lane <레인> --expect-sha <지문> 으로 답한다)
#   오피스 콘솔 폴러(정본: ../references/contract.md §4.1, 서버 쪽 dflow-work/references/api-contract.md §2.12). LLM 을 부르지 않는다.
#   PC 하나 × 신원 하나당 하나. 잠금 $DFLOW_CONSOLE_DIR/poller-<신원>.lock/(pid·pstart·since·cycle), 로그 poller-<신원>.log.
#   start   잠금을 잡고 백그라운드 루프(run)를 띄운다 · `CONSOLE_POLLER started pid=<pid>` · 이미 돌면 `CONSOLE_POLLER running pid=<pid>`
#           · 못 띄우면 `CONSOLE_POLLER skipped <disabled|dry|no-repo|no-dflow|no-ident|idle>`
#   stop    `CONSOLE_POLLER stopped` · `CONSOLE_POLLER none`
#   status  `CONSOLE_POLLER up pid=<pid> since=<iso> cycle=<초>` · `CONSOLE_POLLER down`
#   --once  한 주기만 돌고 끝낸다(시험용, 잠금을 그동안만 쥔다). --dry-run(또는 COORD_DRY=1)은 claim·보내기·ack·올리기·reap 을 하지 않고
#           하려던 일을 stderr 에 `DRY` 로 찍는다(claim 하고 ack 하지 않으면 프롬프트가 unknown 으로 버려지므로 poll 도 하지 않는다)
#   run     루프(내부용). 한 주기(COORD_CONSOLE_CYCLE_S, 기본 30초 — 루프는 직렬이라 주기가 겹치지 않는다):
#           ① 생존 감시 office.sh reap(늘) ② 프롬프트 전달 ③ 화면 올리기(②③ 은 서버가 console 을 알 때만 — console-poll 이 exit 7 이면 10분 쉼)
#           ② 는 `console-poll --accepts keys --limit 1` 로 한 건씩 집어 전달·ack 를 끝낸 뒤 다음 건을 집는다(빈 응답까지, 한 주기 최대 20건).
#             키 입력 답하기는 기본 꺼짐: 꺼져 있으면 --accepts keys 를 보내지 않고, 그래도 받은 키 행은 키를 보내지 않고 refused·reason error·detail keys_disabled 로 ack 한다(서버 reason 목록에 새 값을 더하지 않는다).
#             키 행(kind:'keys')은 켰을 때 검증(대상·만료·허용 키·화면 재판정·소비·레인 잠금·보내기 직전 재확인) 뒤 term_send_keys 한 번으로 넣는다(§4.1 「키 입력 답하기」).
#             compacting 의 retry ack 는 그 주기의 poll 이 끝난 뒤 보낸다(retry 행이 바로 다시 나와 맴돌지 않게). 다만 claim(poll 직전) 뒤
#             120초 ack 창 − 한 건 최대 처리 시간(보내기 60초 + ack 재시도 40초) = 20초가 지나면 다음 poll 전에 먼저 보낸다. 그렇게 돌려보낸
#             행이 같은 주기에 다시 나오면 보내지 않고 새 토큰으로 다시 붙잡는다(한 주기에 같은 id 를 두 번 넣지 않는다).
#             poll 이 exit 5 + forbidden_role(프로젝트 한정 PAT)이면 COORD_CONSOLE_OFF_RETRY_S(기본 30분) 동안 poll·ack 만 끈다(reap·화면은 계속), 지나면 한 번 다시 시도
#           ③ 화면은 `term_read_screen <h> 41`(가림 라이브러리가 맨 앞 줄을 줄 이음 판정에만 쓰고 마지막 40줄을 낸다).
#             captured_at 은 UTC(…Z). 한 요청에 같은 대상을 두 번 넣지 않고, 올리기 실패면 sha 기록을 그대로 둬 다음 주기에 다시 보낸다
#             조정 레인 화면은 같은 읽기 결과를 $DFLOW_CONSOLE_DIR/screen/<handle>.txt·.json(700/600)에 남긴다 — prompt-watch.sh 가 폴러가 도는 동안 화면을 직접 읽지 않게 하는 캐시(lib/screen-cache.sh,
#             설정 approvals.screen_cache_s 가 0 이면 쓰지 않음). 읽기에 실패한 handle 의 캐시는 지우고 10분 넘은 파일은 주기마다 지운다. 자동 응답 직전 재판정은 이 캐시를 쓰지 않는다
#             상주 폴러(run)는 창(kind≠none)이 보인 레인만 REREAD_S(기본 5)초 뒤 한 번 더 읽어 캐시를 바로 갱신한다(⑤ 화면 재읽기 — 주기당·레인당 한 번, 입력 요청 알림 다음, 구간 상한 안).
#             폴러가 끝나면(stop·TERM·자동 종료·--once 끝) 잠금 주인으로서 화면 캐시 폴더의 파일을 모두 지운다(원문이 로컬에 남지 않게 — prompt-watch 는 직접 읽기로 물러난다).
#             같은 화면으로 입력 요청(확인·선택·질문 창)을 판정해 $DFLOW_CONSOLE_DIR/input/<kind>_<ref>.json 을 만들고·고치고·지운다
#             (coord_lane·coord_lead·team_lead, §4.1 「입력 요청 감지」). 바뀐 대상은 ④ 에서 알린다
#           ④ 입력 요청 알림: coord_lane → `COORD_RUN=<회차> office.sh lane-state <레인> auto`, coord_lead → `office.sh lead-sync`,
#             team_lead → 폴러가 직접 `dflow.sh watch … --until "답 대기"`(창이 사라지면 기록의 until_label 로 되돌림)
#   input-handled  조정자·auto-answer 가 창에 답한 뒤 부른다: 기록의 handled 를 {by,at} 로 바꾸고 (since, sha)·(since, full) 을 소비 목록에
#           넣은 뒤 office.sh 를 부른다 · `OK` · 기록이 없으면 `NONE` · --expect-full <지문> 을 주었는데 기록의 full 이 다르면(기록이 이미
#           다음 창) 아무것도 하지 않고 `NONE prompt-changed`
#           시간 상한: 프롬프트 전달 구간을 뺀 나머지(생존 감시·터미널 목록·화면 읽기·화면 올리기)는 구간마다
#             COORD_CONSOLE_PHASE_MAX_S(기본 10초)와 주기 몫 COORD_CONSOLE_CYCLE_MAX_S(기본 25초)의 남은 시간 중 작은 값 안에 끝낸다.
#             넘으면 그 구간을 버리고(자손까지 죽임) 로그에 경고 한 줄을 남긴다. orca·lead-state·dflow.sh 호출은 모두 시간 제한 안에서 돈다.
#             ④ 입력 요청 알림은 office.sh 한 번이 20초(watch 3번 × 5초 + 여유)까지 걸리므로 주기 몫과 따로 COORD_CONSOLE_NOTIFY_MAX_S
#             (기본 45초) 안에 돈다. 끊긴 office.sh 의 잠금은 office.sh trap·coord_lock 탈취가 푼다.
#           매 주기 office.enabled 를 다시 읽어 false 면 스스로 끝낸다.
#           이 신원·host 의 살아 있는 조정 세션 기록(pid>0)·살아 있음이 확인된 열린 회차·살아 있는 팀장 핸들 기록이 없는 주기가
#           두 번 이어지면 잠금을 풀고 끝낸다(pid 0·빈 값인 기록·회차는 할 일로 세지 않는다 — 대상 해석에서는 센다).
#           멈출 때(stop·TERM) 붙잡아 둔 retry ack 를 짧은 제한 시간 안에 보낸다.
#   handle-record team   /dflow-team 팀장 핸들 기록 $DFLOW_CONSOLE_DIR/lead/<MAIN cksum>.json 을 쓴다(다시 쓰면 갱신) ·
#           handle=$ORCA_TERMINAL_HANDLE, pid=$CLAUDE_PID(없으면 0, 둘 다 비면 기존 값 유지) · `OK <경로>`
#   handle-clear team    그 기록을 지운다 · `OK`
#   신원: `dflow.sh me` 의 user_email 로컬 파트 슬러그(office.sh 와 같은 규칙). dflow.sh·DFLOW_CONFIG_DIR·cwd 규칙도 office.sh 와 같다.
#   잠금: 폴더 안에 pid·pstart·since·cycle·tmpd(루프의 임시 폴더). stop 은 TERM 뒤 기다려도 안 끝나면 자손까지 KILL 하고
#         tmpd 를 대신 지운다. 신원을 못 구하면(설정이 꺼진 뒤 등) $DFLOW_CONSOLE_DIR/poller-*.lock 을 훑어 처리한다.
#   환경: DFLOW_CONSOLE_DIR(기본 ~/.dflow/console) · COORD_STATE_ROOT · COORD_CONSOLE_CYCLE_S · COORD_CONSOLE_CYCLE_MAX_S ·
#         COORD_CONSOLE_PHASE_MAX_S · COORD_DRY ·
#         COORD_CONSOLE_KEYS_ENABLED=1(웹 키 입력 답하기 켬 — 설정 console.keys_enabled 와 같다, 기본 꺼짐)
#         시험용: COORD_TERM_SEND_SAFE(term-send-safe.sh 경로) · COORD_LEAD_STATE(lead-state.sh 경로) · CONSOLE_POLL_IDENT(신원) ·
#         COORD_CONSOLE_HELD_MAX_S(retry 를 먼저 보내는 나이, 기본 20) · COORD_CONSOLE_STOP_WAIT_S(stop 이 TERM 뒤 기다리는 초, 기본 10) ·
#         COORD_CONSOLE_LS_TIMEOUT_S(lead-state 상한, 기본 5) · COORD_OFFICE_SH(office.sh 경로) ·
#         COORD_CONSOLE_LANE_LOCK_WAIT_S(레인 잠금 대기, 기본 10) · COORD_CONSOLE_SENT_GRACE_S(보낸 직후 같은 창을 다시 세지 않는 초, 기본 10)
#   비밀: 프롬프트 본문·claim_token·화면 원문·dflow.sh 오류 본문은 로그·stderr 에 남기지 않는다(시각·대상·결과·사유만).
set -uo pipefail
_SD="${0%/*}"; [ "$_SD" != "$0" ] || _SD=.   # dirname 대신(프로세스 0개)
. "$_SD/lib/js-bridge.sh"; if _jsb_on CONSOLE_POLL; then _jsb_exec "$_SD/console-poll" "$@"; fi   # node 판(스위치 COORD_JS_CONSOLE_POLL)
. "$_SD/lib/common.sh"
. "$_SD/lib/term.sh"
. "$_SD/lib/console-resolve.sh"
. "$_SD/lib/screen-cache.sh"   # 레인 화면 캐시(prompt-watch 의 읽기 중복 제거 — 쓰는 쪽은 여기뿐)
coord_default_repo
SELF="$COORD_SCRIPTS_DIR/console-poll.sh"

# 가림·정리 함수(contract §4.1). 없으면 ②③ 을 하지 않는다(claim 한 프롬프트를 넣지 못해 버리는 일을 막는다).
REDACT_OK=0
if [ -f "$COORD_LIB_DIR/console-redact.sh" ] && . "$COORD_LIB_DIR/console-redact.sh" 2>/dev/null; then
  REDACT_OK=1
  for _fn in console_screen_filter console_screen_sha console_clean_prompt; do declare -F "$_fn" >/dev/null || REDACT_OK=0; done
fi
# 입력 요청·키 입력(contract §4.1). 가림 라이브러리와 함께 있어야 한다(없으면 감지하지 않고 키 행은 refused error).
INPUT_OK=0
if [ "$REDACT_OK" = 1 ] && [ -f "$COORD_LIB_DIR/console-input.sh" ] && . "$COORD_LIB_DIR/console-input.sh" 2>/dev/null; then
  INPUT_OK=1
  for _fn in console_input_snapshot console_full_sha console_lane_lock console_consumed_add console_input_write console_input_mark_handled term_send_keys; do declare -F "$_fn" >/dev/null || INPUT_OK=0; done
fi

usage() { coord_log "사용법: console-poll.sh start|stop|status|--once [--dry-run]|run|handle-record team …|handle-clear team --repo <MAIN>|input-handled (--lane L|--lead S8) --by coordinator|auto [--expect-full F]|judge-sha --lane L"; exit 2; }

CD="$(console_dir)"
CYCLE="${COORD_CONSOLE_CYCLE_S:-30}"
case "$CYCLE" in ''|*[!0-9]*|0) CYCLE=30 ;; esac
TSS="${COORD_TERM_SEND_SAFE:-$COORD_SCRIPTS_DIR/term-send-safe.sh}"
OFFICE="${COORD_OFFICE_SH:-$COORD_SCRIPTS_DIR/office.sh}"
DFL_TIMEOUT="${COORD_CONSOLE_DFLOW_TIMEOUT_S:-10}"
OFFICE_TIMEOUT=20           # office.sh 한 번(최악: watch 3번 × 5초 + 여유). 끊겨도 office.sh 가 쥔 잠금은 trap·탈취로 풀린다
LEAD_WATCH_TIMEOUT=5        # /dflow-team 팀장 watch 한 번
KEYS_SEND_TIMEOUT=15        # 키 한 묶음 보내기
ME_TIMEOUT=5
SEND_TIMEOUT=60
MAX_PER_CYCLE=20
OLD_PAUSE_S=600
ACK_RETRY=3                 # ack 네트워크 실패(rc 6) 때 다시 부르는 수(멈출 때는 0)
ACK_WINDOW_S=120            # 서버 ack 창(claimed_at + 120초, api-contract §2.12)
ACK_MAX_S=40                # ack 한 건 최대(DFL_TIMEOUT 10초 × 4번)
# 앞자리 0 은 지워 10진수로 돌려준다(그대로 두면 뒤의 $(( )) 가 8진수로 읽어 08·09 에서 오류, 010 은 8이 된다). 64비트를 넘는 수는 기본값
posint() { case "${1:-}" in ''|*[!0-9]*) echo "$2" ;; *) local n="${1#"${1%%[!0]*}"}"; [ -n "$n" ] && [ "$n" -gt 0 ] 2>/dev/null && echo "$n" || echo "$2" ;; esac; }
CYCLE_MAX="$(posint "${COORD_CONSOLE_CYCLE_MAX_S:-}" 25)"     # 한 주기 몫(프롬프트 전달 구간 제외)
NOTIFY_MAX="$(posint "${COORD_CONSOLE_NOTIFY_MAX_S:-}" 45)"   # 「입력 요청 알림」 구간(주기 몫·구간 상한 밖, office.sh 한 번 20초)
PHASE_MAX="$(posint "${COORD_CONSOLE_PHASE_MAX_S:-}" 10)"     # 생존 감시·화면 읽기·화면 올리기 구간마다
LIST_MAX=5                                                     # 터미널 목록 구간
SCREEN_READ_MAX=5                                              # 화면 하나 읽기
REREAD_S="$(posint "${COORD_CONSOLE_REREAD_S:-}" 5)"           # 창이 보인 레인을 다시 읽기까지(시험용 COORD_CONSOLE_REREAD_S)
REREAD_ON=0                                                    # 상주 폴러(cmd_run)만 1 — --once 는 다시 읽지 않는다
LS_TIMEOUT="$(posint "${COORD_CONSOLE_LS_TIMEOUT_S:-}" 5)"     # lead-state 한 번
HELD_MAX_AGE_S="$(posint "${COORD_CONSOLE_HELD_MAX_S:-}" $((ACK_WINDOW_S - SEND_TIMEOUT - ACK_MAX_S)))"
STOP_WAIT_S="$(posint "${COORD_CONSOLE_STOP_WAIT_S:-}" 10)"
FLUSH_EXIT_MAX_S=4          # 멈출 때 retry ack 전체 상한(한 번에 3초)
DRY="${COORD_DRY:-0}"
LOG=""; LK=""; IDENT=""; HOST=""; SKIP=""; HELD=""; DFLOW=""; REPO=""
SKIP_IDS=" "; OLD_UNTIL=0; SLEEP_PID=""; CONSOLE_OFF=0; CONSOLE_OFF_WARNED=0; RETRIED_IDS=" "
OFF_RETRY_S="${COORD_CONSOLE_OFF_RETRY_S:-1800}"; case "$OFF_RETRY_S" in ''|*[!0-9]*|0) OFF_RETRY_S=1800 ;; esac
CYC_T0=0; DELIV_S=0

TMPD="$(mktemp -d "${TMPDIR:-/tmp}/coord-console.XXXXXX" 2>/dev/null)" || exit 0
trap 'rm -rf "$TMPD"' EXIT

slug() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g'; }
plog() { [ -n "$LOG" ] && printf '%s %s\n' "$(coord_now_iso)" "$*" >> "$LOG" 2>/dev/null; return 0; }
drylog() { coord_log "DRY $*"; plog "DRY $*"; }

# ---- 제한 시간 실행(timeout 명령 없이, 후손까지 죽인다 — office.sh 와 같은 방식) ---------------------
descendants() { compat_descendants "$1"; }   # 깊은 쪽부터(pgrep -P 재귀와 같은 순서, 프로세스 표 한 번 — lib/compat.sh)
# 후손부터 TERM → 0.3초 → 남은 것 KILL(compat.sh). STOP/CONT 로 나무를 얼리는 방식은 윈도우(Git Bash)에 신호가 없어 걷었다.
kill_tree() { compat_kill_tree "$1"; }
# 겹쳐 불러도 된다(구간 함수 안에서 다시 부름): 시간 초과 표식 파일을 호출마다 따로 둔다($$ + 호출 번호 — 자식 프로세스는 부모의 번호에서
# 이어 세므로 부모가 기다리는 동안 안쪽 호출과 겹치지 않는다). 표식은 시간 초과일 때만 만들어지고 바로 지운다.
# 감시자는 sleep 의 pid 를 직접 쥐고(TERM trap 으로 그 sleep 만 죽인다) 끝나므로 pkill -P·mktemp·rm 이 필요 없다.
RL_SEQ=0
run_limited() {  # run_limited <초> <stdout 파일> <stderr 파일> <stdin 파일> <명령…> — 0 성공 · 124 시간 초과 · 그 밖 종료 코드
  local secs="$1" out="$2" err="$3" in="$4" pid wd rc mk; shift 4
  RL_SEQ=$((RL_SEQ + 1)); mk="$TMPD/rl.$$.$RL_SEQ.timeout"
  "$@" >"$out" 2>"$err" <"$in" &
  pid=$!; RL_PID="$pid"
  ( trap 'kill "$sp" 2>/dev/null; exit 0' TERM
    sleep "$secs" & sp=$!
    wait "$sp" 2>/dev/null || exit 0       # sleep 이 중간에 죽었으면(=명령이 먼저 끝나 정리됨) 시간 초과가 아니다
    kill -0 "$pid" 2>/dev/null || exit 0   # 막 끝난 명령(또는 pid 재사용)은 건드리지 않는다
    trap '' TERM                           # 정리(TERM → 0.3초 → KILL)를 끝까지 한다
    : > "$mk"; kill_tree "$pid" ) >/dev/null 2>&1 &
  wd=$!; RL_WD="$wd"
  wait "$pid" 2>/dev/null; rc=$?
  kill "$wd" 2>/dev/null; wait "$wd" 2>/dev/null
  RL_PID=""; RL_WD=""
  if [ -f "$mk" ]; then rm -f "$mk"; rc=124; fi
  return "$rc"
}
RL_PID=""; RL_WD=""
CR_LIMIT_S="$LS_TIMEOUT"    # console-resolve.sh 의 lead-state 호출 상한
_dfl_exec() { cd "$REPO" 2>/dev/null && DFLOW_CONFIG_DIR="$DCD" exec bash "$DFLOW" "$@"; }
dfl() {  # dfl <stdin 파일> <dflow.sh 인자…> — 출력 $TMPD/out, 오류 $TMPD/err(로그에 옮기지 않는다)
  local in="$1"; shift
  run_limited "$DFL_TIMEOUT" "$TMPD/out" "$TMPD/err" "$in" _dfl_exec "$@"
}

# ---- 설정·신원 -----------------------------------------------------------------------------
setup() {  # 실패하면 SKIP 에 사유를 두고 rc 1
  [ "$(coord_cfg_json '.office.enabled' 2>/dev/null)" = true ] || { SKIP=disabled; return 1; }
  REPO="$(coord_repo 2>/dev/null)" || { SKIP=no-repo; return 1; }
  [ -n "$REPO" ] || { SKIP=no-repo; return 1; }
  DFLOW="$(coord_cfg .office.dflow_script)"
  if [ -n "$DFLOW" ]; then
    DFLOW="$(coord_expand "$DFLOW")"
    case "$DFLOW" in /*) ;; *) DFLOW="$REPO/$DFLOW" ;; esac
  else
    DFLOW="$COORD_SCRIPTS_DIR/../../dflow-work/scripts/dflow.sh"
  fi
  [ -f "$DFLOW" ] || { SKIP=no-dflow; return 1; }
  DCD="${DFLOW_CONFIG_DIR:-$REPO}"
  ROOT="$(coord_state_root)"; COORD_STATE_ROOT="$ROOT"; export COORD_STATE_ROOT
  return 0
}
cfg_enabled() { [ "$(coord_cfg_json '.office.enabled' 2>/dev/null)" = true ]; }
HOST="$(slug "$(hostname 2>/dev/null | cut -d. -f1)")"
# 신원 캐시는 DFLOW_CONFIG_DIR 에 묶지 않는다(설정이 꺼지거나 바뀐 뒤의 stop·status 도 같은 신원을 찾게)
ident_cache() { printf '%s/ident' "$CD"; }
# need_ident [cache-first] — CONSOLE_POLL_IDENT → (cache-first 이면 캐시) → dflow.sh me(설정을 읽었을 때만) → 캐시
need_ident() {
  local email c; c="$(ident_cache)"
  IDENT="${CONSOLE_POLL_IDENT:-}"
  if [ -z "$IDENT" ] && [ "${1:-}" = cache-first ] && [ -f "$c" ]; then IDENT="$(head -1 "$c")"; fi
  if [ -z "$IDENT" ] && [ -n "$DFLOW" ] && [ -n "$REPO" ]; then
    local DFL_TIMEOUT="$ME_TIMEOUT"
    if dfl /dev/null me; then
      email="$(jq -r '.user_email // empty' "$TMPD/out" 2>/dev/null)"
      [ -n "$email" ] && IDENT="$(slug "${email%%@*}")"
      [ -n "$IDENT" ] && { mkdir -p "$CD" 2>/dev/null; printf '%s\n' "$IDENT" > "$c" 2>/dev/null; }
    fi
  fi
  [ -n "$IDENT" ] || { [ -f "$c" ] && IDENT="$(head -1 "$c")"; }
  case "$IDENT" in ''|*[!a-z0-9-]*) IDENT=""; SKIP=no-ident; return 1 ;; esac
  LK="$CD/poller-$IDENT.lock"; LOG="$CD/poller-$IDENT.log"
  CR_IDENT="$IDENT"; CR_HOST="$HOST"   # 대상 해석은 이 신원·host 의 기록만 고른다(console-resolve.sh)
}
CR_IDENT=""; CR_HOST=""

# ---- 잠금 ------------------------------------------------------------------------------------
lock_live() {  # 잠금을 쥔 프로세스가 살아 있으면 0(HELD=pid). pid 재사용은 pstart 로 거른다
  local p ps
  HELD=""
  [ -d "$LK" ] || return 1
  coord_read1 p "$LK/pid"
  if [ -z "$p" ]; then   # 막 mkdir 한 직후(pid 를 쓰기 전)
    [ "$(( $(coord_now_epoch) - $(coord_file_mtime "$LK" || echo 0) ))" -lt 5 ] && { HELD="-"; return 0; }
    return 1
  fi
  kill -0 "$p" 2>/dev/null || return 1
  coord_read1 ps "$LK/pstart"
  [ -z "$ps" ] || [ "$ps" = "$(coord_pstart "$p")" ] || return 1
  HELD="$p"
}
lock_write() {  # lock_write <pid>
  printf '%s\n' "$1" > "$LK/pid.tmp" && mv -f "$LK/pid.tmp" "$LK/pid"
  coord_pstart "$1" > "$LK/pstart" 2>/dev/null
  coord_now_iso > "$LK/since"; printf '%s\n' "$CYCLE" > "$LK/cycle"
}
# 죽은 잠금 탈취: 탈취끼리 겨루지 않게 짧은 탈취 잠금($LK.steal)을 쥐고, 다시 확인한 뒤 옛 잠금을 옆으로 옮기고(mv) 새로 mkdir 한다
# (rm -rf 뒤 mkdir 이면 다른 탈취자가 막 만든 새 잠금을 지울 수 있다).
lock_steal() {  # 잡으면 0, 못 잡으면 1(HELD)
  local m="$LK.steal" i=0 st
  until mkdir "$m" 2>/dev/null; do
    i=$((i + 1)); [ "$i" -ge 20 ] && { lock_live || HELD="-"; return 1; }
    if [ "$(( $(coord_now_epoch) - $(coord_file_mtime "$m" || echo 0) ))" -ge 10 ]; then rmdir "$m" 2>/dev/null; continue; fi
    sleep 0.1
  done
  if lock_live; then rmdir "$m" 2>/dev/null; return 1; fi
  plog "죽은 잠금 탈취(pid=$(cat "$LK/pid" 2>/dev/null || echo -))"
  st="$LK.stale.$$"
  mv "$LK" "$st" 2>/dev/null
  if mkdir "$LK" 2>/dev/null; then
    lock_write $$; rmdir "$m" 2>/dev/null; rm -rf "$st"; return 0
  fi
  rmdir "$m" 2>/dev/null; rm -rf "$st"
  lock_live || HELD="-"; return 1
}
lock_take() {  # 잡으면 0(pid = $$), 산 주인이 있으면 1(HELD)
  mkdir -p "$CD" 2>/dev/null
  if mkdir "$LK" 2>/dev/null; then lock_write $$; return 0; fi
  lock_live && return 1
  lock_steal
}
lock_mine() { local _p; coord_read1 _p "$LK/pid"; [ "$_p" = "$$" ]; }
lock_note_tmpd() { printf '%s\n' "$TMPD" > "$LK/tmpd" 2>/dev/null; }   # stop 의 KILL 분기가 대신 지운다

# ---- 할 일 판정 ------------------------------------------------------------------------------
# 이 신원·host 의 pid 가 있는(0·빈 값 아님) 세션 기록 — 살아 있으면 살펴볼 세션, 죽었으면 reap 이 내릴 일
_sess_with_pid() {
  local f p
  for f in "$ROOT"/_session/*.json; do
    [ -f "$f" ] || continue
    _cr_sess_read "$f"                      # 신원·pid 를 jq 한 번으로
    [ "$_CR_MINE" = 1 ] || continue
    p="$_CR_PID"
    case "$p" in ''|0|null) continue ;; esac
    return 0
  done
  return 1
}
has_work() {
  _sess_with_pid && return 0
  [ -n "$(_cr_live_runs strict)" ] && return 0
  [ -n "$(_cr_live_leads)" ] && return 0
  return 1
}

# ---- 1회 전달: inflight -----------------------------------------------------------------------
inflight_sweep() {  # 남은 inflight 파일의 id 는 다시 보내지 않는다(서버가 120초 뒤 unknown 으로 닫는다). 파일만 정리
  local f id
  for f in "$CD"/inflight/*; do
    [ -f "$f" ] || continue
    id="$(basename "$f")"
    case "$SKIP_IDS" in *" $id "*) ;; *) SKIP_IDS="$SKIP_IDS$id " ;; esac
    plog "prompt id=$id inflight 남음 — 다시 보내지 않음"
    [ "$DRY" = 1 ] || rm -f "$f"
  done
}

# ---- ② 프롬프트 전달 ---------------------------------------------------------------------------
in_terms() { case $'\n'"$TL"$'\n' in *$'\n'"$1"$'\n'*) return 0 ;; esac; return 1; }   # grep -qxF 와 같은 한 줄 전체 일치(프로세스 없이)
ack() {  # ack <id> <claim_token> <result> <reason|-> <detail|-> <대상 설명> — 성공 0
  local id="$1" tok="$2" res="$3" rs="$4" dt="$5" what="$6" n=0 rc
  local args=(console-ack "$id" "$tok" "$res")
  [ "$rs" != - ] && args+=(--reason "$rs")
  [ "$dt" != - ] && args+=(--detail "$dt")
  while :; do
    dfl /dev/null "${args[@]}"; rc=$?
    case "$rc" in
      0) plog "prompt id=$id $what → $res reason=$rs detail=$dt (ack $(head -1 "$TMPD/out" | cut -d' ' -f2-))"; return 0 ;;
      7) if [ "$res" = retry ]; then plog "prompt id=$id $what → retry reason=$rs (404 — 이미 반영)"; return 0; fi
         plog "prompt id=$id $what → $res ack 실패 rc=7"; return 1 ;;
      6) n=$((n + 1))
         [ "$n" -le "$ACK_RETRY" ] && continue
         plog "prompt id=$id $what → $res ack 네트워크 실패 ${n}회 — 포기"; return 1 ;;
      *) plog "prompt id=$id $what → $res ack 실패 rc=$rc"; return 1 ;;
    esac
  done
}
# ---- ②' 키 입력 답하기(contract §4.1 「키 입력 답하기」) ----------------------------------------
# 키 목록: 배열·1~4개·모두 문자열이고, 앞자리는 Up·Down 만, 마지막 자리는 Up|Down|Tab|1~9|Enter|Esc 하나(보안 재리뷰 (d')).
# 원소마다 \A…\z 로 검사한다(합친 글을 정규식으로 보면 ["Down,Enter"]·"Down\nEnter" 가 빠져나간다). 통과하면 공백으로 이은 이름들.
KEYS_JQ='.keys as $k
  | if ($k | type) == "array" and ($k | length) >= 1 and ($k | length) <= 4 and ($k | all(type == "string"))
       and ($k[:-1] | all(test("\\A(?:Up|Down)\\z")))
       and ($k[-1] | test("\\A(?:Up|Down|Tab|[1-9]|Enter|Esc)\\z"))
    then $k | join(" ") else "" end'
# 웹 키 입력 답하기 켜짐 여부 — 기본 꺼짐. 환경변수 COORD_CONSOLE_KEYS_ENABLED=1 또는 설정 console.keys_enabled=true 일 때만 켠다.
keys_enabled() {
  [ "${COORD_CONSOLE_KEYS_ENABLED:-}" = 1 ] && return 0
  [ "$(coord_cfg_json '.console.keys_enabled' 2>/dev/null)" = true ]
}
keys_ok() {  # 셸에서 한 번 더(위치 규칙 포함)
  local n=$# i=0 k
  [ "$n" -ge 1 ] && [ "$n" -le 4 ] || return 1
  for k in "$@"; do
    i=$((i + 1))
    if [ "$i" -lt "$n" ]; then case "$k" in Up|Down) ;; *) return 1 ;; esac
    else case "$k" in Up|Down|Tab|Enter|Esc|[1-9]) ;; *) return 1 ;; esac; fi
  done
}
now_ms() { console_iso_to_ms "$(console_now_ms_iso)"; }
# exp_state <만료 ms> — 0 아직 · 1 지남 · 2 지금 시각을 숫자로 못 구함(불확실하면 보내지 않는다)
exp_state() {
  local n; n="$(now_ms 2>/dev/null)"
  case "$n" in ''|*[!0-9]*) return 2 ;; esac
  [ "$n" -gt "$1" ] && return 1
  return 0
}
# judge_lane <h> — 화면을 새로 읽어(41줄) 감지와 같은 함수로 판정한다. rc 0 창 있음(CI_KIND·CI_SHA·CI_FULL — 지문이 없으면 CI_FULL 빈 값)
#   · 1 창 없음 · 2 가림 실패 · 3 stale · 4 읽기 실패
judge_lane() {
  local rc
  run_limited "$SCREEN_READ_MAX" "$TMPD/kscr" /dev/null /dev/null term_read_screen "$1" 41; rc=$?
  if [ "$rc" != 0 ]; then rm -f "$TMPD/kscr"; [ "$rc" = 3 ] && return 3; return 4; fi
  console_input_snapshot "$TMPD/kscr"; rc=$?
  rm -f "$TMPD/kscr"
  return "$rc"
}
# keys_judge_ok <h> <요청 kind> <요청 sha> <요청 since ms> <기록 이름> — 재판정. 같으면 0, 아니면 KJ_WHY 에 ack 사유
#   기록의 since 와 full(창 지문 — 발췌에 안 든 창 앞부분·가린 자리까지)도 지금 화면과 같아야 한다. 지문이 없으면(창 머리를 못 찾음)
#   보내지 않는다(prompt_changed). 소비는 (since, 발췌 sha) 와 (since, full) 둘 다 본다.
keys_judge_ok() {
  local rs rr rc rf
  rs="$(jq -r '.since // empty | tostring' "$(console_input_file "$5")" 2>/dev/null)"
  rf="$(jq -r '.full // empty | tostring' "$(console_input_file "$5")" 2>/dev/null)"
  rr="$(console_iso_to_ms "$rs" 2>/dev/null)"
  if [ -z "$rr" ] || [ "$rr" != "$4" ]; then KJ_WHY=prompt_changed; KJ_LOG="기록 since 다름·없음"; return 1; fi
  judge_lane "$1"; rc=$?
  case "$rc" in
    0) ;;
    1) KJ_WHY=prompt_changed; KJ_LOG="창 없음"; return 1 ;;
    3) KJ_WHY=stale; KJ_LOG="화면 읽기 stale"; return 1 ;;
    *) KJ_WHY=error; KJ_LOG="화면 읽기·가림 실패 rc=$rc"; return 1 ;;
  esac
  if [ "$CI_KIND" != "$2" ] || [ "$CI_SHA" != "$3" ]; then KJ_WHY=prompt_changed; KJ_LOG="kind·발췌 다름"; return 1; fi
  if [ -z "$CI_FULL" ]; then KJ_WHY=prompt_changed; KJ_LOG="창 머리를 찾지 못해 지문 없음"; return 1; fi
  if [ -z "$rf" ] || [ "$rf" != "$CI_FULL" ]; then KJ_WHY=prompt_changed; KJ_LOG="창 지문(full) 다름·기록에 없음"; return 1; fi
  if console_consumed_has "$5" "$rs" "$3" "$rf"; then KJ_WHY=prompt_changed; KJ_LOG="이미 소비된 (since, sha|full)"; return 1; fi
  return 0
}
KJ_WHY=""; KJ_LOG=""
# 보낸 뒤(또는 넣었을 수 있을 때): 소비로 기억하고, 보낸 표식을 남기고, 기록을 지운 뒤 알림 표식
keys_consume() {  # <이름> <레인> <since> <sha> [full]
  console_consumed_add "$1" "$3" "$4" "${5:-}"
  console_lane_mark_sent "$2" "$4"
  if console_input_rec_lock "$1"; then rm -f "$(console_input_file "$1")"; console_input_rec_unlock "$1"; fi
  in_mark "$1"
}
handle_keys() {  # handle_keys <행 JSON> <id> <claim_token> <target_kind> <target_ref> — 행의 모든 칸을 믿지 않는다
  local j="$1" id="$2" tok="$3" tk="$4" ref="$5" what keys ik is ish rq exp_ms h rc name trc res
  what="keys $tk/$( console_input_ref_ok "$ref" && printf '%s' "$ref" || printf '?' )"
  if [ "$INPUT_OK" != 1 ]; then plog "prompt id=$id $what 입력 요청 라이브러리 없음"; ack "$id" "$tok" refused error - "$what"; return 0; fi
  # ⓑ 대상 종류·참조
  if [ "$tk" != coord_lane ] || ! console_input_ref_ok "$ref"; then ack "$id" "$tok" refused error - "$what"; return 0; fi
  # ⓓ 허용 키
  keys="$(printf '%s' "$j" | jq -r "$KEYS_JQ" 2>/dev/null)"
  # shellcheck disable=SC2086
  if [ -z "$keys" ] || ! keys_ok $keys; then plog "prompt id=$id $what 키 형식 위반"; ack "$id" "$tok" refused error - "$what"; return 0; fi
  ik="$(printf '%s' "$j" | jq -r '.input_request.kind // empty | tostring' 2>/dev/null)"
  is="$(printf '%s' "$j" | jq -r '.input_request.since // empty | tostring' 2>/dev/null)"
  ish="$(printf '%s' "$j" | jq -r '.input_request.sha // empty | tostring' 2>/dev/null)"
  case "$ik" in permission|question|choice|usage-limit|trust|message) ;; *) plog "prompt id=$id $what input_request.kind 형식 오류"; ack "$id" "$tok" refused error - "$what"; return 0 ;; esac
  rq="$(console_iso_to_ms "$is")"
  if ! printf '%s' "$ish" | grep -Eqx '[0-9a-f]{64}' || [ -z "$rq" ]; then plog "prompt id=$id $what input_request 형식 오류"; ack "$id" "$tok" refused error - "$what"; return 0; fi
  # ⓒ 만료
  exp_ms="$(console_iso_to_ms "$(printf '%s' "$j" | jq -r '.expires_at // empty | tostring' 2>/dev/null)")"
  [ -n "$exp_ms" ] || { plog "prompt id=$id $what expires_at 형식 오류"; ack "$id" "$tok" refused error - "$what"; return 0; }
  exp_state "$exp_ms"
  case "$?" in
    1) ack "$id" "$tok" refused stale - "$what"; return 0 ;;
    2) plog "prompt id=$id $what 지금 시각을 구하지 못함 → error"; ack "$id" "$tok" refused error - "$what"; return 0 ;;
  esac
  # ⓔ 대상 해석
  h="$(console_resolve coord_lane "$ref")"; rc=$?
  case "$rc" in
    0) ;;
    2) ack "$id" "$tok" refused ambiguous - "$what"; return 0 ;;
    *) ack "$id" "$tok" refused target-not-found - "$what"; return 0 ;;
  esac
  in_terms "$h" || { ack "$id" "$tok" refused stale - "$what"; return 0; }
  name="coord_lane_$ref"
  # ⓕ 재판정(기록 since·화면 kind·발췌 sha) ⓖ 소비 확인
  if ! keys_judge_ok "$h" "$ik" "$ish" "$rq" "$name"; then
    plog "prompt id=$id $what 재판정 불일치($KJ_LOG) → $KJ_WHY"; ack "$id" "$tok" refused "$KJ_WHY" - "$what"; return 0
  fi
  # ⓗ 레인 잠금(auto-answer 와 공유)
  if ! console_lane_lock "$ref"; then
    plog "prompt id=$id $what 레인 잠금을 얻지 못함(다른 쪽이 답하는 중) → prompt_changed"; ack "$id" "$tok" refused prompt_changed - "$what"; return 0
  fi
  # ⓘ 잠금 안에서 보내기 직전 다시: 보낸 직후 표식·기록·화면·소비, 그다음(보내기 바로 앞) 만료
  if console_lane_recent_send "$ref" "$ish"; then
    console_lane_unlock "$ref"; plog "prompt id=$id $what 방금 다른 답이 들어감 → prompt_changed"; ack "$id" "$tok" refused prompt_changed - "$what"; return 0
  fi
  if ! keys_judge_ok "$h" "$ik" "$ish" "$rq" "$name"; then
    console_lane_unlock "$ref"; plog "prompt id=$id $what 보내기 직전 불일치($KJ_LOG) → $KJ_WHY"; ack "$id" "$tok" refused "$KJ_WHY" - "$what"; return 0
  fi
  # 만료는 재판정(화면 읽기로 시간이 걸린다) 뒤, 보내기 바로 앞에서 본다(최종 계약 (g))
  exp_state "$exp_ms"
  case "$?" in
    1) console_lane_unlock "$ref"; plog "prompt id=$id $what 재판정 뒤 만료 → stale"; ack "$id" "$tok" refused stale - "$what"; return 0 ;;
    2) console_lane_unlock "$ref"; plog "prompt id=$id $what 지금 시각을 구하지 못함 → error"; ack "$id" "$tok" refused error - "$what"; return 0 ;;
  esac
  # ⓙ 보내기: 키 전체를 한 번에. 소비에 쓸 지문은 잠금 안 재판정의 것(기록의 full 과 같음을 확인했다)
  local kfull="$CI_FULL"
  mkdir -p "$CD/inflight" 2>/dev/null
  printf '%s %s\n' "$(coord_now_iso)" "$what" > "$CD/inflight/$id"
  # shellcheck disable=SC2086
  run_limited "$KEYS_SEND_TIMEOUT" "$TMPD/keys.out" /dev/null /dev/null term_send_keys "$h" $keys; trc=$?
  res="$(head -1 "$TMPD/keys.out" 2>/dev/null)"; rm -f "$TMPD/keys.out"
  case "$trc:$res" in
    0:accepted|0:submitted|0:turn_started)
      keys_consume "$name" "$ref" "$is" "$ish" "$kfull"; console_lane_unlock "$ref"
      ack "$id" "$tok" sent - "$res" "$what" && rm -f "$CD/inflight/$id" ;;
    0:stale)        # 넣지 못했음이 확실하다
      console_lane_unlock "$ref"; ack "$id" "$tok" refused stale - "$what" && rm -f "$CD/inflight/$id" ;;
    "0:error bad-key")   # 보내기 전에 걸렀다(아무것도 넣지 않음)
      console_lane_unlock "$ref"; ack "$id" "$tok" refused error - "$what" && rm -f "$CD/inflight/$id" ;;
    *)              # 키를 일부 넣었을 수 있다: refused 로 ack 하지 않는다(ack 생략 → 서버가 120초 뒤 unknown). 같은 창은 소비로 기억
      keys_consume "$name" "$ref" "$is" "$ish" "$kfull"; console_lane_unlock "$ref"
      plog "prompt id=$id $what 보내기 결과를 알 수 없음(rc=$trc ${res%% *}) — ack 생략(unknown)" ;;
  esac
  return 0
}

handle_prompt() {  # handle_prompt <프롬프트 JSON 한 줄> <claim 시각(poll 직전 epoch)>
  local j="$1" ct="$2" id kind ref tok h rc crc hdr res trc what det rkind rref
  id="$(printf '%s' "$j" | jq -r '.id // empty' 2>/dev/null)"
  kind="$(printf '%s' "$j" | jq -r '.target_kind // empty' 2>/dev/null)"
  ref="$(printf '%s' "$j" | jq -r '.target_ref // empty' 2>/dev/null)"
  tok="$(printf '%s' "$j" | jq -r '.claim_token // empty' 2>/dev/null)"
  rkind="$(printf '%s' "$j" | jq -r '.kind // empty | tostring' 2>/dev/null)"
  printf '%s' "$id" | grep -Eq '^[0-9a-fA-F-]{8,64}$' || { plog "prompt 형식 오류(id) — 건너뜀"; return 0; }
  case "$kind" in *[!a-z_]*) kind="?" ;; esac
  rref="$ref"
  case "$ref" in *[!A-Za-z0-9._:-]*) ref="?" ;; esac
  what="$kind/$ref"
  case "$SKIP_IDS" in *" $id "*) plog "prompt id=$id $what inflight 남음 — 다시 보내지 않음"; return 0 ;; esac
  [ -n "$tok" ] || { plog "prompt id=$id claim_token 없음 — 건너뜀"; return 0; }
  # 키 입력 행은 따로 처리한다(text 칸은 읽지 않는다). 모르는 kind 는 글로 넣지 않고 거절한다.
  case "$rkind" in
    '') ;;
    keys)
      # 웹 키 입력은 기본 꺼짐: 꺼져 있으면 화면 재판정·term_send_keys 앞에서 바로 거절한다(키 전송 0)
      if ! keys_enabled; then plog "prompt id=$id $what 키 입력 꺼짐(console.keys_enabled) — 거절"; ack "$id" "$tok" refused error keys_disabled "$what"; return 0; fi
      handle_keys "$j" "$id" "$tok" "$kind" "$rref"; return 0 ;;
    *) ack "$id" "$tok" refused error - "$what"; plog "prompt id=$id 모르는 행 종류 — 거절"; return 0 ;;
  esac
  # 이 주기에 이미 compacting 으로 돌려보낸(retry) 행이 다시 나왔다: 다시 넣어 보지 않고 새 토큰·claim 시각으로 붙잡는다
  case "$RETRIED_IDS" in *" $id "*)
    plog "prompt id=$id $what 이 주기에 이미 retry — 다시 붙잡음"
    printf '%s\t%s\t%s\t%s\n' "$id" "$tok" "$what" "$ct" >> "$TMPD/held"; return 0 ;;
  esac
  h="$(console_resolve "$kind" "$ref")"; rc=$?
  case "$rc" in
    0) ;;
    2) ack "$id" "$tok" refused ambiguous - "$what"; return 0 ;;
    *) ack "$id" "$tok" refused target-not-found - "$what"; return 0 ;;
  esac
  in_terms "$h" || { ack "$id" "$tok" refused stale - "$what"; return 0; }
  printf '%s' "$j" | jq -j '.text // ""' 2>/dev/null | console_clean_prompt > "$TMPD/clean" 2>/dev/null; crc=$?
  case "$crc" in
    0) ;;
    2) ack "$id" "$tok" refused bang-in-text - "$what"; return 0 ;;
    *) ack "$id" "$tok" refused error - "$what"; plog "prompt id=$id 정리 실패 rc=$crc"; return 0 ;;
  esac
  hdr="$(console_header_ref "$kind" "$ref")"
  ( umask 077; printf '[오피스→%s] 프롬프트: %s' "$hdr" "$(cat "$TMPD/clean")" > "$TMPD/send.txt" )
  rm -f "$TMPD/clean"
  mkdir -p "$CD/inflight" 2>/dev/null
  printf '%s %s\n' "$(coord_now_iso)" "$what" > "$CD/inflight/$id"
  run_limited "$SEND_TIMEOUT" "$TMPD/tss.out" "$TMPD/tss.err" /dev/null bash "$TSS" --handle "$h" --allow-busy --text-file "$TMPD/send.txt"; trc=$?
  rm -f "$TMPD/send.txt"
  res="$(head -1 "$TMPD/tss.out" 2>/dev/null)"
  set -- $res
  if [ "$trc" = 0 ] && [ "${1:-}" = SENT ] && [ "${2:-}" = "$h" ]; then
    det="${3:-}"; case "$det" in turn_started|submitted|accepted) ;; *) det=- ;; esac
    ack "$id" "$tok" sent - "$det" "$what" && rm -f "$CD/inflight/$id"
    return 0
  fi
  if [ "$trc" = 0 ] && [ "${1:-}" = REFUSED ] && [ "${2:-}" = "$h" ]; then
    case "${3:-}" in
      # retry 는 행을 pending 으로 돌려 다음 poll 이 같은 행을 바로 다시 주므로(가장 오래된 것부터), 이 주기의 poll 이
      # 끝날 때까지 ack 를 미룬다(claimed 로 붙잡아 두어 뒤 프롬프트가 막히지 않게). flush_held 가 retry 로 ack 한다.
      # 붙잡은 시각은 claim(poll 직전) 시각이다 — ack 창은 claimed_at 부터 120초다.
      compacting) printf '%s\t%s\t%s\t%s\n' "$id" "$tok" "$what" "$ct" >> "$TMPD/held"; return 0 ;;
      stale|prompt-open|draft-in-input|bang-in-text) ack "$id" "$tok" refused "$3" - "$what" && rm -f "$CD/inflight/$id"; return 0 ;;
    esac
  fi
  plog "prompt id=$id $what term-send-safe rc=$trc 결과=${1:-없음} ${3:-}"
  ack "$id" "$tok" refused error - "$what" && rm -f "$CD/inflight/$id"
  return 0
}
# 미룬 retry(compacting) ack 를 보낸다. 성공하면 inflight 를 지운다. [<상한 초>] 를 주면 그만큼 지나면 나머지는 버린다(멈출 때).
# HELD_MAX_AGE_S(기본 20 = ack 창 120 − 보내기 60 − ack 40): claim 뒤 이만큼 지난 행이 있으면 다음 poll 전에 먼저 보낸다
# (다음 한 건이 최대 시간을 다 써도 ack 창 안에 들어가게).
flush_held() {
  local id tok what _t cap="${1:-}" t0; t0="$(coord_now_epoch)"
  [ -s "$TMPD/held" ] || return 0
  while IFS=$'\t' read -r id tok what _t; do
    [ -n "$id" ] || continue
    if [ -n "$cap" ] && [ $(( $(coord_now_epoch) - t0 )) -ge "$cap" ]; then plog "prompt id=$id $what → retry 못 보냄(멈추는 중 상한)"; continue; fi
    case "$RETRIED_IDS" in *" $id "*) ;; *) RETRIED_IDS="$RETRIED_IDS$id " ;; esac
    ack "$id" "$tok" retry compacting - "$what" && rm -f "$CD/inflight/$id"
  done < "$TMPD/held"
  : > "$TMPD/held"
}
held_old() {  # 가장 오래 붙잡은 행(claim 시각 기준)이 HELD_MAX_AGE_S 를 넘었으면 0
  local t; [ -s "$TMPD/held" ] || return 1   # 붙잡은 행이 없으면 head·cut 을 부르지 않는다
  t="$(head -1 "$TMPD/held" 2>/dev/null | cut -f4)"
  [ -n "$t" ] && [ $(( $(coord_now_epoch) - t )) -ge "$HELD_MAX_AGE_S" ]
}
phase_prompts() {
  [ "$REDACT_OK" = 1 ] || { plog "프롬프트 건너뜀: 가림·정리 라이브러리 없음"; return 0; }
  [ -n "$TL" ] || { plog "프롬프트 건너뜀: 터미널 목록을 못 읽음"; return 0; }
  # 프로젝트 한정 PAT(forbidden_role) — OFF_RETRY_S(기본 30분) 동안 전달하지 않고, 지나면 한 번 다시 시도한다(서버가 한정 PAT 의 조정 칸을 허용하게 바뀔 수 있다)
  [ "$CONSOLE_OFF" = 0 ] || [ "$(coord_now_epoch)" -ge "$CONSOLE_OFF" ] || return 0
  if [ "$DRY" = 1 ]; then drylog "dflow.sh console-poll --host $HOST$(keys_enabled && printf ' --accepts keys') --limit 1 (claim 하지 않음)"; return 0; fi
  : > "$TMPD/held"; RETRIED_IDS=" "
  poll_loop
  flush_held
}
poll_loop() {  # 한 건씩 claim → 전달 → ack 를 대기열이 빌 때까지(한 주기 최대 MAX_PER_CYCLE 건)
  local i=0 rc line ct
  while [ "$i" -lt "$MAX_PER_CYCLE" ]; do
    held_old && flush_held
    ct="$(coord_now_epoch)"   # claim 시각(보수적으로 poll 직전)
    if keys_enabled; then dfl /dev/null console-poll --host "$HOST" --accepts keys --limit 1; rc=$?
    else dfl /dev/null console-poll --host "$HOST" --limit 1; rc=$?; fi   # 꺼져 있으면 accepts 를 보내지 않는다(서버가 키 행을 주지 않게)
    case "$rc" in
      0) ;;
      7) OLD_UNTIL=$(( $(coord_now_epoch) + OLD_PAUSE_S )); plog "옛 서버(console-poll rc=7) — ②③ 을 ${OLD_PAUSE_S}초 쉼"; return 0 ;;
      5) if [ "$(jq -r '.code // empty' "$TMPD/err" 2>/dev/null)" = forbidden_role ]; then
           # 프로젝트로 한정한 PAT: 콘솔 전달(poll·ack)만 끈다. 생존 감시·화면 올리기는 계속, 폴러를 다시 시작하면 다시 시도
           CONSOLE_OFF=$(( $(coord_now_epoch) + OFF_RETRY_S ))
           if [ "$CONSOLE_OFF_WARNED" = 0 ]; then   # 안내는 프로세스마다 한 번만(다시 시도해도 같은 말을 되풀이하지 않는다)
             CONSOLE_OFF_WARNED=1
             plog "프로젝트 한정 PAT 라 오피스 프롬프트 전달 불가. 한정 없는 PAT 필요"
             coord_log "console-poll: 프로젝트 한정 PAT 라 오피스 프롬프트 전달 불가. 한정 없는 PAT 필요"
           fi
         else plog "console-poll 실패 rc=5 — 이번 주기 건너뜀"; fi
         return 0 ;;
      *) plog "console-poll 실패 rc=$rc — 이번 주기 건너뜀"; return 0 ;;
    esac
    # 응답(프롬프트 본문·claim_token)은 메모리로 읽고 파일은 바로 지운다
    line=""; { while IFS= read -r line || [ -n "$line" ]; do [ -z "$line" ] || break; done < "$TMPD/out"; } 2>/dev/null   # grep -m 1 . (첫 비지 않은 줄)
    rm -f "$TMPD/out" "$TMPD/err"
    [ -n "$line" ] || return 0     # 대기열이 비었다
    i=$((i + 1))
    handle_prompt "$line" "$ct"
    line=""
  done
  plog "한 주기 상한(${MAX_PER_CYCLE}건)에 닿음 — 나머지는 다음 주기"
}

# ---- 입력 요청 감지·알림(contract §4.1 「입력 요청 감지」) -------------------------------------------
# 기록 $CD/input/<kind>_<ref>.json = {v:1, kind, since(UTC ms ISO), excerpt[≤10], handled:null|{by,at}, full, run, handle} — 쓰는 쪽은 폴러,
# 읽는 쪽은 office.sh. full·run·handle 은 킷 내부 칸(서버로 보내지 않는다).
# 바뀐 대상은 $CD/input/.notify/<이름> 표식을 남기고 ④ 가 알린 뒤 지운다(시간 상한으로 못 알리면 다음 주기에 다시).
in_mark() { [ "$DRY" = 1 ] && return 0; coord_mkdirp "$CD/input/.notify"; : > "$CD/input/.notify/$1"; }
# 레인 → 그 레인이 있는 살아 있는 열린 회차(정확히 하나일 때): `<state.json>\t<run-id>`
lane_run() {
  local sf out="" n=0
  while IFS=$'\t' read -r sf _; do
    [ -n "$sf" ] || continue
    [ "$(jq -r --arg l "$1" '.lanes[$l] // empty | select((.state // "active") != "closed") | "y"' "$sf" 2>/dev/null)" = y ] || continue
    n=$((n + 1)); out="$sf"
  done < <(_cr_live_runs)
  [ "$n" = 1 ] || return 1
  sf="${out%/*}"; printf '%s\t%s\n' "$out" "${sf##*/}"
}
# 조정 세션 → 그 세션의 열린 회차 하나(이름 순 첫째)의 run-id
lead_run() {
  local sf s8 best=""
  while IFS=$'\t' read -r sf s8; do
    [ "$s8" = "$1" ] || continue
    sf="${sf%/*}"; sf="${sf##*/}"
    if [ -z "$best" ] || [[ "$sf" < "$best" ]]; then best="$sf"; fi
  done < <(_cr_live_runs)
  [ -n "$best" ] && printf '%s\n' "$best"
}
# 레인 + 핸들 → 그 핸들로 그 레인을 가진 살아 있는 열린 회차의 run-id(정확히 하나일 때). 입력 요청 기록의 run 칸
lane_run_h() {
  local sf out="" n=0
  [ -n "${2:-}" ] || return 1
  while IFS=$'\t' read -r sf _; do
    [ -n "$sf" ] || continue
    [ "$(jq -r --arg l "$1" --arg h "$2" '.lanes[$l] // empty | select((.state // "active") != "closed" and ((.session.handle // "") | tostring) == $h) | "y"' "$sf" 2>/dev/null)" = y ] || continue
    n=$((n + 1)); out="$sf"
  done < <(_cr_live_runs)
  [ "$n" = 1 ] || return 1
  out="${out%/*}"; printf '%s\n' "${out##*/}"
}
# 기록 JSON(stdin)이 「살아 있는」 입력 요청(handled null·usage-limit·trust 아님)이면 y
rec_active() { jq -r 'if type == "object" and .handled == null and .kind != "usage-limit" and .kind != "trust" then "y" else "n" end' 2>/dev/null; }
# input_detect 의 기록 읽기(jq -sj 한 번): 값이 정확히 객체 하나가 아니면(깨진·값 여럿) 빈 출력 = 기록 없음으로 보고 새로 쓴다.
#   객체면 rec_active · kind · since · full · handle · run 을 U+001F 로 잇는다(빈 칸 = 없음·null·false — 예전 `// empty` 와 같은 글).
#   칸 값에 U+001F 가 있으면 칸이 밀리므로 그 기록도 없는 것으로 본다
_CP_REC_JQ='if length == 1 and (.[0] | type) == "object" then .[0]
  | [(if .handled == null and .kind != "usage-limit" and .kind != "trust" then "y" else "n" end),
     (.kind // "" | tostring), (.since // "" | tostring), (.full // "" | tostring), (.handle // "" | tostring), (.run // "" | tostring)]
  | if any(.[]; test("\u001f")) then empty else join("\u001f") end
  else empty end'
# 새 기록 $a 와 지금 기록 $b(없으면 null) 비교(jq -nj 한 번): 같으면 `same`, 다르면 `diff` · 새 kind · 새 rec_active 를 U+001F 로 잇는다
_CP_CMP_JQ='if $a == $b then "same" else
  ["diff", ($a.kind | tostring), (if ($a | type) == "object" and $a.handled == null and $a.kind != "usage-limit" and $a.kind != "trust" then "y" else "n" end)]
  | join("\u001f") end'
# 문장 질문(kind 'message'): 레인 state 의 .question = {at, text}. 기록 JSON(없으면 빈 출력). $2 = 지금 기록, $3 = run-id, $4 = 핸들
message_rec() {
  local sf q at ms since t ex
  [ -n "${3:-}" ] || return 0
  sf="$ROOT/$3/state.json"; [ -f "$sf" ] || return 0
  q="$(jq -c --arg l "$1" '.lanes[$l].question // empty | objects' "$sf" 2>/dev/null)"
  [ -n "$q" ] || return 0
  at="$(printf '%s' "$q" | jq -r '.at // empty | tostring')"
  ms="$(console_iso_to_ms "$at")" || return 0
  since="$(console_ms_to_iso "$ms")" || return 0
  # 첫 줄 → 가림 → 정리(제어 문자 삭제·200자)
  t="$(printf '%s' "$q" | jq -r '.text // "" | tostring | split("\n")[0]')"
  t="$(printf '%s\n' "$t" | console_redact_text 2>/dev/null)" || return 0
  ex="$(printf '%s' "$t" | jq -Rsc '[split("\n")[0] | gsub("[\u0000-\u001f\u007f-\u009f]"; "") | sub(" +\\z"; "") | .[0:200] | sub(" +\\z"; "")] | map(select(test("\\S")))')" || return 0
  printf '%s' "$ex" | jq -e 'length == 1' >/dev/null 2>&1 || return 0
  jq -nc --arg s "$since" --argjson ex "$ex" --argjson cur "${2:-null}" --arg run "$3" --arg h "${4:-}" '
    {v:1, kind:"message", since:$s, excerpt:$ex,
     handled:(if ($cur | type) == "object" and $cur.kind == "message" and $cur.since == $s then ($cur.handled // null) else null end),
     full:null, run:$run, handle:$h}'
}
# input_detect <kind> <ref> <화면 파일> <핸들> — 기록을 만들고·고치고·지운다(화면 원문·발췌는 로그에 남기지 않는다)
#   기록에는 서버로 보내지 않는 내부 칸 full(창 지문, console_full_sha — 창 머리를 못 찾으면 null)·run(조정 레인의 회차)·
#   handle(그 세션 핸들)도 둔다 — office.sh 는 input_request 를 {v,kind,since,excerpt,handled} 로만 추려 보내고, 자기 회차·같은
#   핸들의 기록만 쓴다. full·handle·run 이 바뀌면 같은 kind 여도 새 창으로 본다(since 를 새로). full 이 없는(null) 창은 발췌 sha 가
#   바뀌어도 새 창으로 본다. 창 밖 줄(상태줄·사용량 %)만 바뀐 화면은 full 이 같아 since 를 유지한다.
input_detect() {
  local k="$1" ref="$2" scr="$3" h="${4:-}" name f rc cur ck cs cf ch cr new had=0 now hd run="" ca na rd nk
  console_input_ref_ok "$ref" || return 0
  name="${k}_$ref"; f="$(console_input_file "$name")"
  [ "$k" = coord_lane ] && run="$(lane_run_h "$ref" "$h" 2>/dev/null)"
  console_input_snapshot "$scr"; rc=$?
  if [ "$rc" = 2 ]; then plog "input $k/$ref 가림·해시 실패 — 기록하지 않음"; return 0; fi
  [ "$DRY" = 1 ] && { [ "$rc" = 0 ] && drylog "input $k/$ref $CI_KIND (기록하지 않음)"; return 0; }
  console_input_rec_lock "$name" || { plog "input $k/$ref 기록 잠금 실패 — 다음 주기"; return 0; }
  cur="$(cat "$f" 2>/dev/null)"
  # 기록을 jq 한 번으로 읽는다(객체가 아니면 cur 를 비운다): 살아 있음(rec_active 와 같은 판정)·kind·since·full·handle·run
  ca=n; ck=""; cs=""; cf=""; ch=""; cr=""
  if [ -n "$cur" ] && rd="$(printf '%s' "$cur" | jq -sj "$_CP_REC_JQ" 2>/dev/null)" && [ -n "$rd" ]; then
    IFS=$'\x1f' read -r -d '' ca ck cs cf ch cr <<< "$rd"; cr="${cr%$'\n'}"
    had=1
  else cur=""; fi
  new=""
  if [ "$rc" = 1 ]; then
    # 화면 창 없음: 조정 레인이면 문장 질문(state 의 .question), 아니면 기록을 지운다
    [ "$k" = coord_lane ] && new="$(message_rec "$ref" "$cur" "$run" "$h")"
    if [ -z "$new" ]; then
      if [ "$had" = 1 ]; then
        rm -f "$f"; plog "input $k/$ref 창 사라짐 — 기록 지움"
        # team_lead 는 답 대기에서 돌아올 때만(살아 있던 기록이 사라짐) 알린다
        if [ "$k" != team_lead ] || [ "$ca" = y ]; then in_mark "$name"; fi
      fi
      console_input_rec_unlock "$name"; return 0
    fi
  else
    if [ "$had" = 0 ] || [ "$ck" != "$CI_KIND" ] || [ "$cf" != "$CI_FULL" ] || [ "$ch" != "$h" ] || [ "$cr" != "$run" ] \
       || { [ -z "$CI_FULL" ] && [ "$(printf '%s' "$cur" | jq -c '.excerpt // []' 2>/dev/null | console_excerpt_sha_json)" != "$CI_SHA" ]; } \
       || console_consumed_has_since "$name" "$cs"; then
      # 새 창(또는 소비된 창과 같은 모양이 다시 뜸·창 앞부분이 바뀜) → since 를 새로.
      # 단 키를 막 보낸 같은 창(아직 화면에 반영 전)은 이번 주기에 세지 않는다
      if [ "$k" = coord_lane ] && console_lane_recent_send "$ref" "$CI_SHA"; then console_input_rec_unlock "$name"; return 0; fi
      now="$(console_now_ms_iso)"; hd=null
      case "$CI_KIND" in usage-limit|trust) hd="$(jq -nc --arg a "$now" '{by:"auto", at:$a}')" ;; esac
      new="$(jq -nc --arg k "$CI_KIND" --arg s "$now" --argjson ex "$CI_EXC" --argjson hd "$hd" --arg fu "$CI_FULL" --arg run "$run" --arg h "$h" \
        '{v:1, kind:$k, since:$s, excerpt:$ex, handled:$hd, full:(if $fu == "" then null else $fu end), run:$run, handle:$h}')"
    else
      new="$(printf '%s' "$cur" | jq -c --argjson ex "$CI_EXC" '.excerpt = $ex')"   # 같은 창: since·handled·full 유지, 발췌만
    fi
  fi
  # 새 기록이 지금 기록과 다를 때만 쓴다(jq 한 번: 같음 판정 + 새 기록의 kind·살아 있음). 지금 기록을 JSON 하나로 못 읽으면 다른 것으로 본다
  rd=""
  if [ -n "$new" ]; then
    rd="$(jq -nj --argjson a "$new" --argjson b "${cur:-null}" "$_CP_CMP_JQ" 2>/dev/null)" \
      || rd="$(jq -nj --argjson a "$new" --argjson b null "$_CP_CMP_JQ" 2>/dev/null)"
  fi
  if [ -n "$rd" ] && [ "$rd" != same ]; then
    IFS=$'\x1f' read -r -d '' _ nk na <<< "$rd"; na="${na%$'\n'}"
    if console_input_write "$name" "$new"; then
      plog "input $k/$ref $nk $([ "$had" = 1 ] && echo 갱신 || echo 생성)"
      # team_lead 는 답 대기 전환·복귀(살아 있는 기록 있음↔없음)만 알린다 — 자동 처리 창(usage-limit·trust)은 답 대기가 아니다
      if [ "$k" != team_lead ] || [ "$na" != "$ca" ]; then in_mark "$name"; fi
    fi
  fi
  console_input_rec_unlock "$name"
  return 0
}
# 이번 주기에 해석되지 않은(사라진·터미널이 없는) 대상의 기록을 지운다. 읽기 실패한 대상은 seen 이라 그대로 둔다
input_sweep() {
  local f name a
  for f in "$CD"/input/*.json; do
    [ -f "$f" ] || continue
    name="$(basename "$f" .json)"
    grep -qxF -- "$name" "$TMPD/in_seen" 2>/dev/null && continue
    [ "$DRY" = 1 ] && { drylog "input $name 대상 없음 — 기록 지움(하지 않음)"; continue; }
    if console_input_rec_lock "$name"; then
      a="$(rec_active < "$f")"
      rm -f "$f"; console_input_rec_unlock "$name"; plog "input $name 대상 없음 — 기록 지움"
      if [ "$name" != team_lead_lead ] || [ "$a" = y ]; then in_mark "$name"; fi
    fi
  done
}
office_call() {  # office_call <run-id> <office.sh 인자…> — OFFICE_TIMEOUT(20초) 제한, 실패 무시
  local rid="$1"; shift
  if [ "$DRY" = 1 ]; then drylog "COORD_RUN=$rid office.sh $*"; return 0; fi
  run_limited "$OFFICE_TIMEOUT" /dev/null /dev/null /dev/null env COORD_RUN="$rid" bash "$OFFICE" "$@"
}
# 레인 → 그 레인(닫히지 않은)이 있는 살아 있는 열린 회차들의 run-id(줄마다). 같은 이름 레인이 두 회차에 있으면 둘 다 알린다 —
# office.sh 가 자기 회차·핸들의 기록만 쓰므로 섞이지 않는다
lane_runs_all() {
  local sf
  while IFS=$'\t' read -r sf _; do
    [ -n "$sf" ] || continue
    [ "$(jq -r --arg l "$1" '.lanes[$l] // empty | select((.state // "active") != "closed") | "y"' "$sf" 2>/dev/null)" = y ] || continue
    sf="${sf%/*}"; printf '%s\n' "${sf##*/}"
  done < <(_cr_live_runs)
}
# dflow-team 팀장의 답 대기 전환·복귀(바뀔 때만 — 표식이 있을 때만 부른다)
lead_watch() {
  local lf a s b ul pj until rc args
  lf="$(_cr_live_leads)"
  [ "$(_cr_count "$lf")" = 1 ] || { plog "input team_lead 알림: 살아 있는 팀장 기록이 하나가 아님 — 건너뜀"; return 0; }
  a="$(jq -r '.agent // empty' "$lf" 2>/dev/null)"; s="$(jq -r '.slots // empty | tostring' "$lf" 2>/dev/null)"
  b="$(jq -r '.busy // empty | tostring' "$lf" 2>/dev/null)"; ul="$(jq -r '.until_label // empty | tostring' "$lf" 2>/dev/null)"
  pj="$(jq -r '.project // empty | tostring' "$lf" 2>/dev/null)"
  [ -n "$a" ] || return 0
  # 답 대기 = 살아 있는 기록(handled null·usage-limit·trust 아님)일 때만. 자동 처리 창이면 원래 라벨
  if [ -f "$(console_input_file team_lead_lead)" ] && [ "$(rec_active < "$(console_input_file team_lead_lead)")" = y ]; then until="답 대기"
  else
    until="$ul"
    [ -n "$until" ] || { plog "input team_lead 복귀: until_label 이 비어 watch 를 보내지 않음"; return 0; }
  fi
  args=(watch --agent "$a")
  case "$s" in ''|*[!0-9]*) ;; *) args+=(--slots "$s") ;; esac
  case "$b" in ''|*[!0-9]*) ;; *) args+=(--busy "$b") ;; esac
  args+=(--until "$until")
  [ -n "$pj" ] && args+=(--project "$pj")
  if [ "$DRY" = 1 ]; then drylog "dflow.sh watch (team_lead until=$until)"; return 0; fi
  local DFL_TIMEOUT="$LEAD_WATCH_TIMEOUT"
  dfl /dev/null "${args[@]}"; rc=$?
  rm -f "$TMPD/out" "$TMPD/err"
  plog "input team_lead → watch until=$([ "$until" = "답 대기" ] && echo 답대기 || echo 복귀) rc=$rc"
  return "$rc"
}
# ④ 표식마다 알린다. 시간 초과(124)·네트워크(6)면 표식을 남겨 다음 주기에 다시.
#   구간 상한(NOTIFY_MAX) 안에 office.sh 한 번(OFFICE_TIMEOUT)이 다 들어갈 수 없으면 남은 표식은 다음 주기로 미룬다(중간에 끊지 않게).
input_notify() {
  local m name ref rid rc t0 r1 any n=0
  t0="$(coord_now_epoch)"
  for m in "$CD"/input/.notify/*; do
    [ -f "$m" ] || continue
    if [ "$n" -gt 0 ] && [ $(( $(coord_now_epoch) - t0 + OFFICE_TIMEOUT )) -gt "$NOTIFY_MAX" ]; then plog "입력 요청 알림: 구간 상한이 모자라 남은 표식은 다음 주기에"; break; fi
    n=$((n + 1))
    name="$(basename "$m")"; rc=0
    case "$name" in
      coord_lane_*)
        ref="${name#coord_lane_}"; any=0
        for rid in $(lane_runs_all "$ref"); do
          any=1; office_call "$rid" lane-state "$ref" auto; r1=$?
          case "$r1" in 6|124) rc="$r1" ;; esac
        done
        [ "$any" = 1 ] || plog "input $name 알림: 회차를 못 찾아 건너뜀" ;;
      coord_lead_*)
        ref="${name#coord_lead_}"
        if rid="$(lead_run "$ref")"; then office_call "$rid" lead-sync; rc=$?
        else plog "input $name 알림: 열린 회차를 못 찾아 건너뜀"; fi ;;
      team_lead_lead) lead_watch; rc=$? ;;
    esac
    case "$rc" in 6|124) ;; *) rm -f "$m" ;; esac
  done
  return 0
}

# ---- ③ 화면 올리기 ----------------------------------------------------------------------------
sc_drop_live() { [ "$DRY" = 1 ] || sc_drop "$1"; }   # dry-run 은 화면 캐시도 건드리지 않는다
# 화면 읽기 구간(run_phase 가 백그라운드로 돌린다 — 전역 값은 파일로만 넘긴다): items.jsonl·pending.tsv 를 만든다
screens_collect() {
  local kind ref h sha shaf at lines full=0 touch=0 osha
  mkdir -p "$CD/screens" 2>/dev/null
  # 이 구간(백그라운드 서브셸) 안에서는 살아 있는 회차 판정을 한 번만 한다 — 대상 목록·레인 회차(lane_run_h)가 같은 결과를 다시 쓴다.
  # 키 행 처리(phase_prompts)는 이 구간 밖이라 늘 새로 판정한다
  cr_memo_begin
  # 한 요청에 같은 대상(kind+ref)을 두 번 넣지 않는다(서버가 앞의 것을 duplicate_target 으로 거절). 둘 이상 나온 대상은
  # 해석이 애매한 것이므로 모두 뺀다.
  console_list_targets 2>/dev/null | awk -F'\t' '{ k = $1 "\t" $2; n[k]++; l[NR] = $0; key[NR] = k } END { for (i = 1; i <= NR; i++) if (n[key[i]] == 1) print l[i] }' > "$TMPD/targets"
  local rt sc_on=0
  [ "$DRY" = 1 ] || [ "$(sc_ttl)" -le 0 ] || sc_on=1   # 화면 캐시: 설정 approvals.screen_cache_s 가 0 이거나 dry-run 이면 쓰지 않는다
  while IFS=$'\t' read -r kind ref h; do
    [ -n "$h" ] || continue
    in_terms "$h" || { [ "$kind" = coord_lane ] && sc_drop_live "$h"; continue; }
    # 41줄: 가림 라이브러리가 맨 앞 한 줄을 줄 이음 판정에만 쓰고 마지막 40줄을 낸다
    # 읽기 실패는 일시적일 수 있으므로 입력 요청 기록을 그대로 둔다(seen). 단 화면 캐시는 낡게 두지 않고 지운다
    run_limited "$SCREEN_READ_MAX" "$TMPD/scr" /dev/null /dev/null term_read_screen "$h" 41 || { rm -f "$TMPD/scr"; [ "$kind" = coord_lane ] && sc_drop_live "$h"; printf '%s_%s\n' "$kind" "$ref" >> "$TMPD/in_seen"; continue; }
    [ "$kind" = coord_lane ] && rt="$(sc_now_ms)"   # 화면을 읽은 시각(캐시의 read_at_ms)
    # 입력 요청 감지(같은 화면, 새 읽기 없음). 팀원(team_worker)은 하지 않는다
    CI_KIND=""; CI_FULL=""
    if [ "$INPUT_OK" = 1 ] && [ "$kind" != team_worker ]; then input_detect "$kind" "$ref" "$TMPD/scr" "$h"; fi
    # 화면 캐시(레인 화면만): 같은 읽기 결과를 로컬 600 에 남긴다(prompt-watch 가 읽는다 — 새 읽기 없음). 원문은 로그에 남기지 않는다
    if [ "$kind" = coord_lane ]; then
      if [ "$sc_on" = 1 ]; then
        if sc_store "$h" "$TMPD/scr" "$rt" "${CI_FULL:-}"; then
          # 창이 보이면 그 레인만 잠깐 뒤 한 번 더 읽는다(⑤ phase_reread — 이 구간 파일로만 넘긴다)
          if [ "$REREAD_ON" = 1 ] && [ -n "$SC_STORED_KIND" ]; then printf '%s\t%s\n' "$h" "$(coord_now_epoch)" >> "$TMPD/reread"; fi
        else plog "screen-cache $kind/$ref 쓰기 실패"; fi
      else sc_drop_live "$h"; fi
    fi
    printf '%s_%s\n' "$kind" "$ref" >> "$TMPD/in_seen"
    console_screen_filter < "$TMPD/scr" > "$TMPD/filt" 2>/dev/null || { plog "screen $kind/$ref 가림 실패 — 올리지 않음"; continue; }
    sha="$(console_screen_sha < "$TMPD/filt" 2>/dev/null)"
    case "$sha" in *[!0-9a-f]*|'') sha="" ;; esac   # 소문자 hex 64자 한 줄만(grep -Eq '^[0-9a-f]{64}$' 와 같은 판정, 프로세스 없이)
    [ "${#sha}" -eq 64 ] || { plog "screen $kind/$ref sha 실패 — 올리지 않음"; continue; }
    shaf="$CD/screens/${kind}_${ref}.sha"; at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"   # 화면을 읽은 시각(UTC)
    osha=""; [ -f "$shaf" ] && coord_read1 osha "$shaf"
    if [ -f "$shaf" ] && [ "$osha" = "$sha" ]; then
      jq -nc --arg k "$kind" --arg r "$ref" --arg s "$sha" --arg a "$at" '{target_kind:$k, target_ref:$r, sha:$s, captured_at:$a}' >> "$TMPD/items.jsonl"
      touch=$((touch + 1))
    else
      # 줄 배열과 항목을 jq 한 번으로(예전 lines → 항목 두 번과 같은 JSON)
      jq -Rsc --arg k "$kind" --arg r "$ref" --arg s "$sha" --arg a "$at" \
        '{target_kind:$k, target_ref:$r, sha:$s, captured_at:$a, lines:(split("\n") | if length > 0 and .[-1] == "" then .[:-1] else . end)}' \
        < "$TMPD/filt" >> "$TMPD/items.jsonl"
      full=$((full + 1))
    fi
    printf '%s\t%s\t%s\n' "$kind" "$ref" "$sha" >> "$TMPD/pending.tsv"
  done < "$TMPD/targets"
  rm -f "$TMPD/scr" "$TMPD/filt"
  [ "$DRY" = 1 ] || sc_prune 10   # 대상에서 빠진 handle·끝난 회차의 오래된(10분) 화면 캐시를 지운다
  [ "$INPUT_OK" = 1 ] && input_sweep
  printf '%s %s\n' "$full" "$touch" > "$TMPD/counts"
}
# 화면 올리기 구간(백그라운드): 옛 서버(rc 7)는 $TMPD/old7 표식으로 알린다
screens_upload() {
  local kind ref sha shaf n full=0 touch=0 rc b st rest _tag
  read -r full touch < "$TMPD/counts" 2>/dev/null
  n=$((${full:-0} + ${touch:-0})); [ "$n" -gt 0 ] || return 0
  if [ "$DRY" = 1 ]; then drylog "dflow.sh console-screen --host $HOST (항목 $n: 전체 $full · touch $touch)"; return 0; fi
  jq -sc '. as $a | range(0; length; 20) as $i | $a[$i:$i + 20]' "$TMPD/items.jsonl" > "$TMPD/batches"
  while IFS= read -r b; do
    printf '%s' "$b" > "$TMPD/batch.json"
    dfl "$TMPD/batch.json" console-screen --host "$HOST"; rc=$?
    case "$rc" in
      0) ;;
      7) : > "$TMPD/old7"; plog "옛 서버(console-screen rc=7) — ②③ 을 ${OLD_PAUSE_S}초 쉼"; break ;;
      *) plog "console-screen 실패 rc=$rc — sha 기록을 바꾸지 않아 다음 주기에 다시 보냄"; continue ;;
    esac
    while read -r _tag kind ref st rest; do
      [ "$_tag" = SCREEN ] || continue
      case "$ref" in ''|.*|*[!A-Za-z0-9._:-]*) continue ;; esac
      shaf="$CD/screens/${kind}_${ref}.sha"
      sha="$(awk -F'\t' -v k="$kind" -v r="$ref" '$1 == k && $2 == r { print $3; exit }' "$TMPD/pending.tsv")"
      case "$st" in
        stored|touched) [ -n "$sha" ] && printf '%s\n' "$sha" > "$shaf" ;;
        need_full) rm -f "$shaf" ;;
        *) rm -f "$shaf" ;;
      esac
      plog "screen $kind/$ref → $st${rest:+ $rest}"
    done < "$TMPD/out"
  done < "$TMPD/batches"
  rm -f "$TMPD/batch.json"
}
phase_screens() {
  local rc
  [ "$REDACT_OK" = 1 ] || return 0
  [ -n "$TL" ] || return 0
  rm -f "$TMPD/targets" "$TMPD/counts" "$TMPD/old7" "$TMPD/reread"; : > "$TMPD/items.jsonl"; : > "$TMPD/pending.tsv"; : > "$TMPD/in_seen"
  run_phase "화면 읽기" "$PHASE_MAX" /dev/null /dev/stderr screens_collect; rc=$?
  rm -f "$TMPD/scr" "$TMPD/filt"   # 상한으로 끊겼을 때 남은 화면 원문
  # 읽기를 다 못 끝냈으면(상한 초과) 반쪽 항목을 올리지 않는다
  if [ "$rc" = 0 ]; then run_phase "화면 올리기" "$PHASE_MAX" /dev/null /dev/stderr screens_upload; fi
  [ -f "$TMPD/old7" ] && OLD_UNTIL=$(( $(coord_now_epoch) + OLD_PAUSE_S ))
  rm -f "$TMPD/items.jsonl" "$TMPD/pending.tsv" "$TMPD/batches" "$TMPD/old7" "$TMPD/in_seen"
  return 0
}
# ⑤ 화면 재읽기(상주 폴러만): 화면 읽기에서 창이 보인 레인만 REREAD_S 초 뒤 한 번 더 읽어 화면 캐시를 바로 갱신한다 — 창이 사라졌는지·바뀌었는지를
#   다음 30초 주기까지 기다리지 않고 prompt-watch 가 믿게 한다(낡은 창을 믿는 시간·연속 창을 놓치는 틈을 줄인다). 주기당 한 번·레인당 한 번.
#   입력 요청 기록·서버 올리기는 하지 않는다(다음 주기 몫). 읽기에 실패하면 그 레인의 캐시를 지운다.
screens_reread() {
  local h t0 w full
  while IFS=$'\t' read -r h t0; do
    [ -n "$h" ] || continue
    w=$(( REREAD_S - ($(coord_now_epoch) - ${t0:-0}) ))
    [ "$w" -gt 0 ] && sleep "$w"
    run_limited "$SCREEN_READ_MAX" "$TMPD/scr2" /dev/null /dev/null term_read_screen "$h" 41 || { rm -f "$TMPD/scr2"; sc_drop_live "$h"; continue; }
    full=""
    [ "$INPUT_OK" = 1 ] && full="$(console_full_sha < "$TMPD/scr2" 2>/dev/null)"
    sc_store "$h" "$TMPD/scr2" "$(sc_now_ms)" "$full" || plog "screen-cache 재읽기 쓰기 실패"
  done < "$TMPD/reread"
  rm -f "$TMPD/scr2"
}
phase_reread() {
  [ "$REREAD_ON" = 1 ] && [ "$DRY" != 1 ] && [ -s "$TMPD/reread" ] || { rm -f "$TMPD/reread"; return 0; }
  run_phase "화면 재읽기" "$PHASE_MAX" /dev/null /dev/stderr screens_reread
  rm -f "$TMPD/reread" "$TMPD/scr2"
  return 0
}
# 입력 요청 알림은 office.sh 한 번이 OFFICE_TIMEOUT(20초)까지 걸릴 수 있어 주기 몫(CYCLE_MAX)·구간 상한(PHASE_MAX)과 따로
# NOTIFY_MAX(기본 45초, COORD_CONSOLE_NOTIFY_MAX_S) 안에 돈다(주기의 마지막 일이라 다음 일을 밀지 않는다).
phase_input_notify() {
  local rc
  [ "$INPUT_OK" = 1 ] || return 0
  ls "$CD"/input/.notify/* >/dev/null 2>&1 || return 0
  run_limited "$NOTIFY_MAX" /dev/null /dev/stderr /dev/null input_notify; rc=$?
  [ "$rc" = 124 ] && plog "경고: '입력 요청 알림' 이 ${NOTIFY_MAX}초 상한을 넘어 이번 주기 몫을 버림"
  return 0
}

# ---- 한 주기 ---------------------------------------------------------------------------------
# run_phase <이름> <구간 상한 초> <stdout 파일> <stderr 파일> <명령…> — 주기 몫(CYCLE_MAX, 프롬프트 전달 구간 제외)의 남은 시간과
#   구간 상한 중 작은 값 안에 돌린다. 넘으면 자손까지 죽이고 경고 한 줄. 주기 몫을 다 썼으면 돌리지 않는다(124).
run_phase() {
  local name="$1" cap="$2" out="$3" err="$4" rem lim rc; shift 4
  rem=$(( CYCLE_MAX - ($(coord_now_epoch) - CYC_T0 - DELIV_S) ))
  lim="$cap"; [ "$rem" -lt "$lim" ] && lim="$rem"
  if [ "$lim" -le 0 ]; then plog "경고: 주기 상한 ${CYCLE_MAX}초를 다 써 '$name' 을 이번 주기에 건너뜀"; return 124; fi
  run_limited "$lim" "$out" "$err" /dev/null "$@"; rc=$?
  [ "$rc" = 124 ] && plog "경고: '$name' 이 ${lim}초 상한을 넘어 이번 주기 몫을 버림"
  return "$rc"
}
TL=""
cycle() {
  local sz rc t1
  CYC_T0="$(coord_now_epoch)"; DELIV_S=0
  sz="$(wc -c < "$LOG" 2>/dev/null | tr -d ' ')"
  [ "${sz:-0}" -gt 1048576 ] && mv -f "$LOG" "$LOG.1" 2>/dev/null
  inflight_sweep
  # ① 생존 감시(서버 지원과 무관하게 늘)
  if [ "$DRY" = 1 ]; then drylog "office.sh reap --state-dir $ROOT"
  else
    run_phase "생존 감시" "$PHASE_MAX" /dev/null /dev/null bash "$OFFICE" reap --state-dir "$ROOT"; rc=$?
    case "$rc" in 0|124) ;; *) plog "reap rc=$rc" ;; esac
  fi
  [ "$OLD_UNTIL" -gt "$(coord_now_epoch)" ] && return 0
  TL=""
  if run_phase "터미널 목록" "$LIST_MAX" "$TMPD/tl" /dev/null term_list; then TL="$(cut -f1 "$TMPD/tl")"; fi
  rm -f "$TMPD/tl"
  # ② 프롬프트 전달 — 한 건이 보내기 60초 + ack 40초까지 걸릴 수 있어 주기 몫에서 뺀다
  t1="$(coord_now_epoch)"
  phase_prompts
  DELIV_S=$(( $(coord_now_epoch) - t1 ))
  if [ "$OLD_UNTIL" -le "$(coord_now_epoch)" ]; then phase_screens; fi
  # ④ 입력 요청 알림(키 입력 뒤의 기록 삭제도 여기서 알린다)
  phase_input_notify
  # ⑤ 화면 재읽기(창이 보인 레인만, 상주 폴러만)
  phase_reread
  return 0
}

# 오래 사는 루프가 조정 세션의 값을 물려받아 다른 스크립트에 섞이지 않게 한다.
forget_session_env() { unset COORD_RUN COORD_SESSION_ID CLAUDE_CODE_SESSION_ID CLAUDE_PID ORCA_TERMINAL_HANDLE; }

cmd_run() {
  local i=0 ok=1
  coord_clock_init   # 이후 coord_now_epoch 은 date 를 부르지 않는다
  REREAD_ON=1
  forget_session_env
  setup || ok=0
  need_ident || ok=0
  if [ "$ok" = 0 ]; then
    # start 가 잡아 준 잠금이면(그사이 설정이 꺼진 경우 등) 우리 pid 가 적히길 잠깐 기다려 풀고 끝낸다(죽은 pid 잠금을 남기지 않게)
    if [ "${CONSOLE_POLL_LOCKED:-}" = 1 ] && [ -n "$LK" ]; then
      until lock_mine; do i=$((i + 1)); [ "$i" -ge 50 ] && exit 0; sleep 0.1; done
      rm -rf "$LK"
    fi
    exit 0
  fi
  if [ "${CONSOLE_POLL_LOCKED:-}" = 1 ]; then   # start 가 잠금을 잡고 우리 pid 를 적어 준다
    until lock_mine; do i=$((i + 1)); [ "$i" -ge 50 ] && exit 0; sleep 0.1; done
  else
    lock_take || exit 0
  fi
  trap 'on_exit' EXIT
  trap 'exit 0' TERM INT HUP
  lock_note_tmpd
  plog "폴러 시작 pid=$$ cycle=${CYCLE}s host=$HOST"
  local empty=0
  while :; do
    lock_mine || { plog "잠금을 잃음 — 끝냄"; exit 0; }
    cfg_enabled || { plog "office.enabled 가 꺼짐 — 끝냄"; exit 0; }
    cycle        # 직렬: 앞 주기가 끝나야 다음 주기가 시작된다
    if has_work; then empty=0; else
      empty=$((empty + 1))
      [ "$empty" -ge 2 ] && { plog "할 일 없는 주기 2번 — 끝냄"; exit 0; }
    fi
    sleep "$CYCLE" & SLEEP_PID=$!
    wait "$SLEEP_PID" 2>/dev/null; SLEEP_PID=""
  done
}
on_exit() {
  trap '' TERM INT HUP   # 정리 도중 다시 불리지 않게
  [ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null
  # 주기 도중에 멈추면(stop) 진행 중이던 호출과 그 시간 감시자를 함께 거둔다(고아로 남지 않게)
  [ -n "$RL_WD" ] && { kill "$RL_WD" 2>/dev/null; }   # 감시자의 TERM trap 이 자기 sleep 을 죽인다
  [ -n "$RL_PID" ] && kill_tree "$RL_PID"
  [ -n "$RL_WD" ] && wait "$RL_WD" 2>/dev/null
  RL_PID=""; RL_WD=""
  # 붙잡아 둔 retry(compacting) 를 짧게 돌려보낸다(한 번에 3초, 다시 부르지 않음, 모두 합쳐 FLUSH_EXIT_MAX_S)
  if [ "$DRY" != 1 ] && [ -s "$TMPD/held" ] && [ -n "$DFLOW" ]; then
    DFL_TIMEOUT=3; ACK_RETRY=0
    flush_held "$FLUSH_EXIT_MAX_S"
  fi
  if lock_mine; then
    rm -rf "$LK"; plog "폴러 끝 pid=$$"
    # 단일 인스턴스 잠금의 주인이 끝나는 것이라 화면 캐시(원문 .txt·임시 파일)를 지운다. dry-run 은 건드리지 않는다(시험용 KEEP 도 같다)
    [ "$DRY" = 1 ] || [ "${COORD_CONSOLE_KEEP_SCREEN:-}" = 1 ] || sc_clear
  fi
  rm -rf "$TMPD"
}

cmd_once() {
  coord_clock_init
  forget_session_env
  setup || { coord_log "console-poll: 건너뜀($SKIP)"; exit 0; }
  need_ident || { coord_log "console-poll: 건너뜀($SKIP)"; exit 0; }
  lock_take || { echo "CONSOLE_POLLER running pid=$HELD"; exit 0; }
  trap 'on_exit' EXIT
  trap 'exit 0' TERM INT HUP
  lock_note_tmpd
  cycle
  exit 0
}

_cp_is_windows() { case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; esac; return 1; }
cmd_start() {
  local cpid
  [ "$DRY" = 1 ] && { echo "CONSOLE_POLLER skipped dry"; exit 0; }
  setup || { echo "CONSOLE_POLLER skipped $SKIP"; exit 0; }
  need_ident || { echo "CONSOLE_POLLER skipped $SKIP"; exit 0; }
  lock_live && { echo "CONSOLE_POLLER running pid=$HELD"; exit 0; }
  has_work || { echo "CONSOLE_POLLER skipped idle"; exit 0; }
  lock_take || { echo "CONSOLE_POLLER running pid=$HELD"; exit 0; }
  # 부른 쪽의 stdout·stderr 를 붙잡지 않게 모두 닫고, 가능하면 새 세션으로 떼어 낸다(부른 셸의 프로세스 그룹 정리에 같이 죽지 않게).
  # setsid 명령 → node detached spawn(자식 pid 를 stdout 에 찍고 바로 끝난다) → nohup 순. 어느 경로든 cpid 는 실제 폴러 pid 다.
  cpid=""
  if command -v setsid >/dev/null 2>&1; then
    # 백그라운드 & 안에서는 그룹 리더가 아니라서 setsid 가 포크하지 않고 같은 pid 로 exec 한다
    CONSOLE_POLL_LOCKED=1 CONSOLE_POLL_IDENT="$IDENT" setsid bash "$SELF" run </dev/null >/dev/null 2>&1 &
    cpid=$!
  elif command -v node >/dev/null 2>&1 && ! _cp_is_windows; then
    # 윈도우 node 는 네이티브라 c.pid 가 Windows PID 다(MSYS·Cygwin 셸의 $$ 와 다를 수 있어 잠금 주인 판정이 어긋난다) — 윈도우는 nohup 으로
    cpid="$(CONSOLE_POLL_LOCKED=1 CONSOLE_POLL_IDENT="$IDENT" node -e 'const c=require("child_process").spawn("bash",[process.argv[1],"run"],{detached:true,stdio:"ignore",env:process.env});c.unref();process.stdout.write(String(c.pid))' "$SELF" 2>/dev/null)"
    case "$cpid" in ''|*[!0-9]*) cpid="" ;; esac
  fi
  if [ -z "$cpid" ]; then
    CONSOLE_POLL_LOCKED=1 CONSOLE_POLL_IDENT="$IDENT" nohup bash "$SELF" run </dev/null >/dev/null 2>&1 &
    cpid=$!
  fi
  lock_write "$cpid"
  plog "start → pid=$cpid"
  echo "CONSOLE_POLLER started pid=$cpid"
}

# stop_one — $LK 의 폴러를 멈춘다(멈췄으면 0). TERM 뒤 STOP_WAIT_S 안에 안 끝나면(앞에서 포그라운드 호출을 기다리는 중 등)
#   자손까지 KILL 하고, 잠금에 적힌 임시 폴더(claim_token·프롬프트 본문이 있을 수 있다)를 대신 지운다.
stop_one() {
  local i=0 n t
  if ! lock_live || [ "$HELD" = - ]; then return 1; fi
  kill -TERM "$HELD" 2>/dev/null
  n=$((STOP_WAIT_S * 10))
  while kill -0 "$HELD" 2>/dev/null && [ "$i" -lt "$n" ]; do sleep 0.1; i=$((i + 1)); done
  if kill -0 "$HELD" 2>/dev/null; then
    t="$(head -1 "$LK/tmpd" 2>/dev/null)"
    kill_tree "$HELD"       # 주인이 죽기 전에 자손을 모아 함께 죽인다(주인이 죽으면 자손을 ppid 로 못 찾는다)
    case "$t" in
      /*/coord-console.*) case "$t" in *..*) ;; *) case "${t##*/}" in coord-console.*) [ -d "$t" ] && rm -rf "$t" ;; esac ;; esac ;;
    esac
    sc_clear   # KILL 당한 폴러는 on_exit 을 못 돌리므로 화면 캐시도 대신 지운다
    plog "stop pid=$HELD — TERM 뒤 ${STOP_WAIT_S}초 안에 끝나지 않아 자손까지 KILL·임시 폴더 정리"
  fi
  rm -rf "$LK"; plog "stop pid=$HELD"
  return 0
}

cmd_stop() {
  local d any=0
  setup >/dev/null 2>&1 || true
  if need_ident cache-first; then
    if stop_one; then echo "CONSOLE_POLLER stopped"; else rm -rf "$LK" 2>/dev/null; echo "CONSOLE_POLLER none"; fi
    return 0
  fi
  # 신원을 못 구함(설정이 꺼진 뒤·캐시 없음): 이 PC 의 폴러 잠금을 모두 훑는다
  for d in "$CD"/poller-*.lock; do
    [ -d "$d" ] || continue
    LK="$d"; LOG="${d%.lock}.log"
    stop_one && any=1
  done
  if [ "$any" = 1 ]; then echo "CONSOLE_POLLER stopped"; else echo "CONSOLE_POLLER none"; fi
}

status_line() { echo "CONSOLE_POLLER up pid=$HELD since=$(cat "$LK/since" 2>/dev/null || echo -) cycle=$(cat "$LK/cycle" 2>/dev/null || echo -)"; }
cmd_status() {
  local d
  setup >/dev/null 2>&1 || true
  if need_ident cache-first; then
    if lock_live && [ "$HELD" != - ]; then status_line; else echo "CONSOLE_POLLER down"; fi
    return 0
  fi
  for d in "$CD"/poller-*.lock; do
    [ -d "$d" ] || continue
    LK="$d"
    if lock_live && [ "$HELD" != - ]; then status_line; return 0; fi
  done
  echo "CONSOLE_POLLER down"
}

lead_file() { printf '%s/lead/%s.json' "$CD" "$(printf '%s' "$1" | cksum | cut -d' ' -f1)"; }
cmd_handle_record() {
  local agent="" repo="" slots="" busy="" ul="" proj="" f old new pid h
  [ "${1:-}" = team ] || usage; shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --agent) agent="${2:-}"; shift ;;
      --repo) repo="${2:-}"; shift ;;
      --slots) slots="${2:-}"; shift ;;
      --busy) busy="${2:-}"; shift ;;
      --until-label) ul="${2-}"; shift ;;
      --project) proj="${2:-}"; shift ;;
      *) usage ;;
    esac
    shift
  done
  [ -n "$agent" ] && [ -n "$repo" ] || usage
  case "$slots$busy" in *[!0-9]*) usage ;; esac
  pid="${CLAUDE_PID:-}"; case "$pid" in *[!0-9]*) pid="" ;; esac
  h="${ORCA_TERMINAL_HANDLE:-}"
  f="$(lead_file "$repo")"
  mkdir -p "$(dirname "$f")" || exit 4
  old="$(cat "$f" 2>/dev/null)"; [ -n "$old" ] && printf '%s' "$old" | jq -e 'type == "object"' >/dev/null 2>&1 || old='{}'
  new="$(jq -nc --argjson o "$old" --arg a "$agent" --arg r "$repo" --arg h "$h" --arg p "$pid" --arg at "$(coord_now_iso)" \
      --arg s "$slots" --arg b "$busy" --arg ul "$ul" --arg pj "$proj" '
    $o + {agent:$a, repo:$r, at:$at}
    + (if $h != "" then {handle:$h} elif ($o.handle // null) == null then {handle:""} else {} end)
    + (if $p != "" then {pid:($p | tonumber)} elif ($o.pid // null) == null then {pid:0} else {} end)
    + (if $s != "" then {slots:($s | tonumber)} else {} end)
    + (if $b != "" then {busy:($b | tonumber)} else {} end)
    + (if $ul != "" then {until_label:$ul} else {} end)
    + (if $pj != "" then {project:$pj} else {} end)')" || exit 4
  printf '%s\n' "$new" > "$f.tmp.$$" && mv -f "$f.tmp.$$" "$f" || exit 4
  echo "OK $f"
}
cmd_handle_clear() {
  local repo=""
  [ "${1:-}" = team ] || usage; shift
  [ "${1:-}" = --repo ] && [ -n "${2:-}" ] || usage
  repo="$2"
  rm -f "$(lead_file "$repo")"
  echo OK
}

# input-handled (--lane <레인> | --lead <세션8>) --by <coordinator|auto> [--expect-full <지문>] — 조정자·auto-answer 가 창에 답했다고
#   기록한다. --expect-full 을 주면 기록의 full 이 그 값일 때만(답한 창이 아직 기록의 창일 때만) 처리하고, 다르면 `NONE prompt-changed`.
#   기록 잠금 안의 처리는 lib console_input_mark_handled(term-send-safe.sh·auto-answer.sh 가 레인 잠금 안에서 직접 부르는 것과 같은 함수)
cmd_input_handled() {
  local lane="" lead="" by="" k ref name cur rid rr expect="" has_exp=0 mrc
  while [ $# -gt 0 ]; do
    case "$1" in
      --lane) lane="${2:-}"; shift ;;
      --lead) lead="${2:-}"; shift ;;
      --by) by="${2:-}"; shift ;;
      --expect-full) expect="${2:-}"; has_exp=1; shift ;;
      *) usage ;;
    esac
    shift
  done
  if [ -n "$lane" ] && [ -z "$lead" ]; then k=coord_lane; ref="$lane"
  elif [ -n "$lead" ] && [ -z "$lane" ]; then k=coord_lead; ref="$lead"
  else usage; fi
  case "$by" in coordinator|auto) ;; *) usage ;; esac
  if [ "$has_exp" = 1 ]; then printf '%s' "$expect" | grep -Eqx '[0-9a-f]{64}' || usage; fi
  [ "$INPUT_OK" = 1 ] || { coord_log "console-poll: 입력 요청 라이브러리 없음"; echo NONE; exit 0; }
  console_input_ref_ok "$ref" || usage
  name="${k}_$ref"
  console_input_mark_handled "$name" "$by" "$expect"; mrc=$?
  case "$mrc" in
    0) [ "$CI_MH_CONS" = 1 ] || coord_log "console-poll: 소비 목록 쓰기 실패($name)" ;;
    1) echo NONE; exit 0 ;;
    2) echo "NONE prompt-changed"; exit 0 ;;
    *) coord_log "console-poll: 기록 잠금·쓰기 실패($name)"; exit 4 ;;
  esac
  cur="$CI_MH_REC"
  # office.sh 갱신: 회차는 COORD_RUN(그 레인·세션의 것일 때) → 이 신원의 살아 있는 열린 회차에서 찾기
  rid=""
  # 기록에 적힌 회차(폴러가 쓴 run 칸)가 있으면 그것을 먼저 쓴다
  if [ "$k" = coord_lane ]; then
    rr="$(printf '%s' "$cur" | jq -r '.run // empty | tostring' 2>/dev/null)"
    case "$rr" in ''|.*|*/*) ;; *) [ -f "$(coord_state_root)/$rr/state.json" ] && rid="$rr" ;; esac
  fi
  if [ -z "$rid" ] && [ -n "${COORD_RUN:-}" ] && [ -f "$(coord_state_root)/$COORD_RUN/state.json" ]; then
    if [ "$k" = coord_lane ]; then
      [ "$(jq -r --arg l "$ref" '.lanes | has($l)' "$(coord_state_root)/$COORD_RUN/state.json" 2>/dev/null)" = true ] && rid="$COORD_RUN"
    else [ "$(coord_sess8 "$(coord_state_root)/$COORD_RUN/state.json")" = "$ref" ] && rid="$COORD_RUN"; fi
  fi
  if [ -z "$rid" ]; then
    setup >/dev/null 2>&1; need_ident cache-first >/dev/null 2>&1
    if [ "$k" = coord_lane ]; then rr="$(lane_run "$ref")" && rid="${rr#*$'\t'}"; else rid="$(lead_run "$ref")"; fi
  fi
  if [ -n "$rid" ]; then
    if [ "$k" = coord_lane ]; then office_call "$rid" lane-state "$ref" auto; else office_call "$rid" lead-sync; fi
    case "$?" in 6|124) in_mark "$name" ;; esac   # 시간 초과·네트워크면 폴러가 다음 주기에 다시 알린다
  else in_mark "$name"; fi    # 회차를 못 찾으면 폴러가 다음 주기에 알린다
  echo OK
}

# judge-sha --lane <레인> — 그 레인 화면을 지금 읽어(41줄) 창 지문(CI_FULL, console_full_sha)을 낸다. 조정자가 판단 올리기 전에 기억해
#   두고 `term-send-safe.sh --lane <레인> --raw --expect-sha <지문>` 으로 답한다(잠금 안에서 다시 읽은 화면이 다르면 보내지 않는다).
#   stdout: `JUDGE <h> <kind> <지문>` · 창이 없으면 `NONE <h>` · 읽기 stale 이면 `STALE <h>` · 창은 있는데 머리를 읽은 화면 안에서
#   못 찾아 지문이 없으면 `NOFP <h>`(직접 답하지 않는다 — 터미널에서 사람이 답하거나 창이 바뀌기를 기다린다). 핸들은 현재 회차
#   (COORD_RUN·current)의 lanes.<레인>.session.handle(term-send-safe.sh --lane 과 같다). 화면 원문·발췌는 내지 않는다.
cmd_judge_sha() {
  local lane="" h rc
  while [ $# -gt 0 ]; do
    case "$1" in --lane) lane="${2:-}"; shift ;; *) usage ;; esac
    shift
  done
  console_input_ref_ok "$lane" || usage
  [ "$INPUT_OK" = 1 ] || coord_die 4 "console-poll: 입력 요청 라이브러리 없음"
  coord_has_run || coord_die 3 "현재 회차가 없다"
  h="$(coord_lane_get "$lane" .session.handle 2>/dev/null)"
  [ -n "$h" ] && [ "$h" != null ] || coord_die 3 "레인 $lane 의 handle 이 상태에 없다"
  run_limited "$SCREEN_READ_MAX" "$TMPD/jscr" /dev/null /dev/null term_read_screen "$h" 41; rc=$?
  if [ "$rc" != 0 ]; then rm -f "$TMPD/jscr"; [ "$rc" = 3 ] && { echo "STALE $h"; exit 0; }; coord_die 4 "화면을 읽지 못했다: $h"; fi
  console_input_snapshot "$TMPD/jscr"; rc=$?
  rm -f "$TMPD/jscr"
  case "$rc" in
    0) if [ -n "$CI_FULL" ]; then echo "JUDGE $h $CI_KIND $CI_FULL"; else echo "NOFP $h"; fi ;;
    1) echo "NONE $h" ;;
    *) coord_die 4 "가림·해시 실패: $h" ;;
  esac
}

[ $# -ge 1 ] || usage
sub="$1"; shift
case "$sub" in
  start) [ $# -eq 0 ] || usage; cmd_start ;;
  stop) [ $# -eq 0 ] || usage; cmd_stop ;;
  status) [ $# -eq 0 ] || usage; cmd_status ;;
  run) [ $# -eq 0 ] || usage; cmd_run ;;
  --once|--dry-run)
    for a in "$sub" "$@"; do
      case "$a" in --once) ;; --dry-run) DRY=1 ;; *) usage ;; esac
    done
    case " $sub $* " in *" --once "*) ;; *) usage ;; esac
    cmd_once ;;
  handle-record) cmd_handle_record "$@" ;;
  handle-clear) cmd_handle_clear "$@" ;;
  input-handled) cmd_input_handled "$@" ;;
  judge-sha) cmd_judge_sha "$@" ;;
  -h|--help|help) sed -n '2,/^set -uo/p' "$0" | sed '$d' >&2; exit 0 ;;
  *) usage ;;
esac
exit 0
