#!/usr/bin/env bash
# 사용법: compact-lane.sh <레인> [--force-no-memo] [--dry-run]
#   레인 세션에 /compact 를 안전하게 넣고 끝날 때까지 확인한다(설계 §3.j-3~5). 정본 출력: references/contract.md §3.5
#   거부: merge-in-flight(머지 중) · measure-lane(열린 측정 창의 측정 레인) · no-memo(pre_compact 없음, --force-no-memo 로 통과)
#         · cooldown(compact.cooldown_min 안) · unsupported-kind(opencode·agy 등) · no-handle · term-send-safe 의 거부 사유 그대로.
#   stdout: `COMPACT_REFUSED <레인> <사유>` · `COMPACT_DONE <레인> before=<n|-> after=<n|->` · `COMPACT_TIMEOUT <레인>`.
#   --dry-run: 판정·화면 확인은 실제로, 보내기 직전에 멈추고 `DRY COMPACT_DONE <레인> before=<n|-> after=-`.
#   재측정(after)이 직전(before)과 같거나 못 읽으면 transcript 가 아직 안 갱신된 것이다: 화면 상태줄의 ctx % 로 after 를 어림하고
#   (ctx % × 창 크기), 그것도 없으면 화면의 Compacted 문구만 확인한 채 after=- 로 낸다. 보조 경로를 쓰면 stderr 에만 알린다.
set -uo pipefail
. "$(dirname "$0")/lib/common.sh"
. "$(dirname "$0")/lib/term.sh"
. "$(dirname "$0")/lib/compact-screen.sh"
SD="$(dirname "$0")"

lane="" force=0 dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --force-no-memo) force=1 ;;
    --dry-run) dry=1 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    -*) coord_die 2 "모르는 옵션: $1" ;;
    *) lane="$1" ;;
  esac
  shift
done
[ -n "$lane" ] || coord_die 2 "사용법: compact-lane.sh <레인> [--force-no-memo] [--dry-run]"
[ "$dry" = 1 ] && export COORD_DRY=1
coord_has_run || coord_die 3 "현재 회차가 없다"
SF="$(coord_state_file)"
[ "$(jq -r --arg l "$lane" '.lanes[$l] | type' "$SF")" = object ] || coord_die 2 "상태에 없는 레인: $lane"
LP=".lanes[\"$lane\"]"

refuse() { echo "COMPACT_REFUSED $lane $1"; [ -n "${2:-}" ] && coord_log "$2"; exit 0; }

kind="$(coord_lane_get "$lane" .session.kind)"
case "${kind:-claude}" in claude|glm) ;; *) refuse unsupported-kind "kind=$kind 는 /compact 대상이 아니다(설계 §3.j-6)" ;; esac
h="$(coord_lane_get "$lane" .session.handle)"
[ -n "$h" ] || refuse no-handle "handle 이 상태에 없다 — 신원 보고를 다시 받을 것"
sid="$(coord_lane_get "$lane" .session.session_id)"

# j-3 머지 중·측정 레인
[ "$(jq -r '.merge.in_flight.lane // empty' "$SF")" = "$lane" ] && refuse merge-in-flight
[ -n "$(jq -r --arg l "$lane" '.windows[]? | select(.kind == "measure" and .lane == $l) | .kind' "$SF")" ] && refuse measure-lane

# j-4 준비(정본 갱신 완료 답의 남은 일)·쿨다운
pre="$(coord_lane_get "$lane" .compact.pre_compact)"
if [ -z "$pre" ] && [ "$force" != 1 ]; then refuse no-memo "정본 갱신 요청 → 답의 「남은 일 3줄」을 $LP.compact.pre_compact 에 먼저 적을 것"; fi
last="$(coord_lane_get "$lane" .compact.last_at)"
cool="$(coord_cfg .compact.cooldown_min)"; cool="${cool:-30}"
if [ -n "$last" ]; then
  le="$(coord_iso_to_epoch "$last")"
  if [ -n "$le" ] && [ $(( $(coord_now_epoch) - le )) -lt $(( cool * 60 )) ]; then refuse cooldown "마지막 compact $last (간격 ${cool}분)"; fi
fi

# 보낼 글(한 줄, ! 없음)
memo="$(coord_lane_get "$lane" .memo)"
cname="$(coord_state '.run.coordinator.name // empty')"; caddr="$(coord_state '.run.coordinator.addr // empty')"
next="$(printf '%s\n' "$pre" | sed '/^[[:space:]]*$/d' | head -1 | sed 's/^[[:space:]]*//')"
text="/compact $lane 진행 중. 정본은 ${memo:--}. 조정 세션 ${cname:--}(${caddr:--}). 다음 단계: ${next:--}"
text="$(printf '%s' "$text" | tr '\n\r\t' '   ')"
case "$text" in *'!'*) text="${text//!/}"; coord_log "글의 ! 를 지웠다(셸 모드 방지)" ;; esac

ctx_tokens() {  # ctx_tokens → n 또는 -
  local o
  [ -n "$sid" ] && [ -f "$SD/ctx-usage.sh" ] || { echo -; return; }
  o="$(bash "$SD/ctx-usage.sh" "$sid" 2>/dev/null | head -1)"
  case "$o" in *" tokens="*) o="${o#* tokens=}"; echo "${o%% *}" ;; *) echo - ;; esac
}
before="$(ctx_tokens)"

sargs=(--handle "$h" --text "$text" --timeout-ms 300000)
[ "$dry" = 1 ] && sargs+=(--dry-run)
sres="$(bash "$SD/term-send-safe.sh" "${sargs[@]}")"; src=$?
case "$sres" in
  "REFUSED "*) refuse "${sres##* }" ;;
  "DRY SENT "*)
    coord_log "DRY 이어서: Compacting 나타남(최대 60초)·사라짐(10초 간격, 최대 $(coord_cfg .compact.wait_max_min)분) 확인 → after 측정 → 상태·이벤트 기록"
    echo "DRY COMPACT_DONE $lane before=$before after=-"; exit 0 ;;
  "SENT "*) ;;
  *) coord_die 4 "term-send-safe 실패(rc=$src): $sres" ;;
esac
coord_state_call event compact-sent "$lane" "$(jq -cn --arg t "$text" --arg b "$before" '{text:$t, before:$b}')"

has_compacting() { term_read_screen "$h" 40 2>/dev/null | tail -n 20 | grep -q 'Compacting'; }
# 보낸 직후엔 아직 Compacting 이 안 보인다 — 나타나기를 최대 60초 기다린다(짧은 compact 는 못 볼 수 있다)
i=0; while [ "$i" -lt 12 ]; do has_compacting && break; sleep 5; i=$((i + 1)); done
maxm="$(coord_cfg .compact.wait_max_min)"; maxm="${maxm:-10}"
end=$(( $(coord_now_epoch) + maxm * 60 ))
while has_compacting; do
  if [ "$(coord_now_epoch)" -ge "$end" ]; then
    echo "COMPACT_TIMEOUT $lane"
    coord_state_call event compact-timeout "$lane" "{\"wait_max_min\":$maxm}"
    exit 0
  fi
  sleep 10
done
after="$(ctx_tokens)"
# 재측정이 직전 값과 같으면 transcript 가 아직 갱신되지 않은 것이다 — 화면으로 확인한다(compact.md §6)
if [ "$after" = "$before" ] || [ "$after" = "-" ]; then
  scr="$(term_read_screen "$h" 40 2>/dev/null || true)"
  pct="$(printf '%s\n' "$scr" | compact_screen_ctx_pct)"
  if [ -n "$pct" ]; then
    win="$(coord_lane_get "$lane" .session.window)"; win="${win:-$(coord_cfg .compact.default_window)}"; win="${win:-200000}"
    after=$(( pct * win / 100 ))
    coord_log "COMPACT_NOTE $lane transcript 가 아직 갱신되지 않아 화면 ctx ${pct}% 로 after 를 어림했다(약 ${after} 토큰, 창 ${win})"
  elif printf '%s\n' "$scr" | compact_screen_compacted; then
    after="-"
    coord_log "COMPACT_NOTE $lane transcript 가 아직 갱신되지 않아 화면 Compacted 문구로만 확인했다(after=-)"
  else
    after="-"
    coord_log "COMPACT_NOTE $lane 재측정이 직전 값과 같은데 화면에서도 ctx %·Compacted 를 찾지 못했다(after=-). 화면을 직접 확인할 것"
  fi
fi

now="$(coord_now_iso)"
hist="$(jq -c --arg l "$lane" '.lanes[$l].compact.history // []' "$SF")"
rec="$(jq -cn --arg at "$now" --arg b "$before" --arg a "$after" \
  '{at:$at, before_tokens:($b|tonumber? // null), after_tokens:($a|tonumber? // null)}')"
coord_state_call set "$LP.compact.history" "$(jq -c --argjson r "$rec" '. + [$r]' <<<"$hist")"
coord_state_call set "$LP.compact.last_at" "\"$now\""
coord_state_call set "$LP.compact.pending" false
coord_state_call event compact-done "$lane" "$rec"
echo "COMPACT_DONE $lane before=$before after=$after"
coord_log "다음: 레인에 「재개 확인: 정본을 읽고 남은 일 3줄로 답한 뒤 이어서 진행해 달라.」 를 보내 pre_compact 와 대조"
exit 0
