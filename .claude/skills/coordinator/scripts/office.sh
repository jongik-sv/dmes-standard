#!/usr/bin/env bash
# 사용법: office.sh lead-up | lane-up <레인> | lane-state <레인> <상태|auto> | lane-down <레인> | beat | finish
#   조정 세션(팀장)과 레인(팀원)을 wbs-web 에이전트 오피스에 「표시 전용」으로 보인다(정본: ../references/contract.md §4).
#   표시 경로는 `dflow.sh watch`(POST /api/v1/agent/watch) 하나뿐이다. WBS 데이터(작업·lease·진도율)는 건드리지 않는다.
#   lead-up              팀장 등록: agent `<신원>/<host>/coord:<run-id>`, slots=살아 있는(closed 아닌) 레인 수, busy=작업 중(머지 중 포함) 레인 수
#   lane-up <레인>       팀원 등록(같은 키여도 늘 보낸다): agent `<신원>/<host>/임시:<레인>·<지시 요약>`, until=상태 라벨. 이어 팀장 갱신
#   lane-state <레인> <상태>  상태 라벨(작업 중|대기|머지 중|끝|auto) 갱신. auto = state.json 에서 판정. 같은 값이면 보내지 않는다
#   lane-down <레인>     기록된 키로 `watch --stop` 하고 기록을 지운다. 이어 팀장 갱신
#   beat                 하트비트: 팀장과 살아 있는 레인 전원을 state.json 기준으로 다시 보낸다(키가 바뀌었으면 옛 키 stop 뒤 새 키).
#                        끝난(closed) 레인·state 에서 사라진 레인은 stop. tick.sh 끝에서 부른다
#   finish               팀장·팀원 키를 모두 stop 하고 기록을 비운다(회차 마감). 이후 이 회차의 다른 호출은 무시한다(.office.finished)
#   키 기록: state.json `.office.sent["<레인>"]`(마지막에 보낸 agent 키), 팀장은 `.office.sent["_lead"]`.
#   설정: office.enabled · office.project_id · office.label_max · office.dflow_script (contract §1.2)
#   실패 정책: 어떤 실패도 종료 코드 0(사용법 오류만 2). 경고는 stderr 한 줄, 호출당 5초 제한.
#   dflow 설정(PAT)이 로드되지 않거나 dflow.sh 가 없거나 enabled=false 이면 아무 출력 없이 건너뛴다. COORD_DRY=1 이면 보내지 않는다.
OFFICE_RC=0
trap 'exit "${OFFICE_RC:-0}"' EXIT
set -uo pipefail
. "$(dirname "$0")/lib/common.sh"
coord_default_repo

OFFICE_TIMEOUT_S=5
usage() { coord_log "사용법: office.sh lead-up | lane-up <레인> | lane-state <레인> <상태|auto> | lane-down <레인> | beat | finish"; OFFICE_RC=2; exit 2; }
warn() { coord_log "office: $*"; }

[ $# -ge 1 ] || usage
sub="$1"; shift
case "$sub" in
  lead-up|beat|finish) [ $# -eq 0 ] || usage ;;
  lane-up|lane-down) [ $# -eq 1 ] || usage ;;
  lane-state) [ $# -eq 2 ] || usage ;;
  -h|--help|help) sed -n '2,17p' "$0" >&2; exit 0 ;;
  *) usage ;;
esac

# ---- 건너뛸 조건(모두 무출력) ------------------------------------------------
[ "$(coord_cfg_json '.office.enabled' 2>/dev/null)" = true ] || exit 0
[ "${COORD_DRY:-0}" = 1 ] && { coord_log "DRY office.sh $sub $*"; exit 0; }
coord_has_run || exit 0
SF="$(coord_state_file)"
# 마감(finish)한 회차는 이후 report·hold 훅이 오피스에 다시 등록하지 않게 한다.
# finish·beat 만 통과한다 — beat 는 마감 뒤에도 .office.sent 에 남은 키(finish 때 stop 이 실패한 것)만 마저 내린다.
FINISHED=0; [ "$(jq -r '.office.finished // false' "$SF" 2>/dev/null)" = true ] && FINISHED=1
[ "$FINISHED" = 0 ] || case "$sub" in finish|beat) ;; *) exit 0 ;; esac
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
# 설정은 스킬 폴더(심링크)가 아니라 리포 루트에서 읽는다(스킬 폴더에서 읽으면 다른 리포 PAT 로 404). 이미 지정돼 있으면 그대로.
DCD="${DFLOW_CONFIG_DIR:-$REPO}"

TMPD="$(mktemp -d "${TMPDIR:-/tmp}/coord-office.XXXXXX" 2>/dev/null)" || exit 0
trap 'rm -rf "$TMPD"; exit "${OFFICE_RC:-0}"' EXIT

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
  : > "$TMPD/out"; : > "$TMPD/err"; rm -f "$TMPD/timeout" "$TMPD/done"
  ( cd "$REPO" 2>/dev/null && DFLOW_CONFIG_DIR="$DCD" exec bash "$DFLOW" "$@" ) >"$TMPD/out" 2>"$TMPD/err" </dev/null &
  pid=$!
  ( sleep "$OFFICE_TIMEOUT_S"; [ -f "$TMPD/done" ] && exit 0; : > "$TMPD/timeout"; kill_tree "$pid" ) >/dev/null 2>&1 &
  wd=$!
  wait "$pid" 2>/dev/null; rc=$?
  : > "$TMPD/done"   # 감시자가 sleep 을 잃고 깨어나도 시간 초과로 오인하지 않게
  pkill -P "$wd" 2>/dev/null; kill "$wd" 2>/dev/null; wait "$wd" 2>/dev/null
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
    else "작업 중" end;'
st() { jq -r "$@" "$SF"; }
lane_exists() { [ "$(st --arg l "$1" '.lanes | has($l)')" = true ]; }
auto_label() { st --arg l "$1" "$LABEL_JQ"' lbl($l)'; }
# 값 기록은 늘 coord-state.sh 로(state.json 은 그 스크립트만 쓴다).
rec() { bash "$COORD_SCRIPTS_DIR/coord-state.sh" set "$1" "$2" >/dev/null 2>&1 || warn "state 기록 실패: $1"; }
sent_key() { st --arg l "$1" '.office.sent[$l] // empty'; }
sent_label() { st --arg l "$1" '.office.label[$l] // empty'; }

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
# 팀장 agent 키: <신원>/<host>/coord:<run-id>. run-id 의 슬래시·개행·공백은 뺀다. 전체 120(UTF-16) 이내.
lead_key() {  # lead_key <ident>
  jq -rn --arg id "$1" --argjson max "$KEY_MAX" --slurpfile s "$SF" "$U16_JQ"'
    ($s[0].run.id // "" | tostring | gsub("[/\r\n\t ]"; "")) as $rid
    | ($id + "/coord" + (if $rid == "" then "" else ":" + $rid end)) | trunc16($max)'
}
# 팀원 agent 키: <신원>/<host>/임시:<레인>·<지시 요약>. 요약은 label_max 자 이내, 키 전체와 머리 부분은 120 이내.
lane_key() {  # lane_key <ident> <레인>
  jq -rn --arg id "$1" --arg lane "$2" --argjson max "$LABEL_MAX" --argjson kmax "$KEY_MAX" --argjson lmax "$LANE_NAME_MAX" \
    --slurpfile s "$SF" "$U16_JQ"'
    ($s[0].lanes[$lane] // {}) as $l
    | ([$l.brief, $l.goal, $l.title, (($l.memo // "") | split("\n")[0])]
       | map(select(. != null and . != "") | tostring) | .[0] // "") as $raw
    | ($raw | gsub("[\r\n\t]+"; " ") | gsub("/"; "") | gsub("^ +| +$"; "") | gsub(" +"; " ")) as $sum
    | (($id + "/임시:" + ($lane | trunc16($lmax))) | trunc16($kmax)) as $head
    | (([$max, ($kmax - ($head | u16) - 1)] | min) as $room
       | if $sum == "" or $room <= 0 then $head
         else ($sum | trunc16($room) | gsub(" +$"; "")) as $cut | if $cut == "" then $head else $head + "·" + $cut end end)'
}

# 팀장 갱신. 인자: [제외할 레인]. 같은 slots/busy 이면 force 가 아닐 때 보내지 않는다.
FORCE=0
send_lead() {
  local excl="${1:-}" id key slots busy sig old
  [ "$ABORT" = 0 ] || return 1
  need_ident || return 1
  id="$IDENT"; key="$(lead_key "$id")"
  read -r slots busy < <(st --arg x "$excl" "$LABEL_JQ"'
    . as $r | [$r.lanes | keys[] | select(. != $x) | . as $k | {k: $k, l: ($r | lbl($k))}] as $A
    | [$A[] | select(.l != "끝")] as $alive
    | "\($alive | length) \([$alive[] | select(.l == "작업 중" or .l == "머지 중")] | length)"')
  sig="$slots,$busy"
  old="$(sent_key _lead)"
  if [ "$FORCE" = 0 ] && [ "$old" = "$key" ] && [ "$(st '.office.lead // empty')" = "$sig" ]; then return 0; fi
  local args=(--agent "$key" --slots "${slots:-0}" --busy "${busy:-0}")
  [ -n "$PROJECT" ] && args+=(--project "$PROJECT")
  # 키가 바뀌었으면(회차·신원·host 또는 옛 형식) 옛 키를 먼저 내린다. 못 내렸으면 새 키를 보내지 않고 옛 기록을 둔다(서버 stop 은 멱등).
  if [ -n "$old" ] && [ "$old" != "$key" ]; then watch_call "stop $old" --agent "$old" --stop || return 1; fi
  watch_call "팀장 $key" "${args[@]}" || return 1
  rec '.office.sent["_lead"]' "$(jq -nc --arg k "$key" '$k')"
  rec '.office.lead' "$(jq -nc --arg s "$sig" '$s')"
}

# 기록된 키로 stop 하고 기록을 지운다. 인자: <레인>. 기록이 없으면 0.
stop_lane() {
  local lane="$1" old; old="$(sent_key "$lane")"
  [ -n "$old" ] || return 0
  watch_call "stop $old" --agent "$old" --stop || return 1
  rec ".office.sent[$(jq -nc --arg l "$lane" '$l')]" null
  rec ".office.label[$(jq -nc --arg l "$lane" '$l')]" null
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
  if [ "$FORCE" = 0 ] && [ "$old" = "$key" ] && [ "$oldlbl" = "$label" ]; then return 0; fi
  # 지시 요약이 바뀌어 키가 달라졌으면 옛 키를 먼저 내린다(안 내리면 화면에 같은 레인이 둘 보인다).
  # stop 이 실패하면 새 키를 보내지 않고 옛 기록을 둔다(다음 beat 가 다시 시도, 서버 stop 은 멱등).
  if [ -n "$old" ] && [ "$old" != "$key" ]; then watch_call "stop $old" --agent "$old" --stop || return 1; fi
  local args=(--agent "$key" --until "$label")
  [ -n "$PROJECT" ] && args+=(--project "$PROJECT")
  watch_call "팀원 $key" "${args[@]}" || return 1
  rec ".office.sent[$(jq -nc --arg l "$lane" '$l')]" "$(jq -nc --arg k "$key" '$k')"
  rec ".office.label[$(jq -nc --arg l "$lane" '$l')]" "$(jq -nc --arg s "$label" '$s')"
}

valid_label() { case "$1" in "작업 중"|"대기"|"머지 중"|"끝") return 0 ;; *) return 1 ;; esac; }

case "$sub" in
  lead-up) FORCE=1; send_lead ;;
  lane-up)
    lane_exists "$1" || exit 0
    [ "$(auto_label "$1")" != "끝" ] || { stop_lane "$1"; exit 0; }   # 끝난 레인은 올리지 않는다
    FORCE=1
    send_lane "$1" "$(auto_label "$1")"
    [ "$ABORT" = 0 ] && send_lead ;;
  lane-state)
    lane_exists "$1" || exit 0
    lab="$2"; [ "$lab" = auto ] && lab="$(auto_label "$1")"
    valid_label "$lab" || { coord_log "상태 라벨은 작업 중|대기|머지 중|끝|auto: $2"; exit 0; }
    send_lane "$1" "$lab"; [ "$ABORT" = 0 ] && send_lead ;;
  lane-down)
    stop_lane "$1" && send_lead "$1" ;;
  beat)
    if [ "$FINISHED" = 1 ]; then   # 마감 뒤: 남은 키만 내린다
      for L in $(st '(.office.sent // {}) | to_entries[] | select(.value != null and .key != "_lead") | .key'); do stop_lane "$L"; done
      old="$(sent_key _lead)"
      if [ -n "$old" ] && watch_call "stop $old" --agent "$old" --stop; then rec '.office.sent["_lead"]' null; rec '.office.lead' null; fi
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
    # 레인마다 ABORT 를 초기화해 모든 stop 을 시도한다(한 건의 시간 초과가 나머지를 막지 않게). 마감 표식은 늘 남기고,
    # stop 이 실패한 키는 기록에 남아 이후 beat 가 마저 내린다.
    for L in $(st '(.office.sent // {}) | to_entries[] | select(.value != null and .key != "_lead") | .key'); do ABORT=0; stop_lane "$L"; done
    ABORT=0
    old="$(sent_key _lead)"
    if [ -n "$old" ] && watch_call "stop $old" --agent "$old" --stop; then
      rec '.office.sent["_lead"]' null; rec '.office.lead' null
    fi
    rec '.office.finished' true ;;
esac
exit 0
