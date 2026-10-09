#!/usr/bin/env bash
# 사용법: ctx-usage.sh <session-id> | --pid <pid> | --lane <레인>  [--window N]   (정본: ../references/contract.md §3.3, 설계 §3.j-1)
# stdout 한 줄: `CTX <session-id> tokens=<n> window=<n> pct=<n> src=transcript|dump at=<iso>` 또는 `CTX <id> unknown <사유>`
# 읽는 순서
#   1) <state_dir>/ctx/<session-id>.json 덤프({at,session_id,context_window,rate_limits})가 30분 안이면 그것(src=dump)
#   2) transcript <claude_projects_dir>/<프로젝트 폴더>/<session-id>.jsonl 에서 isSidechain 이 아닌 마지막 assistant 메시지의
#      message.usage.input_tokens + cache_read_input_tokens + cache_creation_input_tokens (src=transcript).
#      파일 끝부분만 tail 로 읽고, 못 찾으면 범위를 넓혀 다시 읽는다. 프로젝트 폴더는 세션 cwd 의 / · . 를 - 로 바꾼 이름,
#      cwd 를 모르면 <claude_projects_dir>/*/<session-id>.jsonl 로 찾는다.
# 창 크기: --window → (덤프의 context_window_size) → state lanes.<레인>.session.window → compact.default_window.
set -uo pipefail
_SD="${0%/*}"; [ "$_SD" != "$0" ] || _SD=.
. "$_SD/lib/js-bridge.sh"; if _jsb_on CTX_USAGE; then _jsb_exec "$_SD/ctx-usage" "$@"; fi   # node 판(스위치 COORD_JS_CTX_USAGE)
# shellcheck source=lib/common.sh
. "$(dirname "$0")/lib/common.sh"
coord_default_repo

usage() { coord_die 2 "사용법: ctx-usage.sh <session-id> | --pid <pid> | --lane <레인> [--window N]"; }

sid="" pid="" lane="" win=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pid) pid="${2:-}"; [ -n "$pid" ] || usage; shift ;;
    --lane) lane="${2:-}"; [ -n "$lane" ] || usage; shift ;;
    --window) win="${2:-}"; case "$win" in ""|*[!0-9]*) usage ;; esac; shift ;;
    -h|--help) sed -n '2,11p' "$0" >&2; exit 0 ;;
    -*) usage ;;
    *) [ -z "$sid" ] || usage; sid="$1" ;;
  esac
  shift
done
[ -n "$sid$pid$lane" ] || usage

isnum() { case "${1:-}" in ""|null|*[!0-9]*) return 1 ;; esac; return 0; }

state_win="" sfile=""
if [ -n "$lane" ]; then
  coord_has_run || coord_die 3 "현재 회차가 없다(--lane 은 회차가 필요하다)"
  sid="$(coord_lane_get "$lane" .session.session_id)"
  pid="$(coord_lane_get "$lane" .session.pid)"
  state_win="$(coord_lane_get "$lane" .session.window)"
  sfile="$(coord_session_file "$pid" "$sid" 2>/dev/null || true)"
elif [ -n "$pid" ]; then
  sfile="$(coord_session_file "$pid" "" 2>/dev/null || true)"
  [ -n "$sfile" ] || { echo "CTX pid:$pid unknown no-session-file"; exit 0; }
else
  sfile="$(coord_session_file "" "$sid" 2>/dev/null || true)"
fi
# 세션 파일이 있으면 그 sessionId 가 정본(/clear 뒤 바뀐다)
if [ -n "$sfile" ]; then
  s="$(jq -r '.sessionId // empty' "$sfile" 2>/dev/null)"; [ -n "$s" ] && sid="$s"
fi
[ -n "$sid" ] && [ "$sid" != null ] || { echo "CTX ${lane:-pid:$pid} unknown no-session-id"; exit 0; }
# session-id·pid 모드: 회차가 있으면 그 세션을 가진 레인의 창 크기를 쓴다
if [ -z "$state_win" ] && coord_has_run; then
  state_win="$(jq -r --arg s "$sid" '[.lanes[] | select(.session.session_id == $s) | .session.window] | map(select(. != null)) | .[0] // empty' \
    "$(coord_state_file)" 2>/dev/null)"
fi
isnum "$state_win" || state_win=""
def_win="$(coord_cfg .compact.default_window)"; isnum "$def_win" || def_win=200000
now="$(coord_now_epoch)"

emit() { # <tokens> <window> <src> <at-epoch>
  local pct; pct="$(awk -v t="$1" -v w="$2" 'BEGIN { printf "%d", (w > 0 ? t * 100 / w + 0.5 : 0) }')"
  echo "CTX $sid tokens=$1 window=$2 pct=$pct src=$3 at=$(coord_epoch_to_iso "$4")"
  exit 0
}

# 1) 덤프
dump="$(coord_state_root)/ctx/$sid.json"
if [ -f "$dump" ]; then
  row="$(jq -r '
    (.at | if type == "number" then (if . > 100000000000 then (. / 1000 | floor) else floor end) else . end) as $at
    | (.context_window // {}) as $cw | ($cw.current_usage // null) as $cu | ($cw.context_window_size // null) as $sz
    | (if $cu != null then (($cu.input_tokens // 0) + ($cu.cache_read_input_tokens // 0) + ($cu.cache_creation_input_tokens // 0))
       elif ($cw.used_percentage != null and $sz != null) then ($cw.used_percentage * $sz / 100 | floor)
       else null end) as $tok
    | [($at | tostring), ($tok // "" | tostring), ($sz // "" | tostring)] | @tsv' "$dump" 2>/dev/null)"
  d_at="$(printf '%s' "$row" | cut -f1)"; d_tok="$(printf '%s' "$row" | cut -f2)"; d_sz="$(printf '%s' "$row" | cut -f3)"
  isnum "$d_at" || d_at="$(coord_iso_to_epoch "$d_at")"
  if isnum "$d_at" && isnum "$d_tok" && [ $((now - d_at)) -le 1800 ]; then
    w="$win"; isnum "$w" || w="$d_sz"; isnum "$w" || w="$state_win"; isnum "$w" || w="$def_win"
    emit "$d_tok" "$w" dump "$d_at"
  fi
fi

# 2) transcript
proj="$(coord_expand "$(coord_cfg .claude_projects_dir)")"
tf=""
if [ -n "$sfile" ]; then
  cwd="$(jq -r '.cwd // empty' "$sfile" 2>/dev/null)"
  if [ -n "$cwd" ]; then
    cand="$proj/$(printf '%s' "$cwd" | sed 's#[/.]#-#g')/$sid.jsonl"
    [ -f "$cand" ] && tf="$cand"
  fi
fi
if [ -z "$tf" ]; then
  for cand in "$proj"/*/"$sid.jsonl"; do [ -f "$cand" ] && { tf="$cand"; break; }; done
fi
[ -n "$tf" ] || { echo "CTX $sid unknown no-transcript"; exit 0; }

size="$(wc -c < "$tf" | tr -d ' ')"
last=""
for n in 262144 2097152 16777216 0; do
  if [ "$n" -eq 0 ] || [ "$n" -ge "$size" ]; then src_cmd=(cat "$tf"); else src_cmd=(tail -c "$n" "$tf"); fi
  last="$("${src_cmd[@]}" | jq -rR 'fromjson? | select(type == "object" and .type == "assistant" and (.isSidechain != true)
           and (.message.usage? != null) and ((.message.model // "") != "<synthetic>"))
         | .message.usage as $u
         | [.timestamp, (($u.input_tokens // 0) + ($u.cache_read_input_tokens // 0) + ($u.cache_creation_input_tokens // 0))]
         | select(.[1] > 0) | @tsv' 2>/dev/null | tail -1)"
  [ -n "$last" ] && break
  { [ "$n" -eq 0 ] || [ "$n" -ge "$size" ]; } && break
done
[ -n "$last" ] || { echo "CTX $sid unknown no-usage"; exit 0; }
t_at="$(coord_iso_to_epoch "$(printf '%s' "$last" | cut -f1)")"
t_tok="$(printf '%s' "$last" | cut -f2)"
w="$win"; isnum "$w" || w="$state_win"; isnum "$w" || w="$def_win"
emit "$t_tok" "$w" transcript "${t_at:-$now}"
