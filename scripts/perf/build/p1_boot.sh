#!/bin/bash
# P1: be-run --all 기동 완료(7 포트 LISTEN)까지 초. 콜드·웜 분리, A,B,A,B,A,B 교대.
# 사용: p1_boot.sh <cold|warm|both> [ROUNDS=3]
# 로그: $RESULTS/p1_<모드>_<A|B>_r<n>.log (P2 가 콜드 로그를 읽는다). CSV: $RESULTS/p1.csv
cd "$(dirname "$0")" && . ./lib.sh
MODES="${1:-both}"; ROUNDS="${2:-3}"
[ "$MODES" = both ] && MODES="cold warm"
resolve_refs
trap 'wt_remove_all' EXIT
wt_ensure A; wt_ensure B
CSV="$RESULTS/p1.csv"
for mode in $MODES; do
  if [ "$mode" = warm ]; then
    # 웜 전제: 데몬·빌드 산출물이 있는 상태. 시간을 재지 않는 예열 1회를 대상마다 먼저 돈다.
    for t in A B; do log "웜 예열 $t (기록 안 함)"; be_boot_once "$t" warm "$RESULTS/p1_warmup_${t}.log"; done
  fi
  r=1
  while [ "$r" -le "$ROUNDS" ]; do
    for t in A B; do
      [ "$mode" = cold ] && clean_cold "$t"
      wait_quiet; L="$(load1)"
      logf="$RESULTS/p1_${mode}_${t}_r${r}.log"
      log "P1 $mode 회차 $r 대상 $t load1=$L"
      be_boot_once "$t" "$mode" "$logf"
      csv_add "$CSV" "$r" "$t" "$mode" boot_seconds "$BOOT_SECS" "$BOOT_RC" "$L"
      csv_add "$CSV" "$r" "$t" "$mode" stop_seconds "$BOOT_STOP_SECS" "$BOOT_RC" "$L"
      log "  -> boot=${BOOT_SECS}s stop=${BOOT_STOP_SECS}s rc=$BOOT_RC"
      [ "$BOOT_RC" = 3 ] && die "포트 점유: 서버 창 필요. 중단"
      sleep 20   # 회차 사이 식히기(load 안정)
    done
    r=$((r+1))
  done
done
./summarize.sh "$CSV" boot_seconds
