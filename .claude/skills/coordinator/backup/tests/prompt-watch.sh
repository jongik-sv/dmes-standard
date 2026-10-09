#!/usr/bin/env bash
# prompt-watch.sh 의 --every·--lanes 를 가짜 orca(PATH 에 꽂음)로 확인한다. 실제 터미널·orca·~/.coord 는 쓰지 않는다.
# 사용법: bash tests/prompt-watch.sh   (실패가 있으면 종료 코드 1)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../scripts/prompt-watch.sh"
fx="$here/fixtures"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/pwatch-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0; pass=0
fail_n=0
chk() { if [ "$1" = ok ]; then pass=$((pass + 1)); echo "ok   $2"; else fail=1; fail_n=$((fail_n + 1)); echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

unset ORCA_TERMINAL_HANDLE CLAUDE_PID COORD_SESSION_ID CLAUDE_CODE_SESSION_ID COORD_RUN DFLOW_CONFIG_DIR COORD_DRY COORD_STATE_ROOT
mkdir -p "$tmp/bin" "$tmp/screens" "$tmp/repo" "$tmp/home" "$tmp/state"
export HOME="$tmp/home" COORD_REPO="$tmp/repo" COORD_RUN=pw
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
  *) echo '{"ok":false,"error":{"message":"unknown"}}' ;;
esac
FAKE
chmod +x "$tmp/bin/orca"
export PATH="$tmp/bin:$PATH" FAKE_ORCA_LOG="$tmp/orca.log" FAKE_SCREENS="$tmp/screens" FAKE_TERMS="ha hb"

# 회차 state: 레인 a(ha)·b(hb)·c(handle 없음)
mkdir -p "$tmp/state/pw"
jq -n '{schema:1, run:{id:"pw", closed_at:null, coordinator:{session_id:"", pid:0, handle:""}}, lanes:{
  a:{session:{handle:"ha"}, state:"active"}, b:{session:{handle:"hb"}, state:"active"}, c:{session:{handle:""}, state:"active"}}, office:{}}' > "$tmp/state/pw/state.json"
printf 'pw\n' > "$tmp/state/current"

idle() { cp "$fx/claude-empty-bare-named.txt" "$FAKE_SCREENS/$1.txt"; }
perm() { { sed -n 1,4p "$fx/claude-empty-bare-named.txt"; printf '%s\n' 'Bash command' ' Do you want to proceed?' ' ❯ 1. Yes' '   2. No'; } > "$FAKE_SCREENS/$1.txt"; }
reads() { grep -c -- '^terminal read ' "$FAKE_ORCA_LOG"; }
run() { : > "$FAKE_ORCA_LOG"; bash "$script" "$@" 2>/dev/null; }

# --- 단일 모드(기존 출력 불변) ---
idle ha; idle hb
eq "단일: 창이 없으면 NONE" "$(run a --follow 0 | head -1)" "NONE ha"
perm ha
eq "단일: 창이 있으면 PROMPT 첫 줄" "$(run a --follow 0 | head -1)" "PROMPT ha permission"
eq "단일: --handle 도 같다" "$(run --handle ha --follow 0 | head -1)" "PROMPT ha permission"
eq "--every 숫자가 아니면 기본값으로 돌아가지 않고도 동작(옵션 문자열은 정수만)" "$(run a --follow 0 --every 2 | head -1)" "PROMPT ha permission"

# --- --every: 읽기 간격 ---
idle ha
run a --follow 2 --every 1 >/dev/null
eq "--every 1 --follow 2: 읽기 2~3회(간격 1초)" "$([ "$(reads)" -ge 2 ] && [ "$(reads)" -le 4 ] && echo yes)" yes
run a --follow 2 --every 5 >/dev/null
eq "--every 5 --follow 2: 읽기 2회(처음 + 5초 뒤 마지막 한 번), 3초 간격 읽기 아님" "$(reads)" 2
eq "기본 간격은 설정 approvals.watch_every_s 로 정한다(10): --follow 2 에 읽기 2회(3초 간격이면 더 많다)" "$(run a --follow 2 >/dev/null; reads)" 2
eq "기본 간격 10초: --follow 12 는 읽기 3회 이하(3초 간격이면 5회)" "$(run a --follow 11 >/dev/null; [ "$(reads)" -le 3 ] && echo yes)" yes
printf '{"state_dir":"%s/state","terminal_backend":"orca","approvals":{"watch_every_s":1}}' "$tmp" > "$tmp/repo/.coord.local.json"
eq "설정 watch_every_s=1: --follow 2 에 읽기 2회 이상" "$(run a --follow 2 >/dev/null; [ "$(reads)" -ge 2 ] && echo yes)" yes
printf '{"state_dir":"%s/state","terminal_backend":"orca"}' "$tmp" > "$tmp/repo/.coord.local.json"

# --- --lanes ---
idle ha; idle hb; perm hb
out="$(run --lanes a,b --follow 0)"
eq "--lanes: 창이 있는 레인만 PROMPT 블록, 줄 앞에 레인 이름" "$(printf '%s\n' "$out" | grep -c '^b PROMPT hb permission$')" 1
eq "--lanes: 시간이 다하면 창 없는 레인에 NONE" "$(printf '%s\n' "$out" | grep -c '^a NONE ha$')" 1
eq "--lanes: 창이 있던 레인은 NONE 이 아니다(끝줄은 NONE 을 내지만 PROMPT 중복 없음)" "$(printf '%s\n' "$out" | grep -c ' PROMPT ')" 1
eq "--lanes: 한 프로세스가 두 레인을 읽는다(a 1회 + b 1회 + b 권한 창 120줄 재읽기 1회)" "$(reads)" 3
# 같은 창이 계속 떠 있으면 다시 알리지 않는다(--follow 2 --every 1: 읽기 여러 회, PROMPT 블록 1회)
out="$(run --lanes a,b --follow 2 --every 1)"
eq "--lanes: 같은 창은 한 번만 알린다" "$(printf '%s\n' "$out" | grep -c '^b PROMPT hb permission$')" 1
eq "--lanes: 읽기는 반복된다" "$([ "$(reads)" -ge 4 ] && echo yes)" yes
# 핸들 없는 레인·없는 레인
out="$(run --lanes a,c --follow 0)"
eq "--lanes: handle 없는 레인은 GONE 한 줄" "$(printf '%s\n' "$out" | grep -c '^c GONE ')" 1
eq "--lanes: GONE 레인은 마지막 NONE 줄에 없다" "$(printf '%s\n' "$out" | grep -c '^c NONE')" 0
eq "--lanes 와 <레인> 을 같이 쓰면 종료 코드 2" "$(bash "$script" --lanes a,b a >/dev/null 2>&1; echo $?)" 2
# 창이 사라졌다가 다시 뜨면 다시 알린다: 읽기 중에 화면을 바꾸는 가짜 orca 대신 두 번 실행해 대신 확인할 수 없으므로 상태 전이를 가짜 화면 교체 스크립트로 흉내
( sleep 1.2; idle hb ) & ( sleep 2.4; perm hb ) &
out="$(run --lanes b --follow 4 --every 1)"; wait
eq "--lanes: 창이 사라졌다 다시 뜨면 다시 알린다(PROMPT 2회)" "$(printf '%s\n' "$out" | grep -c '^b PROMPT hb permission$')" 2

echo "통과 $pass · 실패 $fail_n"
exit "$fail"
