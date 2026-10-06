#!/usr/bin/env bash
# term-send-safe.sh 의 --allow-busy 를 가짜 orca(PATH 에 꽂음)로 확인한다. 실제 터미널·orca 는 쓰지 않는다.
# 사용법: bash tests/term-send-safe-busy.sh   (실패가 있으면 종료 코드 1)
# 가짜 orca 는 lib/term.sh 의 `_orca_json`(`orca <인자…> --json`) 호출을 받아 인자를 $FAKE_ORCA_LOG 에 한 줄로 적고
#   terminal list  → $FAKE_TERMS(공백 구분 핸들)
#   terminal read  → $FAKE_SCREENS/<핸들>.txt 의 줄들(없으면 stale 오류)
#   terminal wait  → $FAKE_IDLE(true 면 satisfied)
#   terminal send  → turn_started
# 를 흉내 낸다. 화면은 tests/fixtures/claude-*.txt 에 작업 중·확인 창·압축 줄을 끼워 만든다.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../scripts/term-send-safe.sh"
fx="$here/fixtures"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/tss-busy-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass + 1)); echo "ok   $2"; else fail=1; echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

# 실제 세션 값·설정이 섞이지 않게 한다.
unset ORCA_TERMINAL_HANDLE CLAUDE_PID COORD_SESSION_ID CLAUDE_CODE_SESSION_ID COORD_RUN DFLOW_CONFIG_DIR COORD_DRY COORD_STATE_ROOT
mkdir -p "$tmp/bin" "$tmp/screens" "$tmp/repo" "$tmp/home"
export HOME="$tmp/home" COORD_REPO="$tmp/repo"
printf '{"state_dir":"%s/state","terminal_backend":"orca"}' "$tmp" > "$tmp/repo/.coord.local.json"
cat > "$tmp/bin/orca" <<'FAKE'
#!/bin/sh
echo "$*" >> "$FAKE_ORCA_LOG"
sub="$2"; h=""; prev=""
for a in "$@"; do [ "$prev" = "--terminal" ] && h="$a"; prev="$a"; done
case "$sub" in
  list) jq -nc --arg t "${FAKE_TERMS:-}" '{ok:true,result:{terminals:[$t | split(" ")[] | select(. != "") | {handle:., title:"", worktreePath:""}]}}' ;;
  read)
    if [ -f "$FAKE_SCREENS/$h.txt" ]; then jq -Rnc '[inputs] | {ok:true,result:{terminal:{tail:.}}}' < "$FAKE_SCREENS/$h.txt"
    else echo '{"ok":false,"error":{"message":"terminal_handle_stale"}}'; fi ;;
  wait) jq -nc --argjson s "${FAKE_IDLE:-true}" '{ok:true,result:{wait:{satisfied:$s}}}' ;;
  send) echo '{"ok":true,"result":{"phase":"turn_started"}}' ;;
  *) echo '{"ok":false,"error":{"message":"unknown"}}' ;;
esac
FAKE
chmod +x "$tmp/bin/orca"
export PATH="$tmp/bin:$PATH" FAKE_ORCA_LOG="$tmp/orca.log" FAKE_SCREENS="$tmp/screens" FAKE_TERMS="h1"
eq "가짜 orca 가 PATH 맨 앞" "$(command -v orca)" "$tmp/bin/orca"

# 화면 만들기: 고정 화면의 머리 4줄 뒤(입력창 위)에 줄을 끼운다.
splice() {  # splice <고정 화면> <끼울 줄…>
  local f="$fx/$1"; shift
  sed -n 1,4p "$f"; printf '%s\n' "$@"; sed -n '5,$p' "$f"
}
BUSY='✻ Thinking… (12s · esc to interrupt)'
cp "$fx/claude-empty-bare-named.txt" "$tmp/scr-idle-empty.txt"
splice claude-empty-bare-named.txt "$BUSY" > "$tmp/scr-busy-empty.txt"
splice claude-draft-typed-named.txt "$BUSY" > "$tmp/scr-busy-draft.txt"
splice claude-empty-bare-named.txt '✻ Compacting conversation… (esc to interrupt)' > "$tmp/scr-busy-compacting.txt"
splice claude-empty-bare-named.txt 'Compacting conversation…' > "$tmp/scr-idle-compacting.txt"
{ sed -n 1,4p "$fx/claude-empty-bare-named.txt"; printf '%s\n' "$BUSY" 'Bash command' ' Do you want to proceed?' ' ❯ 1. Yes' '   2. No'; } > "$tmp/scr-busy-prompt.txt"
{ sed -n 1,4p "$fx/claude-empty-bare-named.txt"; printf '%s\n' 'Bash command' ' Do you want to proceed?' ' ❯ 1. Yes' '   2. No'; } > "$tmp/scr-idle-prompt.txt"
cp "$fx/claude-draft-typed-named.txt" "$tmp/scr-idle-draft.txt"

use() { cp "$tmp/scr-$1.txt" "$FAKE_SCREENS/h1.txt"; }
run() { : > "$FAKE_ORCA_LOG"; bash "$script" "$@" 2>/dev/null; }
calls() { grep -c -- "^terminal $1 " "$FAKE_ORCA_LOG"; }

# --- (a) 옵션 없음: 작업 중 화면은 기존대로 거절 --------------------------------------------
use busy-empty
eq "(a) 옵션 없음·tui-idle 충족·esc to interrupt → interrupt-visible" "$(FAKE_IDLE=true run --handle h1 --text '안녕 하세요')" "REFUSED h1 interrupt-visible"
eq "(a) 그때 send 없음" "$(calls send)" 0
eq "(a) 옵션 없음·tui-idle 미충족 → not-idle" "$(FAKE_IDLE=false run --handle h1 --text '안녕 하세요')" "REFUSED h1 not-idle"
eq "(a) not-idle 은 wait 만 하고 화면을 읽지 않는다" "$(calls wait)$(calls read)$(calls send)" "100"

# --- (b) --allow-busy: 같은 화면에서 SENT, wait 호출 없음 -------------------------------------
eq "(b) --allow-busy·tui-idle 미충족·esc to interrupt → SENT" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text '안녕 하세요')" "SENT h1 turn_started"
eq "(b) tui-idle 대기를 건너뛴다(wait 호출 0)" "$(calls wait)" 0
eq "(b) 보낸 인자: 글 그대로 + --enter --wait-submit 10" \
  "$(grep '^terminal send ' "$FAKE_ORCA_LOG")" "terminal send --terminal h1 --text 안녕 하세요 --enter --wait-submit 10 --json"
eq "(b) 호출 순서 list → read → send" "$(cut -d' ' -f2 "$FAKE_ORCA_LOG" | paste -sd, -)" "list,read,send"
printf '%s' '[오피스→kit] 프롬프트: 파일로 넣기' > "$tmp/text.txt"
eq "(b) --text-file 도 같은 길" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text-file "$tmp/text.txt")" "SENT h1 turn_started"
eq "(b) --text-file 의 글 그대로" "$(grep -c -- '--text \[오피스→kit\] 프롬프트: 파일로 넣기 --enter' "$FAKE_ORCA_LOG")" 1
use idle-empty
eq "(b) --allow-busy·한가한 빈 화면도 SENT" "$(FAKE_IDLE=true run --handle h1 --allow-busy --text x)" "SENT h1 turn_started"
eq "(b) 한가해도 wait 호출 없음" "$(calls wait)" 0

# --- (c) --allow-busy 여도 그대로 거절하는 판정 ----------------------------------------------
use busy-prompt
eq "(c) 확인 창 → prompt-open" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x)" "REFUSED h1 prompt-open"
use busy-compacting
eq "(c) Compacting → compacting" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x)" "REFUSED h1 compacting"
use busy-draft
eq "(c) 입력창에 쓰다 만 글 → draft-in-input" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x)" "REFUSED h1 draft-in-input"
cp "$fx/claude-no-input-box.txt" "$FAKE_SCREENS/h1.txt"
eq "(c) 입력창을 못 찾음 → draft-in-input" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x)" "REFUSED h1 draft-in-input"
use busy-empty
eq "(c) 글에 ! → bang-in-text" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text 'go!')" "REFUSED h1 bang-in-text"
eq "(c) bang-in-text 는 화면을 읽지도 보내지도 않는다" "$(calls read)$(calls send)" "00"
eq "(c) 없는 핸들 → stale" "$(FAKE_IDLE=false run --handle h9 --allow-busy --text x)" "REFUSED h9 stale"
eq "(c) stale 은 list 만" "$(cut -d' ' -f2 "$FAKE_ORCA_LOG" | paste -sd, -)" "list"
rm -f "$FAKE_SCREENS/h1.txt"
eq "(c) 목록에 있지만 화면을 못 읽음 → stale" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x)" "REFUSED h1 stale"
eq "(c) 거절 판정에서는 send 없음" "$(calls send)" 0

# --- (e) --allow-busy: 셸로 돌아간 탭(Claude Code 가 없음)에 넣지 않는다 -------------------------
printf '%s\n' 'Last login: Mon Oct  6 09:00:00 on ttys001' 'jji@mac kit-fix % ' > "$FAKE_SCREENS/h1.txt"
eq "(e) 셸 프롬프트만 있는 화면(입력창 틀 없음) → draft-in-input" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x)" "REFUSED h1 draft-in-input"
eq "(e) 그때 send 없음" "$(calls send)" 0
printf '%s\n' '~/project/dmes-standard-wt/kit-fix' '❯ ' > "$FAKE_SCREENS/h1.txt"
eq "(e) ❯ 셸 프롬프트(가로줄 없음) → draft-in-input" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x)" "REFUSED h1 draft-in-input"
# Claude Code 를 끝낸 뒤: 마지막 화면(입력창 틀)이 남고 그 아래 resume 안내·셸 프롬프트가 이어진다
{ cat "$fx/claude-empty-bare-named.txt"; printf '%s\n' '' 'Resume this session with:' 'claude --resume 0f1e2d3c-aaaa-bbbb-cccc-0123456789ab' 'jji@mac kit-fix % '; } > "$FAKE_SCREENS/h1.txt"
eq "(e) 끝난 세션의 남은 틀 + resume 안내 + 셸 프롬프트 → draft-in-input" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x)" "REFUSED h1 draft-in-input"
eq "(e) 그때 send 없음" "$(calls send)" 0
{ cat "$fx/claude-empty-bare-named.txt"; printf 'jji@mac kit-fix %% ls\n'; for i in 1 2 3 4 5 6; do echo "file$i.txt"; done; printf 'jji@mac kit-fix %% \n'; } > "$FAKE_SCREENS/h1.txt"
eq "(e) 남은 틀 아래 셸 출력이 여러 줄(닫는 가로줄 아래 글 줄 > 6) → draft-in-input" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x)" "REFUSED h1 draft-in-input"
{ cat "$fx/claude-empty-bare-named.txt"; printf '%s\n' '  ctx 45% · $0.12 · opus' '  ⎇ main ✓'; } > "$FAKE_SCREENS/h1.txt"
eq "(e) 입력창 아래 상태 줄이 몇 줄 있는 Claude 화면(% \$ 포함)은 SENT" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x)" "SENT h1 turn_started"
use busy-empty
eq "(e) 작업 중 빈 입력창은 그대로 SENT" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x)" "SENT h1 turn_started"
{ cat "$fx/claude-empty-bare-named.txt"; printf '%s\n' '' 'Resume this session with:' 'claude --resume 0f1e2d3c' 'jji@mac kit-fix % '; } > "$FAKE_SCREENS/h1.txt"
eq "(e) 옵션 없음은 틀 위치 검사를 하지 않는다(기존 동작 그대로)" "$(FAKE_IDLE=true run --handle h1 --text x)" "SENT h1 turn_started"

# --- (d) 옵션이 없을 때의 출력·호출은 그대로 ------------------------------------------------
use idle-empty
eq "(d) 한가한 빈 화면 → SENT" "$(FAKE_IDLE=true run --handle h1 --text '안녕')" "SENT h1 turn_started"
eq "(d) 호출 순서 list → wait → read → send" "$(cut -d' ' -f2 "$FAKE_ORCA_LOG" | paste -sd, -)" "list,wait,read,send"
eq "(d) wait 인자(기본 300000ms)" "$(grep '^terminal wait ' "$FAKE_ORCA_LOG")" "terminal wait --terminal h1 --for tui-idle --timeout-ms 300000 --json"
use idle-prompt
eq "(d) 확인 창 → prompt-open" "$(FAKE_IDLE=true run --handle h1 --text x)" "REFUSED h1 prompt-open"
use idle-compacting
eq "(d) Compacting → compacting" "$(FAKE_IDLE=true run --handle h1 --text x)" "REFUSED h1 compacting"
use idle-draft
eq "(d) 쓰다 만 글 → draft-in-input" "$(FAKE_IDLE=true run --handle h1 --text x)" "REFUSED h1 draft-in-input"
eq "(d) 글에 ! → bang-in-text" "$(FAKE_IDLE=true run --handle h1 --text 'a!b')" "REFUSED h1 bang-in-text"
eq "(d) 없는 핸들 → stale" "$(FAKE_IDLE=true run --handle h9 --text x)" "REFUSED h9 stale"
use idle-empty
eq "(d) --dry-run 은 DRY SENT 이고 send 없음" "$(FAKE_IDLE=true run --handle h1 --text x --dry-run)$(calls send)" "DRY SENT h1 -0"
eq "(d) --allow-busy --dry-run 도 DRY SENT" "$(FAKE_IDLE=false run --handle h1 --allow-busy --text x --dry-run)$(calls send)$(calls wait)" "DRY SENT h1 -00"

echo "통과 $pass · 실패 $([ "$fail" = 0 ] && echo 0 || echo '1+')"
exit "$fail"
