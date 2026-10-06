#!/usr/bin/env bash
# 사용법: office.sh lead-up | lead-sync | lane-up <레인> | lane-state <레인> <상태|auto> | lane-down <레인> | beat | finish | reap [--state-dir <경로>]
#   조정 세션(팀장)과 레인(팀원)을 wbs-web 에이전트 오피스에 「표시 전용」으로 보인다(정본: ../references/contract.md §4).
#   표시 경로는 `dflow.sh watch`(POST /api/v1/agent/watch) 하나뿐이다. WBS 데이터(작업·lease·진도율)는 건드리지 않는다.
#   lead-up              팀장 등록: agent `<신원>/<host>/coord:<세션8>`(조정 세션당 하나). slots·busy 는 이 세션의 열린 회차 전부에서
#                        합산한 살아 있는(closed 아닌) 레인 수·작업 중(머지 중 포함) 레인 수
#   lane-up <레인>       팀원 등록(같은 키여도 늘 보낸다): agent `<신원>/<host>/임시:<레인>·<지시 요약>`, until=상태 라벨. 이어 팀장 갱신
#   lane-state <레인> <상태>  상태 라벨(작업 중|대기|머지 중|답 대기|끝|auto) 갱신. auto = state.json + 입력 요청 기록에서 판정.
#                        키·라벨·요약 해시가 모두 같으면 보내지 않는다
#   lead-sync            이 세션의 팀장 watch 를 다시 보낸다(FORCE). 폴러가 입력 요청 기록을 바꾼 직후 부른다
#   요약 칸(contract §4 「레인 요약·팀장 자리 요약·입력 요청」): 레인 watch 는 늘 --summary-json·--input-request-json, 팀장 watch 는 늘
#                        --until(조정 중|답 대기)·--lead-summary-json 을 싣는다(빼면 서버가 null 로 덮어쓴다). 모두 state.json·기록 파일만으로 만든다
#   lane-down <레인>     기록된 키로 `watch --stop` 하고 기록을 지운다. 이어 팀장 갱신
#   beat                 하트비트: 팀장과 살아 있는 레인 전원을 state.json 기준으로 다시 보낸다(키가 바뀌었으면 옛 키 stop 뒤 새 키).
#                        끝난(closed) 레인·state 에서 사라진 레인은 stop. tick.sh 끝에서 부른다
#   finish               이 회차의 팀원 키를 모두 stop 한다(회차 마감). 같은 세션에 다른 열린 회차가 남으면 팀장은 합산만 다시 보내고,
#                        마지막 열린 회차일 때만 팀장 키를 stop 하고 세션 기록을 지운다. 이후 이 회차의 다른 호출은 무시한다(.office.finished)
#   reap [--state-dir <경로>]  생존 감시(PC 폴러가 30초마다): 세션 기록의 pid 가 죽었으면 그 세션의 팀장·팀원 키를 stop 하고 기록을 지우며
#                        키 기록(.office.sent)을 비운다(finished 표식은 남기지 않는다 — 잘못 판정된 살아 있는 세션이 다음 beat 에서 다시 올라오게). 살아 있는 세션의 열린 회차에서는 session.pid 가 죽은 레인의 팀원 키만 stop.
#                        현재 회차가 없어도 돈다. 상태 뿌리 = --state-dir → COORD_STATE_ROOT → 설정 state_dir
#   키 기록: 팀원은 state.json `.office.sent["<레인>"]`·`.office.label["<레인>"]`, 팀장은 `<state_dir>/_session/<세션8>.json`
#            (`{key,session_id,host,user,pid,handle,sent_at,slots,busy}`, mkdir 잠금). 옛 `.office.sent["_lead"]` 는 옛 키 정리에 읽기만 한다.
#   설정: office.enabled · office.project_id · office.label_max · office.dflow_script · office.quiet_min (contract §1.2)
#   입력 요청 기록(읽기만): ${DFLOW_CONSOLE_DIR:-~/.dflow/console}/input/coord_lane_<레인>.json · coord_lead_<세션8>.json (쓰기는 폴러 몫)
#   실패 정책: 어떤 실패도 종료 코드 0(사용법 오류만 2). 경고는 stderr 한 줄, 호출당 5초 제한.
#   dflow 설정(PAT)이 로드되지 않거나 dflow.sh 가 없거나 enabled=false 이면 아무 출력 없이 건너뛴다. COORD_DRY=1 이면 보내지 않는다.
OFFICE_RC=0
trap 'exit "${OFFICE_RC:-0}"' EXIT
set -uo pipefail
_SD="${0%/*}"; [ "$_SD" != "$0" ] || _SD=.   # dirname 대신(프로세스 0개)
. "$_SD/lib/common.sh"
coord_default_repo

OFFICE_TIMEOUT_S=5
usage() { coord_log "사용법: office.sh lead-up | lead-sync | lane-up <레인> | lane-state <레인> <상태|auto> | lane-down <레인> | beat | finish | reap [--state-dir <경로>]"; OFFICE_RC=2; exit 2; }
warn() { coord_log "office: $*"; }

[ $# -ge 1 ] || usage
sub="$1"; shift
case "$sub" in
  lead-up|lead-sync|beat|finish) [ $# -eq 0 ] || usage ;;
  lane-up|lane-down) [ $# -eq 1 ] || usage ;;
  lane-state) [ $# -eq 2 ] || usage ;;
  reap)
    case "$#" in
      0) ;;
      2) [ "$1" = --state-dir ] && [ -n "$2" ] || usage; COORD_STATE_ROOT="$2"; export COORD_STATE_ROOT ;;
      *) usage ;;
    esac ;;
  -h|--help|help) sed -n '2,26p' "$0" >&2; exit 0 ;;
  *) usage ;;
esac

# ---- 건너뛸 조건(모두 무출력) ------------------------------------------------
[ "$(coord_cfg_json '.office.enabled' 2>/dev/null)" = true ] || exit 0
[ "${COORD_DRY:-0}" = 1 ] && { coord_log "DRY office.sh $sub $*"; exit 0; }
# 하위 coord-state.sh 호출이 같은 상태 뿌리를 쓰게 한다(reap --state-dir 이 설정과 다를 수 있다).
ROOT="$(coord_state_root)"; COORD_STATE_ROOT="$ROOT"; export COORD_STATE_ROOT
SESSD="$ROOT/_session"
SF=""; RID=""; FINISHED=0
if [ "$sub" != reap ]; then   # reap 은 현재 회차 없이 돈다
  coord_has_run || exit 0
  SF="$(coord_state_file)"; RID="${SF%/*}"; RID="${RID##*/}"
  # 마감(finish)한 회차는 이후 report·hold 훅이 오피스에 다시 등록하지 않게 한다.
  # finish·beat 만 통과한다 — beat 는 마감 뒤에도 .office.sent 에 남은 키(finish 때 stop 이 실패한 것)만 마저 내린다.
  [ "$(jq -r '.office.finished // false' "$SF" 2>/dev/null)" = true ] && FINISHED=1
  [ "$FINISHED" = 0 ] || case "$sub" in finish|beat) ;; *) exit 0 ;; esac
fi
REPO="$(coord_repo 2>/dev/null)" || exit 0

DFLOW="$(coord_cfg .office.dflow_script)"
if [ -n "$DFLOW" ]; then
  DFLOW="$(coord_expand "$DFLOW")"
  case "$DFLOW" in /*) ;; *) DFLOW="$REPO/$DFLOW" ;; esac
else
  DFLOW="$COORD_SCRIPTS_DIR/../../dflow-work/scripts/dflow.sh"
fi
[ -f "$DFLOW" ] || exit 0
PROJECT="$(coord_cfg .office.project_id)"
LABEL_MAX="$(coord_cfg .office.label_max)"
case "$LABEL_MAX" in ''|*[!0-9]*) LABEL_MAX=40 ;; esac
QUIET_MIN="$(coord_cfg .office.quiet_min)"
case "$QUIET_MIN" in ''|*[!0-9]*) QUIET_MIN=30 ;; esac
# 요약 바이트 상한(서버 계약: 레인 2048·팀장 8192·입력 요청 3072). 환경 변수는 시험용으로 낮추기만 한다.
SUM_MAX=2048; LEAD_MAX=8192; INREQ_MAX=3072
case "${COORD_OFFICE_SUM_MAX:-}" in ''|*[!0-9]*) ;; *) [ "$COORD_OFFICE_SUM_MAX" -lt "$SUM_MAX" ] && SUM_MAX="$COORD_OFFICE_SUM_MAX" ;; esac
case "${COORD_OFFICE_LEAD_MAX:-}" in ''|*[!0-9]*) ;; *) [ "$COORD_OFFICE_LEAD_MAX" -lt "$LEAD_MAX" ] && LEAD_MAX="$COORD_OFFICE_LEAD_MAX" ;; esac
# 입력 요청 기록 폴더(폴러가 쓴다, 여기서는 읽기만). console-resolve.sh 의 console_dir 과 같은 규칙.
INDIR="$(coord_expand "${DFLOW_CONSOLE_DIR:-$HOME/.dflow/console}")/input"
# 자유 글 가림(contract §4 「레인 요약·팀장 자리 요약」): brief·hold 사유·pending_user 첫 줄·goal·지시 요약(키)은
# console_redact_text(lib/console-redact.sh)로 가리고, `/`·`~/` 로 시작하는 절대 경로 토큰은 `[경로]` 로 바꾼 뒤 싣는다.
# 함수가 없거나 실패하면 그 칸을 비워 보낸다(실패 시 닫힘).
REDACT_OK=0
if [ -f "$COORD_LIB_DIR/console-redact.sh" ] && . "$COORD_LIB_DIR/console-redact.sh" 2>/dev/null && declare -F console_redact_text >/dev/null; then REDACT_OK=1; fi
PATH_SED='s#(^|[[:space:]"'"'"'(=,])~?/[^[:space:]"'"'"')]+#\1[경로]#g'
red() {  # red <글> — 가린 글(stdout). 실패하면 rc 1·빈 출력
  local t
  [ -n "$1" ] || return 0
  [ "$REDACT_OK" = 1 ] || return 1
  t="$(printf '%s\n' "$1" | console_redact_text 2>/dev/null)" || return 1
  printf '%s\n' "$t" | sed -E "$PATH_SED" 2>/dev/null || return 1
}
# 설정은 스킬 폴더(심링크)가 아니라 리포 루트에서 읽는다(스킬 폴더에서 읽으면 다른 리포 PAT 로 404). 이미 지정돼 있으면 그대로.
DCD="${DFLOW_CONFIG_DIR:-$REPO}"

TMPD="$(mktemp -d "${TMPDIR:-/tmp}/coord-office.XXXXXX" 2>/dev/null)" || exit 0
# 시간 제한으로 끊겨도(폴러 run_limited 의 TERM) 쥔 세션 기록 잠금을 풀고, 돌던 dflow.sh 와 그 감시자를 거둔다.
# (state.json 잠금은 coord-state.sh 자식이 쥐고 자기 EXIT trap 으로 푼다 — KILL 로 끊겨 남은 것은 coord_lock 의 탈취가 치운다)
HELD_LOCK=""; DFL_PID=""; DFL_WD=""
on_exit() {  # 폴러의 kill_tree 는 TERM 0.3초 뒤 KILL 하므로 잠금·임시 폴더부터 치우고, 자식에는 TERM 만 보낸다(기다리지 않음)
  local p
  trap '' TERM INT HUP
  [ -n "$HELD_LOCK" ] && coord_unlock "$HELD_LOCK"
  rm -rf "$TMPD"
  [ -n "$DFL_WD" ] && { kill "$DFL_WD" 2>/dev/null; }   # 감시자의 TERM trap 이 자기 sleep 을 죽인다
  if [ -n "$DFL_PID" ]; then for p in $(descendants "$DFL_PID") "$DFL_PID"; do kill -TERM "$p" 2>/dev/null; done; fi
  exit "${OFFICE_RC:-0}"
}
trap on_exit EXIT
trap 'exit' TERM INT HUP

# ---- dflow.sh 호출(5초 제한, timeout 명령 없이) ----------------------------------
# 반환: 0 성공 · 124 시간 초과 · 그 밖 dflow.sh 종료 코드. 출력은 $TMPD/out 에 둔다(파이프를 쓰면 남은 자식이 붙잡는다).
ABORT=0   # 1 이면 이번 호출의 남은 전송을 건너뛴다(시간 초과·설정 없음·네트워크 오류·인증 거절)
# pid 와 모든 후손(재귀). `x=$(sleep 47)` 처럼 서브셸 아래 손자도 포함한다.
descendants() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do descendants "$c"; echo "$c"; done; }
kill_tree() {  # kill_tree <pid> — 후손부터 TERM, 잠깐 뒤 남은 것은 KILL
  local all p; all="$(descendants "$1"; echo "$1")"
  for p in $all; do kill -TERM "$p" 2>/dev/null; done
  sleep 0.3
  for p in $all; do kill -0 "$p" 2>/dev/null && kill -KILL "$p" 2>/dev/null; done
  return 0
}
dfl() {
  local pid wd rc
  : > "$TMPD/out"; : > "$TMPD/err"; [ ! -f "$TMPD/timeout" ] || rm -f "$TMPD/timeout"
  ( cd "$REPO" 2>/dev/null && DFLOW_CONFIG_DIR="$DCD" exec bash "$DFLOW" "$@" ) >"$TMPD/out" 2>"$TMPD/err" </dev/null &
  pid=$!; DFL_PID="$pid"
  # 감시자는 sleep 의 pid 를 직접 쥐고(TERM trap 으로 그 sleep 만 죽인다) 끝난다 — pkill -P 가 필요 없다. 시간 초과면 표식 파일을 남기고 나무를 거둔다.
  ( trap 'kill "$sp" 2>/dev/null; exit 0' TERM
    sleep "$OFFICE_TIMEOUT_S" & sp=$!
    wait "$sp" 2>/dev/null || exit 0       # sleep 이 중간에 죽었으면(명령이 먼저 끝나 정리됨) 시간 초과가 아니다
    kill -0 "$pid" 2>/dev/null || exit 0   # 막 끝난 명령(또는 pid 재사용)은 건드리지 않는다
    trap '' TERM                           # 정리(TERM → 0.3초 → KILL)를 끝까지 한다
    : > "$TMPD/timeout"; kill_tree "$pid" ) >/dev/null 2>&1 &
  wd=$!; DFL_WD="$wd"
  wait "$pid" 2>/dev/null; rc=$?
  kill "$wd" 2>/dev/null; wait "$wd" 2>/dev/null
  DFL_PID=""; DFL_WD=""
  [ -f "$TMPD/timeout" ] && rc=124
  return "$rc"
}
# dflow.sh 종료 코드 2 는 두 가지다: 설정 없음(PAT 미설정·.dflow 없음, stderr 가 글)과 API 4xx 거절(stderr 가 JSON 본문).
dfl_rejected() { [ "$(head -c 1 "$TMPD/err" 2>/dev/null)" = "{" ]; }
# 전송 한 건. 성공 0. 실패하면 1 — 설정 없음(무출력)·시간 초과·네트워크·인증(3·5·7) 오류는 ABORT 로 남은 전송까지 건너뛰고,
# API 4xx 거절(rc 2 + JSON)·그 밖은 이 건만 실패로 둔다. ABORT 이면 호출하지 않는다(호출당 5초 계약).
watch_call() {  # watch_call <설명> <dflow watch 인자…>
  local what="$1" rc; shift
  [ "$ABORT" = 0 ] || return 1
  dfl watch "$@"; rc=$?
  # 서버가 요약 칸 일부를 null 로 저장했다(형식 오류). 경고 한 줄만 남기고 종료 코드·ABORT 판정은 그대로다.
  if grep -q '^SUMMARY_ERROR' "$TMPD/err" 2>/dev/null; then
    warn "요약 칸 오류(서버가 그 칸만 null): $what — $(grep -m1 '^SUMMARY_ERROR' "$TMPD/err" | cut -c15-300)"
  fi
  case "$rc" in
    0) return 0 ;;
    2) if dfl_rejected; then warn "서버가 거절함(4xx): $what"; else ABORT=1; fi ;;   # 설정 없음은 조용히
    124) ABORT=1; warn "시간 초과(${OFFICE_TIMEOUT_S}초): $what" ;;
    6) ABORT=1; warn "네트워크 오류: $what" ;;
    3|5|7) ABORT=1; warn "인증·권한·경로 오류 rc=$rc: $what" ;;
    *) warn "watch 실패 rc=$rc: $what" ;;
  esac
  return 1
}

# ---- state.json 읽기·기록 -------------------------------------------------------
LABEL_JQ='def lbl($k): .lanes[$k] as $l
  | if ($l.state // "active") == "closed" then "끝"
    elif (.merge.in_flight.lane // "") == $k then "머지 중"
    elif $l.hold != null or ($l.state // "") == "closing" then "대기"
    else "작업 중" end;
  # 답 대기: 입력 요청 기록이 살아 있는 레인($inp = "<회차>/<레인>" 배열 — 기록의 run·handle 이 그 회차·레인 세션과 같은 것만).
  # 우선순위 끝 > 답 대기 > 머지 중 > 대기 > 작업 중
  def lbl2($rid; $k; $inp): lbl($k) as $b | if $b != "끝" and any($inp[]; . == ($rid + "/" + $k)) then "답 대기" else $b end;'
st() { jq -r "$@" "$SF"; }
lane_exists() { [ "$(st --arg l "$1" '.lanes | has($l)')" = true ]; }
auto_label() { st --arg l "$1" --arg rid "$RID" --argjson inp "$(active_inputs)" "$LABEL_JQ"' lbl2($rid; $l; $inp)'; }

# ---- 요약 칸(contract §4 「레인 요약·팀장 자리 요약·입력 요청」) ---------------------------------------
# 문자열: 제어 문자(U+0000~001F·007F~009F)를 지우되 줄바꿈·탭은 공백(발췌 줄은 모두 지움) → 코드포인트로 자른다(서버와 같은 정리).
# 시각: 시간대(Z·±HH:MM) 있는 ISO 만, 그 밖은 null. 숫자: 정수로 내리고 범위로 자른다. 비밀·경로·핸들·pid 는 싣지 않는다.
SUM_JQ='
def ctl_sp: explode | map(if . == 9 or . == 10 or . == 13 then 32 elif . < 32 or (. >= 127 and . <= 159) then empty else . end) | implode;
def ctl_del: explode | map(select(. >= 32 and (. < 127 or . > 159))) | implode;
def str($n): if . == null then null else (tostring | ctl_sp | .[0:$n]) end;
def isotz: if type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\\.[0-9]+)?)?(Z|[+-][0-9]{2}:[0-9]{2})$") then . else null end;
def epoch: if (isotz) == null then null else
  (capture("^(?<b>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2})(?<s>:[0-9]{2})?(\\.[0-9]+)?(?<z>Z|[+-][0-9]{2}:[0-9]{2})$") // null) as $m
  | if $m == null then null else
      (($m.b + ($m.s // ":00") + "Z") | fromdateiso8601)
      - (if $m.z == "Z" then 0 else (($m.z[1:3] | tonumber) * 3600 + ($m.z[4:6] | tonumber) * 60) * (if $m.z[0:1] == "-" then -1 else 1 end) end)
    end end;
def rng($lo; $hi): if type == "number" then (floor | if . < $lo then $lo elif . > $hi then $hi else . end) else null end;
def bytes: tojson | utf8bytelength;
def arr: if type == "array" then . else [] end;
# $rb·$rh = 가린 brief·hold 사유(red — 실패하면 빈 글). hold 가 있으면 사유를 못 가려도 null 이 아닌 "" 로 둔다(라벨·대기 판단 유지).
def lane_sum($k; $max; $rb; $rh): (.lanes[$k] // {}) as $l | {
    v: 1, lane: ($k | str(60)), state: (($l.state // "active") | str(20)),
    brief: ($rb | str(200)),
    items_done: ([$l.items | arr | .[] | select(type == "object" and .done == true)] | length | rng(0; 9999)),
    items_total: ($l.items | arr | length | rng(0; 9999)),
    hold: (if $l.hold == null then null else ($rh | str(100)) end),
    branch: (($l.branch // "") | str(120)),
    last_report_at: ($l.last_report_at | isotz), last_instr_at: ($l.last_instr_at | isotz),
    ctx_pct: ($l.ctx | if type == "object" then .pct elif type == "number" then . else null end | rng(0; 100)),
    compact_pending: ((($l.compact // {}) | if type == "object" then .pending else false end) == true) }
  # 바이트 상한을 넘으면 brief → hold → branch 순으로 한 글자씩 줄인다
  | until(bytes <= $max or ((.brief | length) == 0 and ((.hold // "") | length) == 0 and (.branch | length) == 0);
      if (.brief | length) > 0 then .brief |= .[0:length - 1]
      elif ((.hold // "") | length) > 0 then .hold |= .[0:length - 1]
      else .branch |= .[0:length - 1] end);
# 입력 요청 기록 하나 → {v,kind,since,excerpt,handled} 또는 null(형식이 틀리면 없는 것). 발췌는 아래쪽 10줄·줄당 200자, 상한을 넘으면 위 줄부터 버린다.
def inreq($max): if type != "object" then null else . as $o
  | ($o.handled | if . == null then null
      elif type == "object" and (.by == "coordinator" or .by == "auto") and ((.at | isotz) != null) then {by: .by, at: .at}
      else "bad" end) as $h
  | if ($o.kind | type) != "string" or ((["permission","question","choice","usage-limit","trust","message"] | index($o.kind)) == null)
       or (($o.since | isotz) == null) or $h == "bad" then null
    else {v: 1, kind: $o.kind, since: $o.since,
          excerpt: ([$o.excerpt | arr | .[] | tostring | ctl_del | .[0:200]] | .[-10:]), handled: $h}
      | until(bytes <= $max or (.excerpt | length) == 0; .excerpt |= .[1:])
    end end;
def inreq_active: . != null and .handled == null and .kind != "usage-limit" and .kind != "trust";
# 회차 하나(state.json) → {created, s:{run,decision,merge,progress,lanes,resource,alive}}. 레인 라벨은 lbl2(입력 요청 포함).
# $red = {"<run-id>": {ft: 가린 pending_user 첫 건 글, goal: 가린 run.goal}} (red 실패면 빈 글)
def run_sum($inp; $now; $qmin; $xr; $xl; $red): . as $r | (input_filename | split("/") | .[-2]) as $id
  | ($red[$id] // {ft: "", goal: ""}) as $rd
  # 내리는 중인 레인(lane-down 의 제외 레인)은 끝으로 센다(뒤이어 closed 로 바뀌어도 요약이 같게).
  | [(.lanes // {}) | keys[] | . as $k
     | {k: $k, lb: (if $id == $xr and $k == $xl then "끝" else ($r | lbl2($id; $k; $inp)) end), l: ($r.lanes[$k] // {})}] as $L
  | (.pending_user | arr) as $pu
  | [$L[] | .l.items | arr | .[] | select(type == "object")] as $it
  | {created: ((.run.created_at | epoch) // 0),
     s: {run: ($id | str(60)),
         decision: {pending_user: ($pu | length), open: ($pu | length),
                    first_title: (if ($pu | length) == 0 then null
                                  else ($rd.ft // "" | tostring | split("\n")[0] // "" | str(100)) end)},
         merge: {in_flight: ((.merge.in_flight // {}) | if type == "object" then (.lane // null) else null end | if . == null or . == "" then null else str(60) end),
                 queue: ([(.merge.queue | arr | .[]) | (if type == "object" then (.lane // null) else . end) | select(. != null and . != "") | str(60)] | .[0:10])},
         progress: {goal: (($rd.goal // "") | tostring | split("\n")[0] // "" | if . == "" then null else str(120) end),
                    started_at: (.run.created_at | isotz),
                    items_done: ([$it[] | select(.done == true)] | length), items_total: ($it | length)},
         lanes: {working: ([$L[] | select(.lb == "작업 중" or .lb == "머지 중")] | length),
                 waiting: ([$L[] | select(.lb == "대기" or .lb == "답 대기")] | length),
                 done: ([$L[] | select(.lb == "끝")] | length),
                 quiet: ([$L[] | select(.lb != "끝") | ((.l.last_report_at // .l.last_instr_at) | epoch) as $t
                          | select($t != null and ($now - $t) > ($qmin * 60)) | .k | str(60)] | .[0:10])},
         resource: {band: (.usage.band // null | if . == null or . == "" or . == "UNKNOWN" then null else str(20) end),
                    five: (.usage.five | rng(0; 100)), week: (.usage.week | rng(0; 100)),
                    load_adjust: ((.load.hard_ticks // 0) | if type == "number" then floor else 0 end),
                    banned: (((.load.banned // []) | if type == "array" or type == "object" then length else 0 end) > 0)},
         alive: {last_tick_at: (.run.last_tick_at | isotz)}}};'
sha256() {  # openssl 우선(shasum 은 perl 이라 호출당 5배쯤 든다) → shasum → sha256sum. 소문자 hex 64자 한 줄
  local h
  if command -v openssl >/dev/null 2>&1; then h="$(openssl dgst -sha256 -r 2>/dev/null)"; printf '%s\n' "${h%% *}"
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 | cut -d' ' -f1
  else sha256sum | cut -d' ' -f1; fi
}
# 레인 입력 요청 기록이 그 회차·그 레인 세션의 것인지: 기록의 run 이 <run-id> 이고 handle 이 그 회차 state 의
# lanes.<레인>.session.handle 과 같으면(둘 다 비지 않음) 0. 같은 PC 의 다른 조정 세션이 같은 레인 이름을 써도 섞이지 않게 한다.
# 인자: <기록 파일> <run-id> <레인>. run·handle 이 없는 옛 기록은 쓰지 않는다(폴러가 다음 주기에 다시 쓴다).
rec_mine() {
  local sf="$ROOT/$2/state.json"
  [ -n "$2" ] && [ -f "$sf" ] || return 1
  [ "$(jq -r --slurpfile s "$sf" --arg r "$2" --arg l "$3" '
      ((.run // "") | tostring) == $r and ((.handle // "") | tostring) != ""
      and ((.handle // "") | tostring) == (($s[0].lanes[$l].session.handle // "") | tostring)' "$1" 2>/dev/null)" = true ]
}
# 입력 요청 기록 파일 하나 → 정리한 JSON 한 줄 또는 null(없음·깨짐·형식 오류·다른 회차/세션의 레인 기록). 인자: <kind>_<ref> 파일 이름 앞부분.
# 서버로 가는 칸은 inreq() 가 {v,kind,since,excerpt,handled} 로만 추린다(킷 내부 칸 full·run·handle 은 싣지 않는다).
# 팀장 기록(coord_lead_<세션8>)은 세션별 이름이라 회차·핸들을 보지 않는다.
inreq_json() {
  local f="$INDIR/$1.json" out
  [ -f "$f" ] || { echo null; return 0; }
  case "$1" in coord_lane_*) rec_mine "$f" "$RID" "${1#coord_lane_}" || { echo null; return 0; } ;; esac
  out="$(jq -sc --argjson max "$INREQ_MAX" "$LABEL_JQ$SUM_JQ"' if length == 1 then (.[0] | inreq($max)) else null end' "$f" 2>/dev/null)"
  [ -n "$out" ] && echo "$out" || echo null
}
# 입력 요청이 살아 있는(handled null·usage-limit·trust 아님) 레인 `<회차>/<레인>` 배열(JSON) — 기록의 run 회차에서 rec_mine 인 것만.
# 한 호출에서 한 번만 읽는다.
ACTIVE_IN=""
active_inputs() {
  if [ -z "$ACTIVE_IN" ]; then
    local f n r names=()
    for f in "$INDIR"/coord_lane_*.json; do
      [ -f "$f" ] || continue
      n="${f##*/coord_lane_}"; n="${n%.json}"
      r="$(jq -r '.run // empty | tostring' "$f" 2>/dev/null)"
      case "$r" in ''|.*|*/*) continue ;; esac
      rec_mine "$f" "$r" "$n" || continue
      [ "$(jq -sc --argjson max "$INREQ_MAX" "$LABEL_JQ$SUM_JQ"' if length == 1 then (.[0] | inreq($max) | inreq_active) else false end' "$f" 2>/dev/null)" = true ] \
        && names+=("$r/$n")
    done
    ACTIVE_IN="$(jq -nc '$ARGS.positional' --args -- ${names[@]+"${names[@]}"})"
  fi
  printf '%s' "$ACTIVE_IN"
}
lane_summary() {  # 레인 summary 한 줄(자유 글은 red 로 가린다)
  local rb rh
  rb="$(red "$(st --arg l "$1" '.lanes[$l].brief // "" | tostring')")" || rb=""
  rh="$(red "$(st --arg l "$1" '.lanes[$l].hold | if . == null then "" elif type == "object" then (.reason // "" | tostring) else tostring end')")" || rh=""
  st -c --arg l "$1" --argjson max "$SUM_MAX" --arg rb "$rb" --arg rh "$rh" "$LABEL_JQ$SUM_JQ"' lane_sum($l; $max; $rb; $rh)'
}
# 값 기록은 늘 coord-state.sh 로(state.json 은 그 스크립트만 쓴다).
rec() { bash "$COORD_SCRIPTS_DIR/coord-state.sh" set "$1" "$2" >/dev/null 2>&1 || warn "state 기록 실패: $1"; }
rec_many() { bash "$COORD_SCRIPTS_DIR/coord-state.sh" set-many "$@" >/dev/null 2>&1 || warn "state 기록 실패: $1"; }   # 여러 칸을 한 번의 잠금·쓰기로
sent_key() { st --arg l "$1" '.office.sent[$l] // empty'; }
sent_label() { st --arg l "$1" '.office.label[$l] // empty'; }
sent_sumhash() { st --arg l "$1" '.office.sumhash[$l] // empty'; }

slug() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g'; }
# <신원>/<host> — dflow.sh watcher_id_default(`<신원>/<host>/poll`)에서 마지막 토막을 뗀 값과 같다.
# 신원은 /me 의 user_email 로컬 파트(state 에 캐시), host 는 hostname 첫 토막.
IDENT=""
need_ident() {  # 서브셸 없이 부른다(IDENT·ABORT 를 호출자에 남긴다). 실패하면 rc 1
  [ -n "$IDENT" ] && return 0
  [ "$ABORT" = 0 ] || return 1
  local user host email rc
  user="$(st '.office.user // empty')"
  if [ -z "$user" ]; then
    dfl me; rc=$?
    if [ "$rc" != 0 ]; then
      case "$rc" in
        2) if dfl_rejected; then warn "신원 조회 거절(4xx)"; else ABORT=1; fi ;;   # 설정 없음은 조용히
        124|6|3|5|7) ABORT=1; warn "신원 조회 실패 rc=$rc" ;;
        *) warn "신원 조회 실패 rc=$rc" ;;
      esac
      return 1
    fi
    email="$(jq -r '.user_email // empty' "$TMPD/out" 2>/dev/null)"
    [ -n "$email" ] || { warn "신원 조회 응답에 user_email 없음"; return 1; }
    user="$(slug "${email%%@*}")"
    rec '.office.user' "$(jq -nc --arg u "$user" '$u')"
  fi
  host="$(slug "$(hostname 2>/dev/null | cut -d. -f1)")"
  IDENT="$user/$host"
}

# 키 길이는 서버가 JS .length(UTF-16 코드 유닛)로 잰다(상한 120). 코드포인트가 아니라 UTF-16 단위로 세고 자른다(이모지는 2).
KEY_MAX=120
LANE_NAME_MAX=40
U16_JQ='def u16: explode | map(if . > 65535 then 2 else 1 end) | add // 0;
  def trunc16($n): explode | reduce .[] as $c ({u: 0, o: [], stop: false};
    if .stop then . elif (.u + (if $c > 65535 then 2 else 1 end)) <= $n then .u += (if $c > 65535 then 2 else 1 end) | .o += [$c] else .stop = true end)
    | .o | implode;'
# 팀장 agent 키: <신원>/<host>/coord:<세션8>(조정 세션당 하나, contract §4). 전체 120(UTF-16) 이내.
lead_key() {  # lead_key <ident> <세션8>
  jq -rn --arg id "$1" --arg s8 "$2" --argjson max "$KEY_MAX" "$U16_JQ"'
    ($id + "/coord" + (if $s8 == "" then "" else ":" + $s8 end)) | trunc16($max)'
}
# 팀원 agent 키: <신원>/<host>/임시:<레인>·<지시 요약>. 요약은 label_max 자 이내, 키 전체와 머리 부분은 120 이내.
lane_key() {  # lane_key <ident> <레인> — 지시 요약도 자유 글이라 red 로 가린 뒤 쓴다(실패하면 요약 없이 머리만)
  local raw
  raw="$(st --arg lane "$2" '(.lanes[$lane] // {}) as $l
    | ([$l.brief, $l.goal, $l.title, (($l.memo // "") | tostring | split("\n")[0])]
       | map(select(. != null and . != "") | tostring) | .[0] // "")')"
  raw="$(red "$raw")" || raw=""
  jq -rn --arg id "$1" --arg lane "$2" --argjson max "$LABEL_MAX" --argjson kmax "$KEY_MAX" --argjson lmax "$LANE_NAME_MAX" \
    --arg raw "$raw" "$U16_JQ"'
    ($raw | gsub("[\r\n\t]+"; " ") | gsub("/"; "") | gsub("^ +| +$"; "") | gsub(" +"; " ")) as $sum
    | (($id + "/임시:" + ($lane | trunc16($lmax))) | trunc16($kmax)) as $head
    | (([$max, ($kmax - ($head | u16) - 1)] | min) as $room
       | if $sum == "" or $room <= 0 then $head
         else ($sum | trunc16($room) | gsub(" +$"; "")) as $cut | if $cut == "" then $head else $head + "·" + $cut end end)'
}

# ---- 조정 세션 기록 <state_dir>/_session/<세션8>.json (팀장 키·마지막 slots/busy) ------------------------
# 쓰기·지우기는 coord_lock(mkdir 잠금 `<세션8>.lock`) 아래에서만 한다.
sess_file() { printf '%s/%s.json' "$SESSD" "$1"; }
sess_get() { jq -r "($2) // empty" "$(sess_file "$1")" 2>/dev/null; }   # sess_get <세션8> <jq식>
sess_write() {  # sess_write <세션8> <json> — handle 이 비면 기존 기록의 handle 을 둔다(조정 세션이 적어 둔 값)
  local s8="$1" new="$2" f t rc=0
  f="$(sess_file "$s8")"
  mkdir -p "$SESSD" 2>/dev/null || { warn "세션 기록 폴더 생성 실패"; return 1; }
  coord_lock "$SESSD/$s8" || { warn "세션 기록 잠금 실패: $s8"; return 1; }
  HELD_LOCK="$SESSD/$s8"   # 끊기면 on_exit 가 푼다
  t="$f.tmp.$$"
  # handle 이 비면 기존 handle 을, pid 가 믿을 수 없는 값(pid_fresh false)이면 기존 pid(>0)를 둔다. pid_fresh 는 기록에 남기지 않는다.
  if jq -n --argjson n "$new" --argjson o "$(cat "$f" 2>/dev/null || echo null)" \
       '$n + (if (($n.handle // "") == "") then {handle: (($o // {}).handle // "")} else {} end)
        + (if ($n.pid_fresh != true and ((($o // {}).pid // 0) > 0)) then {pid: $o.pid} else {} end) | del(.pid_fresh)' > "$t" 2>/dev/null && [ -s "$t" ]; then
    mv -f "$t" "$f" || rc=1
  else rm -f "$t"; rc=1; fi
  coord_unlock "$SESSD/$s8"; HELD_LOCK=""
  [ "$rc" = 0 ] || warn "세션 기록 쓰기 실패: $s8"
  return "$rc"
}
sess_rm() {  # sess_rm <세션8>
  coord_lock "$SESSD/$1" || { warn "세션 기록 잠금 실패: $1"; return 1; }
  HELD_LOCK="$SESSD/$1"
  rm -f "$(sess_file "$1")"; coord_unlock "$SESSD/$1"; HELD_LOCK=""
}
# 다른 회차의 state.json 쓰기(늘 coord-state.sh 로).
rec_run() { COORD_RUN="$1" bash "$COORD_SCRIPTS_DIR/coord-state.sh" set "$2" "$3" >/dev/null 2>&1 || warn "state 기록 실패($1): $2"; }
rec_run_many() { local r="$1"; shift; COORD_RUN="$r" bash "$COORD_SCRIPTS_DIR/coord-state.sh" set-many "$@" >/dev/null 2>&1 || warn "state 기록 실패($r): $1"; }
run_sent() { jq -r "$2" "$ROOT/$1/state.json" 2>/dev/null; }   # run_sent <run-id> <jq식>

MY_S8=""; [ -n "$SF" ] && MY_S8="$(coord_sess8 "$SF")"
# 이 호출을 한 환경의 조정 세션 <세션8>(조정 세션 자신이 부른 호출만 값이 있다). 일반 터미널·다른 세션·오래 사는 폴러는 다르거나 비어 있다.
ENV_S8="$(printf '%s' "$(printf '%s' "${COORD_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-}}" | cut -c1-8)" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
# 이 세션(<세션8>)의 열린 회차(closed_at null·finished 아님) 목록. 인자: [제외할 레인(현재 회차에서)] [self=1 이면 현재 회차 제외]
# 출력: 회차마다 `<run-id>\t<살아 있는 레인>\t<busy>`
group_runs() {
  local rid s8 open fin alive busy _sid _pid
  while IFS=$'\t' read -r rid s8 open fin alive busy _sid _pid; do
    [ "$s8" = "$MY_S8" ] && [ "$open" = 1 ] && [ "$fin" = 0 ] || continue
    [ "${2:-0}" = 1 ] && [ "$rid" = "$RID" ] && continue
    printf '%s\t%s\t%s\n' "$rid" "$alive" "$busy"
  done < <(coord_runs_summary "$RID" "${1:-}")
}

# 회차들의 옛 `.office.sent._lead` 중 새 키와 다른 것을 stop 하고 기록을 비운다. 인자: <새 키> <run-id 목록(줄바꿈 구분, 첫 칸만 읽는다)>.
# stop 이 하나라도 실패하면 rc 1(새 키를 보내지 않는다 — 서버 stop 은 멱등이라 다음 호출이 재시도).
drop_old_leads() {
  local key="$1" rid o seen=" "
  while IFS=$'\t' read -r rid _; do
    [ -n "$rid" ] || continue
    o="$(run_sent "$rid" '.office.sent._lead // empty')"
    [ -n "$o" ] && [ "$o" != "$key" ] || continue
    case "$seen" in *" $o "*) ;; *) seen="$seen$o "; watch_call "stop $o" --agent "$o" --stop || return 1 ;; esac
    rec_run "$rid" '.office.sent["_lead"]' null
  done <<< "$2"
  return 0
}

# 팀장 갱신. 인자: [제외할 레인] [self=1 이면 현재 회차를 합산에서 뺀다(finish)]. 같은 키·slots/busy 이면 force 가 아닐 때 보내지 않는다.
FORCE=0
send_lead() {
  local excl="${1:-}" self="${2:-0}" key slots=0 busy=0 rid a b old o
  [ "$ABORT" = 0 ] || return 1
  [ -n "$MY_S8" ] || return 1
  need_ident || return 1
  key="$(lead_key "$IDENT" "$MY_S8")"
  local runs; runs="$(group_runs "$excl" "$self")"
  while IFS=$'\t' read -r rid a b; do
    [ -n "$rid" ] || continue
    slots=$((slots + ${a:-0})); busy=$((busy + ${b:-0}))
  done <<< "$runs"
  old="$(sess_get "$MY_S8" .key)"
  # 회차에 남은 옛 `.office.sent._lead`(coord:<run-id>·…/coord)는 새 키와 다르면 stop 하고 기록을 비운다(성공했을 때만 — 실패하면 다음 호출이 재시도).
  # 새 키를 이미 보낸 뒤에도 남아 있을 수 있으므로 같은 키·같은 slots/busy 로 일찍 끝나는 길보다 앞서 처리한다.
  local runs_all; runs_all="$runs"$'\n'"$RID"
  drop_old_leads "$key" "$runs_all" || return 1
  # 팀장 자리 요약·라벨은 slots·busy 와 같은 회차 집합에서 만든다. 해시(라벨+요약)가 바뀌었으면 같은 키·slots/busy 여도 보낸다.
  lead_info "$runs" "$excl"
  local lhash; lhash="$(printf '%s\n%s' "$LEAD_LABEL" "$LSUM" | sha256)"
  if [ "$FORCE" = 0 ] && [ "$old" = "$key" ] && [ "$(sess_get "$MY_S8" .slots)" = "$slots" ] && [ "$(sess_get "$MY_S8" .busy)" = "$busy" ] \
     && [ "$(sess_get "$MY_S8" .sumhash)" = "$lhash" ]; then
    return 0
  fi
  # 새 키를 처음 보낼 때(세션 기록이 없거나 키가 다를 때) 옛 키를 먼저 내린다: 세션 기록의 옛 키와, 이 세션 열린 회차·현재 회차의
  # 옛 `.office.sent._lead`(coord:<run-id>·…/coord). 하나라도 못 내렸으면 새 키를 보내지 않는다(서버 stop 은 멱등, 다음 호출이 재시도).
  if [ "$old" != "$key" ]; then
    # 세션 기록의 옛 키(이 세션의 키가 바뀐 경우, 예: host 변경)
    [ -n "$old" ] && { watch_call "stop $old" --agent "$old" --stop || return 1; }
  fi
  local args=(--agent "$key" --slots "$slots" --busy "$busy")
  [ -n "$PROJECT" ] && args+=(--project "$PROJECT")
  args+=(--until "$LEAD_LABEL" --lead-summary-json "$LSUM")
  watch_call "팀장 $key" "${args[@]}" || return 1
  # pid: 이 호출이 조정 세션 자신에게서 왔을 때만(환경의 세션 id 앞 8자가 <세션8> 과 같고 CLAUDE_PID 가 숫자) 현재 값으로 갱신한다.
  # 세션을 다시 시작·resume 하면 pid 가 바뀌므로 init 때 값을 그대로 두면 살아 있는 세션을 죽었다고 판정한다.
  # 폴러처럼 오래 사는 프로세스가 옛 CLAUDE_PID 를 물려받았을 수 있으므로 살아 있는 pid 일 때만 믿고, 이 세션의 모든 열린 회차에 함께 적는다.
  # 믿을 수 없는 호출(curpid 가 빔)은 세션 기록의 기존 pid 를 그대로 둔다(sess_write 가 병합).
  local curpid="" gr
  case "${CLAUDE_PID:-}" in ''|*[!0-9]*) ;; *) [ -n "$ENV_S8" ] && [ "$ENV_S8" = "$MY_S8" ] && coord_pid_alive "$CLAUDE_PID" && curpid="$CLAUDE_PID" ;; esac
  if [ -n "$curpid" ]; then
    rec '.run.coordinator.pid' "$curpid"
    while IFS=$'\t' read -r gr _; do [ -n "$gr" ] && [ "$gr" != "$RID" ] && rec_run "$gr" '.run.coordinator.pid' "$curpid"; done <<< "$(group_runs "" 1)"
  fi
  sess_write "$MY_S8" "$(jq -nc --slurpfile s "$SF" --arg key "$key" --arg ident "$IDENT" --arg now "$(coord_now_iso)" --arg cp "$curpid" \
    --argjson slots "$slots" --argjson busy "$busy" --arg sh "$lhash" --arg lb "$LEAD_LABEL" '$s[0].run.coordinator as $c
    | {key: $key, session_id: ($c.session_id // ""), host: ($ident | split("/")[1] // ""), user: ($ident | split("/")[0]),
       pid: (if $cp != "" then ($cp | tonumber) else (($c.pid // 0) | tonumber? // 0) end), pid_fresh: ($cp != ""),
       handle: ($c.handle // ""), sent_at: $now, slots: $slots, busy: $busy, label: $lb, sumhash: $sh}')"
}

# 팀장 자리 요약(lead_summary)과 라벨(until)을 LSUM·LEAD_LABEL 에 둔다. 인자: <group_runs 출력> [제외할 레인(현재 회차에서)].
# runs = 열린 회차 중 최근 5개(오래된 순), 8192바이트를 넘으면 오래된 회차부터 뺀다. 라벨은 회차 중 하나라도 pending_user 가 있거나
# 팀장 입력 요청 기록(coord_lead_<세션8>.json, handled null·usage-limit·trust 아님)이 있으면 `답 대기`, 아니면 `조정 중`.
LSUM='{"v":1,"runs":[]}'; LEAD_LABEL="조정 중"
lead_info() {
  local rid files=() out pend lin redj='{}' f ft gl
  while IFS=$'\t' read -r rid _; do
    [ -n "$rid" ] && [ -f "$ROOT/$rid/state.json" ] && files+=("$ROOT/$rid/state.json")
  done <<< "$1"
  # 자유 글(pending_user 첫 건·goal)을 회차마다 미리 가린다(실패하면 빈 글)
  for f in ${files[@]+"${files[@]}"}; do
    rid="${f%/*}"; rid="${rid##*/}"
    ft="$(jq -r '(.pending_user | if type == "array" then . else [] end) as $pu
      | if ($pu | length) == 0 then "" else ($pu[0] | if type == "object" then (.text // .title // "") else . end | tostring) end' "$f" 2>/dev/null)"
    gl="$(jq -r '.run.goal // "" | tostring' "$f" 2>/dev/null)"
    ft="$(red "$ft")" || ft=""
    gl="$(red "$gl")" || gl=""
    redj="$(jq -nc --argjson o "$redj" --arg k "$rid" --arg ft "$ft" --arg g "$gl" '$o + {($k): {ft: $ft, goal: $g}}')" || redj='{}'
  done
  out=""
  if [ "${#files[@]}" -gt 0 ]; then
    out="$(jq -nc --argjson inp "$(active_inputs)" --argjson now "$(coord_now_epoch)" --argjson qmin "$QUIET_MIN" --argjson max "$LEAD_MAX" \
      --arg xr "$RID" --arg xl "${2:-}" --argjson red "$redj" "$LABEL_JQ$SUM_JQ"'
      [inputs | run_sum($inp; $now; $qmin; $xr; $xl; $red)] | sort_by(.created) | map(.s) as $all
      | {v: 1, runs: ($all | .[-5:])} | until(bytes <= $max or (.runs | length) == 0; .runs |= .[1:])
      | [., ([$all[] | .decision.pending_user] | any(. > 0))]' "${files[@]}" 2>/dev/null)"
  fi
  if [ -n "$out" ]; then
    LSUM="$(printf '%s' "$out" | jq -c '.[0]')"; pend="$(printf '%s' "$out" | jq -r '.[1]')"
  else
    LSUM='{"v":1,"runs":[]}'; pend=false
    [ "${#files[@]}" -gt 0 ] && warn "팀장 요약 만들기 실패"
  fi
  lin="$(inreq_json "coord_lead_$MY_S8" | jq -r "$LABEL_JQ$SUM_JQ"' inreq_active' 2>/dev/null)"
  if [ "$pend" = true ] || [ "$lin" = true ]; then LEAD_LABEL="답 대기"; else LEAD_LABEL="조정 중"; fi
}

# 이 세션의 팀장 키를 내리고 세션 기록을 지운다(마지막 열린 회차 마감). 기록이 없으면 0. stop 이 실패하면 기록을 둔다.
lead_down() {
  local k; k="$(sess_get "$MY_S8" .key)"
  [ -n "$k" ] || return 0
  watch_call "stop $k" --agent "$k" --stop || return 1
  sess_rm "$MY_S8"
}

# 기록된 키로 stop 하고 기록을 지운다. 인자: <레인>. 기록이 없으면 0.
stop_lane() {
  local lane="$1" old; old="$(sent_key "$lane")"
  [ -n "$old" ] || return 0
  watch_call "stop $old" --agent "$old" --stop || return 1
  local q; q="$(jq -nc --arg l "$lane" '$l')"
  if [ -z "$(sent_sumhash "$lane")" ]; then rec_many ".office.sent[$q]" null ".office.label[$q]" null
  else rec_many ".office.sent[$q]" null ".office.label[$q]" null ".office.sumhash[$q]" null; fi
}

# 팀원 한 명 보내기. 인자: <레인> <라벨>. 같은 키·라벨이면 force 가 아닐 때 건너뛴다.
# 라벨이 끝이거나 레인이 closed 이면 올리지 않고 내린다(lane-down 뒤 늦은 report 가 행을 다시 만들지 않게).
send_lane() {
  local lane="$1" label="$2" id key old oldlbl
  [ "$ABORT" = 0 ] || return 1
  case "$lane" in _lead) return 0 ;; esac
  if [ "$label" = "끝" ] || [ "$(auto_label "$lane")" = "끝" ]; then stop_lane "$lane"; return; fi
  need_ident || return 1
  id="$IDENT"; key="$(lane_key "$id" "$lane")"
  old="$(sent_key "$lane")"; oldlbl="$(sent_label "$lane")"
  # 요약 칸은 이 키로 보내는 모든 호출에 늘 싣는다(빼면 서버가 null 로 덮어쓴다). 해시(summary+input_request)는
  # 「같은 키·같은 라벨인데 요약만 바뀌었을 때 추가로 보낼지」 판단에만 쓴다.
  local sum inreq shash
  sum="$(lane_summary "$lane" 2>/dev/null)"; inreq="$(inreq_json "coord_lane_$lane")"
  shash="$(printf '%s\n%s' "$sum" "$inreq" | sha256)"
  if [ "$FORCE" = 0 ] && [ "$old" = "$key" ] && [ "$oldlbl" = "$label" ] && [ "$(sent_sumhash "$lane")" = "$shash" ]; then return 0; fi
  # 지시 요약이 바뀌어 키가 달라졌으면 옛 키를 먼저 내린다(안 내리면 화면에 같은 레인이 둘 보인다).
  # stop 이 실패하면 새 키를 보내지 않고 옛 기록을 둔다(다음 beat 가 다시 시도, 서버 stop 은 멱등).
  if [ -n "$old" ] && [ "$old" != "$key" ]; then watch_call "stop $old" --agent "$old" --stop || return 1; fi
  local args=(--agent "$key" --until "$label")
  [ -n "$PROJECT" ] && args+=(--project "$PROJECT")
  if [ -n "$sum" ]; then args+=(--summary-json "$sum"); else warn "레인 요약 만들기 실패: $lane"; fi
  args+=(--input-request-json "$inreq")
  watch_call "팀원 $key" "${args[@]}" || return 1
  local q; q="$(jq -nc --arg l "$lane" '$l')"
  rec_many ".office.sent[$q]" "$(jq -nc --arg k "$key" '$k')" ".office.label[$q]" "$(jq -nc --arg s "$label" '$s')" \
    ".office.sumhash[$q]" "$(jq -nc --arg s "$shash" '$s')"
}

valid_label() { case "$1" in "작업 중"|"대기"|"머지 중"|"답 대기"|"끝") return 0 ;; *) return 1 ;; esac; }

# 입력 요청 기록은 호출당 한 번만 읽는다(뒤의 $(auto_label …) 서브셸들이 채워 둔 ACTIVE_IN 을 물려받게 여기서 채운다).
[ "$sub" = reap ] || active_inputs >/dev/null

case "$sub" in
  lead-up|lead-sync) FORCE=1; send_lead ;;   # lead-sync: 입력 요청 기록·pending_user 가 바뀐 직후 팀장 칸(라벨·요약)을 다시 보낸다
  lane-up)
    lane_exists "$1" || exit 0
    [ "$(auto_label "$1")" != "끝" ] || { stop_lane "$1"; exit 0; }   # 끝난 레인은 올리지 않는다
    FORCE=1
    send_lane "$1" "$(auto_label "$1")"
    [ "$ABORT" = 0 ] && send_lead ;;
  lane-state)
    lane_exists "$1" || exit 0
    lab="$2"; [ "$lab" = auto ] && lab="$(auto_label "$1")"
    valid_label "$lab" || { coord_log "상태 라벨은 작업 중|대기|머지 중|답 대기|끝|auto: $2"; exit 0; }
    send_lane "$1" "$lab"; [ "$ABORT" = 0 ] && send_lead ;;
  lane-down)
    stop_lane "$1" && send_lead "$1" ;;
  beat)
    if [ "$FINISHED" = 1 ]; then   # 마감 뒤: 남은 키만 내린다
      for L in $(st '(.office.sent // {}) | to_entries[] | select(.value != null and .key != "_lead") | .key'); do stop_lane "$L"; done
      old="$(sent_key _lead)"   # 옛 형식 팀장 키(읽기만, 서버 stop 은 멱등)
      [ -n "$old" ] && watch_call "stop $old" --agent "$old" --stop && rec '.office.sent["_lead"]' null
      # 이 세션에 열린 회차가 더 없는데 팀장 기록이 남았으면(finish 때 stop 실패) 마저 내린다
      [ -z "$(group_runs "" 1)" ] && lead_down
      exit 0
    fi
    FORCE=1
    send_lead
    for L in $(st '.lanes | keys[]'); do
      lab="$(auto_label "$L")"
      if [ "$lab" = "끝" ]; then stop_lane "$L"; else send_lane "$L" "$lab"; fi
    done
    # state 에서 사라진 레인의 남은 키
    for L in $(st '(.office.sent // {}) as $s | (.lanes // {}) as $ln | $s | keys[] | select(. != "_lead") | select($ln[.] == null)'); do stop_lane "$L"; done ;;
  finish)
    # 레인마다 ABORT 를 초기화해 이 회차의 모든 팀원 stop 을 시도한다(한 건의 시간 초과가 나머지를 막지 않게). 마감 표식은 늘 남기고,
    # stop 이 실패한 키는 기록에 남아 이후 beat·reap 이 마저 내린다.
    for L in $(st '(.office.sent // {}) | to_entries[] | select(.value != null and .key != "_lead") | .key'); do ABORT=0; stop_lane "$L"; done
    ABORT=0
    old="$(sent_key _lead)"   # 옛 형식 팀장 키(coord:<run-id>)가 이 회차에 남았으면 내린다(읽기만)
    [ -n "$old" ] && [ "$old" != "$(sess_get "$MY_S8" .key)" ] && watch_call "stop $old" --agent "$old" --stop && rec '.office.sent["_lead"]' null
    ABORT=0
    # 팀장: 같은 세션에 다른 열린 회차가 남았으면 합산만 다시 보내고(이 회차를 뺀 값), 마지막 열린 회차일 때만 내린다.
    if [ -n "$MY_S8" ]; then
      if [ -n "$(group_runs "" 1)" ]; then
        # 세션 기록이 없고 이 호출도 그 조정 세션 자신이 아니면(예: 다른 세션이 죽은 세션의 회차를 닫음) 죽어서 내려간 팀장 칸을 되살리지 않는다.
        if [ -f "$(sess_file "$MY_S8")" ] || [ "$ENV_S8" = "$MY_S8" ]; then FORCE=1; send_lead "" 1; fi
      else lead_down; fi
    fi
    rec '.office.finished' true ;;
  reap)
    # 생존 감시(contract §4 「생존 판정」·§4.1). ABORT 는 호출 전체에 하나다(30초마다 다시 돌므로 남은 일은 다음 주기가 마저 한다).
    summary="$(coord_runs_summary)"
    dead=" "
    for f in "$SESSD"/*.json; do
      [ -f "$f" ] || continue
      s8="$(basename "$f" .json)"
      pid="$(jq -r '.pid // 0 | tostring' "$f" 2>/dev/null)"
      case "$pid" in ''|0|null) continue ;; esac   # pid 를 모르면 TTL 에 맡긴다
      coord_pid_alive "$pid" && continue
      dead="$dead$s8 "; ok=1
      while IFS=$'\t' read -r rid r8 _open fin _rest; do
        [ -n "$rid" ] && [ "$r8" = "$s8" ] || continue
        while IFS=$'\t' read -r L k; do
          [ -n "$L" ] || continue
          if watch_call "stop $k" --agent "$k" --stop; then
            q="$(jq -nc --arg l "$L" '$l')"; rec_run_many "$rid" ".office.sent[$q]" null ".office.label[$q]" null
          else ok=0; fi
        done < <(run_sent "$rid" '(.office.sent // {}) | to_entries[] | select(.value != null and .key != "_lead") | "\(.key)\t\(.value)"')
        o="$(run_sent "$rid" '.office.sent._lead // empty')"
        [ -n "$o" ] && { if watch_call "stop $o" --agent "$o" --stop; then rec_run "$rid" '.office.sent["_lead"]' null; else ok=0; fi; }
      done <<< "$summary"
      k="$(jq -r '.key // empty' "$f" 2>/dev/null)"
      [ -n "$k" ] && { watch_call "stop $k" --agent "$k" --stop || ok=0; }
      [ "$ok" = 1 ] && sess_rm "$s8"   # 하나라도 못 내렸으면 기록을 두어 다음 reap 이 다시 시도한다
    done
    # 살아 있는(또는 기록 없는) 세션의 열린 회차: session.pid 가 죽은 레인의 팀원 키만 내린다(pid 0·빈 값은 제외)
    while IFS=$'\t' read -r rid r8 open fin _rest; do
      [ -n "$rid" ] && [ "$open" = 1 ] && [ "$fin" = 0 ] || continue
      case "$dead" in *" $r8 "*) continue ;; esac
      while IFS=$'\t' read -r L k p; do
        [ -n "$L" ] || continue
        case "$p" in ''|0|null) continue ;; esac
        coord_pid_alive "$p" && continue
        if watch_call "stop $k" --agent "$k" --stop; then
          q="$(jq -nc --arg l "$L" '$l')"; rec_run_many "$rid" ".office.sent[$q]" null ".office.label[$q]" null
        fi
      done < <(run_sent "$rid" '. as $r | (.office.sent // {}) | to_entries[] | select(.value != null and .key != "_lead")
        | "\(.key)\t\(.value)\t\(($r.lanes[.key].session.pid // 0) | tostring)"')
    done <<< "$summary" ;;
esac
exit 0
