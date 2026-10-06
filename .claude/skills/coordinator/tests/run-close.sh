#!/usr/bin/env bash
# 회차 마감(close-run)과 새 회차 시작·틱의 STALE_RUN·SESSION_RUNS 점검을 가짜 dflow.sh 와 임시 상태 폴더로 확인한다. 실제 서버·~/.coord 는 쓰지 않는다.
# 사용법: bash tests/run-close.sh   (실패가 있으면 종료 코드 1)
# 계약(contract §2.1·§3.3·§3.4·§4): 팀장 키는 조정 세션 단위(`coord:<세션8>`)라 같은 세션의 열린 회차는 자동 마감하지 않고
# `SESSION_RUNS` 로 알리며, 다른 세션의 마감 표식 없는 회차는 `STALE_RUN` 경고만 낸다.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$here/../scripts"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/run-close-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0
chk() { if [ "$1" = ok ]; then echo "ok   $2"; else echo "FAIL $2${3:+ — $3}"; fail=1; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

repo="$tmp/repo"; mkdir -p "$repo"
# CLAUDE_PID 는 이 셸(살아 있음)로 고정한다(Claude Code 안에서 돌려도 실제 세션 값이 섞이지 않게).
export COORD_REPO="$repo" FAKE_LOG="$tmp/fake.log" CLAUDE_PID=$$
unset COORD_RUN COORD_SESSION_ID CLAUDE_CODE_SESSION_ID COORD_DRY COORD_STATE_ROOT
cat > "$tmp/fake-dflow.sh" <<'FAKE'
#!/bin/sh
if [ "$1" = me ]; then printf '{"user_email":"Jji.Test@x.com"}'; exit 0; fi
echo "$*" >> "$FAKE_LOG"
printf '2026-10-06T00:00:00Z'
FAKE
jq -n --arg st "$tmp/state" --arg ds "$tmp/fake-dflow.sh" \
  '{state_dir:$st, office:{enabled:true, project_id:"proj-1", label_max:40, dflow_script:$ds}}' > "$repo/.coord.local.json"
CS="bash $SD/coord-state.sh"
host="$(hostname | cut -d. -f1 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')"
ID="jji-test/$host"
: > "$FAKE_LOG"
log() { cat "$FAKE_LOG" 2>/dev/null; }
reset() { : > "$FAKE_LOG"; }
runget() { COORD_RUN="$1" $CS get "$2"; }   # runget <회차> <jq식>

# --- 1. close-run: 이벤트 → office finish → closed_at -------------------------------
COORD_SESSION_ID=s-one $CS init r1 --goal 첫회차 >/dev/null
eq "init: 현재 세션 id 를 .run.coordinator.session_id 에 기록" "$(runget r1 .run.coordinator.session_id)" s-one
eq "init: 조정 세션 pid(CLAUDE_PID) 를 .run.coordinator.pid 에 기록" "$(runget r1 .run.coordinator.pid)" "$$"
eq "init: closed_at 은 null" "$(runget r1 '.run.closed_at')" null
COORD_RUN=r1 $CS lane-add a1 '{"brief":"레인"}' >/dev/null
COORD_RUN=r1 bash "$SD/office.sh" lane-up a1
reset
eq "close-run: OK" "$(COORD_RUN=r1 $CS close-run)" OK
eq "close-run: 팀장 키(coord:<세션8>) stop" "$(log | grep -c -- "--agent $ID/coord:sone --stop")" 1
eq "close-run: 팀원 키 stop" "$(log | grep -c -- "--agent $ID/임시:a1·레인 --stop")" 1
eq "close-run: .office.finished" "$(runget r1 '.office.finished')" true
eq "close-run: closed_at 기록" "$([ "$(runget r1 '.run.closed_at // ""')" != "" ] && echo yes)" yes
eq "close-run: run-closed 이벤트 한 줄" "$(grep -c '"kind":"run-closed"' "$tmp/state/r1/events.jsonl")" 1
eq "close-run: 계약 밖 .run.state 는 쓰지 않는다" "$(runget r1 '.run | has("state")')" false
first="$(runget r1 '.run.closed_at')"; sleep 1
COORD_RUN=r1 $CS close-run >/dev/null
eq "close-run 재호출: closed_at 은 처음 값 유지" "$(runget r1 '.run.closed_at')" "$first"

# --- 2. event run-closed 도 같은 길 -------------------------------------------------------
COORD_SESSION_ID=s-two $CS init r2 >/dev/null
reset
COORD_RUN=r2 $CS event run-closed - '{"why":"시험"}' >/dev/null
eq "event run-closed: closed_at 기록" "$([ "$(runget r2 '.run.closed_at // ""')" != "" ] && echo yes)" yes
eq "event run-closed: 팀장 stop" "$(log | grep -c -- "--agent $ID/coord:stwo --stop")" 1
eq "event run-closed: 데이터 보존" "$(grep '"kind":"run-closed"' "$tmp/state/r2/events.jsonl" | jq -r '.data.why')" 시험

# --- 3. init: 같은 세션의 열린 회차는 자동 마감하지 않고 SESSION_RUNS ----------------------------
COORD_SESSION_ID=s-three $CS init r3 >/dev/null
reset
out="$(COORD_SESSION_ID=s-three $CS init r4 2>"$tmp/err")"
eq "init: 첫 줄은 그대로 RUN" "$(printf '%s\n' "$out" | head -1 | cut -d' ' -f1-2)" "RUN r4"
eq "init: 같은 세션의 열린 회차 → SESSION_RUNS <세션8> open=<새 회차 포함 수>" "$(printf '%s\n' "$out" | grep -c '^SESSION_RUNS sthree open=2$')" 1
eq "init: SESSION_RUNS 경고는 stderr 에도" "$(grep -c 'SESSION_RUNS sthree' "$tmp/err")" 1
eq "init: 같은 세션 회차는 STALE_RUN 이 아니다" "$(printf '%s\n' "$out" | grep -c '^STALE_RUN')" 0
eq "자동 마감 없음: r3 은 열린 채" "$(runget r3 '.run.closed_at')$(runget r3 '.office.finished // false')" "nullfalse"
eq "자동 마감 없음: run-closed 이벤트 없음" "$(grep -c '"kind":"run-closed"' "$tmp/state/r3/events.jsonl")" 0
eq "자동 마감 없음: 팀장 stop 없음" "$(log | grep -c -- '--stop')" 0
eq "같은 세션: 팀장 키 하나(coord:sthree)" "$(log | grep -o -- "--agent $ID/coord[^ ]*" | sort -u)" "--agent $ID/coord:sthree"

# --- 4. init: 다른 세션의 열린 회차는 경고만 -------------------------------------------------
out="$(COORD_SESSION_ID=s-other $CS init r5 2>"$tmp/err")"
eq "init: 다른 세션의 열린 r4 는 경고 줄" "$(printf '%s\n' "$out" | grep -c '^STALE_RUN r4 open session=s-three idle=[0-9]*m$')" 1
eq "init: 다른 세션의 열린 r3 도 경고 줄" "$(printf '%s\n' "$out" | grep -c '^STALE_RUN r3 open session=s-three ')" 1
eq "init: 경고에 close-run 안내(stderr)" "$(grep -c 'COORD_RUN=r4 coord-state.sh close-run' "$tmp/err")" 1
eq "init: 다른 세션뿐이면 SESSION_RUNS 없음" "$(printf '%s\n' "$out" | grep -c '^SESSION_RUNS')" 0
eq "init: 경고만 — r4 는 닫지 않는다" "$(runget r4 '.run.closed_at')" null

# --- 5. 마감된 회차는 경고하지 않는다 --------------------------------------------------------
out="$(COORD_SESSION_ID=s-five $CS init r6 2>/dev/null)"
eq "마감된 r1·r2 는 경고 없음" "$(printf '%s\n' "$out" | grep -c '^STALE_RUN r[12] ')" 0
for r in r3 r4 r5; do COORD_RUN=$r $CS close-run >/dev/null; done
out="$(COORD_SESSION_ID=s-five $CS init r7 2>/dev/null)"
eq "같은 세션 s-five 의 r6 이 열려 있으면 SESSION_RUNS open=2" "$(printf '%s\n' "$out" | grep -c '^SESSION_RUNS sfive open=2$')" 1
eq "r6 은 자동 마감되지 않는다" "$(runget r6 '.run.closed_at')" null
eq "이미 닫은 r3·r4·r5 는 경고 없음" "$(printf '%s\n' "$out" | grep -c '^STALE_RUN r[345]')" 0

# --- 6. tick: 다른 세션이 살아 있는 레인을 둔 열린 회차만 STALE_RUN(경고) ----------------------------
COORD_SESSION_ID=s-tick $CS init r8 >/dev/null 2>&1
COORD_SESSION_ID=s-tick $CS init r9 >/dev/null 2>&1        # r8 은 같은 세션이라 열린 채 남는다(정상)
COORD_SESSION_ID=s-oth $CS init r10 >/dev/null 2>&1
COORD_RUN=r10 $CS lane-add b1 '{"brief":"다른 세션 레인"}' >/dev/null
COORD_RUN=r8 $CS lane-add c1 '{"brief":"같은 세션 레인"}' >/dev/null
# 조정 세션이 둘이면 서로의 회차가 늘 보이므로 tick 은 120분 넘게 조용한 회차만 알린다.
tk0="$(COORD_RUN=r9 bash "$SD/tick.sh" --dry-run --no-answer 2>/dev/null)"
eq "tick: 방금 갱신된 다른 세션 회차 r10 은 STALE_RUN 없음(120분 미만)" "$(printf '%s\n' "$tk0" | grep -c '^STALE_RUN r10 ')" 0
touch -t "$(date -v-3H +%Y%m%d%H%M 2>/dev/null || date -d '3 hours ago' +%Y%m%d%H%M)" "$tmp/state/r10/state.json"
tk="$(COORD_RUN=r9 bash "$SD/tick.sh" --dry-run --no-answer 2>/dev/null)"
eq "tick: 다른 세션의 열린 r10(살아 있는 레인) 은 STALE_RUN" "$(printf '%s\n' "$tk" | grep -c '^STALE_RUN r10 session=s-oth idle=[0-9]*m$')" 1
eq "tick: 같은 세션의 열린 r8 은 STALE_RUN 없음(팀장 칸 공유)" "$(printf '%s\n' "$tk" | grep -c '^STALE_RUN r8 ')" 0
eq "tick: 자기 회차 r9 는 STALE_RUN 없음" "$(printf '%s\n' "$tk" | grep -c '^STALE_RUN r9 ')" 0
eq "tick: 살아 있는 레인이 없는 r6·r7 은 STALE_RUN 없음" "$(printf '%s\n' "$tk" | grep -c '^STALE_RUN r[67] ')" 0
eq "tick: 경고만 — r10 은 닫지 않는다" "$(runget r10 '.run.closed_at')" null
COORD_RUN=r10 $CS close-run >/dev/null
tk="$(COORD_RUN=r9 bash "$SD/tick.sh" --dry-run --no-answer 2>/dev/null)"
eq "tick: 닫은 뒤에는 STALE_RUN 없음" "$(printf '%s\n' "$tk" | grep -c '^STALE_RUN')" 0

exit "$fail"
