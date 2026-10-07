#!/usr/bin/env bash
# timeout-guard.sh(PreToolUse 훅) 시험 — 입력 JSON 을 jq 로 읽는 경로와 node 로 읽는 경로(jq 없는 PATH)가 같은 판정을 내는지,
# 둘 다 없을 때 통과하며 stderr 에 한 줄 남기는지 본다. 훅 계약: stdin JSON, 거부 = stderr 이유 + exit 2, 그 밖에는 exit 0.
# 사용법: bash tests/timeout-guard.sh   (node 필요, jq 는 있으면 jq 경로도 같이 본다. 네트워크·도커를 쓰지 않는다)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
GUARD="$here/../scripts/timeout-guard.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/timeout-guard-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

# 허용 도구만 담은 PATH 폴더: nojq(node 만), nonode(jq 만), none(둘 다 없음)
mkdir -p "$tmp/nojq" "$tmp/nonode" "$tmp/none"
for t in sh awk sed cat uname dirname tr head grep env; do
  p="$(command -v "$t" 2>/dev/null)" || continue
  for d in nojq nonode none; do ln -sf "$p" "$tmp/$d/$t"; done
done
pn="$(command -v node)" && ln -sf "$pn" "$tmp/nojq/node"
pj="$(command -v jq 2>/dev/null)" && ln -sf "$pj" "$tmp/nonode/jq"
HAVE_JQ=0; [ -n "$pj" ] && HAVE_JQ=1

guard() { # guard <경로 폴더|-> <json>  → rc 와 stderr 를 $tmp/err 로
  if [ "$1" = - ]; then printf '%s' "$2" | /bin/sh "$GUARD" 2>"$tmp/err" >/dev/null
  else printf '%s' "$2" | PATH="$1" /bin/sh "$GUARD" 2>"$tmp/err" >/dev/null; fi
  return $?
}
B() { # B <command JSON 문자열> [timeout JSON 값] [background]
  local t=""; [ -n "${2:-}" ] && t=",\"timeout\":$2"
  local b=""; [ -n "${3:-}" ] && b=",\"run_in_background\":$3"
  printf '{"tool_name":"Bash","tool_input":{"command":%s%s%s}}' "$1" "$t" "$b"
}

run_case() { # run_case <이름> <기대 rc> <json> [stderr 에 있어야 할 글]
  local name="$1" want="$2" json="$3" msg="${4:-}" mode dir rc
  for mode in node jq; do
    if [ "$mode" = node ]; then dir="$tmp/nojq"; else [ "$HAVE_JQ" = 1 ] || continue; dir="$tmp/nonode"; fi
    guard "$dir" "$json"; rc=$?
    eq "[$mode] $name → rc $want" "$rc" "$want"
    [ -z "$msg" ] || eq "[$mode] $name → stderr 에 \"$msg\"" "$(grep -c -- "$msg" "$tmp/err")" 1
  done
}

run_case "Bash 가 아닌 도구는 통과" 0 '{"tool_name":"Read","tool_input":{"file_path":"x"}}'
run_case "대상이 아닌 명령(ls)은 통과" 0 "$(B '"ls -la"')"
run_case "heavy.sh 를 timeout 없이 부르면 거부" 2 "$(B '"bash .claude/skills/dflow-dev/scripts/heavy.sh pnpm test"')" "timeout-guard:"
run_case "timeout 300000 이면 통과" 0 "$(B '"bash .claude/skills/dflow-dev/scripts/heavy.sh pnpm test"' 300000)"
run_case "timeout 이 수 글자(\"300000\")여도 통과" 0 "$(B '"./gradlew test"' '"300000"')"
run_case "timeout 299999.9 는 내림해 거부" 2 "$(B '"./gradlew test"' 299999.9)" "timeout 299999"
run_case "timeout 이 수가 아닌 글자면 0 으로 보고 거부" 2 "$(B '"./gradlew test"' '"abc"')" "timeout 없음"
run_case "run_in_background:true 로 대상을 부르면 거부" 2 "$(B '"./gradlew test"' 600000 true)" "run_in_background"
run_case "서버 기동(bootRun)은 run_in_background:true 면 통과" 0 "$(B '"./gradlew :api:bootRun"' '' true)"
run_case "여러 줄 명령의 둘째 줄도 본다" 2 "$(B '"echo hi\n./gradlew test\n"')" "timeout-guard:"
run_case "한글·따옴표가 든 명령도 그대로 읽는다" 0 "$(B '"echo \"한글 값\" && ls"')"
run_case "깨진 JSON 은 통과(fail-open)" 0 '{"tool_name":'
run_case "빈 입력은 통과" 0 ''
run_case "tool_input 이 없으면 통과" 0 '{"tool_name":"Bash"}'

# jq·node 둘 다 없으면 통과하되 알린다
guard "$tmp/none" "$(B '"./gradlew test"')"; rc=$?
eq "[둘 다 없음] rc 0(fail-open)" "$rc" 0
eq "[둘 다 없음] stderr 에 한 줄" "$(grep -c 'jq·node 가 없어' "$tmp/err")" 1

echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
