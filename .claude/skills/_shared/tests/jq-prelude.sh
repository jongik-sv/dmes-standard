#!/usr/bin/env bash
# jq 를 부르는 진입 스크립트(.claude/skills/*/scripts/*.sh)가 윈도우용 동봉 jq 켜기를 갖췄는지 본다.
# 갖춘 것으로 인정하는 경우: 첫 jq 호출보다 앞의(주석이 아닌) 줄에서
#   (가) `PATH="$_sb:$PATH"` 로 `_shared/bin` 을 PATH 앞에 둔다(머리말 한 줄), 또는
#   (나) coordinator 처럼 lib/common.sh 를 source 한다(lib/compat.sh 가 같은 일을 한다).
# 다른 스크립트가 source 하는 파일(dflow-lease.sh·dflow-config.sh)은 진입 스크립트가 아니므로 뺀다.
# 사용법: bash .claude/skills/_shared/tests/jq-prelude.sh
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
skills="$(cd "$here/../.." && pwd)"
pass=0; fail=0
JQ_CALL='(^|[^A-Za-z0-9_./-])(jq|\$JQ)([[:space:]);|]|$)'   # 탭·`)`·`;`·`|` 앞뒤와 변수 호출($JQ)도 잡는다
PRELUDE='PATH="\$_sb:\$PATH"|lib/common\.sh'
for f in "$skills"/*/scripts/*.sh; do
  case "${f##*/}" in dflow-lease.sh|dflow-config.sh) continue ;; esac
  # 주석 줄을 뺀 본문에서 jq 를 명령으로 부르는 첫 줄 번호
  first_jq="$(grep -nvE '^[[:space:]]*#' "$f" | grep -E "$JQ_CALL" | head -1 | cut -d: -f1)"
  [ -n "$first_jq" ] || continue
  rel="${f#$skills/}"
  prel="$(grep -nvE '^[[:space:]]*#' "$f" | grep -E "$PRELUDE" | head -1 | cut -d: -f1)"
  if [ -n "$prel" ] && [ "$prel" -le "$first_jq" ]; then
    pass=$((pass+1)); echo "ok   $rel"
  else
    fail=$((fail+1)); echo "FAIL $rel — 첫 jq 호출(${first_jq}줄)보다 앞에 윈도우용 동봉 jq 켜기(머리말 한 줄 또는 lib/common.sh source)가 없다"
  fi
done
# 동봉 jq 래퍼는 실행 권한이 있어야 하고, 같은 폴더에 win64/jq.exe 와 라이선스가 있어야 한다
[ -x "$skills/_shared/bin/jq" ] && { pass=$((pass+1)); echo "ok   _shared/bin/jq 실행 권한"; } || { fail=$((fail+1)); echo "FAIL _shared/bin/jq 실행 권한 없음"; }
for n in win64/jq.exe jq-LICENSE.txt README.md; do
  [ -f "$skills/_shared/bin/$n" ] && { pass=$((pass+1)); echo "ok   _shared/bin/$n 있음"; } || { fail=$((fail+1)); echo "FAIL _shared/bin/$n 없음"; }
done
echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
