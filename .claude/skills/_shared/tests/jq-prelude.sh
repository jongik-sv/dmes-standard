#!/usr/bin/env bash
# jq 를 부르는 진입 스크립트(.claude/skills/*/scripts/*.sh)가 윈도우용 동봉 jq 켜기를 갖췄는지 본다.
# 갖춘 것으로 인정하는 경우: (가) 머리말에 `_shared/bin` 을 PATH 앞에 두는 줄이 있다, (나) coordinator 처럼 lib/common.sh 를 source 한다(compat.sh 가 같은 일을 한다).
# 다른 스크립트가 source 하는 파일(dflow-lease.sh·dflow-config.sh)은 진입 스크립트가 아니므로 뺀다.
# 사용법: bash .claude/skills/_shared/tests/jq-prelude.sh
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
skills="$(cd "$here/../.." && pwd)"
pass=0; fail=0
for f in "$skills"/*/scripts/*.sh; do
  case "${f##*/}" in dflow-lease.sh|dflow-config.sh) continue ;; esac
  # 주석 줄을 뺀 본문에서 jq 를 명령으로 부르는지 본다
  grep -vE '^[[:space:]]*#' "$f" | grep -qE '(^|[^A-Za-z0-9_./-])jq( |$)' || continue
  rel="${f#$skills/}"
  if grep -q '_shared/bin' "$f" || grep -qE 'lib/common\.sh' "$f"; then
    pass=$((pass+1)); echo "ok   $rel"
  else
    fail=$((fail+1)); echo "FAIL $rel — jq 를 쓰지만 윈도우용 동봉 jq 켜기(머리말 한 줄 또는 lib/common.sh source)가 없다"
  fi
done
# 동봉 jq 래퍼는 실행 권한이 있어야 하고, 같은 폴더에 jq.exe 와 라이선스가 있어야 한다
[ -x "$skills/_shared/bin/jq" ] && { pass=$((pass+1)); echo "ok   _shared/bin/jq 실행 권한"; } || { fail=$((fail+1)); echo "FAIL _shared/bin/jq 실행 권한 없음"; }
for n in jq.exe jq-LICENSE.txt README.md; do
  [ -f "$skills/_shared/bin/$n" ] && { pass=$((pass+1)); echo "ok   _shared/bin/$n 있음"; } || { fail=$((fail+1)); echo "FAIL _shared/bin/$n 없음"; }
done
echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
