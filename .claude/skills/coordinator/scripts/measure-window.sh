#!/usr/bin/env bash
# 사용법: measure-window.sh open <measure|move|ban> [--lane <레인>] --until <iso> [--hold-heavy] [--dry-run]
#         measure-window.sh close [<kind>] [--dry-run]
#         measure-window.sh status
#         measure-window.sh quiet-check
#   측정·이동·금지 창(설계 §3.d). 정본 출력: references/contract.md §3.5
#   open       : state windows 에 추가. --hold-heavy 이고 heavy.script 가 있으면 `<heavy> --detach --exclusive sleep <창 길이초>` 로
#                공용 칸을 창 내내 붙잡고 job id 를 hold_job 에 남긴다. → `WINDOW_OPEN <kind> until=<iso> hold_job=<id|->`
#   close      : (kind 를 주면 그 종류만) 붙잡은 job 이 있으면 그 job 의 손자(runpid)·자식(pid)을 lstart 대조 뒤 TERM 으로 끝내고,
#                windows 에서 빼고 이벤트. 창마다 `WINDOW_CLOSED <kind>`, 없으면 `WINDOW none`.
#   status     : 창마다 `WINDOW <kind> lane=<레인|-> until=<iso>`, 없으면 `WINDOW none`.
#   quiet-check: heavy snapshot RUN 수 · load1/코어 · ps 의 GradleWrapperMain·vitest·playwright(mcp 제외) 수로
#                `QUIET yes|no run=<n> per_core=<f> procs=<n>`. yes = RUN 0·procs 0·per_core < heavy.measure_quiet.
#                2분 유지 판정은 조정자가 두 번 불러 확인한다.
set -uo pipefail
. "$(dirname "$0")/lib/common.sh"

sub="${1:-}"; [ $# -gt 0 ] && shift
kind="" lane="" until_iso="" hold=0 dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --lane) lane="${2:-}"; shift ;;
    --until) until_iso="${2:-}"; shift ;;
    --hold-heavy) hold=1 ;;
    --dry-run) dry=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    -*) coord_die 2 "모르는 옵션: $1" ;;
    *) kind="$1" ;;
  esac
  shift
done
[ "$dry" = 1 ] && export COORD_DRY=1
JOBS="${DFLOW_HEAVY_JOBS:-$HOME/.dflow/jobs}"

windows_json() { coord_has_run && jq -c '.windows // []' "$(coord_state_file)" || echo '[]'; }

# job 의 프로세스를 lstart 가 맞을 때만 TERM(pid 재사용 방지). 손자(runpid, 슬롯을 쥔 heavy.sh) 먼저.
stop_job() {
  local id="$1" jd="$JOBS/$1" n p ps0 cur any=0
  [ -d "$jd" ] || { coord_log "잡 폴더가 없다: $jd"; return 0; }
  [ -f "$jd/rc" ] && { coord_log "잡 $id 은 이미 끝났다(rc=$(cat "$jd/rc"))"; return 0; }
  for n in run ""; do
    p="$(cat "$jd/${n}pid" 2>/dev/null)"; ps0="$(cat "$jd/${n}pstart" 2>/dev/null)"
    [ -n "$p" ] || continue
    cur="$(coord_pstart "$p")"
    if [ -n "$cur" ] && [ "$cur" = "$ps0" ]; then coord_do kill -TERM "$p" && any=1
    else coord_log "잡 $id 의 ${n:-job }pid $p 는 이미 없거나 다른 프로세스다(건너뜀)"; fi
  done
  [ "$any" = 1 ] && [ "${COORD_DRY:-0}" != 1 ] && sleep 1
  return 0
}

case "$sub" in
open)
  case "$kind" in measure|move|ban) ;; *) coord_die 2 "open <measure|move|ban> 가 필요하다" ;; esac
  [ -n "$until_iso" ] || coord_die 2 "--until <iso> 가 필요하다"
  ue="$(coord_iso_to_epoch "$until_iso")"; [ -n "$ue" ] || coord_die 2 "--until 시각을 읽지 못했다: $until_iso"
  now="$(coord_now_epoch)"; secs=$(( ue - now ))
  [ "$secs" -gt 0 ] || coord_die 2 "--until 이 이미 지났다: $until_iso"
  coord_has_run || coord_die 3 "현재 회차가 없다"
  job="-"
  if [ "$hold" = 1 ]; then
    if hs="$(coord_heavy_script)"; then
      if [ "$dry" = 1 ]; then
        coord_log "DRY $(coord_q bash "$hs" --detach --exclusive sleep "$secs")"
      else
        out="$(bash "$hs" --detach --exclusive sleep "$secs" 2>/dev/null)"
        case "$out" in *"HEAVY_DETACHED id="*) job="${out#*HEAVY_DETACHED id=}"; job="${job%% *}" ;;
          *) coord_log "heavy 붙잡기 실패(통지만으로 진행): $out" ;; esac
      fi
    else
      coord_log "heavy.script 가 없다 — 공용 칸은 붙잡지 않고 통지만 한다"
    fi
  fi
  w="$(jq -cn --arg k "$kind" --arg l "$lane" --arg o "$(coord_now_iso)" --arg u "$until_iso" --arg j "$job" \
    '{kind:$k, lane:(if $l == "" then null else $l end), opened_at:$o, until:$u, notified:[], hold_job:(if $j == "-" then null else $j end)}')"
  coord_state_call set '.windows' "$(windows_json | jq -c --argjson w "$w" '. + [$w]')"
  coord_state_call event window-open "${lane:--}" "$w"
  [ "$dry" = 1 ] && pre="DRY " || pre=""
  echo "${pre}WINDOW_OPEN $kind until=$until_iso hold_job=$job" ;;

close)
  ws="$(windows_json)"
  sel="$(jq -c --arg k "$kind" '[.[] | select($k == "" or .kind == $k)]' <<<"$ws")"
  if [ "$(jq 'length' <<<"$sel")" = 0 ]; then echo "WINDOW none"; exit 0; fi
  while IFS=$'\t' read -r k j l; do
    [ "$j" != "-" ] && stop_job "$j"
    coord_state_call event window-close "${l}" "$(jq -cn --arg k "$k" --arg j "$j" '{kind:$k, hold_job:(if $j == "-" then null else $j end)}')"
    [ "$dry" = 1 ] && echo "DRY WINDOW_CLOSED $k" || echo "WINDOW_CLOSED $k"
  done < <(jq -r '.[] | [.kind, (.hold_job // "-"), (.lane // "-")] | @tsv' <<<"$sel")
  coord_state_call set '.windows' "$(jq -c --arg k "$kind" '[.[] | select(($k == "" or .kind == $k) | not)]' <<<"$ws")"
  if hs="$(coord_heavy_script)" && [ "$dry" != 1 ]; then
    coord_log "heavy 현황: $(bash "$hs" snapshot 2>/dev/null | head -1 | tr '\t' ' ')"
  fi ;;

status)
  ws="$(windows_json)"
  if [ "$(jq 'length' <<<"$ws")" = 0 ]; then echo "WINDOW none"; exit 0; fi
  jq -r '.[] | "WINDOW \(.kind) lane=\(.lane // "-") until=\(.until // "-")"' <<<"$ws" ;;

quiet-check)
  run=0
  if hs="$(coord_heavy_script)"; then
    run="$(bash "$hs" snapshot 2>/dev/null | awk -F'\t' '$1 == "RUN"' | wc -l | tr -d ' ')"
  else
    coord_log "heavy.script 가 없다 — RUN 수는 0 으로 본다(ps 검사만)"
  fi
  procs="$(ps -axo pid=,command= 2>/dev/null | grep -E 'GradleWrapperMain|vitest|playwright' | grep -viE 'mcp|grep' | awk -v me="$$" '$1 != me' | wc -l | tr -d ' ')"
  load="$(coord_load1)"; cpus="$(coord_cpus)"
  pc="$(awk -v l="${load:-0}" -v c="${cpus:-1}" 'BEGIN { printf "%.2f", (c > 0 ? l / c : l) }')"
  q="$(coord_cfg .heavy.measure_quiet)"; q="${q:-0.5}"
  if [ "$run" = 0 ] && [ "$procs" = 0 ] && awk -v p="$pc" -v q="$q" 'BEGIN { exit !(p < q) }'; then r=yes; else r=no; fi
  echo "QUIET $r run=$run per_core=$pc procs=$procs" ;;

*) coord_die 2 "사용법: measure-window.sh open|close|status|quiet-check …" ;;
esac
exit 0
