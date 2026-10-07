#!/usr/bin/env bash
# dflow-lease.sh 의 lease_refs_json 시험: 상태 파일의 「project_id generation」 줄을 읽을 때 앞뒤 공백·CR 이 붙은 숫자도 받는다.
# jq 1.8 은 tonumber 가 앞뒤 공백이 있는 문자열을 거부하므로(1.7.1 은 받는다) 1.7.1·1.8.x 양쪽에서 같은 결과여야 한다.
# 실행: bash .claude/skills/dflow-work/tests/lease-refs.sh   (서버·네트워크·실제 PAT 를 쓰지 않는다)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2 — $3"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

tmp="$(mktemp -d "${TMPDIR:-/tmp}/lease-refs-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
# lease_refs_json 정의만 필요하다(함수 본문은 jq 만 쓴다)
. "$HERE/../scripts/dflow-lease.sh"

refs() { printf '%b' "$1" > "$tmp/lease"; lease_refs_json "$tmp/lease" 2>&1; }

eq "보통 줄" "$(refs 'p1 3\np2 12\n')" '[{"project_id":"p1","generation":3},{"project_id":"p2","generation":12}]'
eq "빈 줄은 건너뜀" "$(refs 'p1 3\n\np2 4\n')" '[{"project_id":"p1","generation":3},{"project_id":"p2","generation":4}]'
eq "줄끝 CR(CRLF 파일)" "$(refs 'p1 3\r\np2 4\r\n')" '[{"project_id":"p1","generation":3},{"project_id":"p2","generation":4}]'
eq "숫자 뒤 공백" "$(refs 'p1 3 \n')" '[{"project_id":"p1","generation":3}]'
eq "줄 앞 공백·탭" "$(refs '  p1 3\n\tp2 4\n')" '[{"project_id":"p1","generation":3},{"project_id":"p2","generation":4}]'
eq "공백뿐인 줄·CR 뿐인 줄은 건너뜀" "$(refs 'p1 3\n   \n\r\np2 4\n')" '[{"project_id":"p1","generation":3},{"project_id":"p2","generation":4}]'
eq "빈 파일" "$(refs '')" '[]'

echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
