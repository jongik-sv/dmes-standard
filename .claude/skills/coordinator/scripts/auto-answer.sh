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
#   거부 칸(삭제·레인 세션의 push·공용 DB 쓰기·서버 종료·권한 설정·비밀값)은 늘 거부한다. 판정은 approvals 기록과 이벤트에 남긴다.
#   판정에 쓴 화면(80줄 원문)의 창 지문(console_full_sha — 폴러·judge-sha 의 41줄과 같은 창이면 같은 값)을 기억했다가 레인 잠금을 얻은 뒤
#   다시 읽은 화면(보내기 바로 앞)과 비교해 다르면(같은 kind 의 다른 창 포함) 아무것도 보내지 않고 `NONE <h>` 로 끝낸다. 지문을 만들지
#   못하면(창 머리가 읽은 화면 위로 밀림 등) `ESCALATE <h> <kind> no-fingerprint`. 보낸 직후 잠금 안에서 입력 요청 기록이 판정한 창(같은
#   지문)일 때만 handled(auto)·소비를 남기고(console_input_mark_handled), 잠금을 푼 뒤 `console-poll.sh input-handled --expect-full` 로 알린다.
#   권한 창의 명령·질문·선택지는 지문과 같은 창 판정(console_window_json)의 창 안에서만 읽는다(창 밖 대화 기록은 보지 않는다).
#   허용은 질문 줄이 정확히 `Do you want to proceed?` 이고 도구 이름 줄이 `… command`(뒤 괄호 허용) 인 창만 — 그 밖의 권한 창은 거부 칸이면 DENY,
#   아니면 `ESCALATE <h> permission not-proceed|not-command|window-shape`. 창을 못 잡으면 `ESCALATE <h> permission no-fingerprint`.
#   trust·usage-limit·question·choice 도 같은 창(J_WIN.gen)만 본다: 창이 권한 창 모양(머리 다음 도구 이름 줄)·들여쓴 가로줄 머리·
#   선택지 블록 사이에 얕은 글 줄·질문 줄 없음이거나, 그 kind 의 확인 문구가 창의 머리~질문 줄(pre)에 없으면(trust 는 끝 쪽에 `No, exit`·
#   `trust this folder` 선택지도 필요) `ESCALATE <h> <kind> window-shape`. 선택지 번호는 창 블록의 선택지 줄에서만 고른다(trust 의 Yes 번호가
#   없으면 예전처럼 1 을 보내지 않고 `ESCALATE <h> trust no-yes-option`). 창을 못 잡으면 `ESCALATE <h> <kind> no-fingerprint`.
#   판단 올리기 기록의 cmd: 권한 창 모양 사유는 창 안 도구 이름 줄 아래 전부, 지문 없음은 화면 아래 30줄을 가린 것.
set -uo pipefail
_SD="${0%/*}"; [ "$_SD" != "$0" ] || _SD=.   # dirname 대신(프로세스 0개)
source "$_SD/lib/common.sh"
source "$_SD/lib/compat.sh"
source "$_SD/lib/term.sh"
coord_cfg_prime   # 설정을 서브셸 밖에서 한 번 읽어 둔다(coord_cfg 호출들이 jq 없이 물려받게)

h="" lane="" dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --lane) lane="$2"; shift ;;
    --handle) h="$2"; shift ;;
    --dry-run) dry=1 ;;
    -h|--help) sed -n '2,/^set -uo/p' "$0" | sed '$d'; exit 0 ;;
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
# 오피스 키 입력(console-poll.sh)과 레인 단위 잠금을 공유한다(contract §4.1 「키 입력 답하기」). --handle 만 주면 현재 회차에서
# 그 핸들의 레인을 찾는다(정확히 하나일 때). 라이브러리가 없으면 잠금 없이 예전처럼 동작한다.
LK_LANE="" AA_LIB=0
if [ -f "$COORD_LIB_DIR/console-redact.sh" ] && [ -f "$COORD_LIB_DIR/console-input.sh" ] \
   && . "$COORD_LIB_DIR/console-redact.sh" 2>/dev/null && . "$COORD_LIB_DIR/console-input.sh" 2>/dev/null; then AA_LIB=1; fi
if [ "$AA_LIB" = 1 ]; then
  if [ -n "$lane" ]; then LK_LANE="$lane"
  elif coord_has_run; then
    LK_LANE="$(jq -r --arg h "$h" '[(.lanes // {}) | to_entries[] | select(.value.session.handle == $h) | .key] | if length == 1 then .[0] else empty end' "$(coord_state_file)" 2>/dev/null)"
  fi
  console_input_ref_ok "$LK_LANE" || LK_LANE=""
fi

# 화면 지문: 창 지문(console_input_snapshot 의 CI_FULL = console_full_sha — 폴러·judge-sha·term-send-safe --expect-sha 와 같은 함수·같은
# 창 범위). 라이브러리가 없으면 원문 마지막 41줄의 sha. FP_SHA 는 발췌 sha(보낸 표식용, 모르면 -). 못 만들면 rc 1
# FP_WIN 은 지문과 같은 창 판정의 창 JSON(console_window_json — 권한 창이면 .perm 에 도구 이름·질문·본문·선택지). 라이브러리가 없으면 빈 값
FP_FULL=""; FP_SHA="-"; FP_WIN=""
fp_of() {
  local tf; FP_FULL=""; FP_SHA="-"; FP_WIN=""
  if [ "$AA_LIB" = 1 ]; then
    tf="$(umask 077; mktemp "${TMPDIR:-/tmp}/aa-scr.XXXXXX")" || return 1
    printf '%s\n' "$1" > "$tf"
    console_input_snapshot "$tf" && { FP_FULL="$CI_FULL"; FP_SHA="$CI_SHA"; FP_WIN="$CI_WIN"; }
    rm -f "$tf"
  else
    FP_FULL="$(printf '%s\n' "$1" | tail -41 | compat_sha256)"   # openssl → sha256sum → shasum → node(lib/compat.sh)
  fi
  [ -n "$FP_FULL" ]
}

screen="$(term_read_screen "$h" 80)" || coord_die 4 "화면을 읽지 못했다: $h"
kind="$(printf '%s\n' "$screen" | coord_screen_prompt_kind)"
[ -n "$kind" ] || { echo "NONE $h"; exit 0; }
bottom="$(printf '%s\n' "$screen" | tail -30)"

record() { # decision category cmd why
  coord_has_run || return 0
  local rec; rec="$(jq -cn --arg at "$(coord_now_iso)" --arg lane "${lane:-$h}" --arg d "$1" --arg c "$2" --arg cmd "$3" --arg why "$4" \
    '{at:$at,lane:$lane,decision:$d,category:$c,cmd:($cmd|.[0:300]),why:$why}')"
  local cur; cur="$(coord_state '.approvals // []' 2>/dev/null)"; [ -n "$cur" ] || cur='[]'
  coord_state_call set '.approvals' "$(printf '%s' "$cur" | jq -c --argjson r "$rec" '. + [$r]')" >/dev/null
  coord_state_call event approval "${lane:--}" "$rec" >/dev/null
}
# 지문 없음 판단 올리기 기록용: 화면 아래 30줄을 가린 것(가림 실패면 빈 값), 한 줄로 이어 끝 300자
bottom_redacted() {
  [ "$AA_LIB" = 1 ] || return 0
  printf '%s\n' "$bottom" | console_screen_filter 2>/dev/null | jq -Rrs 'gsub("\n"; " ") | .[-300:]' 2>/dev/null
}
no_fp() { # <kind> <사유 글>
  coord_log "$2: $h"
  record user "$1" "$(bottom_redacted)" "$2"
  echo "ESCALATE $h $1 no-fingerprint"; exit 0
}
# 판정에 쓴 화면의 지문. 잠금을 기다리는 사이 같은 kind 의 다른 창으로 바뀌면 이 판정을 그 창에 넣지 않는다(보내기 직전 비교)
fp_of "$screen" || no_fp "$kind" "화면 지문을 만들지 못해 자동 응답하지 않음"
J_FULL="$FP_FULL"; J_WIN="$FP_WIN"   # 판정은 이 창(J_WIN) 하나만 본다 — 보내기 직전 fp_of 가 FP_* 를 덮어써도 바뀌지 않게
OPT_SRC=""                            # 선택지 번호는 창의 선택지 줄(J_WIN 의 opts)에서만 찾는다 — 아래 kind 별로 채운다

# 선택지 번호 찾기: 패턴에 맞는 첫 「N. 글」 줄의 N
opt_num() { # <포함 패턴> [제외 패턴]
  printf '%s\n' "$OPT_SRC" | grep -E "^[[:space:]]*(❯|›|>)?[[:space:]]*[0-9]+\.[[:space:]].*($1)" \
    | { if [ -n "${2:-}" ]; then grep -viE "$2"; else cat; fi; } | head -1 | sed -E 's/^[^0-9]*([0-9]+)\..*/\1/'; }

# 확인·선택 창(trust·usage-limit·question·choice): 지문과 같은 한 번의 창 판정(J_WIN.gen)만 본다. kind 는 화면 마지막 30줄 글로 정해져
# 명령 본문(echo·heredoc)이나 대화 줄의 문구로도 바뀌므로, 창 모양과 그 kind 의 확인 문구가 창 안(머리~질문 줄)에 있는지 다시 본다
if [ "$kind" != permission ]; then
  gw="$(printf '%s' "$J_WIN" | jq -c '.gen // empty' 2>/dev/null)"
  [ -n "$gw" ] || no_fp "$kind" "확인·선택 창의 창을 잡지 못해 자동 응답하지 않음"
  OPT_SRC="$(printf '%s' "$gw" | jq -r '.opts[]' 2>/dev/null)"
  gpre="$(printf '%s' "$gw" | jq -r '.pre[]' 2>/dev/null)"; gtail="$(printf '%s' "$gw" | jq -r '.tail[]' 2>/dev/null)"
  gall="$(printf '%s\n%s' "$gpre" "$gtail" | tr '\n' ' ')"
  shape_bad() { record user "$kind" "$gall" "창 모양이 다름($1)"; echo "ESCALATE $h $kind window-shape"; exit 0; }
  # 권한 창 모양: 선택지 블록 위로 가장 가까운 들여쓰기 0 머리 다음 줄이 도구 이름 줄(본문에 문구를 심은 권한 창)
  gs="$(printf '%s' "$gw" | jq -r 'if .ptool then "권한 창 모양" elif .hk == "rule" then "들여쓴 가로줄 머리" elif (.blk | not) then "선택지 블록 사이 얕은 글 줄" elif (.pre | length) == 0 then "질문 줄 없음" else "ok" end' 2>/dev/null)"
  [ "$gs" = ok ] || shape_bad "${gs:-판정 실패}"
  case "$kind" in
    trust)
      printf '%s\n' "$gpre" | grep -qE 'trust the files in this folder|one you trust' || shape_bad "신뢰 문구가 창 머리~질문 줄에 없음"
      printf '%s\n' "$gtail" | grep -qE 'No, exit|trust this folder' || shape_bad "신뢰 창 선택지(No, exit)가 없음" ;;
    usage-limit)
      printf '%s\n' "$gpre" | grep -qE '^(What do you want to do\?|Usage limit reached)' || shape_bad "한도 창 문구가 창 머리~질문 줄에 없음" ;;
  esac
fi

send_key() { # key(숫자 또는 esc) — 보내기 직전(잠금 안) 판정한 화면과 같은 창인지 다시 확인한다
  local now scr sha=- got=0
  # 레인 잠금(오피스 키 입력과 동시에 답하지 않게). 못 얻으면 NONE 처럼 건너뛰고 다음 틱에 다시
  if [ "$dry" != 1 ] && [ -n "$LK_LANE" ]; then
    console_lane_lock "$LK_LANE" || { coord_log "레인 잠금을 얻지 못해 건너뜀(오피스 키 입력과 겹침): $LK_LANE"; echo "NONE $h"; return 1; }
    got=1
  fi
  scr="$(term_read_screen "$h" 80)"
  now="$(printf '%s\n' "$scr" | coord_screen_prompt_kind)"
  [ "$now" = "$kind" ] || { [ "$got" = 1 ] && console_lane_unlock "$LK_LANE"; coord_log "창이 바뀌어 보내지 않음($kind → ${now:-없음})"; echo "NONE $h"; return 1; }
  # 같은 kind 여도 판정한 화면(J_FULL)과 다르면 보내지 않는다(예: git status 창이 git push 창으로 바뀜). 다음 틱이 처음부터 다시 판정한다
  if ! fp_of "$scr" || [ "$FP_FULL" != "$J_FULL" ]; then
    [ "$got" = 1 ] && console_lane_unlock "$LK_LANE"
    coord_log "판정한 화면과 지금 화면이 달라 보내지 않음($kind)"; echo "NONE $h"; return 1
  fi
  sha="$FP_SHA"
  if [ "$got" = 1 ]; then
    # 오피스 키 입력이 방금 들어갔는데 화면에 아직 반영되지 않은 같은 창이면 두 번 답하지 않는다
    if console_lane_recent_send "$LK_LANE" "$sha"; then
      console_lane_unlock "$LK_LANE"; coord_log "방금 다른 답(오피스 키 입력)이 들어간 같은 창 — 건너뜀"; echo "NONE $h"; return 1
    fi
  fi
  local text="$1"; [ "$1" = esc ] && text=$'\e'
  if [ "$dry" = 1 ]; then coord_log "DRY term_send $h $1"; return 0; fi
  term_send "$h" "$text" >/dev/null
  if [ "$got" = 1 ]; then
    # 잠금 안: 보낸 표식 + 기록이 판정한 창(J_FULL)이면 handled(auto)·소비(오피스 표시·재전송 방지). 다음 창 기록은 건드리지 않는다
    console_lane_mark_sent "$LK_LANE" "$sha"
    console_input_mark_handled "coord_lane_$LK_LANE" auto "$J_FULL"; local mrc=$?
    console_lane_unlock "$LK_LANE"
    # office 알림(잠금 밖 — office.sh 가 오래 걸려도 다른 답을 막지 않게). 실패해도 계속
    [ "$mrc" = 0 ] && bash "$COORD_SCRIPTS_DIR/console-poll.sh" input-handled --lane "$LK_LANE" --by auto --expect-full "$J_FULL" >/dev/null 2>&1 </dev/null
  fi
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
    # Yes 번호는 창의 선택지 줄에서만 찾는다. 없으면(번호 없는 신뢰 창 — 첫 항목이 No, exit 일 수 있다) 1 을 짐작해 보내지 않고 올린다
    case "${here:-$wt}" in
      "$repo"|"$repo"/*) n="$(opt_num 'Yes')"
        if [ -z "$n" ]; then record user trust "$gall" "창에 번호 있는 Yes 선택지 없음"; echo "ESCALATE $h trust no-yes-option"; exit 0; fi
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
    # 명령 = 지문과 같은 한 번의 창 판정(J_WIN.perm, console_window_json)에서 머리 가로줄·도구 이름 줄·질문 줄·선택지 줄을 뺀 본문 전부.
    # 창을 못 잡았으면(라이브러리 없음 포함) 지문 없음과 같이 올린다. 선택지 번호도 그 창의 선택지 줄에서만 찾는다(본문 속 `2. Yes` 무시)
    pw="$(printf '%s' "$J_WIN" | jq -c '.perm // empty' 2>/dev/null)"
    [ -n "$pw" ] || no_fp permission "권한 창의 머리·도구 이름 줄을 잡지 못해 자동 응답하지 않음"
    cmd="$(printf '%s' "$pw" | jq -r '.body[].t' 2>/dev/null)"
    # 판단 올리기(not-proceed·not-command·window-shape) 기록용: 도구 이름 줄 아래 창 줄 전부(가짜 질문 아래 위험 줄도 남게)
    wall="$(printf '%s' "$pw" | jq -r '.rest[]' 2>/dev/null | tr '\n' ' ')"
    OPT_SRC="$(printf '%s' "$pw" | jq -r '.opts[]' 2>/dev/null)"
    pq="$(printf '%s' "$pw" | jq -r '.q' 2>/dev/null)"; ptool="$(printf '%s' "$pw" | jq -r '.tool' 2>/dev/null)"
    # 창 모양: 질문 줄이 도구 이름 줄과 같은 들여쓰기(실제 창 1칸, 명령 본문은 더 깊게 그려진다)이고 본문이 있다. 본문 속 가짜 질문·선택지가
    # 블록에 붙어 질문 줄로 잡히면 들여쓰기가 달라 허용하지 않는다
    pshape="$(printf '%s' "$pw" | jq -r 'if .qind == .tind and (.body | length) > 0 then "ok" else "bad" end' 2>/dev/null)"
    if [ "$spawned" = 1 ]; then allow="$(coord_cfg_json '.approvals.auto_allow_spawned // []')"; else allow="$(coord_cfg_json '.approvals.auto_allow // []')"; fi
    flat="$(printf '%s' "$cmd" | tr '\n' ' ')"
    # 거부 칸: 삭제·되돌리기·push·공용 DB·프로세스 종료·권한·비밀값·쓰기 리다이렉션(본문과 질문 줄 — 예: make this edit to settings.json)
    nodevnull="$(printf '%s' "$flat" | sed -E 's/[0-9]?>>?[[:space:]]*\/dev\/null//g; s/2>&1//g; s/>&2//g')"
    if printf '%s' "$flat $pq" | grep -qiE '(^|[^a-z0-9_-])(rm|rmdir|unlink|shred|truncate)([[:space:]]|$)|-delete([[:space:]]|$)|-exec([[:space:]]|dir)|(^|[^a-z])xargs[[:space:]]|git[[:space:]]+(branch[[:space:]]+-[dD]|push|reset|clean|checkout[[:space:]]+--|restore|stash[[:space:]]+(drop|clear|pop)|rebase|filter-branch|update-ref[[:space:]]+-d)|worktree[[:space:]]+remove|--force|(^|[^a-z])(DROP|TRUNCATE)[[:space:]]|DELETE[[:space:]]+FROM|UPDATE[[:space:]].*[[:space:]]SET[[:space:]]|(^|[^a-z])(kill|pkill|killall|shutdown|reboot|launchctl)[[:space:]]|(^|[^a-z])(taskkill|Stop-Process)([[:space:]]|$)|(^|[;&|(]|/c)[[:space:]]*(del|rd|Remove-Item)([[:space:]]|$)|chmod|chown|sudo|settings(\.local)?\.json|\.coord(\.local)?\.json|(ANTHROPIC|API|AUTH)_?(KEY|TOKEN)|security[[:space:]]+find-generic-password|curl[[:space:]].*-X[[:space:]]*(POST|PUT|DELETE|PATCH)|bootRun|local-run\.sh|(yarn|pnpm|npm)[[:space:]]+(remove|uninstall|rm|dlx|exec)|npx[[:space:]]+-y' \
       || printf '%s' "$nodevnull" | grep -qE '>'; then
      send_key esc && { record deny deny-table "$flat" "거부 칸"; out "DENY $h permission deny-table"; }
      exit 0
    fi
    # 허용(ANSWER)은 질문 줄이 정확히 `Do you want to proceed?` 인 셸 명령 창만. 다른 질문(make this edit·will automatically deny 등)은 올린다
    if [ "$pq" != "Do you want to proceed?" ]; then record user permission "$wall" "질문이 proceed 가 아님"; echo "ESCALATE $h permission not-proceed"; exit 0; fi
    case "$ptool" in *command|*"command ("*")") ;; *) record user permission "$wall" "셸 명령 창이 아님"; echo "ESCALATE $h permission not-command"; exit 0 ;; esac
    [ "$pshape" = ok ] || { record user permission "$wall" "창 모양이 다름(질문·본문 들여쓰기)"; echo "ESCALATE $h permission window-shape"; exit 0; }
    # 경로가 레인 워크트리·임시 폴더 안인지(edit-own 판정)
    wt_abs=""; [ -n "$wt" ] && [ "$wt" != null ] && wt_abs="$(coord_wt_abs "$wt" 2>/dev/null)"
    path_ok() {
      local a
      for a in "$@"; do
        case "$a" in -*) continue ;; esac
        case "$a" in
          /private/tmp/*|/tmp/*|"${TMPDIR:-/nonexistent}"*) ;;
          /*|~*|..*|*/../*|[A-Za-z]:*|*\\*) [ -n "$wt_abs" ] && case "$a" in "$wt_abs"/*) ;; *) return 1 ;; esac || return 1 ;;
          *) [ -n "$wt_abs" ] || return 1 ;;  # 상대 경로는 레인 워크트리를 알 때만
        esac
      done
      return 0
    }
    # 범주 판정: 조각마다 첫 단어(실행 파일)로 범주를 매긴다. 하나라도 허용 밖·모름이면 올린다
    cats=""; unknown=0; c=""
    while IFS= read -r seg; do
      seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:](]*//; s/^([A-Z_]+=[^[:space:]]*[[:space:]]+)+//')"; [ -n "$seg" ] || continue
      read -r -a w <<<"$seg"
      c=""
      case "${w[0]}" in
        git)
          case "${w[1]:-}" in
            status|log|diff|show|rev-parse|merge-base|ls-files|blame) c=status ;;
            branch) case "${w[2]:-}" in --list|-a|-v|--show-current|"") c=status ;; esac ;;
            worktree) [ "${w[2]:-}" = list ] && c=status ;;
            add|commit) c=commit-own ;;
          esac ;;
        ps|uptime|date|pwd|echo|which|whoami|uname|printf) c=status ;;
        orca) case "${w[1]:-} ${w[2]:-}" in "terminal list"|"terminal read"|"terminal show") c=status ;; esac ;;
        cat|head|tail|ls|grep|rg|find|wc|jq|stat|file|sort|uniq|cut|diff|tree|du) c=read ;;
        sed) [ "${w[1]:-}" = -n ] && c=read
             case "${w[1]:-}" in -i|-i*) path_ok "${w[@]:2}" && c=edit-own ;; esac ;;
        awk) c=read ;;
        mkdir|touch|cp|mv|tee) path_ok "${w[@]:1}" && c=edit-own ;;
        ./gradlew|gradlew) c=heavy-build ;;
        bash|sh) case "${w[1]:-}" in */heavy.sh) [ "${w[2]:-}" = status ] || [ "${w[2]:-}" = snapshot ] && c=status || c=heavy-build ;; esac ;;
        */heavy.sh) case "${w[1]:-}" in status|snapshot) c=status ;; *) c=heavy-build ;; esac ;;
        npx) case "${w[1]:-}" in vitest|tsc|tsup|playwright|eslint|prettier) c=heavy-build ;; esac ;;
        npm|pnpm|yarn) case "${w[1]:-} ${w[2]:-}" in "test "*|"run test"*|"run build"*|"run lint"*|"run typecheck"*|"exec vitest"*) c=heavy-build ;; esac ;;
      esac
      if [ -z "$c" ]; then unknown=1; c="unknown:${w[0]}"; break; fi
      printf '%s' "$allow" | jq -e --arg c "$c" 'index($c) != null' >/dev/null || { unknown=1; c="$c(허용 밖)"; break; }
      cats="$cats $c"
    done < <(printf '%s\n' "$cmd" | sed -E 's/(&&|\|\||;|\|)/\n/g')
    if [ "$unknown" = 0 ] && [ -n "$cats" ]; then
      n="$(opt_num 'Yes' "don't ask|do not ask|allow all|always|this session")"
      [ -n "$n" ] || { record user permission "$flat" "1회 승인 선택지 못 찾음"; echo "ESCALATE $h permission no-yes-option"; exit 0; }
      send_key "$n" && { record allow "${cats# }" "$flat" "판단표 허용 범주"; out "ANSWER $h permission $n ${cats# }"; }
    else
      record user "${c:-unknown}" "$flat" "판단표에 확실히 들지 않음"
      echo "ESCALATE $h permission ${c:-unknown}"
    fi ;;

  question|choice)
    # 레인 모델이 사람에게 묻는 선택 창. 삭제·사용자 결정에 닿으면 사용자에게, (Recommended) 가 있으면 그것을 고른다.
    # 결정 낱말은 화면 아래 30줄과 창 둘 다에서 찾고(넓게 = 보수), (Recommended) 선택지는 창 블록의 선택지 줄에서만 고른다
    if printf '%s\n%s\n' "$bottom" "$gall" | grep -qiE '삭제|delete|drop|force|push|배포|deploy|비밀|secret|token'; then
      record user "$kind" "" "사용자 결정 항목"; echo "ESCALATE $h $kind user-decision"
    else
      n="$(opt_num '\(Recommended\)|\(권장\)|\(추천\)')"
      if [ -n "$n" ]; then
        send_key "$n" && { record allow "$kind" "" "권장 선택지"; out "ANSWER $h $kind $n recommended"; }
      else record user "$kind" "" "권장 선택지 없음"; echo "ESCALATE $h $kind no-recommended"; fi
    fi ;;
esac
exit 0
