#!/usr/bin/env bash
# 감시 틱 한 번을 묶어 돌리고, 조정자가 행동해야 할 줄만 낸다. 정본: ../references/contract.md §3.3, ../SKILL.md 「틱 절차」
# 사용법: tick.sh [--no-answer] [--dry-run]
#   수집·판정을 모두 스크립트로 해서 조정자는 결과 몇 줄만 읽는다(조용한 틱은 `TICK quiet` 한 줄).
#   확인·선택 창은 판정표대로 바로 응답한다(auto-answer.sh). --no-answer 면 PROMPT 줄만 낸다.
#   stdout(행동 줄만, 순서대로):
#     PROMPT <레인> <kind> · ANSWER/DENY/ESCALATE …(auto-answer 결과 그대로)
#     IDLE <레인> since=… · WAIT_USER <레인> <kind> · STALL? <레인> … · GONE <레인>     (idle-check)
#     STALL <레인> …                                                                    (stall-check)
#     CTX_OVER <레인> pct=<n> thr=<n> · CTX_OVER_SELF pct=<n> thr=<n>
#     BAND_CHANGED <이전> <지금> five=<n> week=<n>        (state.usage 를 지금 값으로 갱신해 한 번만 낸다)
#     LOAD_SOFT|LOAD_HARD|LOAD_RELEASE per_core=<f>      (두 틱 연속일 때만)
#     WINDOW_DUE <kind> lane=<레인|-> until=<iso>
#     UNACKED <instr-id> <레인> <분>m
#     UNLINKED <이름> pid=<pid>                          (처음 본 것만)
#     STALE_RUN <run-id> session=<id|-> idle=<분>m       (다른 조정 세션이 연 회차가 마감 표식 없이 살아 있는 레인을 둔 채 남음 — 경고만.
#                                                         같은 세션의 열린 회차는 팀장 칸을 공유하는 정상 상태라 알리지 않는다)
#     TICK quiet                                          (위 줄이 하나도 없을 때)
set -uo pipefail
SD="$(cd "$(dirname "$0")" && pwd)"
source "$SD/lib/common.sh"

answer=1 dry=0
for a in "$@"; do case "$a" in --no-answer) answer=0 ;; --dry-run) dry=1; export COORD_DRY=1 ;; -h|--help) sed -n 2,19p "$0"; exit 0 ;; esac; done
coord_has_run || coord_die 3 "현재 회차가 없다"
RD="$(coord_run_dir)"; mkdir -p "$RD/ticks"
out=()
emit() { out+=("$*"); }
now="$(coord_now_epoch)"

status="$(bash "$SD/coord-status.sh" 2>/dev/null)"

# 1. 확인·선택 창(busy·idle 가리지 않고 handle 이 있는 active 레인). 감지는 폴러의 화면 캐시가 신선하면 orca 를 부르지 않는다(prompt-watch.sh).
#    응답 직전 재판정(auto-answer.sh)은 캐시를 쓰지 않고 늘 직접 읽는다.
for L in $(coord_state '.lanes | to_entries[] | select((.value.state // "active") == "active" and ((.value.session.handle // "") != "")) | .key'); do
  pw="$(bash "$SD/prompt-watch.sh" "$L" 2>/dev/null | head -1)"
  case "$pw" in
    PROMPT*)
      kind="$(printf '%s' "$pw" | awk '{print $3}')"
      if [ "$answer" = 1 ]; then
        flag=(); [ "$dry" = 1 ] && flag=(--dry-run)
        r="$(bash "$SD/auto-answer.sh" --lane "$L" "${flag[@]+"${flag[@]}"}" 2>/dev/null | head -1)"
        case "$r" in NONE*|"") ;; *) emit "$r lane=$L" ;; esac
      else emit "PROMPT $L $kind"; fi ;;
  esac
done

# 2. idle·정지
while read -r kind L rest; do
  case "$kind" in IDLE|WAIT_USER|STALL\?|GONE) emit "$kind $L $rest" ;; esac
done < <(bash "$SD/idle-check.sh" 2>/dev/null)
while read -r kind L rest; do [ "$kind" = STALL ] && emit "STALL $L $rest"; done < <(bash "$SD/stall-check.sh" 2>/dev/null)

# 3. 컨텍스트 임계(레인은 coord-status 의 ctx 칸, 창 크기별 임계)
thr_for() { # <window> → pct 임계
  coord_cfg_all | jq -r --arg w "${1:-}" '.compact as $c | (($c.by_window[$w].pct) // $c.threshold_pct // 40)'
}
cool="$(coord_cfg .compact.cooldown_min)"; cool="${cool:-30}"
while read -r _ L name st _for _rep _com _ah _bg ctxf _hold; do
  pct="${ctxf#ctx=}"; pct="${pct%\%}"; case "$pct" in ''|-|*[!0-9]*) continue ;; esac
  win="$(coord_lane_get "$L" .session.window 2>/dev/null)"; [ -n "$win" ] && [ "$win" != null ] || win="$(coord_cfg .compact.default_window)"
  thr="$(thr_for "$win")"
  [ "$pct" -ge "$thr" ] || continue
  last="$(coord_iso_to_epoch "$(coord_lane_get "$L" .compact.last_at 2>/dev/null)")"
  [ -n "$last" ] && [ $(( (now - last) / 60 )) -lt "$cool" ] && continue
  emit "CTX_OVER $L pct=$pct thr=$thr"
done < <(printf '%s\n' "$status" | grep '^LANE ')
self="$(coord_state '.run.coordinator.session_id // empty')"
if [ -n "$self" ]; then
  c="$(bash "$SD/ctx-usage.sh" "$self" 2>/dev/null)"
  case "$c" in *" pct="*)
    pct="$(printf '%s' "$c" | sed 's/.* pct=\([0-9]*\).*/\1/')"; win="$(printf '%s' "$c" | sed 's/.* window=\([0-9]*\).*/\1/')"
    thr="$(thr_for "$win")"; [ "$pct" -ge "$thr" ] && emit "CTX_OVER_SELF pct=$pct thr=$thr" ;;
  esac
fi

# 4. 사용량 띠(바뀔 때 한 번)
ub="$(bash "$SD/usage-band.sh" 2>/dev/null)"
band="$(printf '%s' "$ub" | awk '{print $2}')"; old="$(coord_state '.usage.band // "UNKNOWN"')"
if [ -n "$band" ] && [ "$band" != UNKNOWN ] && [ "$band" != "$old" ]; then
  five="$(printf '%s' "$ub" | sed 's/.* five=\([^ ]*\).*/\1/')"; week="$(printf '%s' "$ub" | sed 's/.* week=\([^ ]*\).*/\1/')"
  emit "BAND_CHANGED $old $band five=$five week=$week"
  coord_state_call set '.usage' "$(jq -cn --arg b "$band" --arg f "$five" --arg w "$week" --arg at "$(coord_now_iso)" '{band:$b,five:($f|tonumber? // null),week:($w|tonumber? // null),src:"tick",at:$at}')" >/dev/null
fi

# 5. load(두 틱 연속)
pc="$(printf '%s\n' "$status" | grep '^PC ' | sed 's/.* per_core=\([0-9.]*\).*/\1/')"
if [ -n "$pc" ]; then
  soft="$(coord_cfg .heavy.load_soft)"; hard="$(coord_cfg .heavy.load_hard)"; rel="$(coord_cfg .heavy.load_release)"
  lvl="$(awk -v p="$pc" -v s="${soft:-1.2}" -v h="${hard:-2.0}" -v r="${rel:-0.8}" 'BEGIN{ if (p>=h) print "hard"; else if (p>=s) print "soft"; else if (p<r) print "release"; else print "mid" }')"
  prev="$(cat "$RD/ticks/load" 2>/dev/null)"; echo "$lvl" > "$RD/ticks/load"
  if [ "$lvl" = "$prev" ]; then
    case "$lvl" in
      hard) emit "LOAD_HARD per_core=$pc" ;;
      soft) emit "LOAD_SOFT per_core=$pc" ;;
      release) [ "$(coord_state '.load.banned | length' 2>/dev/null)" != 0 ] && emit "LOAD_RELEASE per_core=$pc" ;;
    esac
  fi
fi

# 6. 창 끝
while IFS=$'\t' read -r k l u; do
  ue="$(coord_iso_to_epoch "$u")"; [ -n "$ue" ] && [ "$now" -ge "$ue" ] && emit "WINDOW_DUE $k lane=${l:--} until=$u"
done < <(coord_state '.windows[]? | [.kind, (.lane // "-"), (.until // "")] | @tsv' 2>/dev/null)

# 7. ack 없는 지시(cooldown 넘은 것)
ic="$(coord_cfg .idle.cooldown_min)"; ic="${ic:-15}"
while IFS=$'\t' read -r id L sent; do
  se="$(coord_iso_to_epoch "$sent")"; [ -n "$se" ] || continue
  age=$(( (now - se) / 60 )); [ "$age" -ge "$ic" ] && emit "UNACKED $id $L ${age}m"
done < <(coord_state '.instrs[]? | select(.ack_at == null) | [.id, .lane, .sent_at] | @tsv' 2>/dev/null)

# 8. 처음 본 UNLINKED 세션
seen="$RD/ticks/unlinked"; touch "$seen"
while read -r _ nm pidf _; do
  grep -qxF "$nm" "$seen" || { echo "$nm" >> "$seen"; emit "UNLINKED $nm $pidf"; }
done < <(printf '%s\n' "$status" | grep '^UNLINKED ')

# 9. 다른 조정 세션이 연 회차가 마감 표식 없이 살아 있는 레인을 둔 채 남음(contract §2.1·§3.3, 경고만 — 자동 마감하지 않는다).
#    팀장 키는 조정 세션 단위라 같은 세션의 다른 열린 회차는 정상(팀장 칸 공유)이므로 알리지 않는다.
me8="$(coord_sess8 "$RD/state.json")"
while IFS=$'\t' read -r rid sid s8 alive; do
  [ -n "$rid" ] && [ "$s8" != "$me8" ] && [ "${alive:-0}" -gt 0 ] || continue
  mt="$(coord_file_mtime "$(coord_state_root)/$rid/state.json")"; age="-"
  # 조정 세션이 둘이면 서로의 회차가 늘 보이므로, state.json 이 STALE_MIN(120)분 넘게 조용한 회차만 알린다(mtime 을 모르면 알린다).
  if [ -n "$mt" ]; then [ $(( (now - mt) / 60 )) -ge 120 ] || continue; age="$(( (now - mt) / 60 ))m"; fi
  emit "STALE_RUN $rid session=$sid idle=$age"
done < <(coord_stale_runs "$(basename "$RD")")

if [ "${#out[@]}" -eq 0 ]; then echo "TICK quiet"; else printf '%s\n' "${out[@]}"; fi
[ "${#out[@]}" -gt 0 ] && coord_state_call event tick - "$(jq -cn --argjson n "${#out[@]}" '{actions:$n}')" >/dev/null 2>&1
# 에이전트 오피스 하트비트(팀장·살아 있는 레인 전원을 state.json 기준으로 재전송). 실패·dry-run 이어도 틱 출력은 그대로다.
# 그 전에 틱 시각을 남긴다(팀장 자리 요약의 alive.last_tick_at — contract §4).
[ "$dry" = 1 ] || coord_state_call set '.run.last_tick_at' "$(jq -nc --arg t "$(coord_now_iso)" '$t')" >/dev/null 2>&1 || true
[ "$dry" = 1 ] || bash "$SD/office.sh" beat >/dev/null 2>&1 || true
# 오피스 콘솔 폴러가 죽었으면 다시 띄운다(이미 돌면 아무 일도 하지 않는다 — contract §4.1). COORD_CONSOLE_POLL=0 이면 건너뜀.
[ "$dry" = 1 ] || [ "${COORD_CONSOLE_POLL:-1}" = 0 ] || bash "$SD/console-poll.sh" start >/dev/null 2>&1 </dev/null || true
exit 0
