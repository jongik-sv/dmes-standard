#!/usr/bin/env bash
# H4 재현 시도(1회): 차례를 쥔 직후 빌드를 취소하고 같은 데몬으로 다시 돌렸을 때 차례 대기가 남는지 본다.
# heavy.sh 로 감싸 실행한다. Oracle 접속 없음(기존 PDB 모드), 임시 TMPDIR, 30분 상한.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; backend="$(cd "$here/../.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
T="$(mktemp -d)"; export TMPDIR="$T" DMES_TEST_SLOTS=0 DMES_ORA_HARNESS_LOCK_WAIT_SEC=30 DMES_ORA_TURN_WAIT_MS=90000
G="$backend/gradlew"; F="$here/composite-seq"
args=(-p "$F" test --continue --max-workers=3 --console=plain --rerun-tasks -Pdmes.ora.pdb=T_FIXTURE)
SEQ_TEST_SLEEP_MS=60000 "$G" "${args[@]}" >"$T/a.txt" 2>&1 & P=$!
for _ in $(seq 1 120); do grep -q "시험 PDB T_FIXTURE →" "$T/a.txt" 2>/dev/null && break; sleep 2; done
echo "1차: 차례 쥠 확인 $(grep -c '시험 PDB T_FIXTURE →' "$T/a.txt")회, 취소"
kill -INT "$P"; sleep 15; kill -9 "$P" 2>/dev/null; wait "$P" 2>/dev/null
s=$(date +%s)
SEQ_TEST_SLEEP_MS=300 timeout 600 "$G" "${args[@]}" >"$T/b.txt" 2>&1; rc=$?
echo "2차(같은 데몬): rc=$rc $(( $(date +%s) - s ))s 차례 대기 $(grep -c '끝나기를 기다린다' "$T/b.txt")회 / $(grep -m1 '차례를' "$T/b.txt" | cut -c1-120)"
"$G" -p "$F" --stop >/dev/null 2>&1
echo "로그: $T"
