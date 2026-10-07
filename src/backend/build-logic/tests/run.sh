#!/usr/bin/env bash
# 하니스 회귀 시험(Oracle 접속 없음): included build 3개가 각자 서비스를 만들어도 PC 잠금(lock-hold)·시험 PDB 는 하나만 쓰는지 보고,
# 같은 빌드의 모듈이 시험 PDB 를 쓰는 구간(차례)이 --parallel 이어도 겹치지 않는지 본다(mcm-core·mcm 을 한 빌드에 묶으면 Flyway clean 이 서로 표를 지우던 결함).
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
# 주인 서비스의 정리(잠금 해제)는 모든 probe 가 끝난 뒤여야 한다(included build 서비스가 먼저 닫히지 않는다는 가정을 확인).
last_done="$(grep -n 'PROBE-. done' "$out" | tail -1 | cut -d: -f1)"
cleanup="$(grep -n '\[dmes-ora\] 정리:' "$out" | head -1 | cut -d: -f1)"
[ -n "$cleanup" ] || fail "주인 정리 로그가 없음"
[ "$cleanup" -gt "$last_done" ] || fail "주인이 probe 보다 먼저 정리했다(정리 $cleanup 줄 < 마지막 done $last_done 줄)"
# Test 태스크 배선: Oracle 모드에서 Test 태스크가 구성되고(configureEach 안 tasks.register 같은 구성 오류가 없고) 마무리 태스크가 붙는지 본다.
wout="$tmp/wiring.txt"
"$backend/gradlew" -p "$here/composite" wiring --dry-run --no-daemon --console=plain -Pdmes.ora.pdb=T_FIXTURE >"$wout" 2>&1 || { cat "$wout"; fail "Test 태스크 구성 실패(--dry-run)"; }
grep -q ':testOraTurnRelease' "$wout" || { cat "$wout"; fail "test 에 차례 마무리 태스크가 붙지 않음"; }
# 차례: probe 의 start~end 구간이 서로 겹치지 않아야 한다.
python3 - "$out" <<'PY' || fail "probe 구간이 겹쳤다(차례가 직렬이 아님)"
import re, sys
iv = {}
for line in open(sys.argv[1], encoding="utf-8", errors="replace"):
    m = re.search(r"PROBE-(\w) (start|end) (\d+)", line)
    if m:
        iv.setdefault(m.group(1), {})[m.group(2)] = int(m.group(3))
spans = sorted((v["start"], v["end"], k) for k, v in iv.items() if "start" in v and "end" in v)
if len(spans) != 3:
    sys.exit("구간 3개가 아님: %r" % spans)
for (s1, e1, k1), (s2, e2, k2) in zip(spans, spans[1:]):
    if s2 < e1:
        sys.exit("겹침: %s(%d~%d) %s(%d~%d)" % (k1, s1, e1, k2, s2, e2))
PY
echo "OK: 서비스가 여러 개여도 잠금·PDB 를 공유했고 정리는 모든 probe 뒤에 했으며 시험 차례는 겹치지 않았다"
