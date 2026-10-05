#!/usr/bin/env bash
# 레인 화면의 확인·선택 창에 판정표대로 자동 응답한다. 정본: ../references/approvals.md, ../references/contract.md §3.5
# 사용법: auto-answer.sh (--lane <레인> | --handle <h>) [--dry-run]
#   stdout 한 줄:
#     NONE <h>                                   창 없음
#     ANSWER <h> <kind> <보낸 키> <사유>          자동 응답함(dry-run 이면 앞에 DRY)
#     DENY <h> <kind> <사유>                      거부(Esc)함
#     ESCALATE <h> <kind> <사유>                  조정자 판단 필요(판단 올리기 또는 사용자에게). 아무것도 보내지 않음
#   kind: trust · usage-limit · permission · question · choice
#   권한 창 범주는 조정자가 띄운 세션(spawned_by=coordinator)이면 approvals.auto_allow_spawned, 아니면 approvals.auto_allow.
#   거부 칸(삭제·push·공용 DB 쓰기·서버 종료·권한 설정·비밀값)은 늘 거부한다. 판정은 approvals 기록과 이벤트에 남긴다.
set -uo pipefail
source "$(dirname "$0")/lib/common.sh"
source "$(dirname "$0")/lib/term.sh"

h="" lane="" dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --lane) lane="$2"; shift ;;
    --handle) h="$2"; shift ;;
    --dry-run) dry=1 ;;
    -h|--help) sed -n 2,12p "$0"; exit 0 ;;
    *) coord_die 2 "알 수 없는 인자: $1" ;;
  esac
  shift
done
spawned=0 wt=""
if [ -n "$lane" ]; then
  h="$(coord_lane_get "$lane" .session.handle 2>/dev/null)"
  [ "$(coord_lane_get "$lane" .session.spawned_by 2>/dev/null)" = coordinator ] && spawned=1
  wt="$(coord_lane_get "$lane" .worktree 2>/dev/null)"
fi
[ -n "$h" ] && [ "$h" != null ] || coord_die 2 "handle 이 없다(--handle 또는 state 의 session.handle)"

screen="$(term_read_screen "$h" 80)" || coord_die 4 "화면을 읽지 못했다: $h"
kind="$(printf '%s\n' "$screen" | coord_screen_prompt_kind)"
[ -n "$kind" ] || { echo "NONE $h"; exit 0; }
bottom="$(printf '%s\n' "$screen" | tail -30)"

# 선택지 번호 찾기: 패턴에 맞는 첫 「N. 글」 줄의 N
opt_num() { printf '%s\n' "$bottom" | grep -E "^[[:space:]]*(❯|>)?[[:space:]]*[0-9]+\.[[:space:]].*($1)" | head -1 | sed -E 's/^[^0-9]*([0-9]+)\..*/\1/'; }

record() { # decision category cmd why
  coord_has_run || return 0
  local rec; rec="$(jq -cn --arg at "$(coord_now_iso)" --arg lane "${lane:-$h}" --arg d "$1" --arg c "$2" --arg cmd "$3" --arg why "$4" \
    '{at:$at,lane:$lane,decision:$d,category:$c,cmd:($cmd|.[0:300]),why:$why}')"
  local cur; cur="$(coord_state '.approvals // []' 2>/dev/null)"; [ -n "$cur" ] || cur='[]'
  coord_state_call set '.approvals' "$(printf '%s' "$cur" | jq -c --argjson r "$rec" '. + [$r]')" >/dev/null
  coord_state_call event approval "${lane:--}" "$rec" >/dev/null
}

send_key() { # key(숫자 또는 esc) — 보내기 직전 같은 창인지 다시 확인한다
  local now; now="$(term_read_screen "$h" 80 | coord_screen_prompt_kind)"
  [ "$now" = "$kind" ] || { coord_log "창이 바뀌어 보내지 않음($kind → ${now:-없음})"; return 1; }
  local text="$1"; [ "$1" = esc ] && text=$'\e'
  if [ "$dry" = 1 ]; then coord_log "DRY term_send $h $1"; return 0; fi
  term_send "$h" "$text" >/dev/null
  sleep 3
  now="$(term_read_screen "$h" 80 | coord_screen_prompt_kind)"
  [ "$now" = "$kind" ] && coord_log "경고: 응답 뒤에도 창이 남아 있다($h)"
  return 0
}
out() { if [ "$dry" = 1 ]; then echo "DRY $*"; else echo "$*"; fi; }

case "$kind" in
  trust)
    # 리포(메인 체크아웃 또는 그 워크트리) 안에서 뜬 신뢰 확인만 승인한다.
    repo="$(coord_repo)"; here="$(term_list | awk -F'\t' -v h="$h" '$1==h{print $3}')"
    case "${here:-$wt}" in
      "$repo"|"$repo"/*) n="$(opt_num 'Yes')"; [ -n "$n" ] || n=1
        send_key "$n" && { record allow trust "" "repo 안 폴더"; out "ANSWER $h trust $n repo-folder"; } ;;
      *) record user trust "" "repo 밖 폴더: ${here:-?}"; echo "ESCALATE $h trust outside-repo" ;;
    esac ;;

  usage-limit)
    # 기다리기 쪽만 고른다. 지출 한도 조정·업그레이드·계정 전환은 고르지 않는다. 못 찾으면 Esc(창 닫기)도 하지 않고 올린다.
    n="$(opt_num 'Wait for limit to reset|Wait here|Stop and wait')"
    if [ -n "$n" ]; then
      send_key "$n" && { record allow usage-limit "" "기다리기 선택"; out "ANSWER $h usage-limit $n wait"; }
    else record user usage-limit "" "기다리기 선택지 없음"; echo "ESCALATE $h usage-limit no-wait-option"; fi ;;

  permission)
    cmd="$(printf '%s\n' "$screen" | awk '/Do you want to proceed\?/{exit} f{print} /(Bash command|Edit file|Write file|Read file|Fetch|command)$/{f=1}' | sed 's/^[[:space:]│]*//;s/[[:space:]│]*$//' | grep -v '^$')"
    [ -n "$cmd" ] || cmd="$(printf '%s\n' "$bottom" | grep -v -E 'Do you want|❯|^[[:space:]]*[0-9]\.|Esc to cancel' | tail -8)"
    if [ "$spawned" = 1 ]; then allow="$(coord_cfg_json '.approvals.auto_allow_spawned // []')"; else allow="$(coord_cfg_json '.approvals.auto_allow // []')"; fi
    flat="$(printf '%s' "$cmd" | tr '\n' ' ')"
    # 거부 칸
    if printf '%s' "$flat" | grep -qiE '(^|[^a-z])rm[[:space:]]+-[a-z]*[rf]|git[[:space:]]+(branch[[:space:]]+-D|push|reset[[:space:]]+--hard|clean[[:space:]]+-[a-z]*f)|worktree[[:space:]]+remove[[:space:]]+.*--force|--force-with-lease|(^|[^a-z])(DROP|TRUNCATE)[[:space:]]|DELETE[[:space:]]+FROM|(^|[^a-z])(kill|pkill|killall|shutdown|reboot)[[:space:]]|chmod|chown|sudo|settings(\.local)?\.json|\.coord(\.local)?\.json|(ANTHROPIC|API|AUTH)_?(KEY|TOKEN)|security[[:space:]]+find-generic-password|curl[[:space:]].*-X[[:space:]]*(POST|PUT|DELETE|PATCH)|bootRun|local-run\.sh'; then
      send_key esc && { record deny deny-table "$flat" "거부 칸"; out "DENY $h permission deny-table"; }
      exit 0
    fi
    # 범주 판정: 조각마다 범주를 매기고, 하나라도 허용 밖·모름이면 올린다
    cats=""; unknown=0
    while IFS= read -r seg; do
      seg="$(printf '%s' "$seg" | sed 's/^[[:space:](]*//')"; [ -n "$seg" ] || continue
      c=""
      case "$seg" in
        git\ status*|git\ log*|git\ diff*|git\ show*|git\ branch\ --list*|git\ worktree\ list*|git\ rev-parse*|*--version*|ps\ *|uptime*|orca\ terminal\ list*|orca\ terminal\ read*|orca\ terminal\ show*|*heavy.sh\ status*|*heavy.sh\ snapshot*|date*|pwd*|echo\ *|which\ *) c=status ;;
        cat\ *|head\ *|tail\ *|ls*|grep\ *|rg\ *|find\ *|wc\ *|sed\ -n*|jq\ *|stat\ *|file\ *|sort*|uniq*|awk\ *|cut\ *|diff\ *) c=read ;;
        git\ add*|git\ commit*) c=commit-own ;;
        sed\ -i*|perl\ -i*|tee\ *|mkdir\ *|touch\ *|cp\ *|mv\ *) c=edit-own ;;
        *heavy.sh*|*gradlew*|*gradle\ *|npm\ test*|npm\ run\ test*|npm\ run\ build*|npx\ vitest*|npx\ tsc*|npx\ tsup*|pnpm\ *|yarn\ *|*vitest*|*playwright\ test*) c=heavy-build ;;
      esac
      if [ -z "$c" ]; then unknown=1; break; fi
      printf '%s' "$allow" | jq -e --arg c "$c" 'index($c) != null' >/dev/null || { unknown=1; c="$c(허용 밖)"; break; }
      cats="$cats $c"
    done < <(printf '%s\n' "$cmd" | sed -E 's/(&&|\|\||;|\|)/\n/g')
    if [ "$unknown" = 0 ] && [ -n "$cats" ]; then
      n="$(opt_num 'Yes')"; [ -n "$n" ] || n=1
      send_key "$n" && { record allow "${cats# }" "$flat" "판단표 허용 범주"; out "ANSWER $h permission $n ${cats# }"; }
    else
      record user "${c:-unknown}" "$flat" "판단표에 확실히 들지 않음"
      echo "ESCALATE $h permission ${c:-unknown}"
    fi ;;

  question|choice)
    # 레인 모델이 사람에게 묻는 선택 창. 삭제·사용자 결정에 닿으면 사용자에게, (Recommended) 가 있으면 그것을 고른다.
    if printf '%s\n' "$bottom" | grep -qiE '삭제|delete|drop|force|push|배포|deploy|비밀|secret|token'; then
      record user "$kind" "" "사용자 결정 항목"; echo "ESCALATE $h $kind user-decision"
    else
      n="$(opt_num '\(Recommended\)|\(권장\)|\(추천\)')"
      if [ -n "$n" ]; then
        send_key "$n" && { record allow "$kind" "" "권장 선택지"; out "ANSWER $h $kind $n recommended"; }
      else record user "$kind" "" "권장 선택지 없음"; echo "ESCALATE $h $kind no-recommended"; fi
    fi ;;
esac
exit 0
