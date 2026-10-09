#!/usr/bin/env bash
# build-logic 이 상위가 쥔 PC 잠금(DMES_ORA_LOCK_HELD)을 인정하는지 보는 회귀 시험(Oracle 접속 없음, 임시 TMPDIR).
# 세 경우: ① 유효한 주인 → adopt(lock-hold 를 따로 안 띄우고 놓지도 않음) ② 죽은 pid → 직접 잡음 ③ 환경변수 없음 → 직접 잡음.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; backend="$(cd "$here/../.." && pwd)"; repo="$(cd "$backend/../.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
T="$(mktemp -d)"; export TMPDIR="$T" DMES_TEST_SLOTS=0 DMES_ORA_HARNESS_LOCK_WAIT_SEC=30
fail=0
trap 'kill "${holder:-0}" 2>/dev/null; pkill -P $$ sleep 2>/dev/null; kill "${wd:-0}" 2>/dev/null; rm -rf "$T"' EXIT
# 전체 시간 상한 150초 — 멈추면 스스로 끝낸다(heavy 자리를 오래 쥐지 않게)
( sleep 150; echo "FAIL 전체 시간 상한(150초) 초과" >&2; kill -TERM $$ ) & wd=$!
run() { # <기대> <env 값|-> 
  local expect="$1" held="$2" out="$T/g-$1.txt"
  if [ "$held" = "-" ]; then unset DMES_ORA_LOCK_HELD; else export DMES_ORA_LOCK_HELD="$held"; fi
  PROBE_EXPECT="$expect" "$backend/gradlew" -p "$here/composite-seq" probeLockHeld --no-daemon --console=plain -Pdmes.ora.pdb=T_FIXTURE >"$out" 2>&1
  if grep -q "PROBE-LOCKHELD $expect ok" "$out"; then echo "OK  $expect (DMES_ORA_LOCK_HELD=$held)"; else echo "FAIL $expect (DMES_ORA_LOCK_HELD=$held)"; grep -E "Assertion|assert|FAILED|오류" "$out" | head -5; fail=$((fail+1)); fi
}
# ① 상위가 잠금을 쥔 상황: lock-hold 를 직접 띄운다. stdin 은 sleep 파이프로 열어 둔다(fifo 는 macOS 의 node 가 쓰기 끝이 닫혀도 끝을 못 알아채 멈춘다).
sleep 600 | node "$repo/scripts/oracle/pdb.mjs" lock-hold --wait-sec 20 >"$T/hold.out" 2>&1 &
holder=$!
for _ in $(seq 1 40); do grep -q LOCKED "$T/hold.out" 2>/dev/null && break; sleep 0.25; done
pid="$(awk '/LOCKED/{print $2}' "$T/hold.out")"
[ -n "$pid" ] || { echo "FAIL 상위 잠금을 못 잡음"; cat "$T/hold.out"; exit 1; }
run adopt "$pid"
# 상위 잠금은 gradle 이 끝난 뒤에도 살아 있어야 한다
if [ "$(awk '{print $1}' "$T/dmes-ora-pdb.lock/owner" 2>/dev/null)" = "$pid" ]; then echo "OK  gradle 이 끝난 뒤에도 상위 잠금 유지"; else echo "FAIL 상위 잠금이 사라졌다"; fail=$((fail+1)); fi
kill -TERM "$holder" 2>/dev/null; pkill -P $$ sleep 2>/dev/null; sleep 1
[ ! -e "$T/dmes-ora-pdb.lock" ] && echo "OK  상위가 놓으면 잠금 해제" || { echo "FAIL 상위가 놓았는데 잠금이 남음"; fail=$((fail+1)); }
# ② 죽은 pid, ③ 환경변수 없음
run own 99999999
run own -
echo "실패 $fail"
rm -rf "$T"
[ "$fail" -eq 0 ]
