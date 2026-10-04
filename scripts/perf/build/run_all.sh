#!/bin/bash
# 일괄 실행(조정 세션 「측정 시작」 + 서버 창 확보 뒤에만). 사용: run_all.sh [B 커밋(기본 저장소 HEAD)]
# 순서: P1 콜드·웜(한 번에 실행, 워크트리 유지) → P2 계수 → P3. 단계 시각·load 는 $RESULTS/run_all.log 에 남는다.
cd "$(dirname "$0")" && . ./lib.sh
[ -n "${1:-}" ] && export B_REF="$1"
step() { echo "=== $(date '+%H:%M:%S') START $* | $(uptime)"; "$@"; rc=$?; echo "=== $(date '+%H:%M:%S') END rc=$rc $* | $(uptime)"; return $rc; }
{
  step ./p1_boot.sh both 3 || exit 1
  step ./p2_count.sh
  step ./p3_stop.sh
  for f in "$RESULTS/p1.csv" "$RESULTS/p3.csv"; do echo "--- $f"; ./summarize.sh "$f"; done
} 2>&1 | tee -a "$RESULTS/run_all.log"
