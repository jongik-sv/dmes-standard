#!/usr/bin/env bash
# 콘솔 대상 해석(source 용). 정본: ../../references/contract.md §4.1 「대상 해석」. common.sh 를 먼저 source 해야 한다.
#   console_resolve <target_kind> <target_ref>   stdout 한 줄 `<handle>`. 종료 코드 0 찾음 · 1 없음(target-not-found) · 2 둘 이상(ambiguous)
#   console_header_ref <target_kind> <target_ref>  머리글 `[오피스→<ref>]` 의 ref: coord_lane=레인 이름, 두 팀장=lead,
#                                                  team_worker=그 슬롯의 주문 id8. 형식(^[A-Za-z0-9._-]{1,40}$)이 틀리면 lead
#   console_list_targets                          이 PC 에서 지금 해석되는 대상 전부, 줄마다 `<kind>\t<ref>\t<handle>`
#   console_dir                                   콘솔 폴더(DFLOW_CONSOLE_DIR, 기본 ~/.dflow/console)
# 핸들이 이 PC 의 터미널 목록(term_list)에 있는지는 보지 않는다(호출자가 stale 로 처리).
# 회차 생존: 열린(.run.closed_at null) · 마감 표식(.office.finished) 없는 회차 중 「죽은 세션」의 것은 세지 않는다.
#   죽은 세션 = 세션 기록(<state_dir>/_session/<세션8>.json)의 pid 가 0 이 아닌데 죽음. 기록이 없으면(reap 이 지운 뒤 포함)
#   회차의 .run.coordinator.pid 로 같은 판정을 한다. 둘 다 0·빈 값이면 모르는 것이라 센다(대상 해석). 폴러의 자기 종료 판단은
#   `_cr_live_runs strict` 로 살아 있음이 확인된 회차만 센다(contract §4 생존 판정).
# 레인 생존: 레인 session.pid 가 0·빈 값이 아니고 죽었으면(office.sh reap 과 같은 kill -0 규칙) 그 레인은 해석하지 않는다.
# 팀원: lead-state.sh 의 SLOT 줄 중 state= 가 살아 있는 팀원 상태(spawn·blocked)인 줄만 쓴다.
# 신원: CR_IDENT(신원 슬러그)·CR_HOST(이 PC host 슬러그)와 같은 기록만 고른다 — 세션 기록 .user·.host, 회차 .office.user,
#   팀장 기록 .agent(<신원>/<host>/lead 의 앞 두 칸). 둘 중 하나라도 비었거나 기록에 신원이 없으면(옛 기록) 고르지 않는다
#   (다른 사람 세션에 프롬프트를 넣거나 화면을 올리지 않게 — 소유를 증명할 수 없는 기록은 대상이 아니다).
# 시간 제한: CR_LIMIT_S 가 있고 run_limited(console-poll.sh)가 정의돼 있으면 lead-state.sh 호출을 그 초 안에 끊는다
#   (넘으면 빈 출력 = 슬롯 없음). 단독으로 source 하면 직접 부른다.
# 시험용 덮어쓰기: COORD_LEAD_STATE = dflow-team lead-state.sh 경로.

console_dir() { coord_expand "${DFLOW_CONSOLE_DIR:-$HOME/.dflow/console}"; }
_cr_lead_state() { printf '%s' "${COORD_LEAD_STATE:-$COORD_SCRIPTS_DIR/../../dflow-team/scripts/lead-state.sh}"; }
_cr_ref_ok() { case "$1" in ''|.*|*[!A-Za-z0-9._-]*) return 1 ;; esac; [ "${#1}" -le 64 ]; }
_cr_count() { if [ -z "$1" ]; then echo 0; else printf '%s\n' "$1" | grep -c .; fi; }

# _cr_pid_dead <pid> — pid 가 0·빈 값이 아니고 죽었으면 0
_cr_pid_dead() { case "${1:-}" in ''|0|null) return 1 ;; esac; ! kill -0 "$1" 2>/dev/null; }
# _cr_pid_live <pid> — pid 가 0·빈 값이 아니고 살아 있으면 0
_cr_pid_live() { case "${1:-}" in ''|0|null) return 1 ;; esac; kill -0 "$1" 2>/dev/null; }
# _cr_ident_ok — 신원·host 를 알고 있으면 0
_cr_ident_ok() { [ -n "${CR_IDENT:-}" ] && [ -n "${CR_HOST:-}" ]; }
# _cr_sess_mine <세션 기록 파일> — 기록의 .user·.host 가 이 신원·host 이면 0
_cr_sess_mine() {
  _cr_ident_ok || return 1
  [ "$(jq -r '"\(.user // "")/\(.host // "")"' "$1" 2>/dev/null)" = "$CR_IDENT/$CR_HOST" ]
}
# _cr_session_dead <세션8> <회차 coordinator pid> [strict] — 죽은 세션이면 0.
#   strict 이면 「살아 있음이 확인되지 않음」(pid 0·빈 값 포함)도 죽은 것으로 본다.
#   세션 기록이 있지만 다른 신원의 것이면 그 회차는 이 신원의 것이 아니므로 죽은 것으로 친다(고르지 않음).
_cr_session_dead() {
  local f p; f="$(coord_state_root)/_session/$1.json"
  if [ -f "$f" ]; then
    _cr_sess_mine "$f" || return 0
    p="$(jq -r '.pid // 0 | tostring' "$f" 2>/dev/null)"
    case "$p" in ''|0|null) ;; *) _cr_pid_dead "$p"; return ;; esac
  fi
  if [ "${3:-}" = strict ]; then _cr_pid_live "${2:-0}" && return 1; return 0; fi
  _cr_pid_dead "${2:-0}"
}
# 살아 있는(죽지 않은) 세션의 열린 이 신원 회차: 줄마다 `<state.json>\t<세션8>`. [strict] 이면 살아 있음이 확인된 것만
_cr_live_runs() {
  local root f line s8 rpid u
  _cr_ident_ok || return 0
  root="$(coord_state_root)"
  for f in "$root"/*/state.json; do
    [ -f "$f" ] || continue
    line="$(jq -r "$COORD_S8_JQ"' select((.run.closed_at // null) == null and (.office.finished // false) != true)
      | [coord_s8, ((.run.coordinator.pid // 0) | tostring), (.office.user // "" | tostring)] | @tsv' "$f" 2>/dev/null)"
    [ -n "$line" ] || continue
    IFS=$'\t' read -r s8 rpid u <<< "$line"
    [ "$u" = "$CR_IDENT" ] || continue
    _cr_session_dead "$s8" "$rpid" "${1:-}" && continue
    printf '%s\t%s\n' "$f" "$s8"
  done
  return 0
}
# pid 가 살아 있는 이 신원·host 의 팀장 핸들 기록: 줄마다 경로
_cr_live_leads() {
  local f p a
  _cr_ident_ok || return 0
  for f in "$(console_dir)"/lead/*.json; do
    [ -f "$f" ] || continue
    a="$(jq -r '.agent // empty' "$f" 2>/dev/null)"
    case "$a" in "$CR_IDENT/$CR_HOST/"*) ;; *) continue ;; esac
    p="$(jq -r '.pid // 0 | tostring' "$f" 2>/dev/null)"
    _cr_pid_live "$p" && printf '%s\n' "$f"
  done
  return 0
}
# lead-state.sh 한 번 부르기(CR_LIMIT_S 가 있고 run_limited 가 있으면 시간 제한)
_cr_lead_state_call() {  # <lead-state 경로> <agent> <repo>
  local o rc
  if [ -n "${CR_LIMIT_S:-}" ] && [ -n "${TMPD:-}" ] && declare -F run_limited >/dev/null 2>&1; then
    o="$(mktemp "$TMPD/ls.XXXXXX" 2>/dev/null)" || return 0
    run_limited "$CR_LIMIT_S" "$o" /dev/null /dev/null bash "$1" --agent "$2" --repo "$3"; rc=$?
    if [ "$rc" = 124 ] && declare -F plog >/dev/null 2>&1; then plog "경고: lead-state ${CR_LIMIT_S}초 상한을 넘어 이번 판정에서 뺌"; fi
    cat "$o" 2>/dev/null; rm -f "$o"
  else
    bash "$1" --agent "$2" --repo "$3" 2>/dev/null </dev/null
  fi
  return 0
}
# 살아 있는 팀장들의 살아 있는 팀원 SLOT 줄: 줄마다 `<slot 번호>\t<id8>\t<handle>`
_cr_worker_slots() {
  local f a r ls; ls="$(_cr_lead_state)"
  [ -f "$ls" ] || return 0
  for f in $(_cr_live_leads); do
    a="$(jq -r '.agent // empty' "$f" 2>/dev/null)"; r="$(jq -r '.repo // empty' "$f" 2>/dev/null)"
    [ -n "$a" ] && [ -n "$r" ] || continue
    _cr_lead_state_call "$ls" "$a" "$r" | awk '$1 == "SLOT" {
      s = $2; sub(/^w/, "", s); h = ""; st = ""
      for (i = 3; i <= NF; i++) { if ($i ~ /^handle=/) h = substr($i, 8); if ($i ~ /^state=/) st = substr($i, 7) }
      if (st != "spawn" && st != "blocked") next   # 살아 있는 팀원만(lead-state.sh SLOT 의 진행 중 상태)
      if (h == "-") h = ""
      print s "\t" $3 "\t" h }'
  done
  return 0
}

# 찾은 후보(줄마다 handle, 빈 줄은 handle 없음 표시 "-")를 판정해 낸다
_cr_pick() {
  local n; n="$(_cr_count "$1")"
  [ "$n" -eq 0 ] && return 1
  [ "$n" -gt 1 ] && return 2
  [ "$1" != "-" ] || return 1
  printf '%s\n' "$1"
}

_cr_coord_lead() {
  local s8="$1" f p h hs sf
  _cr_ref_ok "$s8" || return 1
  f="$(coord_state_root)/_session/$s8.json"
  if [ -f "$f" ]; then
    _cr_sess_mine "$f" || return 1          # 다른 신원·host(또는 신원 없는 옛 기록)
    p="$(jq -r '.pid // 0 | tostring' "$f" 2>/dev/null)"
    _cr_pid_dead "$p" && return 1          # 죽은 조정 세션
    h="$(jq -r '.handle // empty' "$f" 2>/dev/null)"
    [ -n "$h" ] && { printf '%s\n' "$h"; return 0; }
  fi
  hs="$(_cr_live_runs | awk -F'\t' -v s="$s8" '$2 == s { print $1 }' | while IFS= read -r sf; do
          jq -r '.run.coordinator.handle // empty' "$sf" 2>/dev/null; done | grep . | sort -u)"
  _cr_pick "$hs"
}

_cr_coord_lane() {
  local lane="$1" sf hs="" r lp
  _cr_ref_ok "$lane" || return 1
  while IFS=$'\t' read -r sf _; do
    [ -n "$sf" ] || continue
    r="$(jq -r --arg l "$lane" '.lanes[$l] // empty | select((.state // "active") != "closed")
          | ((.session.pid // 0) | tostring) + "\tH:" + ((.session.handle // "") | tostring)' "$sf" 2>/dev/null)"
    [ -n "$r" ] || continue
    lp="${r%%$'\t'*}"; r="${r#*$'\t'}"
    _cr_pid_dead "$lp" && continue          # 레인 세션이 죽음(터미널이 셸로 돌아갔을 수 있다)
    r="${r#H:}"; [ -n "$r" ] || r="-"
    hs="${hs:+$hs
}$r"
  done < <(_cr_live_runs)
  _cr_pick "$hs"
}

_cr_team_lead() {
  local f h hs=""
  for f in $(_cr_live_leads); do
    h="$(jq -r '.handle // empty' "$f" 2>/dev/null)"; [ -n "$h" ] || h="-"
    hs="${hs:+$hs
}$h"
  done
  _cr_pick "$hs"
}

_cr_team_worker() {
  local n="${1#w}" hs
  case "$1" in w[0-9]*) ;; *) return 1 ;; esac
  case "$n" in ''|*[!0-9]*) return 1 ;; esac
  hs="$(_cr_worker_slots | awk -F'\t' -v n="$n" '$1 == n { print ($3 == "" ? "-" : $3) }')"
  _cr_pick "$hs"
}

console_resolve() {  # console_resolve <target_kind> <target_ref>
  case "${1:-}" in
    coord_lead) _cr_coord_lead "${2:-}" ;;
    coord_lane) _cr_coord_lane "${2:-}" ;;
    team_lead) _cr_team_lead ;;
    team_worker) _cr_team_worker "${2:-}" ;;
    *) return 1 ;;
  esac
}

console_header_ref() {  # console_header_ref <target_kind> <target_ref>
  local r="lead" n
  case "${1:-}" in
    coord_lane) r="${2:-}" ;;
    team_worker)
      n="${2#w}"
      r="$(_cr_worker_slots | awk -F'\t' -v n="$n" '$1 == n { print $2 }')"
      [ "$(_cr_count "$r")" -eq 1 ] || r="lead" ;;
  esac
  if ! printf '%s' "$r" | grep -Eq '^[A-Za-z0-9._-]{1,40}$'; then r="lead"; fi
  printf '%s\n' "$r"
}

console_list_targets() {
  local root f s8 k h lanes L slots n rc
  root="$(coord_state_root)"
  # 조정 팀장: 세션 기록이 있고 새 키(…/coord:<세션8>)인 것만. 옛 …/coord(식별자 없음)는 콘솔을 열지 않는다.
  for f in "$root"/_session/*.json; do
    [ -f "$f" ] || continue
    s8="$(basename "$f" .json)"
    k="$(jq -r '.key // empty' "$f" 2>/dev/null)"
    case "$k" in */coord:?*) ;; *) continue ;; esac
    h="$(console_resolve coord_lead "$s8")" && printf 'coord_lead\t%s\t%s\n' "$s8" "$h"
  done
  # 조정 레인: 살아 있는 세션의 열린 회차의 closed 아닌 레인(이름이 둘 이상의 회차에 있으면 ambiguous 라 뺀다)
  lanes="$(_cr_live_runs | while IFS=$'\t' read -r f _; do
      jq -r '(.lanes // {}) | to_entries[] | select((.value.state // "active") != "closed") | .key' "$f" 2>/dev/null; done | sort -u)"
  for L in $lanes; do
    h="$(console_resolve coord_lane "$L")" && printf 'coord_lane\t%s\t%s\n' "$L" "$h"
  done
  # /dflow-team 팀장·팀원
  h="$(console_resolve team_lead lead)" && printf 'team_lead\tlead\t%s\n' "$h"
  slots="$(_cr_worker_slots | cut -f1 | grep -E '^[0-9]+$' | sort -u)"
  for n in $slots; do
    h="$(console_resolve team_worker "w$n")"; rc=$?
    [ "$rc" = 0 ] && printf 'team_worker\tw%s\t%s\n' "$n" "$h"
  done
  return 0
}
