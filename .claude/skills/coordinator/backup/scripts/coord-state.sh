#!/usr/bin/env bash
# 사용법: coord-state.sh <하위명령> …   (정본: ../references/contract.md §2·§3.4)
#   init <run-id> [--goal 글] [--rules-doc 경로]   회차 폴더·빈 state.json 생성, current 지정 · `RUN <run-id> <폴더>`
#   use <run-id>                                   current 바꾸기 · `OK`
#   get [jq식]                                     state.json 에 jq 적용 결과
#   set <jq경로> <json값>                          값 쓰기 · `OK`
#   set-many <경로> <값> [<경로> <값> …]           값 여러 개를 한 번에(한 번의 잠금·쓰기) · `OK`
#   lane-add <레인> <json>                         기본 레인 골격 * 기존 값 * json 병합 · `OK`
#   event <kind> [레인|-] [json]                   events.jsonl 에 한 줄 · `OK`
#   instr <레인> <kind>                            다음 지시 번호 발급·기록 · `<레인>-<n>`
#   ack <instr-id>                                 ack 시각 기록 · `OK`
#   report <레인> [요약 글] [--question <글>|--answered]  last_report_at 갱신, reports.md 에 한 줄 · `OK`
#                                                  --question: .lanes.<레인>.question = {at, text(첫 줄 200자)} (레인의 문장 질문 —
#                                                  오피스 입력 요청 kind 'message'), --answered: 그 질문을 지운다
#   item-done <레인> <항목id>                      항목 완료 · `PROGRESS <레인> <pct>%`
#   progress                                       레인마다 `PROGRESS <레인> <pct>% <끝>/<전체>`, 끝에 `PROGRESS ALL <pct>%`
#   hold <레인> <사유|-> [until-iso]               hold 세우기(`-` 는 풀기) · `OK`
#   close-run [json]                               회차 마감: run-closed 이벤트 → office finish → `.run.closed_at` 기록 · `OK`
#                                                  (`event run-closed` 도 같은 길. 이미 마감했으면 closed_at 은 그대로, finish 는 다시 건다)
#   summary                                        summary.md 재생성 · 경로
# state.json 은 이 스크립트만 쓴다. 쓰기는 mkdir 잠금(<회차>/.lock) 아래에서 임시 파일 → mv 로 원자적으로 한다.
# 회차는 COORD_RUN 환경 변수 → <state_dir>/current 순으로 정한다(init 은 인자의 run-id).
# init 은 조정 세션 id·pid(CLAUDE_PID, 없으면 0 — TTL 에 맡긴다)·Orca 핸들(ORCA_TERMINAL_HANDLE, 없으면 빈 값)을 .run.coordinator 에 적고,
# 오피스 콘솔 폴러를 띄운다(console-poll.sh start — COORD_DRY=1·COORD_CONSOLE_POLL=0 이면 건너뜀). 같은 조정 세션의 다른 열린 회차가 있으면
# `SESSION_RUNS <세션8> open=<n>`, 다른 세션의 마감 표식 없는 회차는 `STALE_RUN <run-id> open …` 줄로 알린다(둘 다 경고만, 자동 마감 없음).
set -uo pipefail
# shellcheck source=lib/common.sh
_SD="${0%/*}"; [ "$_SD" != "$0" ] || _SD=.   # dirname 대신(프로세스 0개)
. "$_SD/lib/js-bridge.sh"; if _jsb_on COORD_STATE; then _jsb_exec "$_SD/coord-state" "$@"; fi   # node 판(스위치 COORD_JS_COORD_STATE)
. "$_SD/lib/common.sh"
coord_default_repo

usage() { coord_die 2 "사용법: coord-state.sh init|use|get|set|set-many|lane-add|event|instr|ack|report|item-done|progress|hold|close-run|summary … (contract §3.4)"; }

LANE_SKEL='{"session":{"name":"","addr":"","session_id":"","pid":0,"handle":"","kind":"claude","window":null,"spawned_by":"user"},
 "branch":"","worktree":"","owned":[],"forbidden":[],"heavy_env":null,"priority":2,"items":[],"queue":[],"hold":null,
 "last_report_at":null,"last_instr_at":null,"ctx":null,
 "compact":{"pending":false,"last_at":null,"pre_compact":null,"history":[]},"memo":"","state":"active"}'

_LOCKED=""
trap '[ -n "$_LOCKED" ] && coord_unlock "$_LOCKED"' EXIT

# mv 를 재시도한다: 윈도우는 다른 프로세스가 대상 파일을 열고 있으면(백신·탐색기·동시 읽기) mv 가 잠금 오류로 실패한다.
# 0.1초 간격으로 최대 5번. macOS 는 첫 시도에서 성공하므로 달라지지 않는다.
_atomic_mv() {
  local i=0
  while [ "$i" -lt 5 ]; do
    mv -f "$1" "$2" 2>/dev/null && return 0
    i=$((i + 1)); [ "$i" -lt 5 ] && sleep 0.1
  done
  mv -f "$1" "$2"
}
# stdin → <파일> 원자적 쓰기(같은 폴더 임시 파일 → mv).
atomic_write() {
  local f="$1" t; t="$1.tmp.$$"
  if cat > "$t" && [ -s "$t" ]; then _atomic_mv "$t" "$f"; else rm -f "$t"; return 1; fi
}
run_dir() { coord_run_dir; }
state_file_checked() {
  local f; f="$(run_dir)/state.json"
  [ -f "$f" ] || coord_die 3 "state.json 없음: $f (coord-state.sh init 먼저)"
  printf '%s' "$f"
}
st_lock() { coord_lock "$1/" || coord_die 4 "잠금 실패: $1/.lock"; _LOCKED="$1/"; }
st_unlock() { coord_unlock "$1/"; _LOCKED=""; }
# 잠금을 쥔 채로 state.json 에 jq 필터 적용(인자 = jq 인자들). 실패하면 원본 그대로, rc 4.
st_apply() {
  local f="$1"; shift
  jq "$@" "$f" | atomic_write "$f" || { coord_log "state.json 쓰기 실패(jq $*)"; return 4; }
}
# 잠금 → 적용 → 해제. 인자 = jq 인자들.
st_update() {
  local dir f rc
  f="$(state_file_checked)"; dir="${f%/*}"
  st_lock "$dir"; st_apply "$f" "$@"; rc=$?; st_unlock "$dir"
  return "$rc"
}
# events.jsonl 한 줄. 인자: <회차폴더> <kind> <레인|-> [json]
ev_append() {
  local dir="$1" kind="$2" lane="${3:--}" data="${4:-}"
  [ -n "$data" ] || data='{}'
  printf '%s' "$data" | jq -e . >/dev/null 2>&1 || coord_die 2 "event json 오류: $data"
  local line; line="$(jq -nc --arg at "$(coord_now_iso)" --arg k "$kind" --arg l "$lane" --argjson d "$data" \
    '{at:$at, kind:$k, lane:(if $l == "-" or $l == "" then null else $l end), data:$d}')"
  st_lock "$dir"; printf '%s\n' "$line" >> "$dir/events.jsonl"; st_unlock "$dir"
}
# 에이전트 오피스 표시(office.sh). 표시 전용이라 실패해도 상태 쓰기·stdout 계약은 그대로다.
office() { bash "$COORD_SCRIPTS_DIR/office.sh" "$@" >/dev/null 2>&1 || true; }
lane_name_ok() { case "$1" in ""|*[!A-Za-z0-9._-]*) coord_die 2 "레인 이름 형식 오류: '$1'" ;; esac; }
lane_exists() {
  local f; f="$(state_file_checked)"
  [ "$(jq -r --arg l "$1" '.lanes | has($l)' "$f")" = true ] || coord_die 2 "없는 레인: $1"
}
json_ok() { printf '%s' "$1" | jq empty >/dev/null 2>&1 && [ -n "$1" ] || coord_die 2 "json 오류: $1"; }

cmd_init() {
  local id="${1:-}" goal="" rules="" root dir sid="${COORD_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-}}" cpid="${CLAUDE_PID:-0}"
  [ -n "$id" ] || usage; shift
  case "$id" in */*|.*|current|ctx|_session|*[!A-Za-z0-9._-]*) coord_die 2 "run-id 형식 오류: $id" ;; esac
  case "$cpid" in ''|*[!0-9]*) cpid=0 ;; esac
  while [ $# -gt 0 ]; do
    case "$1" in
      --goal) goal="${2:-}"; shift ;;
      --rules-doc) rules="${2:-}"; shift ;;
      *) usage ;;
    esac
    shift
  done
  root="$(coord_state_root)"; dir="$root/$id"
  [ -f "$dir/state.json" ] && coord_die 2 "이미 있는 회차: $dir (이어 쓰려면 use $id)"
  mkdir -p "$dir/lanes" "$dir/ticks" || coord_die 4 "폴더 생성 실패: $dir"
  jq -n --arg id "$id" --arg goal "$goal" --arg rules "$rules" --arg ib "$(coord_cfg .integration_branch)" \
    --arg now "$(coord_now_iso)" --arg sid "$sid" --argjson cpid "$cpid" --arg h "${ORCA_TERMINAL_HANDLE:-}" '{
      schema: 1,
      run: {id: $id, goal: $goal, rules_doc: $rules, integration_branch: $ib, created_at: $now, closed_at: null,
            coordinator: {name: "", addr: "", session_id: $sid, handle: $h, pid: $cpid},
            cron_id: null, usage_band_notified: null},
      lanes: {}, deps: [],
      merge: {in_flight: null, queue: [], history: []},
      windows: [],
      usage: {band: "UNKNOWN", five: null, week: null, src: null, at: null},
      load: {soft_ticks: 0, hard_ticks: 0, release_ticks: 0, banned: []},
      instrs: [], backlog: [], approvals: [],
      glm: {status: null, at: null, detail: null},
      decisions: [], pending_user: []}' | atomic_write "$dir/state.json" || coord_die 4 "state.json 생성 실패"
  [ -f "$dir/events.jsonl" ] || : > "$dir/events.jsonl"
  printf '%s\n' "$id" | atomic_write "$root/current" || coord_die 4 "current 쓰기 실패"
  ev_append "$dir" init - "$(jq -nc --arg g "$goal" '{goal:$g}')"
  COORD_RUN="$id" office lead-up
  # 오피스 콘솔 폴러(contract §4.1). 이미 돌면 그대로 둔다. 실패해도 init 은 계속한다(stdout 계약 불변).
  if [ "${COORD_DRY:-0}" != 1 ] && [ "${COORD_CONSOLE_POLL:-1}" != 0 ]; then
    bash "$COORD_SCRIPTS_DIR/console-poll.sh" start >/dev/null 2>&1 || true
  fi
  echo "RUN $id $dir"
  local s8; s8="$(coord_sess8 "$dir/state.json")"
  # 세션 id 도 pid 도 모르면 <세션8> 이 회차 id 로 떨어져 회차마다 팀장 칸이 따로 생긴다(contract §4).
  [ "$s8" != "$id" ] || coord_log "경고: 조정 세션 id(COORD_SESSION_ID·CLAUDE_CODE_SESSION_ID)와 CLAUDE_PID 를 모른다 — 오피스 팀장 칸이 이 회차 단위로 따로 생긴다. 조정 세션 안에서 init 하라"
  init_stale_check "$id" "$s8"
}

# 새 회차를 시작할 때 마감 표식 없는 다른 회차를 알린다(자동 마감하지 않는다 — contract §3.4).
# 같은 조정 세션(<세션8> 이 같음)의 열린 회차는 팀장 칸을 공유하는 정상 상태라 `SESSION_RUNS <세션8> open=<n>` 한 줄(n 은 새 회차 포함
# 이 세션의 열린 회차 수)과 stderr 경고만 낸다. 다른 세션의 회차는 `STALE_RUN <run-id> open session=<id|-> idle=<분>m` 경고만 낸다.
init_stale_check() {  # init_stale_check <새 run-id> <새 회차의 세션8>
  local rid sid s8 _alive age mt now same=0; now="$(coord_now_epoch)"
  while IFS=$'\t' read -r rid sid s8 _alive; do
    [ -n "$rid" ] || continue
    if [ -n "$2" ] && [ "$s8" = "$2" ]; then same=$((same + 1)); continue; fi
    mt="$(coord_file_mtime "$(coord_state_root)/$rid/state.json")"; age="-"
    [ -n "$mt" ] && age="$(( (now - mt) / 60 ))m"
    echo "STALE_RUN $rid open session=$sid idle=$age"
    coord_log "STALE_RUN $rid: 다른 조정 세션의 회차가 마감 표식 없이 남아 있다(경고만). 끝난 회차라면 COORD_RUN=$rid coord-state.sh close-run (진행 중인 다른 조정자의 회차면 그대로 둔다)"
  done < <(coord_stale_runs "$1")
  if [ "$same" -gt 0 ]; then
    echo "SESSION_RUNS $2 open=$((same + 1))"
    coord_log "SESSION_RUNS $2: 이 조정 세션에 열린 회차가 $((same + 1))개다(앞 회차는 자동 마감하지 않는다). 오피스 팀장 칸 하나를 공유하고 slots·busy 는 합산된다. 끝난 회차는 COORD_RUN=<회차> coord-state.sh close-run 으로 닫는다"
  fi
}

# 회차 마감(closing.md §6): run-closed 이벤트 → 오피스 finish(팀장·팀원 표시 내림) → .run.closed_at 기록.
# 이미 마감한 회차면 closed_at 은 처음 값을 두고, finish 는 다시 건다(stop 이 실패해 남은 키를 마저 내리는 용도).
close_run() {  # close_run [레인|-] [json]
  state_file_checked >/dev/null
  ev_append "$(run_dir)" run-closed "${1:--}" "${2:-}"
  office finish
  st_update --arg now "$(coord_now_iso)" '.run.closed_at = (.run.closed_at // $now)' || exit 4
}

cmd_close_run() {
  [ $# -le 1 ] || usage
  close_run - "${1:-}"
  echo OK
}

cmd_use() {
  local id="${1:-}" root
  [ -n "$id" ] || usage
  root="$(coord_state_root)"
  [ -f "$root/$id/state.json" ] || coord_die 3 "없는 회차: $root/$id"
  printf '%s\n' "$id" | atomic_write "$root/current" || coord_die 4 "current 쓰기 실패"
  echo OK
}

cmd_get() { local f; f="$(state_file_checked)"; jq -r "${1:-.}" "$f" || exit 2; }

cmd_set() {
  [ $# -eq 2 ] || usage
  case "$1" in .*) ;; *) coord_die 2 "jq 경로는 . 으로 시작한다: $1" ;; esac
  json_ok "$2"
  local merge_old="" merge_new="" q_old="" q_new=""
  case "$1" in .merge*)
    merge_old="$(jq -r '.merge.in_flight.lane // empty' "$(state_file_checked)" 2>/dev/null)"
    q_old="$(jq -c '.merge.queue // []' "$(state_file_checked)" 2>/dev/null)" ;;
  esac
  st_update --argjson v "$2" "$1 = \$v" || exit 4
  case "$1" in
    .merge*)   # 머지 중 라벨(오피스)은 in_flight 레인이 바뀔 때만 다시 보낸다. 대기열만 바뀌면 팀장 자리 요약만 다시 보낸다
      merge_new="$(jq -r '.merge.in_flight.lane // empty' "$(state_file_checked)" 2>/dev/null)"
      q_new="$(jq -c '.merge.queue // []' "$(state_file_checked)" 2>/dev/null)"
      if [ "$merge_old" != "$merge_new" ]; then
        [ -z "$merge_old" ] || office lane-state "$merge_old" auto
        [ -z "$merge_new" ] || office lane-state "$merge_new" auto
      elif [ "$q_old" != "$q_new" ]; then office lead-sync; fi ;;
    .pending_user*) office lead-sync ;;   # 팀장 라벨(답 대기)·자리 요약(decision)
  esac
  echo OK
}

# set-many <jq경로> <json값> [<경로> <값> …] — set 을 여러 개 한 번의 잠금·jq·쓰기로(office.sh 가 레인 상태 세 칸을 한꺼번에 적는 용도).
# 하나라도 형식이 틀리면 아무것도 쓰지 않는다. .merge*·.pending_user* 는 office 갱신 부수 효과가 있어 따로 하나씩 set 으로 처리한다.
cmd_set_many() {
  [ $# -ge 2 ] && [ $(( $# % 2 )) -eq 0 ] || usage
  local i=1 args=() prog="" a
  for a in "$@"; do
    if [ $((i % 2)) -eq 1 ]; then
      case "$a" in .*) ;; *) coord_die 2 "jq 경로는 . 으로 시작한다: $a" ;; esac
      case "$a" in .merge*|.pending_user*) cmd_set_each "$@"; return ;; esac
    else json_ok "$a"
    fi
    i=$((i + 1))
  done
  i=0
  while [ $# -gt 0 ]; do
    i=$((i + 1)); args+=(--argjson "v$i" "$2"); prog="${prog:+$prog | }$1 = \$v$i"; shift 2
  done
  st_update "${args[@]}" "$prog" || exit 4
  echo OK
}
cmd_set_each() { while [ $# -gt 0 ]; do cmd_set "$1" "$2" >/dev/null || exit 4; shift 2; done; echo OK; }

cmd_lane_add() {
  [ $# -eq 2 ] || usage
  lane_name_ok "$1"; json_ok "$2"
  # 오피스 팀원 키가 레인 이름을 40자로 자르므로(contract §4) 더 긴 이름은 폴러가 대상을 못 찾는다.
  [ "${#1}" -le 40 ] || coord_die 2 "레인 이름은 40자 이하: ${#1}자"
  st_update --arg l "$1" --argjson j "$2" --argjson sk "$LANE_SKEL" '.lanes[$l] = ($sk * (.lanes[$l] // {}) * $j)' || exit 4
  mkdir -p "$(run_dir)/lanes/$1"
  ev_append "$(run_dir)" lane-add "$1"
  # 정본 메모 경로가 비면 compact 문구가 「정본은 -」 로 나간다(decompose.md §5): 경고만 내고 OK 는 그대로
  [ -n "$(jq -r --arg l "$1" '.lanes[$l].memo // empty' "$(state_file_checked)" 2>/dev/null)" ] \
    || echo "WARN lane-add $1: memo(정본 메모 경로)가 비어 있다 — compact 문구가 「정본은 -」 로 나간다" >&2
  # 이미 오피스에 올라간 레인이면 지시 요약(brief)이 바뀐 것을 바로 반영한다(처음 올리는 일은 spawn-lane·beat 몫)
  [ -z "$(jq -r --arg l "$1" '.office.sent[$l] // empty' "$(state_file_checked)" 2>/dev/null)" ] || office lane-state "$1" auto
  echo OK
}

cmd_event() {
  [ $# -ge 1 ] || usage
  if [ "$1" = run-closed ]; then close_run "${2:--}" "${3:-}"   # 회차 마감(closing.md §6)
  else
    state_file_checked >/dev/null
    ev_append "$(run_dir)" "$1" "${2:--}" "${3:-}"
  fi
  echo OK
}

cmd_instr() {
  [ $# -eq 2 ] || usage
  lane_exists "$1"
  local f dir id now
  f="$(state_file_checked)"; dir="${f%/*}"; now="$(coord_now_iso)"
  st_lock "$dir"
  id="$(jq -r --arg l "$1" '$l + "-" + ((([.instrs[]? | select(.lane == $l) | .id | tostring | ltrimstr($l + "-") | tonumber?] | max) // 0) + 1 | tostring)' "$f")"
  if ! st_apply "$f" --arg id "$id" --arg l "$1" --arg k "$2" --arg now "$now" \
      '.instrs += [{id: $id, lane: $l, kind: $k, sent_at: $now, ack_at: null, nudges: 0}] | .lanes[$l].last_instr_at = $now'; then
    st_unlock "$dir"; exit 4
  fi
  st_unlock "$dir"
  ev_append "$dir" instr "$1" "$(jq -nc --arg id "$id" --arg k "$2" '{id:$id, kind:$k}')"
  echo "$id"
}

cmd_ack() {
  [ $# -eq 1 ] || usage
  local f; f="$(state_file_checked)"
  [ "$(jq -r --arg id "$1" '[.instrs[]? | select(.id == $id)] | length' "$f")" -gt 0 ] || coord_die 2 "없는 지시: $1"
  st_update --arg id "$1" --arg now "$(coord_now_iso)" '(.instrs[] | select(.id == $id) | .ack_at) = $now' || exit 4
  echo OK
}

cmd_report() {
  [ $# -ge 1 ] || usage
  lane_exists "$1"
  local lane="$1" text="" have_text=0 q="" qset=0 ans=0 now dir
  shift
  # `--question <글>`·`--answered` 만 옵션이다(그 밖의 인자는 종전처럼 요약 글 — 첫 번째만 쓴다)
  while [ $# -gt 0 ]; do
    case "$1" in
      --question) [ $# -ge 2 ] || usage; q="$2"; qset=1; shift ;;
      --answered) ans=1 ;;
      *) [ "$have_text" = 0 ] && { text="$1"; have_text=1; } ;;
    esac
    shift
  done
  [ "$qset" = 1 ] && [ "$ans" = 1 ] && usage
  now="$(coord_now_iso)"; dir="$(run_dir)"
  # 레인이 조정자에게 문장으로 물은 질문(오피스 입력 요청 kind 'message', contract §4.1): 첫 줄 200자, 제어 문자 정리
  if [ "$qset" = 1 ]; then
    q="$(printf '%s' "$q" | jq -Rsr 'gsub("\r"; "\n") | split("\n") | map(gsub("\t"; " ") | gsub("[\u0000-\u001f\u007f-\u009f]"; "") | sub("^\\s+"; "") | sub("\\s+\\z"; "")) | map(select(. != "")) | (.[0] // "") | .[0:200]')"
    [ -n "$q" ] || coord_die 2 "--question 글이 비었다"
    st_update --arg l "$lane" --arg now "$now" --arg q "$q" '.lanes[$l].last_report_at = $now | .lanes[$l].question = {at: $now, text: $q}' || exit 4
  elif [ "$ans" = 1 ]; then
    st_update --arg l "$lane" --arg now "$now" '.lanes[$l].last_report_at = $now | del(.lanes[$l].question)' || exit 4
  else
    st_update --arg l "$lane" --arg now "$now" '.lanes[$l].last_report_at = $now' || exit 4
  fi
  set -- "$lane" "$text"
  mkdir -p "$dir/lanes/$1"
  printf -- '- %s %s\n' "$now" "${2:-}" >> "$dir/lanes/$1/reports.md"
  ev_append "$dir" report "$1" "$(jq -nc --arg t "${2:-}" '{text:$t}')"
  office lane-state "$1" auto
  echo OK
}

PCT_DEF='def wsum: map(.weight // 1) | add // 0;
         def lpct: (.items // []) as $it | ($it | wsum) as $t | ($it | map(select(.done == true)) | wsum) as $d
                   | {d: $d, t: $t, p: (if $t > 0 then ($d * 100 / $t | floor) else 0 end)};'

cmd_item_done() {
  [ $# -eq 2 ] || usage
  lane_exists "$1"
  local f; f="$(state_file_checked)"
  [ "$(jq -r --arg l "$1" --arg i "$2" '[.lanes[$l].items[]? | select((.id | tostring) == $i)] | length' "$f")" -gt 0 ] \
    || coord_die 2 "없는 항목: $1 $2"
  st_update --arg l "$1" --arg i "$2" '(.lanes[$l].items[] | select((.id | tostring) == $i) | .done) = true' || exit 4
  ev_append "$(run_dir)" item-done "$1" "$(jq -nc --arg i "$2" '{item:$i}')"
  office lane-state "$1" auto
  jq -r --arg l "$1" "$PCT_DEF"' .lanes[$l] | lpct | "PROGRESS \($l) \(.p)%"' "$f"
}

cmd_progress() {
  local f; f="$(state_file_checked)"
  jq -r "$PCT_DEF"' [.lanes | to_entries[] | {k: .key} + (.value | lpct)] as $L
    | ($L[] | "PROGRESS \(.k) \(.p)% \(.d)/\(.t)"),
      (($L | map(.d) | add // 0) as $d | ($L | map(.t) | add // 0) as $t
       | "PROGRESS ALL \(if $t > 0 then ($d * 100 / $t | floor) else 0 end)%")' "$f"
}

cmd_hold() {
  [ $# -ge 2 ] || usage
  lane_exists "$1"
  if [ "$2" = "-" ]; then
    st_update --arg l "$1" '.lanes[$l].hold = null' || exit 4
    ev_append "$(run_dir)" hold-release "$1"
  else
    if [ -n "${3:-}" ] && [ -z "$(coord_iso_to_epoch_loose "$3")" ]; then coord_die 2 "until 시각 형식 오류: $3"; fi
    st_update --arg l "$1" --arg r "$2" --arg u "${3:-}" '.lanes[$l].hold = {reason: $r, until: (if $u == "" then null else $u end)}' || exit 4
    ev_append "$(run_dir)" hold "$1" "$(jq -nc --arg r "$2" --arg u "${3:-}" '{reason:$r, until:(if $u == "" then null else $u end)}')"
  fi
  office lane-state "$1" auto
  echo OK
}

cmd_summary() {
  local f dir out
  f="$(state_file_checked)"; dir="${f%/*}"; out="$dir/summary.md"
  jq -r --arg now "$(coord_now_iso)" "$PCT_DEF"'
    def v: if . == null or . == "" then "-" else tostring end;
    def hm: if . == null or . == "" then "-" else (tostring | capture("T(?<h>[0-9]{2}:[0-9]{2})").h // tostring) end;
    def holdtxt: if . == null then "-" else (.reason + (if .until then " (~" + (.until | hm) + ")" else "" end)) end;
    [.lanes | to_entries[] | {k: .key} + (.value | lpct)] as $L
    | ($L | map(.d) | add // 0) as $D | ($L | map(.t) | add // 0) as $T
    | "# 조정 회차 \(.run.id) 요약",
      "",
      "- 갱신: \($now) (coord-state.sh summary 자동 생성)",
      "- 목표: \(.run.goal | v)",
      "- 규칙 문서: \(.run.rules_doc | v)",
      "- 통합 브랜치: \(.run.integration_branch | v)",
      "- 조정자: \(.run.coordinator.name | v) (session \(.run.coordinator.session_id | v))",
      "- 전체 진도: \(if $T > 0 then ($D * 100 / $T | floor) else 0 end)% (\($D)/\($T))",
      "",
      "## 레인",
      "",
      "| 레인 | 세션 | 상태 | 진도 | hold | 마지막 보고 | 마지막 지시 | ctx |",
      "|---|---|---|---|---|---|---|---|",
      (.lanes | to_entries[] | .key as $k | .value as $l | ($l | lpct) as $p
        | "| \($k) | \($l.session.name | v) | \($l.state | v) | \($p.p)% (\($p.d)/\($p.t)) | \($l.hold | holdtxt) | \($l.last_report_at | hm) | \($l.last_instr_at | hm) | \(if $l.ctx then "\($l.ctx.pct)%" else "-" end) |"),
      "",
      "## 레인별 항목",
      (.lanes | to_entries[] | .key as $k | .value as $l
        | "", "### \($k) — \($l.branch | v) · \($l.worktree | v)",
          (if ($l.items // []) == [] then "- (항목 없음)" else ($l.items[] | "- [\(if .done then "x" else " " end)] \(.id) \(.title // "") (가중치 \(.weight // 1))") end),
          (if ($l.queue // []) != [] then "- 다음 할 일: \($l.queue | map(tostring) | join(", "))" else empty end)),
      "",
      "## 머지",
      "",
      "- 진행 중: \(if .merge.in_flight then "\(.merge.in_flight.lane) \(.merge.in_flight.branch | v) (허가 \(.merge.in_flight.granted_at | hm))" else "없음" end)",
      "- 대기열: \(if (.merge.queue // []) == [] then "없음" else (.merge.queue | map(if type == "object" then (.lane // tostring) else tostring end) | join(", ")) end)",
      (if (.merge.history // []) == [] then "- 이력: 없음" else ("- 이력(최근 5):", (.merge.history[-5:][] | "  - \(.lane // "-") \(.branch // "") merged=\(.merged | v) cleaned=\(.cleaned | v)")) end),
      "",
      "## 창",
      "",
      (if (.windows // []) == [] then "- 없음" else (.windows[] | "- \(.kind) lane=\(.lane | v) until=\(.until | v)") end),
      "",
      "## 사용량 띠",
      "",
      "- \(.usage.band | v) (5시간 \(.usage.five | v)% · 1주 \(.usage.week | v)%, 출처 \(.usage.src | v), \(.usage.at | v))",
      "",
      "## 사용자 결정 대기",
      "",
      (if (.pending_user // []) == [] then "- 없음" else (.pending_user[] | "- \(.at | v) \(.text)") end),
      "",
      "## 최근 결정",
      "",
      (if (.decisions // []) == [] then "- 없음" else (.decisions[-10:][] | "- \(.at | v) \(.text)") end)
  ' "$f" | atomic_write "$out" || coord_die 4 "summary.md 쓰기 실패"
  echo "$out"
}

[ $# -ge 1 ] || usage
sub="$1"; shift
case "$sub" in
  init) cmd_init "$@" ;;
  use) cmd_use "$@" ;;
  get) cmd_get "$@" ;;
  set) cmd_set "$@" ;;
  set-many) cmd_set_many "$@" ;;
  lane-add) cmd_lane_add "$@" ;;
  event) cmd_event "$@" ;;
  instr) cmd_instr "$@" ;;
  ack) cmd_ack "$@" ;;
  report) cmd_report "$@" ;;
  item-done) cmd_item_done "$@" ;;
  progress) cmd_progress ;;
  hold) cmd_hold "$@" ;;
  close-run) cmd_close_run "$@" ;;
  summary) cmd_summary ;;
  -h|--help|help) sed -n '2,23p' "$0" >&2; exit 0 ;;
  *) usage ;;
esac
