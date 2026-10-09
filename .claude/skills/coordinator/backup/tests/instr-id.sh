#!/usr/bin/env bash
# coord-state.sh instr 의 지시 번호 채번 시험: 기존 id 가 문자열이 아니어도(null·숫자) 오류 없이 다음 번호를 낸다.
# jq 1.8 은 ltrimstr 에 문자열이 아닌 입력을 주면 오류를 내므로(1.7.1 은 그대로 통과) 1.7.1·1.8.x 양쪽에서 같은 결과여야 한다.
# 임시 상태 폴더만 쓴다. 실제 서버·~/.coord·터미널은 건드리지 않는다.
# 사용법: bash tests/instr-id.sh   (실패가 있으면 종료 코드 1)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$here/../scripts"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/instr-id-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0
chk() { if [ "$1" = ok ]; then echo "ok   $2"; else echo "FAIL $2${3:+ — $3}"; fail=1; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

repo="$tmp/repo"; mkdir -p "$repo" "$tmp/home"
export COORD_REPO="$repo" CLAUDE_PID=$$ HOME="$tmp/home" COORD_CONSOLE_POLL=0
unset COORD_RUN COORD_SESSION_ID CLAUDE_CODE_SESSION_ID COORD_DRY COORD_STATE_ROOT ORCA_TERMINAL_HANDLE DFLOW_CONFIG_DIR
jq -n --arg st "$tmp/state" '{state_dir:$st, office:{enabled:false}}' > "$repo/.coord.local.json"
CS="bash $SD/coord-state.sh"
COORD_SESSION_ID=s-instr $CS init r1 --goal 시험 >/dev/null 2>&1
export COORD_RUN=r1
$CS lane-add a1 '{"memo":"/x/resume-a1.md"}' >/dev/null 2>&1
$CS lane-add b1 '{"memo":"/x/resume-b1.md"}' >/dev/null 2>&1

eq "첫 지시는 a1-1" "$($CS instr a1 kick 2>&1)" a1-1
eq "둘째 지시는 a1-2" "$($CS instr a1 kick 2>&1)" a1-2

# 경계 입력: id 가 null·숫자·객체인 기존 지시, 다른 레인의 지시가 섞여 있다
$CS set '.instrs' '[{"lane":"a1","id":"a1-7"},{"lane":"a1","id":null},{"lane":"a1","id":5},{"lane":"a1","id":{"x":1}},{"lane":"a1"},{"lane":"b1","id":"b1-40"}]' >/dev/null 2>&1
eq "비문자열 id 가 섞여도 오류 없이 a1-8" "$($CS instr a1 kick 2>&1)" a1-8
eq "다른 레인 번호는 따로 센다(b1-41)" "$($CS instr b1 kick 2>&1)" b1-41
[ "$fail" = 0 ] && echo "통과" || echo "실패 있음"
exit "$fail"
