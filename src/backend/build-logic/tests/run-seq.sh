#!/usr/bin/env bash
# 같은 build 안 Oracle Test 태스크가 여럿일 때 시험 차례(acquireTurn) 교착이 없는지 보는 회귀 시험(Oracle 접속 없음, 2026-10-09).
# 사용: run-seq.sh [반복 횟수=5] [composite-seq|composite-multi]. 기존 PDB 모드(-Pdmes.ora.pdb)라 복제·삭제 없이 PC 잠금만 임시 TMPDIR 에 만들어 다른 레인과 겹치지 않는다.
# 교착이면 DMES_ORA_TURN_WAIT_MS(여기서는 60초) 뒤 「Oracle 시험 차례를 … 기다려도 받지 못했다」 로 실패한다 — 실패 횟수를 센다.
# 병렬이 아닌 빌드(--parallel 없음)에 워커 3개로 돌린다: 대기자가 프로젝트 잠금을 쥔 채 기다리면 차례 주인의 마무리 태스크가 못 돈다(진단: ~/.coord/logfmt-1008/lanes/jsched-tx/memo.md).
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
backend="$(cd "$here/../.." && pwd)"
runs="${1:-5}"
fixture="${2:-composite-seq}"   # composite-seq(한 build 의 하위 프로젝트 4개) | composite-multi(included build 3개, 태스크 testAll)
[ "$fixture" = composite-multi ] && task=testAll || task=test
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
fail=0
faildir="$(mktemp -d -t seq-fail)"
for i in $(seq 1 "$runs"); do
  tmp="$(mktemp -d)"
  out="$tmp/out.txt"
  start=$(date +%s)
  TMPDIR="$tmp" DMES_TEST_SLOTS=0 DMES_ORA_HARNESS_LOCK_WAIT_SEC=30 DMES_ORA_TURN_WAIT_MS=60000 \
    "$backend/gradlew" -p "$here/$fixture" $task --continue --max-workers=3 --no-daemon --console=plain --rerun-tasks \
    -Pdmes.ora.pdb=T_FIXTURE >"$out" 2>&1
  rc=$?
  secs=$(( $(date +%s) - start ))
  if [ "$rc" -eq 0 ]; then
    echo "run $i: OK (${secs}s) 차례 대기 $(grep -c '다른 Oracle 시험이 끝나기를 기다린다' "$out")회"
  else
    fail=$((fail + 1))
    echo "run $i: FAIL rc=$rc (${secs}s) — $(grep -m1 '차례를' "$out" || grep -m1 'FAILED' "$out" || echo '원인 줄 없음')"
    cp "$out" "$faildir/run-$i.txt"
  fi
  rm -rf "$tmp"
done
echo "실패 $fail/$runs (실패 로그: $faildir)"
[ "$fail" -eq 0 ]
