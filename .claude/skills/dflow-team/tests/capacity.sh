#!/usr/bin/env bash
# capacity.sh 의 윈도우(Git Bash) 갈래 시험 — node 의 os 모듈로 여유 메모리를 읽는 경로(가짜 node 를 PATH 앞에 둔다).
# 사용법: bash tests/capacity.sh   (네트워크·도커를 쓰지 않는다. macOS·Linux·Git Bash 모두 같은 결과여야 한다)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
CAP="$here/../scripts/capacity.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/capacity-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }
has() { case "$2" in *"$3"*) chk ok "$1" ;; *) chk fail "$1" "[$3] 없음: $2" ;; esac; }

# 가짜 node: 마지막 인자(cpus|totalmem|freepct)에 따라 환경변수 FAKE_<이름> 을 그대로 출력한다. 비어 있으면 아무것도 내지 않고 rc 1.
mkdir -p "$tmp/fake" "$tmp/nonode"
cat > "$tmp/fake/node" <<'NODE'
#!/bin/sh
for a in "$@"; do w="$a"; done
case "$w" in
  cpus) v="${FAKE_CPUS:-}" ;;
  totalmem) v="${FAKE_TOTALMEM:-}" ;;
  freepct) v="${FAKE_FREEPCT:-}" ;;
  *) v= ;;
esac
[ -n "$v" ] || exit 1
echo "$v"
NODE
chmod +x "$tmp/fake/node"
# node 가 없는 PATH: 필요한 도구만 연결한다
for t in awk sed sh bash cat dirname uname date env getconf nproc head tr cut sort grep mkdir; do p="$(command -v "$t" 2>/dev/null)" && ln -sf "$p" "$tmp/nonode/$t"; done
# heavy.sh 를 가짜로(부하 대기 판정이 시험 결과에 섞이지 않게)
printf '#!/bin/sh\necho "HEAVY_STATUS slots=2 held=0 waiting=0"\n' > "$tmp/heavy.sh"

run() { DFLOW_CAP_OS=windows DFLOW_HEAVY_BIN="$tmp/heavy.sh" "$@"; }

r="$(FAKE_FREEPCT=64 FAKE_CPUS=8 PATH="$tmp/fake:$PATH" run bash "$CAP" 2>&1)"; rc=$?
eq "여유 64% → CAPACITY_OK(rc 0)" "$rc" 0
has "OK 줄 머리" "$r" "CAPACITY_OK free=64% swap=?% load=? "
has "os=windows 가 찍힌다" "$r" "os=windows"
has "스왑·부하는 못 읽음으로 남는다(0 이 아니다)" "$r" "unknown=swap,load"

r="$(FAKE_FREEPCT=10 PATH="$tmp/fake:$PATH" run bash "$CAP" 2>&1)"; rc=$?
eq "여유 10% → CAPACITY_LOW(rc 1)" "$rc" 1
has "LOW 사유" "$r" "CAPACITY_LOW 여유메모리10%<30%"

r="$(FAKE_FREEPCT=0 PATH="$tmp/fake:$PATH" run bash "$CAP" 2>&1)"; rc=$?
eq "여유 0%(실측 0) 도 값으로 쓴다 → LOW" "$rc" 1

r="$(PATH="$tmp/fake:$PATH" run bash "$CAP" 2>&1)"; rc=$?   # 가짜 node 가 값을 못 낸다
eq "node 가 값을 못 내면 CAPACITY_UNKNOWN(rc 0)" "$rc" 0
has "UNKNOWN 줄" "$r" "CAPACITY_UNKNOWN 판정 불가(os=windows)"

r="$(PATH="$tmp/nonode" run /bin/bash "$CAP" 2>&1)"; rc=$?
eq "node 가 없으면 CAPACITY_UNKNOWN(rc 0)" "$rc" 0
has "node 없음 줄" "$r" "CAPACITY_UNKNOWN 판정 불가(os=windows)"
has "free 도 못 읽음" "$r" "unknown=free,swap,load"

r="$(FAKE_FREEPCT=ab PATH="$tmp/fake:$PATH" run bash "$CAP" 2>&1)"
has "숫자가 아닌 값은 버린다" "$r" "CAPACITY_UNKNOWN"

# max: sysctl·/proc 이 없을 때(DFLOW_CAP_PROC 를 없는 곳으로) node totalmem 으로 RAM 을 읽는다. sysctl 이 있는 macOS 에서는 sysctl 이 먼저라 이 시험은 Linux·Git Bash 에서만 의미가 있다.
r="$(FAKE_TOTALMEM=17179869184 DFLOW_CAP_PROC="$tmp/noproc" PATH="$tmp/fake:$PATH" run bash "$CAP" max 2>&1)"
case "$(uname -s)" in
  Darwin) has "max (macOS 는 sysctl 이 먼저) ram 이 숫자" "$r" "GB source=default" ;;
  *) has "max: node totalmem 16GB → TEAM_MAX 4 k=2" "$r" "TEAM_MAX 4 k=2 ram=16GB" ;;
esac
r="$(DFLOW_CAP_PROC="$tmp/noproc" PATH="$tmp/nonode" run /bin/bash "$CAP" max 2>&1)"
case "$(uname -s)" in
  Darwin) : ;;
  *) has "max: RAM 을 못 읽으면 ram=?GB(기본 k=2)" "$r" "ram=?GB" ;;
esac

echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
