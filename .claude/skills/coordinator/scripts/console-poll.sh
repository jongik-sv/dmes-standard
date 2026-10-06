#!/usr/bin/env bash
# 사용법: console-poll.sh start | stop | status | --once [--dry-run] | run
#         console-poll.sh handle-record team --agent <신원>/<host>/lead --repo <MAIN> [--slots n] [--busy n] [--until-label 글] [--project id]
#         console-poll.sh handle-clear team --repo <MAIN>
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
#           ② 는 `console-poll --limit 1` 로 한 건씩 집어 전달·ack 를 끝낸 뒤 다음 건을 집는다(빈 응답까지, 한 주기 최대 20건).
#             compacting 의 retry ack 는 그 주기의 poll 이 끝난 뒤 보낸다(retry 행이 바로 다시 나와 맴돌지 않게). 다만 claim(poll 직전) 뒤
#             120초 ack 창 − 한 건 최대 처리 시간(보내기 60초 + ack 재시도 40초) = 20초가 지나면 다음 poll 전에 먼저 보낸다. 그렇게 돌려보낸
#             행이 같은 주기에 다시 나오면 보내지 않고 새 토큰으로 다시 붙잡는다(한 주기에 같은 id 를 두 번 넣지 않는다).
#             poll 이 exit 5 + forbidden_role(프로젝트 한정 PAT)이면 그 프로세스 동안 poll·ack 만 끈다(reap·화면은 계속)
#           ③ 화면은 `term_read_screen <h> 41`(가림 라이브러리가 맨 앞 줄을 줄 이음 판정에만 쓰고 마지막 40줄을 낸다).
#             captured_at 은 UTC(…Z). 한 요청에 같은 대상을 두 번 넣지 않고, 올리기 실패면 sha 기록을 그대로 둬 다음 주기에 다시 보낸다
#           시간 상한: 프롬프트 전달 구간을 뺀 나머지(생존 감시·터미널 목록·화면 읽기·화면 올리기)는 구간마다
#             COORD_CONSOLE_PHASE_MAX_S(기본 10초)와 주기 몫 COORD_CONSOLE_CYCLE_MAX_S(기본 25초)의 남은 시간 중 작은 값 안에 끝낸다.
#             넘으면 그 구간을 버리고(자손까지 죽임) 로그에 경고 한 줄을 남긴다. orca·lead-state·dflow.sh 호출은 모두 시간 제한 안에서 돈다.
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
#         COORD_CONSOLE_PHASE_MAX_S · COORD_DRY
#         시험용: COORD_TERM_SEND_SAFE(term-send-safe.sh 경로) · COORD_LEAD_STATE(lead-state.sh 경로) · CONSOLE_POLL_IDENT(신원) ·
#         COORD_CONSOLE_HELD_MAX_S(retry 를 먼저 보내는 나이, 기본 20) · COORD_CONSOLE_STOP_WAIT_S(stop 이 TERM 뒤 기다리는 초, 기본 10) ·
#         COORD_CONSOLE_LS_TIMEOUT_S(lead-state 상한, 기본 5)
#   비밀: 프롬프트 본문·claim_token·화면 원문·dflow.sh 오류 본문은 로그·stderr 에 남기지 않는다(시각·대상·결과·사유만).
set -uo pipefail
. "$(dirname "$0")/lib/common.sh"
. "$(dirname "$0")/lib/term.sh"
. "$(dirname "$0")/lib/console-resolve.sh"
coord_default_repo
SELF="$COORD_SCRIPTS_DIR/console-poll.sh"

# 가림·정리 함수(contract §4.1). 없으면 ②③ 을 하지 않는다(claim 한 프롬프트를 넣지 못해 버리는 일을 막는다).
REDACT_OK=0
if [ -f "$COORD_LIB_DIR/console-redact.sh" ] && . "$COORD_LIB_DIR/console-redact.sh" 2>/dev/null; then
  REDACT_OK=1
  for _fn in console_screen_filter console_screen_sha console_clean_prompt; do declare -F "$_fn" >/dev/null || REDACT_OK=0; done
fi

usage() { coord_log "사용법: console-poll.sh start|stop|status|--once [--dry-run]|run|handle-record team …|handle-clear team --repo <MAIN>"; exit 2; }

CD="$(console_dir)"
CYCLE="${COORD_CONSOLE_CYCLE_S:-30}"
case "$CYCLE" in ''|*[!0-9]*|0) CYCLE=30 ;; esac
TSS="${COORD_TERM_SEND_SAFE:-$COORD_SCRIPTS_DIR/term-send-safe.sh}"
OFFICE="$COORD_SCRIPTS_DIR/office.sh"
DFL_TIMEOUT="${COORD_CONSOLE_DFLOW_TIMEOUT_S:-10}"
ME_TIMEOUT=5
SEND_TIMEOUT=60
MAX_PER_CYCLE=20
OLD_PAUSE_S=600
ACK_RETRY=3                 # ack 네트워크 실패(rc 6) 때 다시 부르는 수(멈출 때는 0)
ACK_WINDOW_S=120            # 서버 ack 창(claimed_at + 120초, api-contract §2.12)
ACK_MAX_S=40                # ack 한 건 최대(DFL_TIMEOUT 10초 × 4번)
posint() { case "${1:-}" in ''|*[!0-9]*) echo "$2" ;; *) [ "$1" -gt 0 ] && echo "$1" || echo "$2" ;; esac; }
CYCLE_MAX="$(posint "${COORD_CONSOLE_CYCLE_MAX_S:-}" 25)"     # 한 주기 몫(프롬프트 전달 구간 제외)
PHASE_MAX="$(posint "${COORD_CONSOLE_PHASE_MAX_S:-}" 10)"     # 생존 감시·화면 읽기·화면 올리기 구간마다
LIST_MAX=5                                                     # 터미널 목록 구간
SCREEN_READ_MAX=5                                              # 화면 하나 읽기
LS_TIMEOUT="$(posint "${COORD_CONSOLE_LS_TIMEOUT_S:-}" 5)"     # lead-state 한 번
HELD_MAX_AGE_S="$(posint "${COORD_CONSOLE_HELD_MAX_S:-}" $((ACK_WINDOW_S - SEND_TIMEOUT - ACK_MAX_S)))"
STOP_WAIT_S="$(posint "${COORD_CONSOLE_STOP_WAIT_S:-}" 10)"
FLUSH_EXIT_MAX_S=4          # 멈출 때 retry ack 전체 상한(한 번에 3초)
DRY="${COORD_DRY:-0}"
LOG=""; LK=""; IDENT=""; HOST=""; SKIP=""; HELD=""; DFLOW=""; REPO=""
SKIP_IDS=" "; OLD_UNTIL=0; SLEEP_PID=""; CONSOLE_OFF=0; RETRIED_IDS=" "
CYC_T0=0; DELIV_S=0

TMPD="$(mktemp -d "${TMPDIR:-/tmp}/coord-console.XXXXXX" 2>/dev/null)" || exit 0
trap 'rm -rf "$TMPD"' EXIT

slug() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g'; }
plog() { [ -n "$LOG" ] && printf '%s %s\n' "$(coord_now_iso)" "$*" >> "$LOG" 2>/dev/null; return 0; }
drylog() { coord_log "DRY $*"; plog "DRY $*"; }

# ---- 제한 시간 실행(timeout 명령 없이, 후손까지 죽인다 — office.sh 와 같은 방식) ---------------------
descendants() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do descendants "$c"; echo "$c"; done; }
# 나무를 먼저 멈춰(STOP) 세는 사이에 새로 뜬 자손이 빠지지 않게 하고(세 번까지 다시 센다), TERM → CONT → 남으면 KILL
kill_tree() {
  local all="" p n=0 new
  while [ "$n" -lt 3 ]; do
    new=0
    for p in $(descendants "$1"; echo "$1"); do
      case " $all " in *" $p "*) ;; *) all="$all $p"; new=1; kill -STOP "$p" 2>/dev/null ;; esac
    done
    [ "$new" = 0 ] && break
    n=$((n + 1))
  done
  for p in $all; do kill -TERM "$p" 2>/dev/null; kill -CONT "$p" 2>/dev/null; done
  sleep 0.3
  for p in $all; do kill -0 "$p" 2>/dev/null && kill -KILL "$p" 2>/dev/null; done
  return 0
}
# 겹쳐 불러도 된다(구간 함수 안에서 다시 부름): 표식 파일을 호출마다 따로 만든다.
run_limited() {  # run_limited <초> <stdout 파일> <stderr 파일> <stdin 파일> <명령…> — 0 성공 · 124 시간 초과 · 그 밖 종료 코드
  local secs="$1" out="$2" err="$3" in="$4" pid wd rc mk; shift 4
  mk="$(mktemp -d "$TMPD/rl.XXXXXX" 2>/dev/null)" || return 125
  "$@" >"$out" 2>"$err" <"$in" &
  pid=$!; RL_PID="$pid"
  ( sleep "$secs"; [ -f "$mk/done" ] && exit 0; : > "$mk/timeout"; kill_tree "$pid" ) >/dev/null 2>&1 &
  wd=$!; RL_WD="$wd"
  wait "$pid" 2>/dev/null; rc=$?
  : > "$mk/done"
  pkill -P "$wd" 2>/dev/null; kill "$wd" 2>/dev/null; wait "$wd" 2>/dev/null
  RL_PID=""; RL_WD=""
  [ -f "$mk/timeout" ] && rc=124
  rm -rf "$mk"
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
  p="$(cat "$LK/pid" 2>/dev/null)"
  if [ -z "$p" ]; then   # 막 mkdir 한 직후(pid 를 쓰기 전)
    [ "$(( $(coord_now_epoch) - $(coord_file_mtime "$LK" || echo 0) ))" -lt 5 ] && { HELD="-"; return 0; }
    return 1
  fi
  kill -0 "$p" 2>/dev/null || return 1
  ps="$(cat "$LK/pstart" 2>/dev/null)"
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
lock_mine() { [ "$(cat "$LK/pid" 2>/dev/null)" = "$$" ]; }
lock_note_tmpd() { printf '%s\n' "$TMPD" > "$LK/tmpd" 2>/dev/null; }   # stop 의 KILL 분기가 대신 지운다

# ---- 할 일 판정 ------------------------------------------------------------------------------
# 이 신원·host 의 pid 가 있는(0·빈 값 아님) 세션 기록 — 살아 있으면 살펴볼 세션, 죽었으면 reap 이 내릴 일
_sess_with_pid() {
  local f p
  for f in "$ROOT"/_session/*.json; do
    [ -f "$f" ] || continue
    _cr_sess_mine "$f" || continue
    p="$(jq -r '.pid // 0 | tostring' "$f" 2>/dev/null)"
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
in_terms() { printf '%s\n' "$TL" | grep -qxF -- "$1"; }
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
handle_prompt() {  # handle_prompt <프롬프트 JSON 한 줄> <claim 시각(poll 직전 epoch)>
  local j="$1" ct="$2" id kind ref tok h rc crc hdr res trc what det
  id="$(printf '%s' "$j" | jq -r '.id // empty' 2>/dev/null)"
  kind="$(printf '%s' "$j" | jq -r '.target_kind // empty' 2>/dev/null)"
  ref="$(printf '%s' "$j" | jq -r '.target_ref // empty' 2>/dev/null)"
  tok="$(printf '%s' "$j" | jq -r '.claim_token // empty' 2>/dev/null)"
  printf '%s' "$id" | grep -Eq '^[0-9a-fA-F-]{8,64}$' || { plog "prompt 형식 오류(id) — 건너뜀"; return 0; }
  case "$ref" in *[!A-Za-z0-9._:-]*) ref="?" ;; esac
  what="$kind/$ref"
  case "$SKIP_IDS" in *" $id "*) plog "prompt id=$id $what inflight 남음 — 다시 보내지 않음"; return 0 ;; esac
  [ -n "$tok" ] || { plog "prompt id=$id claim_token 없음 — 건너뜀"; return 0; }
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
  local t; t="$(head -1 "$TMPD/held" 2>/dev/null | cut -f4)"
  [ -n "$t" ] && [ $(( $(coord_now_epoch) - t )) -ge "$HELD_MAX_AGE_S" ]
}
phase_prompts() {
  [ "$REDACT_OK" = 1 ] || { plog "프롬프트 건너뜀: 가림·정리 라이브러리 없음"; return 0; }
  [ -n "$TL" ] || { plog "프롬프트 건너뜀: 터미널 목록을 못 읽음"; return 0; }
  [ "$CONSOLE_OFF" = 0 ] || return 0      # 프로젝트 한정 PAT(forbidden_role) — 이 프로세스 동안 전달하지 않는다
  if [ "$DRY" = 1 ]; then drylog "dflow.sh console-poll --host $HOST --limit 1 (claim 하지 않음)"; return 0; fi
  : > "$TMPD/held"; RETRIED_IDS=" "
  poll_loop
  flush_held
}
poll_loop() {  # 한 건씩 claim → 전달 → ack 를 대기열이 빌 때까지(한 주기 최대 MAX_PER_CYCLE 건)
  local i=0 rc line ct
  while [ "$i" -lt "$MAX_PER_CYCLE" ]; do
    held_old && flush_held
    ct="$(coord_now_epoch)"   # claim 시각(보수적으로 poll 직전)
    dfl /dev/null console-poll --host "$HOST" --limit 1; rc=$?
    case "$rc" in
      0) ;;
      7) OLD_UNTIL=$(( $(coord_now_epoch) + OLD_PAUSE_S )); plog "옛 서버(console-poll rc=7) — ②③ 을 ${OLD_PAUSE_S}초 쉼"; return 0 ;;
      5) if [ "$(jq -r '.code // empty' "$TMPD/err" 2>/dev/null)" = forbidden_role ]; then
           # 프로젝트로 한정한 PAT: 콘솔 전달(poll·ack)만 끈다. 생존 감시·화면 올리기는 계속, 폴러를 다시 시작하면 다시 시도
           CONSOLE_OFF=1
           plog "프로젝트 한정 PAT 라 오피스 프롬프트 전달 불가. 한정 없는 PAT 필요"
           coord_log "console-poll: 프로젝트 한정 PAT 라 오피스 프롬프트 전달 불가. 한정 없는 PAT 필요"
         else plog "console-poll 실패 rc=5 — 이번 주기 건너뜀"; fi
         return 0 ;;
      *) plog "console-poll 실패 rc=$rc — 이번 주기 건너뜀"; return 0 ;;
    esac
    # 응답(프롬프트 본문·claim_token)은 메모리로 읽고 파일은 바로 지운다
    line="$(grep -m 1 . "$TMPD/out" 2>/dev/null)"
    rm -f "$TMPD/out" "$TMPD/err"
    [ -n "$line" ] || return 0     # 대기열이 비었다
    i=$((i + 1))
    handle_prompt "$line" "$ct"
    line=""
  done
  plog "한 주기 상한(${MAX_PER_CYCLE}건)에 닿음 — 나머지는 다음 주기"
}

# ---- ③ 화면 올리기 ----------------------------------------------------------------------------
# 화면 읽기 구간(run_phase 가 백그라운드로 돌린다 — 전역 값은 파일로만 넘긴다): items.jsonl·pending.tsv 를 만든다
screens_collect() {
  local kind ref h sha shaf at lines full=0 touch=0
  mkdir -p "$CD/screens" 2>/dev/null
  # 한 요청에 같은 대상(kind+ref)을 두 번 넣지 않는다(서버가 앞의 것을 duplicate_target 으로 거절). 둘 이상 나온 대상은
  # 해석이 애매한 것이므로 모두 뺀다.
  console_list_targets 2>/dev/null | awk -F'\t' '{ k = $1 "\t" $2; n[k]++; l[NR] = $0; key[NR] = k } END { for (i = 1; i <= NR; i++) if (n[key[i]] == 1) print l[i] }' > "$TMPD/targets"
  while IFS=$'\t' read -r kind ref h; do
    [ -n "$h" ] || continue
    in_terms "$h" || continue
    # 41줄: 가림 라이브러리가 맨 앞 한 줄을 줄 이음 판정에만 쓰고 마지막 40줄을 낸다
    run_limited "$SCREEN_READ_MAX" "$TMPD/scr" /dev/null /dev/null term_read_screen "$h" 41 || { rm -f "$TMPD/scr"; continue; }
    console_screen_filter < "$TMPD/scr" > "$TMPD/filt" 2>/dev/null || { plog "screen $kind/$ref 가림 실패 — 올리지 않음"; continue; }
    sha="$(console_screen_sha < "$TMPD/filt" 2>/dev/null)"
    printf '%s' "$sha" | grep -Eq '^[0-9a-f]{64}$' || { plog "screen $kind/$ref sha 실패 — 올리지 않음"; continue; }
    shaf="$CD/screens/${kind}_${ref}.sha"; at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"   # 화면을 읽은 시각(UTC)
    if [ -f "$shaf" ] && [ "$(cat "$shaf" 2>/dev/null)" = "$sha" ]; then
      jq -nc --arg k "$kind" --arg r "$ref" --arg s "$sha" --arg a "$at" '{target_kind:$k, target_ref:$r, sha:$s, captured_at:$a}' >> "$TMPD/items.jsonl"
      touch=$((touch + 1))
    else
      lines="$(jq -Rsc 'split("\n") | if length > 0 and .[-1] == "" then .[:-1] else . end' < "$TMPD/filt")"
      jq -nc --arg k "$kind" --arg r "$ref" --arg s "$sha" --arg a "$at" --argjson l "$lines" \
        '{target_kind:$k, target_ref:$r, sha:$s, captured_at:$a, lines:$l}' >> "$TMPD/items.jsonl"
      full=$((full + 1))
    fi
    printf '%s\t%s\t%s\n' "$kind" "$ref" "$sha" >> "$TMPD/pending.tsv"
  done < "$TMPD/targets"
  rm -f "$TMPD/scr" "$TMPD/filt"
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
  rm -f "$TMPD/targets" "$TMPD/counts" "$TMPD/old7"; : > "$TMPD/items.jsonl"; : > "$TMPD/pending.tsv"
  run_phase "화면 읽기" "$PHASE_MAX" /dev/null /dev/stderr screens_collect; rc=$?
  rm -f "$TMPD/scr" "$TMPD/filt"   # 상한으로 끊겼을 때 남은 화면 원문
  # 읽기를 다 못 끝냈으면(상한 초과) 반쪽 항목을 올리지 않는다
  if [ "$rc" = 0 ]; then run_phase "화면 올리기" "$PHASE_MAX" /dev/null /dev/stderr screens_upload; fi
  [ -f "$TMPD/old7" ] && OLD_UNTIL=$(( $(coord_now_epoch) + OLD_PAUSE_S ))
  rm -f "$TMPD/items.jsonl" "$TMPD/pending.tsv" "$TMPD/batches" "$TMPD/old7"
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
  [ "$OLD_UNTIL" -gt "$(coord_now_epoch)" ] && return 0
  phase_screens
  return 0
}

# 오래 사는 루프가 조정 세션의 값을 물려받아 다른 스크립트에 섞이지 않게 한다.
forget_session_env() { unset COORD_RUN COORD_SESSION_ID CLAUDE_CODE_SESSION_ID CLAUDE_PID ORCA_TERMINAL_HANDLE; }

cmd_run() {
  local i=0 ok=1
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
  [ -n "$RL_WD" ] && { pkill -P "$RL_WD" 2>/dev/null; kill "$RL_WD" 2>/dev/null; }
  [ -n "$RL_PID" ] && kill_tree "$RL_PID"
  RL_PID=""; RL_WD=""
  # 붙잡아 둔 retry(compacting) 를 짧게 돌려보낸다(한 번에 3초, 다시 부르지 않음, 모두 합쳐 FLUSH_EXIT_MAX_S)
  if [ "$DRY" != 1 ] && [ -s "$TMPD/held" ] && [ -n "$DFLOW" ]; then
    DFL_TIMEOUT=3; ACK_RETRY=0
    flush_held "$FLUSH_EXIT_MAX_S"
  fi
  if lock_mine; then rm -rf "$LK"; plog "폴러 끝 pid=$$"; fi
  rm -rf "$TMPD"
}

cmd_once() {
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

cmd_start() {
  local cpid
  [ "$DRY" = 1 ] && { echo "CONSOLE_POLLER skipped dry"; exit 0; }
  setup || { echo "CONSOLE_POLLER skipped $SKIP"; exit 0; }
  need_ident || { echo "CONSOLE_POLLER skipped $SKIP"; exit 0; }
  lock_live && { echo "CONSOLE_POLLER running pid=$HELD"; exit 0; }
  has_work || { echo "CONSOLE_POLLER skipped idle"; exit 0; }
  lock_take || { echo "CONSOLE_POLLER running pid=$HELD"; exit 0; }
  # 부른 쪽의 stdout·stderr 를 붙잡지 않게 모두 닫고, 가능하면 새 세션으로 떼어 낸다(부른 셸의 프로세스 그룹 정리에 같이 죽지 않게).
  if command -v perl >/dev/null 2>&1; then
    CONSOLE_POLL_LOCKED=1 CONSOLE_POLL_IDENT="$IDENT" perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or exit 127' \
      bash "$SELF" run </dev/null >/dev/null 2>&1 &
  else
    CONSOLE_POLL_LOCKED=1 CONSOLE_POLL_IDENT="$IDENT" nohup bash "$SELF" run </dev/null >/dev/null 2>&1 &
  fi
  cpid=$!
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
    kill_tree "$HELD"       # 주인이 죽기 전에 자손을 모아 함께 죽인다(주인이 죽으면 자손을 pgrep -P 로 못 찾는다)
    case "$t" in
      /*/coord-console.*) case "$t" in *..*) ;; *) case "${t##*/}" in coord-console.*) [ -d "$t" ] && rm -rf "$t" ;; esac ;; esac ;;
    esac
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
  -h|--help|help) sed -n '2,/^set -uo/p' "$0" | sed '$d' >&2; exit 0 ;;
  *) usage ;;
esac
exit 0
