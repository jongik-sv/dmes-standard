#!/usr/bin/env bash
# term-send-safe.sh 의 입력창 판정(input_state)을 고정 화면 발췌로 확인한다. 터미널·orca 는 쓰지 않는다.
# 사용법: bash tests/term-send-safe-input-state.sh   (실패가 있으면 종료 코드 1)
# 고정 화면: tests/fixtures/claude-*.txt (2026-10-05 실제 Claude Code 2.1.289 에서 `claude -n <이름>` 으로 띄운 첫 화면 발췌)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../scripts/term-send-safe.sh"
fail=0

check() {  # check <기대값> <고정 화면 파일>
  local want="$1" file="$here/fixtures/$2" got
  got="$(TERM_SEND_SAFE_SELFTEST=1 bash "$script" --handle h --text x < "$file")"
  if [ "$got" = "$want" ]; then echo "ok   $2 → $got"; else echo "FAIL $2 → $got (기대 $want)"; fail=1; fi
}

check empty   claude-empty-placeholder-named.txt     # 이름이 붙은 상단 줄 + Try "…" 안내문(2026-10-05 거부 사례)
check empty   claude-empty-placeholder-unnamed.txt   # 이름 없는 상단 줄 + 안내문
check empty   claude-empty-bare-named.txt            # 안내문이 사라진 빈 ❯
check draft   claude-draft-typed-named.txt           # 사용자가 친 글
check draft   claude-draft-typed-try-word.txt        # Try 라는 한 단어만 친 글(안내문이 아니다)
check unknown claude-no-input-box.txt                # 입력창이 없는 화면은 애매함으로 판정

exit "$fail"
