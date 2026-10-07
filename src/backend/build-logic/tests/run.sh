#!/usr/bin/env bash
# 하니스 교착 회귀 시험(Oracle 접속 없음): included build 3개가 각자 서비스를 만들어도 PC 잠금(lock-hold)·시험 PDB 는 하나만 쓰는지 본다.
# 임시 TMPDIR 에 잠금을 만들어 다른 레인의 실제 잠금과 겹치지 않는다. 기존 PDB 모드(-Pdmes.ora.pdb)라 복제·삭제도 하지 않는다.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
backend="$(cd "$here/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export TMPDIR="$tmp" DMES_ORA_HARNESS_LOCK_WAIT_SEC=30 DMES_TEST_SLOTS=0
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
out="$tmp/out.txt"
set +e
timeout_sec=120
"$backend/gradlew" -p "$here/composite" probeAll --parallel --no-daemon --console=plain -Pdmes.ora.pdb=T_FIXTURE >"$out" 2>&1 &
pid=$!
( sleep "$timeout_sec"; kill "$pid" 2>/dev/null ) 2>/dev/null & killer=$!; disown "$killer" 2>/dev/null
wait "$pid"; rc=$?
kill "$killer" 2>/dev/null
set -e
cat "$out"
fail() { echo "FAIL: $*" >&2; exit 1; }
[ "$rc" -eq 0 ] || fail "gradle 종료 코드 $rc (교착이면 잠금 대기 한도 후 실패)"
for m in a b c; do grep -q "PROBE-$m done" "$out" || fail "probe $m 가 끝나지 않음"; done
n="$(grep -c 'PROBE-. pdb=T_FIXTURE' "$out")"; [ "$n" -eq 3 ] || fail "PDB 값이 3개가 아님($n)"
if grep -q '같은 빌드의 시험 PDB' "$out"; then :; else fail "공유 로그가 없음(서비스가 하나뿐이었거나 공유 실패)"; fi
echo "OK: 서비스가 여러 개여도 잠금·PDB 를 공유했다"
