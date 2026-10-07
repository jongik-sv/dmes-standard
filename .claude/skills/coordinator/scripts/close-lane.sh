#!/usr/bin/env bash
# 사용법: close-lane.sh <레인> | --handle <h>  [--force-report] [--dry-run]
#   끝난 레인·워커 세션의 탭을 닫고 사라졌는지 확인한다(설계 §3.e 정리 절차, Q7 결정).
#   Q7 순서 중 정본 메모 완료 갱신·산출물 복사는 조정자가 먼저 한다. 이 스크립트는 그 뒤의 기계적 부분:
#   bg 실행 확인 → 보고 확인 → 워크트리·브랜치 남음 경고 → orca terminal close --tab → handle·세션 파일 사라짐 확인(최대 15초)
#   → state lanes.<l>.state=closed · 이벤트.
#   거부: bg-running(세션 자손이나 레인 워크트리에서 도는 빌드·시험, heavy.sh RUN cwd 가 레인 워크트리)
#         · not-reported(last_report_at 없음, --force-report 로 통과). worktree·branch 가 남은 것은 stderr 경고만.
#   stdout: `CLOSED <레인> handle=<h>` 또는 `CLOSE_REFUSED <레인> <사유>`.
#   --dry-run: 판정은 실제로, 닫기 직전에 멈추고 `DRY CLOSED <레인> handle=<h>`.
set -uo pipefail
. "$(dirname "$0")/lib/common.sh"
. "$(dirname "$0")/lib/term.sh"
. "$(dirname "$0")/lib/compat.sh"

lane="" h="" force_report=0 dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --handle) h="${2:-}"; shift ;;
    --force-report) force_report=1 ;;
    --dry-run) dry=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    -*) coord_die 2 "모르는 옵션: $1" ;;
    *) lane="$1" ;;
  esac
  shift
done
[ -n "$lane" ] || [ -n "$h" ] || coord_die 2 "사용법: close-lane.sh <레인> | --handle <h> [--force-report] [--dry-run]"
[ "$dry" = 1 ] && export COORD_DRY=1

has_run=0; coord_has_run && has_run=1
if [ -n "$lane" ]; then
  [ "$has_run" = 1 ] || coord_die 3 "현재 회차가 없다"
  [ "$(coord_state "(.lanes[\"$lane\"] // null) | type")" = object ] || coord_die 2 "상태에 없는 레인: $lane"
  [ -n "$h" ] || h="$(coord_lane_get "$lane" .session.handle)"
  [ -n "$h" ] || coord_die 3 "레인 $lane 의 handle 이 상태에 없다"
elif [ "$has_run" = 1 ]; then
  lane="$(jq -r --arg h "$h" '.lanes | to_entries[] | select(.value.session.handle == $h) | .key' "$(coord_state_file)" | head -1)"
fi
label="${lane:--}"
pid="" wt="" br="" rep=""
if [ -n "$lane" ]; then
  pid="$(coord_lane_get "$lane" .session.pid)"; [ "$pid" = 0 ] && pid=""
  wt="$(coord_lane_get "$lane" .worktree)"
  br="$(coord_lane_get "$lane" .branch)"
  rep="$(coord_lane_get "$lane" .last_report_at)"
fi
refuse() { echo "CLOSE_REFUSED $label $1"; [ -n "${2:-}" ] && coord_log "$2"; exit 0; }

# 레인 워크트리가 메인 체크아웃이면 cwd 대조를 하지 않는다(모든 세션이 같은 cwd).
main_repo="$(coord_repo 2>/dev/null)"
wt_check=""
if [ -n "$wt" ] && [ -d "$wt" ]; then
  wt_real="$(cd "$wt" && pwd -P)"; main_real="$( [ -n "$main_repo" ] && cd "$main_repo" 2>/dev/null && pwd -P)"
  [ "$wt_real" != "$main_real" ] && wt_check="$wt_real"
fi

# 1. 백그라운드 실행
HEAVY_RE='GradleWrapperMain|gradlew|vitest|playwright (test|show-report)|/tsc( |$)|tsup|heavy\.sh|jest|npm (run|test|exec vite)'
bg=()
ps_all="$(compat_ps_table)"   # pid ppid args(Git Bash 는 /proc)
# (가) 세션 pid 의 자손 중 무거운 명령(mcp 서버는 뺀다)
if [ -n "$pid" ] && compat_pid_alive "$pid"; then
  desc="$(printf '%s\n' "$ps_all" | awk -v root="$pid" '
    { p[NR] = $1; pp[NR] = $2; $1 = ""; $2 = ""; c[NR] = $0 }
    END {
      keep[root] = 1; changed = 1
      while (changed) { changed = 0; for (i = 1; i <= NR; i++) if (keep[pp[i]] && !keep[p[i]]) { keep[p[i]] = 1; changed = 1 } }
      for (i = 1; i <= NR; i++) if (keep[p[i]] && p[i] != root) print p[i] "\t" c[i]
    }')"
  while IFS=$'\t' read -r dp dc; do
    [ -n "$dp" ] || continue
    printf '%s' "$dc" | grep -qi mcp && continue
    printf '%s' "$dc" | grep -qE "$HEAVY_RE" && bg+=("pid=$dp${dc:0:120}")
  done <<<"$desc"
fi
# (나) 레인 워크트리를 cwd 로 둔 무거운 명령(세션 밖에서 띄운 것 포함)
if [ -n "$wt_check" ]; then
  while read -r hp hc; do
    [ -n "$hp" ] || continue
    printf '%s' "$hc" | grep -qi mcp && continue
    cwd="$(compat_pid_cwd "$hp")"
    case "$cwd" in "$wt_check"|"$wt_check"/*) bg+=("pid=$hp cwd=$cwd ${hc:0:100}") ;; esac
  done < <(printf '%s\n' "$ps_all" | awk '{ $2 = ""; print }' | grep -E "$HEAVY_RE" | grep -v grep)
  # (다) heavy.sh snapshot 의 RUN cwd
  if hs="$(coord_heavy_script)"; then
    while IFS=$'\t' read -r tag _ _ _ cwd cmd; do
      [ "$tag" = RUN ] || continue
      case "$cwd" in "$wt_check"|"$wt_check"/*|"$wt"|"$wt"/*) bg+=("heavy RUN cwd=$cwd ${cmd:0:100}") ;; esac
    done < <(bash "$hs" snapshot 2>/dev/null)
  fi
fi
if [ "${#bg[@]}" -gt 0 ]; then
  coord_log "도는 백그라운드:"; printf '  %s\n' "${bg[@]}" >&2
  refuse bg-running
fi

# 2. 보고
if [ -n "$lane" ] && [ -z "$rep" ] && [ "$force_report" != 1 ]; then
  refuse not-reported "마지막 보고(last_report_at)가 없다 — 산출물을 받았으면 --force-report"
fi

# 3. 워크트리·브랜치 남음(경고만)
if [ -n "$wt_check" ] && coord_git worktree list --porcelain 2>/dev/null | grep -qxF "worktree $wt_check"; then
  coord_log "경고: 워크트리가 남아 있다: $wt_check (worktree-left — 레인이 정리했는지 확인)"
fi
if [ -n "$br" ] && [ "$br" != "$(coord_cfg .integration_branch)" ] && [ -n "$(coord_git branch --list "$br" 2>/dev/null)" ]; then
  coord_log "경고: 브랜치가 남아 있다: $br (branch-left — squash 로 -d 거부면 사용자 결정 목록에)"
fi

# 4. 닫기
if ! term_list | cut -f1 | grep -qxF "$h"; then
  coord_log "터미널 목록에 이미 없다: $h (닫기 생략, 상태만 갱신)"
  gone_already=1
else
  gone_already=0
fi
if [ "$dry" = 1 ]; then
  [ "$gone_already" = 0 ] && coord_log "DRY orca terminal close --terminal $h --tab"
  coord_log "DRY 확인: term_list 에서 $h 사라짐 · ${pid:+$(coord_expand "$(coord_cfg .sessions_dir)")/$pid.json 없어짐 }(최대 15초)"
  [ -n "$lane" ] && coord_state_call set ".lanes[\"$lane\"].state" '"closed"'
  [ -n "$(coord_cfg .wake_targets)" ] && coord_log "wake_targets($(coord_cfg .wake_targets)) 갱신 필요"
  echo "DRY CLOSED $label handle=$h"; exit 0
fi
if [ "$gone_already" = 0 ]; then
  r="$(term_close "$h")"
  case "$r" in closed|stale) ;; *) coord_die 4 "terminal close 실패: $r" ;; esac
fi
sf=""; [ -n "$pid" ] && sf="$(coord_expand "$(coord_cfg .sessions_dir)")/$pid.json"
end=$(( $(coord_now_epoch) + 15 )); ok=0
while [ "$(coord_now_epoch)" -le "$end" ]; do
  if ! term_list | cut -f1 | grep -qxF "$h" && { [ -z "$sf" ] || [ ! -f "$sf" ]; }; then ok=1; break; fi
  sleep 1
done
[ "$ok" = 1 ] || coord_log "경고: 15초 안에 사라짐을 확인하지 못했다(handle 또는 $sf) — 다시 확인할 것"
if [ -n "$lane" ]; then
  coord_state_call set ".lanes[\"$lane\"].state" '"closed"'
  coord_state_call event lane-closed "$lane" "$(jq -cn --arg h "$h" --argjson v "$ok" '{handle:$h, verified:($v == 1)}')"
  bash "$(dirname "$0")/office.sh" lane-down "$lane" >/dev/null 2>&1 || true   # 에이전트 오피스에서 내린다(실패해도 무시)
fi
[ -n "$(coord_cfg .wake_targets)" ] && coord_log "wake_targets($(coord_cfg .wake_targets)) 갱신 필요 — 닫은 세션을 빼라"
echo "CLOSED $label handle=$h"
exit 0
