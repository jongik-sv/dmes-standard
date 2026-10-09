#!/bin/bash
# 본 측정 일괄 실행 — 단계마다 시각·load 를 찍는다. 로그는 이 스크립트가 $RESULTS/run_all.log 로 직접 남긴다(저장소 밖).
# 공용 무거운 작업 칸을 독점하려면 이 스크립트 전체를 감싼다(단계마다 감싸지 않는다. 독점 안의 heavy.mjs 는 슬롯을 다시 쓰고 통과하므로 HEAVY_CMD 는 비운다. 안에서 --exclusive 를 다시 부르면 거부된다):
#   node .claude/skills/dflow-dev/scripts/heavy.mjs --detach --exclusive scripts/perf/framework/run_all.sh  (뒤이어 node heavy.mjs wait <id> — 한 번에 최대 240초만 기다리므로 HEAVY_JOB_RUNNING(exit 76)인 동안 다시 부른다. HEAVY_JOB_BUSY 면 다시 --detach)
cd "$(dirname "$0")"
source ./lib.sh
exec > >(tee -a "$RESULTS/run_all.log") 2>&1
step() { echo "=== $(date '+%H:%M:%S') START $* | $(uptime)"; "$@"; rc=$?; echo "=== $(date '+%H:%M:%S') END rc=$rc $* | $(uptime)"; return $rc; }
step ./p3_logs.sh || exit 1
step ./p1_cache.sh 3 || exit 1
step ./p2_build.sh || exit 1
step ./p2_run.sh 3
rc=$?
step ./p2_cleanup.sh
for f in "$RESULTS"/p*.csv; do echo "--- $f"; python3 summarize.py "$f"; done
exit $rc
