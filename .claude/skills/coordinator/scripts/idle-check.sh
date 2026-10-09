#!/usr/bin/env bash
# 사용법: idle-check.sh [레인…]   (없으면 active 레인 전부. 정본: ../references/contract.md §3.3, 설계 §3.i-2)
# stdout 레인마다 한 줄:
#   IDLE <레인> since=<iso>        확정(후보이고 거부 없음, 첫 관측 뒤 idle.confirm_gap_min 이상 지나 다시 후보). since = idle 시작 시각
#   CANDIDATE <레인>               첫 관측(확정 전). 관측 시각은 <회차>/ticks/idle-<레인>
#   BUSY <레인> <사유>             busy(세션 status 값) · idle-<n>m(idle_min 미만) · cooldown · bg=<콤마목록>
#   HOLD <레인> <사유>             hold until 미경과(사유 = hold.reason) · usage-band-R
#   WAIT_USER <레인> <창 종류>     화면에 확인·선택 창(permission·choice·usage-limit)
#   COMPACTING <레인>              화면 아래에 Compacting
#   STALL? <레인> bg=<분>m         bg 거부가 idle.stall_max_min 넘게 이어짐(분 = idle 지속 분: idle 중에는 새 bg 를 띄울 수 없으므로)
#   GONE <레인>                    세션 파일 없음 또는 pid 죽음
# 판정 순서: GONE → (until 지난 hold 는 coord-state.sh hold <레인> - 로 풀고 hold-expired 이벤트) → 후보 아님(BUSY)
#   → 후보 중 거부: WAIT_USER → COMPACTING → HOLD → HOLD usage-band-R → BUSY cooldown → bg(BUSY/STALL?) → CANDIDATE/IDLE.
# 화면 신호는 레인 handle 이 있을 때만 읽는다. 후보가 아니거나 거부되면 관측 기록을 지운다.
# 상태 쓰기(hold 풀기·이벤트)는 coord-state.sh 로만 한다(COORD_DRY=1 이면 DRY 로 찍기만).
set -uo pipefail
_SD="${0%/*}"; [ "$_SD" != "$0" ] || _SD=.
. "$_SD/lib/js-bridge.sh"; if _jsb_on IDLE_CHECK; then _jsb_exec "$_SD/idle-check" "$@"; fi   # node 판(스위치 COORD_JS_IDLE_CHECK)
# shellcheck source=lib/common.sh
. "$(dirname "$0")/lib/common.sh"
# shellcheck source=lib/term.sh
. "$(dirname "$0")/lib/term.sh"
coord_default_repo

case "${1:-}" in -h|--help) sed -n '2,16p' "$0" >&2; exit 0 ;; -*) coord_die 2 "사용법: idle-check.sh [레인…]" ;; esac

coord_has_run || coord_die 3 "현재 회차가 없다(coord-state.sh init 먼저)"
SF="$(coord_state_file)"
TICKS="$(coord_run_dir)/ticks"; mkdir -p "$TICKS" || coord_die 4 "ticks 폴더 생성 실패: $TICKS"
DIR="$(dirname "$0")"
NOW="$(coord_now_epoch)"
num() { case "${1:-}" in ""|*[!0-9]*) printf '%s' "$2" ;; *) printf '%s' "$1" ;; esac; }
IDLE_MIN="$(num "$(coord_cfg .idle.idle_min)" 5)"
COOL_MIN="$(num "$(coord_cfg .idle.cooldown_min)" 15)"
GAP_MIN="$(num "$(coord_cfg .idle.confirm_gap_min)" 2)"
STALL_MAX="$(num "$(coord_cfg .idle.stall_max_min)" 90)"

SNAP=""
if HS="$(coord_heavy_script)"; then SNAP="$(bash "$HS" snapshot 2>/dev/null)"; fi
BAND=""
band() { [ -n "$BAND" ] || BAND="$(bash "$DIR/usage-band.sh" 2>/dev/null | awk '{ print $2 }')"; printf '%s' "${BAND:-UNKNOWN}"; }
clear_tick() { rm -f "$TICKS/idle-$1"; }

if [ $# -gt 0 ]; then lanes="$*"
else lanes="$(jq -r '.lanes | to_entries[] | select((.value.state // "active") == "active") | .key' "$SF")"; fi

for L in $lanes; do
  if [ "$(jq -r --arg l "$L" '.lanes | has($l)' "$SF")" != true ]; then coord_log "없는 레인: $L"; continue; fi
  row="$(jq -r --arg l "$L" '.lanes[$l] as $x | [($x.session.session_id // ""), ($x.session.pid // 0 | tostring), ($x.session.handle // ""),
          ($x.hold.reason // ""), ($x.hold.until // ""), ($x.last_instr_at // ""), ($x.worktree // "")] | map(tostring) | join("\u001f")' "$SF")"
  IFS=$'\037' read -r sid pid handle hreason huntil linstr wt <<EOF
$row
EOF
  sfile="$(coord_session_file "$pid" "$sid" 2>/dev/null || true)"
  spid=""; [ -n "$sfile" ] && spid="$(jq -r '.pid // empty' "$sfile")"
  if [ -z "$sfile" ] || ! coord_pid_alive "$spid"; then clear_tick "$L"; echo "GONE $L"; continue; fi
  status="$(jq -r '.status // "unknown"' "$sfile")"
  s2="$(jq -r '.sessionId // empty' "$sfile")"; [ -n "$s2" ] && sid="$s2"
  upd="$(jq -r '(.statusUpdatedAt // .updatedAt // 0) / 1000 | floor' "$sfile")"

  # until 지난 hold 풀기
  if [ -n "$hreason" ] && [ -n "$huntil" ]; then
    ue="$(coord_iso_to_epoch_loose "$huntil")"
    if [ -n "$ue" ] && [ "$ue" -le "$NOW" ]; then
      coord_state_call hold "$L" -
      coord_state_call event hold-expired "$L" "$(jq -nc --arg r "$hreason" --arg u "$huntil" '{reason:$r, until:$u}')"
      hreason=""
    fi
  fi

  # 후보 판정
  idle_for=$(( (NOW - upd) / 60 )); [ "$idle_for" -lt 0 ] && idle_for=0
  if [ "$status" != idle ]; then clear_tick "$L"; echo "BUSY $L $status"; continue; fi
  if [ "$idle_for" -lt "$IDLE_MIN" ]; then clear_tick "$L"; echo "BUSY $L idle-${idle_for}m"; continue; fi

  # 거부 신호
  if [ -n "$handle" ]; then
    scr="$(term_read_screen "$handle" 40 2>/dev/null || true)"
    if [ -n "$scr" ]; then
      kind="$(printf '%s\n' "$scr" | coord_screen_prompt_kind)"
      if [ -n "$kind" ]; then clear_tick "$L"; echo "WAIT_USER $L $kind"; continue; fi
      if printf '%s\n' "$scr" | tail -n 15 | grep -q 'Compacting'; then clear_tick "$L"; echo "COMPACTING $L"; continue; fi
    fi
  fi
  if [ -n "$hreason" ]; then clear_tick "$L"; echo "HOLD $L $(printf '%s' "$hreason" | tr ' \t' '__')"; continue; fi
  if [ "$(band)" = R ]; then clear_tick "$L"; echo "HOLD $L usage-band-R"; continue; fi
  if [ -n "$linstr" ]; then
    le="$(coord_iso_to_epoch_loose "$linstr")"
    if [ -n "$le" ] && [ $((NOW - le)) -lt $((COOL_MIN * 60)) ]; then clear_tick "$L"; echo "BUSY $L cooldown"; continue; fi
  fi
  bg="$(coord_bg_signals "$(coord_wt_abs "$wt")" "$sid" "$SNAP")"
  if [ -n "$bg" ]; then
    clear_tick "$L"
    if [ "$idle_for" -gt "$STALL_MAX" ]; then echo "STALL? $L bg=${idle_for}m"; else echo "BUSY $L bg=$bg"; fi
    continue
  fi

  # 확정
  tf="$TICKS/idle-$L"
  first="$(head -1 "$tf" 2>/dev/null | tr -cd '0-9')"
  if [ -n "$first" ] && [ "$first" -ge "$upd" ] && [ $((NOW - first)) -ge $((GAP_MIN * 60)) ]; then
    echo "IDLE $L since=$(coord_epoch_to_iso "$upd")"
  elif [ -n "$first" ] && [ "$first" -ge "$upd" ]; then
    echo "CANDIDATE $L"
  else
    printf '%s\n' "$NOW" > "$tf.tmp.$$" && mv -f "$tf.tmp.$$" "$tf"
    echo "CANDIDATE $L"
  fi
done
exit 0
