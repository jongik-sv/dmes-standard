#!/usr/bin/env bash
# build-logic 시험 자리·상위 잠금 회귀 시험(Oracle 접속 없음, 임시 TMPDIR, 2026-10-12 잠금 세분화).
# 경우: ① 직접 자리 잡기(own) ② 상위 heavy 가 넘긴 자리(DMES_ORA_SEAT_HELD → seatadopt) ③ 옛 상위 CDB 잠금(DMES_ORA_LOCK_HELD → mutex)
#       ④ 죽은 pid 의 DMES_ORA_LOCK_HELD → own ⑤ 자리 2개가 다 차 있으면 기다리다 시간 초과로 실패.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; backend="$(cd "$here/../.." && pwd)"; repo="$(cd "$backend/../.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
# gradlew 의 heavy 감싸기를 끈다 — heavy 가 자리를 먼저 잡아 넘기면 own 경우를 볼 수 없다(seatadopt 는 그 경로를 직접 만든다).
T="$(mktemp -d)"; export TMPDIR="$T" DMES_TEST_SLOTS=0 DMES_ORA_HARNESS_LOCK_WAIT_SEC=30 DMES_ORA_TEST_SEATS=2 DFLOW_GRADLEW_NO_HEAVY=1
unset DMES_ORA_LOCK_HELD DMES_ORA_SEAT_HELD
fail=0
trap 'kill "${holder:-0}" "${s1:-0}" "${s2:-0}" 2>/dev/null; pkill -P $$ sleep 2>/dev/null; kill "${wd:-0}" 2>/dev/null; rm -rf "$T"' EXIT
# 전체 시간 상한 240초 — 멈추면 스스로 끝낸다(heavy 자리를 오래 쥐지 않게)
( sleep 240; echo "FAIL 전체 시간 상한(240초) 초과" >&2; kill -TERM $$ ) & wd=$!
run() { # <기대> [ENV=값 …]
  local expect="$1"; shift
  local out="$T/g-$expect.txt"
  env "$@" PROBE_EXPECT="$expect" "$backend/gradlew" -p "$here/composite-seq" probeLockHeld --no-daemon --console=plain -Pdmes.ora.pdb=T_FIXTURE >"$out" 2>&1
  if grep -q "PROBE-LOCKHELD $expect ok" "$out"; then echo "OK  $expect ($*)"; else echo "FAIL $expect ($*)"; grep -E "Assertion|assert|FAILED|오류|자리" "$out" | head -8; fail=$((fail+1)); fi
}
# 상위가 잠금을 쥔 상황을 만든다: stdin 은 sleep 파이프로 열어 둔다(fifo 는 macOS 의 node 가 쓰기 끝이 닫혀도 끝을 못 알아채 멈춘다).
hold() { # <명령> <출력 파일> <기다릴 낱말>
  sleep 600 | node "$repo/scripts/oracle/pdb.mjs" $1 --wait-sec 20 >"$2" 2>&1 &
  for _ in $(seq 1 40); do grep -q "$3" "$2" 2>/dev/null && break; sleep 0.25; done
}
# ① 직접
run own
[ -z "$(ls "$T" | grep dmes-ora-)" ] && echo "OK  끝나면 잠금 폴더 없음" || { echo "FAIL 남은 잠금: $(ls "$T")"; fail=$((fail+1)); }
# ② 상위 자리
hold seat-hold "$T/seat.out" SEATED; holder=$!
spid="$(awk '/SEATED/{print $2}' "$T/seat.out")"; sseat="$(awk '/SEATED/{print $3}' "$T/seat.out")"
[ -n "$spid" ] || { echo "FAIL 상위 자리를 못 잡음"; cat "$T/seat.out"; exit 1; }
run seatadopt DMES_ORA_SEAT_HELD="$spid" PROBE_SEAT="$sseat"
kill -TERM "$holder" 2>/dev/null; pkill -P $$ sleep 2>/dev/null; sleep 1
[ ! -e "$T/dmes-ora-seat-$sseat.lock" ] && echo "OK  상위가 놓으면 자리 해제" || { echo "FAIL 상위가 놓았는데 자리가 남음"; fail=$((fail+1)); }
# ③ 옛 상위 CDB 잠금
hold lock-hold "$T/hold.out" LOCKED; holder=$!
pid="$(awk '/LOCKED/{print $2}' "$T/hold.out")"
[ -n "$pid" ] || { echo "FAIL 상위 잠금을 못 잡음"; cat "$T/hold.out"; exit 1; }
run mutex DMES_ORA_LOCK_HELD="$pid"
if [ "$(awk '{print $1}' "$T/dmes-ora-pdb.lock/owner" 2>/dev/null)" = "$pid" ]; then echo "OK  gradle 이 끝난 뒤에도 상위 CDB 잠금 유지"; else echo "FAIL 상위 CDB 잠금이 사라졌다"; fail=$((fail+1)); fi
kill -TERM "$holder" 2>/dev/null; pkill -P $$ sleep 2>/dev/null; sleep 1
[ ! -e "$T/dmes-ora-pdb.lock" ] && echo "OK  상위가 놓으면 CDB 잠금 해제" || { echo "FAIL 상위가 놓았는데 잠금이 남음"; fail=$((fail+1)); }
# ④ 죽은 pid
run own DMES_ORA_LOCK_HELD=99999999
# ⑤ 자리 2개가 다 차 있으면 시간 초과(대기 5초)로 실패
hold seat-hold "$T/s1.out" SEATED; s1=$!
hold seat-hold "$T/s2.out" SEATED; s2=$!
out="$T/g-full.txt"
DMES_ORA_HARNESS_LOCK_WAIT_SEC=5 PROBE_EXPECT=own "$backend/gradlew" -p "$here/composite-seq" probeLockHeld --no-daemon --console=plain -Pdmes.ora.pdb=T_FIXTURE >"$out" 2>&1
if grep -q "시험 자리를 잡지 못했다" "$out"; then echo "OK  자리가 다 차면 기다리다 실패"; else echo "FAIL 자리가 다 찼는데 잡았거나 다른 오류"; grep -E "자리|FAILED|오류" "$out" | head -5; fail=$((fail+1)); fi
kill -TERM "$s1" "$s2" 2>/dev/null; pkill -P $$ sleep 2>/dev/null
echo "실패 $fail"
rm -rf "$T"
[ "$fail" -eq 0 ]
