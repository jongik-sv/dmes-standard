#!/usr/bin/env bash
# spawn-lane.sh 의 brief(에이전트 오피스 레인 칸에 보일 지시 한 줄): --brief 인자, --prompt-file 첫 글줄에서 뽑기(「— 」 뒤 제목·앞 60자·경로 토큰 제외),
# 이미 brief 가 있는 레인은 덮어쓰지 않는 규칙을 --dry-run 으로 확인한다. 가짜 orca·임시 상태 폴더만 쓰고 실제 탭은 띄우지 않는다.
# 사용법: bash tests/spawn-brief.sh   (실패가 있으면 종료 코드 1)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$(cd "$here/../scripts" && pwd)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/spawn-brief-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0
chk() { if [ "$1" = ok ]; then echo "ok   $2"; else echo "FAIL $2${3:+ — $3}"; fail=1; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

repo="$tmp/repo"; mkdir -p "$repo" "$tmp/fb" "$tmp/home"
export COORD_REPO="$repo" CLAUDE_PID=$$ COORD_CONSOLE_POLL=0 HOME="$tmp/home" DFLOW_CONSOLE_DIR="$tmp/console"
unset COORD_RUN COORD_SESSION_ID CLAUDE_CODE_SESSION_ID COORD_DRY COORD_STATE_ROOT ORCA_TERMINAL_HANDLE DFLOW_CONFIG_DIR
# office 는 끈다(표시 전송 없음). 상태 폴더는 임시.
jq -n --arg st "$tmp/state" '{state_dir:$st, office:{enabled:false}}' > "$repo/.coord.local.json"
# 가짜 orca: worktree list 만 답한다(--dry-run 은 사전 확인으로 이것만 부른다)
printf '#!/bin/sh\ncase "$1 $2" in "worktree list") printf %%s %s ;; *) echo "{\\"ok\\":false}" ;; esac\n' "'{\"ok\":true,\"result\":{\"worktrees\":[{\"path\":\"$repo\"}]}}'" > "$tmp/fb/orca"; chmod +x "$tmp/fb/orca"
CS="bash $SD/coord-state.sh"
( cd "$repo" && git init -q . 2>/dev/null; $CS init sb >/dev/null 2>&1 )
export COORD_RUN=sb

sp() {  # sp <레인> [spawn-lane 인자…] → --dry-run 이 lane-add 에 넘기려던 JSON 의 brief(없으면 -)를 출력
  local n="$1" line; shift
  line="$(cd "$repo" && PATH="$tmp/fb:$PATH" bash "$SD/spawn-lane.sh" --name "$n" --kind claude --dry-run --worktree "$repo" "$@" 2>&1 | grep "^DRY coord-state.sh lane-add $n ")"
  line="${line#*\'}"; line="${line%\'*}"
  printf '%s' "$line" | jq -r '.brief // "-"'
}
pf() { printf '%s\n' "$2" > "$tmp/$1.md"; printf '%s' "$tmp/$1.md"; }

eq "--brief 인자가 brief 가 된다" "$(sp a1 --brief '관리자 화면 수정')" "관리자 화면 수정"
eq "--brief 가 지시 파일보다 우선한다" "$(sp a2 --brief '직접 준 한 줄' --prompt-file "$(pf p2 '# 레인 x — 파일 제목')")" "직접 준 한 줄"
eq "지시 파일: 「— 」 뒤 제목" "$(sp a3 --prompt-file "$(pf p3 '# 레인 js-w3a — 13개 소형 스크립트 이식')")" "13개 소형 스크립트 이식"
long="## 다음 일을 진행해 달라 가나다라마바사아자차카타파하 가나다라마바사아자차카타파하 가나다라마바사아자차카타파하 가나다라마바사아자차카타파하 끝"
eq "지시 파일: 「— 」 가 없으면 줄 앞 60자(앞쪽 # 제거)" "$(sp a4 --prompt-file "$(pf p4 "$long")")" "$(printf '%s' "${long#\#\# }" | jq -Rrs '.[0:60]')"
eq "경로 토큰은 뺀다(/ ~/ ./ ../ C:/)" "$(sp a5 --prompt-file "$(pf p5 '지시 /Users/x/brief.md ~/memo.md ./a ../b C:/w/z 파일을 읽고 진행')")" "지시 파일을 읽고 진행"
eq "빈 줄 뒤 첫 글줄을 쓴다" "$(sp a6 --prompt-file "$(pf p6 $'\n\n  첫 글줄 — 제목입니다')")" "제목입니다"
eq "경로뿐인 줄이면 brief 를 넣지 않는다" "$(sp a7 --prompt-file "$(pf p7 '/Users/x/only/path.md')")" "-"
eq "brief 인자도 지시 파일도 없으면 넣지 않는다" "$(sp a8)" "-"
eq "--brief 는 200자까지" "$(sp a9 --brief "$(printf 'ㄱ%.0s' $(seq 1 250))" | jq -Rr 'length')" "200"

# 이미 brief 가 있는 레인은 덮어쓰지 않는다
$CS lane-add keep '{"brief":"먼저 적은 한 줄"}' >/dev/null 2>&1
eq "이미 brief 가 있으면 lane-add 에 brief 를 넘기지 않는다(덮어쓰지 않음)" "$(sp keep --brief '새 한 줄')" "-"
$CS lane-add empty '{"brief":""}' >/dev/null 2>&1
eq "brief 가 비어 있으면 채운다" "$(sp empty --brief '채운 한 줄')" "채운 한 줄"

# 실제 기동 경로(record_lane): 함수만 떼어 lane-add 에 넘기는 JSON 을 본다(brief 가 있을 때만 들어간다)
fn="$(awk '/^record_lane\(\) \{/,/^\}/' "$SD/spawn-lane.sh")"
[ -n "$fn" ] || chk fail "record_lane 함수를 찾지 못했다"
rl() {  # rl <BRIEF>
  bash -c 'coord_state_call() { [ "$1" = lane-add ] && printf "%s" "$3"; }; worktree_of() { echo /wt; }
    name=lx kind=claude model="" CD_PATH=/wt SD=/nonexistent BRIEF="$1"
    '"$fn"'
    record_lane hX 123 sid1 ""' _ "$1" 2>/dev/null
}
eq "record_lane: brief 가 있으면 JSON 에 들어간다" "$(rl '한 줄 요약' | jq -r '.brief')" "한 줄 요약"
eq "record_lane: brief 가 비면 키를 넣지 않는다" "$(rl '' | jq -r 'has("brief")')" "false"
eq "record_lane: 세션 정보는 그대로" "$(rl 'x' | jq -r '[.session.handle, .session.kind, .state] | join(",")')" "hX,claude,active"

exit "$fail"
