#!/usr/bin/env bash
# console-poll.sh(오피스 콘솔 폴러)·lib/console-resolve.sh 를 가짜 dflow.sh·가짜 orca·가짜 term-send-safe·가짜 lead-state 로 확인한다.
# 사용법: bash tests/console-poll.sh   (실패가 있으면 종료 코드 1, 40초쯤 걸린다)
# 실제 서버·~/.coord·~/.dflow·터미널은 쓰지 않는다: HOME·COORD_STATE_ROOT·DFLOW_CONSOLE_DIR·COORD_REPO 를 모두 임시 폴더로 둔다.
# 가짜는 모두 $FAKE_DIR 의 파일로 움직인다(백그라운드 폴러도 같은 값을 보게):
#   dflow.sh  me → {"user_email":"Jji.Test@x.com"} · watch → 인자 기록 · console-poll → queue 첫 줄을 하나 내고 지움(poll_rc 가 있으면 그 종료 코드)
#             console-ack → 인자 기록, ack_rc 의 첫 줄을 종료 코드로 씀 · console-screen → stdin 을 screen.<n>.json 에 두고
#             lines 있으면 stored, 없으면 touched(screen_mode=need_full 이면 need_full)
#   orca      terminal list → terms(공백 구분) · terminal read → screens/<h>.txt
#   term-send-safe(COORD_TERM_SEND_SAFE)  받은 핸들·--allow-busy·글을 tss.log 에, 결과는 tss/<h>(없으면 SENT <h> turn_started, `exit` 면 종료 코드 4)
#   lead-state(COORD_LEAD_STATE)          slots 파일 그대로
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$(cd "$here/../scripts" && pwd)"
CP="$SD/console-poll.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/console-poll-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
BG=""
cleanup() {
  local p
  for p in $BG; do kill "$p" 2>/dev/null; done
  for d in "$tmp"/*/console; do
    for l in "$d"/poller-*.lock; do [ -f "$l/pid" ] && kill "$(cat "$l/pid")" 2>/dev/null; done
  done
  pkill -f "$tmp/bin/" 2>/dev/null   # 멈춘 가짜(orca·lead-state·dflow·tss)가 남지 않게
  rm -rf "$tmp"
}
trap cleanup EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass + 1)); echo "ok   $2"; else fail=1; echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

# ---- 격리 -------------------------------------------------------------------------------------
unset ORCA_TERMINAL_HANDLE CLAUDE_PID COORD_SESSION_ID CLAUDE_CODE_SESSION_ID COORD_RUN DFLOW_CONFIG_DIR COORD_DRY CONSOLE_POLL_IDENT COORD_CONSOLE_POLL COORD_CONSOLE_KEYS_ENABLED
mkdir -p "$tmp/bin" "$tmp/repo" "$tmp/home"
export HOME="$tmp/home" COORD_REPO="$tmp/repo" COORD_CONSOLE_CYCLE_S=1
export COORD_TERM_SEND_SAFE="$tmp/bin/fake-tss.sh" COORD_LEAD_STATE="$tmp/bin/fake-lead-state.sh"
jq -n --arg st "$tmp/unused-state" --arg ds "$tmp/bin/fake-dflow.sh" \
  '{state_dir:$st, terminal_backend:"orca", office:{enabled:true, project_id:null, label_max:40, dflow_script:$ds}}' > "$tmp/repo/.coord.local.json"

cat > "$tmp/bin/fake-dflow.sh" <<'FAKE'
#!/bin/sh
F="$FAKE_DIR"
[ -f "$F/hang_$1" ] && { echo "$*" >> "$FAKE_LOG"; : > "$F/hung_$1"; while :; do sleep 1; done; }
case "$1" in
  me) printf '{"user_email":"Jji.Test@x.com"}'; exit 0 ;;
  console-poll)
    echo "$*" >> "$FAKE_LOG"
    # 프로젝트 한정 PAT: 실제 dflow.sh api_raw 처럼 403 본문(JSON)을 stderr 로 내고 exit 5
    [ "$(cat "$F/poll_mode" 2>/dev/null)" = forbidden ] && { echo '{"error":"프로젝트 한정 토큰","code":"forbidden_role"}' >&2; exit 5; }
    [ -f "$F/poll_rc" ] && exit "$(cat "$F/poll_rc")"
    l="$(head -1 "$F/queue" 2>/dev/null)"
    tail -n +2 "$F/queue" > "$F/q.tmp" 2>/dev/null; mv "$F/q.tmp" "$F/queue"
    if [ -n "$l" ]; then
      mkdir -p "$F/claimed"; printf '%s\n' "$l" > "$F/claimed/$(printf '%s' "$l" | jq -r .id)"
      printf '%s\n' "$l"
    fi
    exit 0 ;;
  console-ack)
    echo "$*" >> "$FAKE_LOG"
    rc=0
    if [ -s "$F/ack_rc" ]; then rc="$(head -1 "$F/ack_rc")"; tail -n +2 "$F/ack_rc" > "$F/a.tmp"; mv "$F/a.tmp" "$F/ack_rc"; fi
    [ "$rc" = 0 ] || exit "$rc"
    # 서버처럼: retry 는 그 행을 pending 으로 돌린다(가장 오래된 것이라 대기열 맨 앞)
    if [ "$4" = retry ] && [ -f "$F/claimed/$2" ]; then cat "$F/claimed/$2" "$F/queue" > "$F/q.tmp"; mv "$F/q.tmp" "$F/queue"; fi
    echo "ACK $4"; exit 0 ;;
  console-screen)
    n=$(( $(ls "$F"/screen.*.json 2>/dev/null | wc -l) + 1 ))
    cat > "$F/screen.$n.json"
    echo "$* n=$n" >> "$FAKE_LOG"
    [ -f "$F/screen_rc" ] && { echo '{"error":"server"}' >&2; exit "$(cat "$F/screen_rc")"; }
    jq -r --arg m "$(cat "$F/screen_mode" 2>/dev/null)" '.[] | "SCREEN \(.target_kind) \(.target_ref) \(if has("lines") then "stored" elif $m == "need_full" then "need_full" else "touched" end)"' "$F/screen.$n.json"
    exit 0 ;;
  *) echo "$*" >> "$FAKE_LOG"; printf '2026-10-06T00:00:00Z'; exit 0 ;;
esac
FAKE
cat > "$tmp/bin/orca" <<'FAKE'
#!/bin/sh
echo "$*" >> "$FAKE_DIR/orca.log"
# 멈춘 orca 흉내: hang_<하위 명령> 파일이 있으면 표식을 남기고 끝없이 기다린다(경로에 $tmp 가 있어 pgrep -f 로 찾는다)
[ -f "$FAKE_DIR/hang_$2" ] && { : > "$FAKE_DIR/hung_$2"; while :; do sleep 1; done; }
# 느린 읽기: slow_read 의 초만큼 걸리고 시작·끝을 read.trace 에 적는다(주기 겹침 확인)
if [ "$2" = read ] && [ -f "$FAKE_DIR/slow_read" ]; then echo "B $$" >> "$FAKE_DIR/read.trace"; sleep "$(cat "$FAKE_DIR/slow_read")"; echo "E $$" >> "$FAKE_DIR/read.trace"; fi
sub="$2"; h=""; prev=""
for a in "$@"; do [ "$prev" = "--terminal" ] && h="$a"; prev="$a"; done
case "$sub" in
  list) jq -nc --arg t "$(cat "$FAKE_DIR/terms" 2>/dev/null)" '{ok:true,result:{terminals:[$t | split(" ")[] | select(. != "") | {handle:., title:"", worktreePath:""}]}}' ;;
  read)
    if [ -f "$FAKE_DIR/screens/$h.txt" ]; then jq -Rnc '[inputs] | {ok:true,result:{terminal:{tail:.}}}' < "$FAKE_DIR/screens/$h.txt"
    else echo '{"ok":false,"error":{"message":"terminal_handle_stale"}}'; fi ;;
  *) echo '{"ok":false,"error":{"message":"fake orca: not allowed"}}' ;;
esac
FAKE
cat > "$tmp/bin/fake-tss.sh" <<'FAKE'
#!/bin/sh
h=""; f=""; busy=no
while [ $# -gt 0 ]; do
  case "$1" in --handle) h="$2"; shift ;; --text-file) f="$2"; shift ;; --allow-busy) busy=yes ;; esac
  shift
done
printf 'h=%s busy=%s text=%s\n' "$h" "$busy" "$(cat "$f")" >> "$FAKE_DIR/tss.log"
[ -f "$FAKE_DIR/tss_sleep_$h" ] && sleep "$(cat "$FAKE_DIR/tss_sleep_$h")"
[ -f "$FAKE_DIR/tss_hang_$h" ] && { : > "$FAKE_DIR/hung_tss"; while :; do sleep 1; done; }
if [ -f "$FAKE_DIR/tss/$h" ]; then
  r="$(cat "$FAKE_DIR/tss/$h")"; [ "$r" = exit ] && exit 4
  echo "$r"
else echo "SENT $h turn_started"; fi
FAKE
cat > "$tmp/bin/fake-lead-state.sh" <<'FAKE'
#!/bin/sh
echo "$*" >> "$FAKE_DIR/ls.log"
[ -f "$FAKE_DIR/hang_ls" ] && { : > "$FAKE_DIR/hung_ls"; while :; do sleep 1; done; }
cat "$FAKE_DIR/slots" 2>/dev/null
FAKE
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH"
eq "격리: 가짜 orca 가 PATH 맨 앞" "$(command -v orca)" "$tmp/bin/orca"

RUN0="$(pgrep -f "$CP run" 2>/dev/null | grep -c .)"   # 시작 때 이미 있던 같은 경로의 폴러(다른 시험의 남은 것 등)
host="$(hostname | cut -d. -f1 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')"
ID="jji-test/$host"
dead_pid() { sh -c 'exit 0' & local p=$!; wait "$p" 2>/dev/null; echo "$p"; }
DEAD="$(dead_pid)"

# 시나리오마다 새 상태 뿌리·콘솔 폴더·가짜 폴더
newenv() {
  S="$tmp/$1"
  mkdir -p "$S/state/_session" "$S/console/lead" "$S/fake/screens" "$S/fake/tss"
  export COORD_STATE_ROOT="$S/state" DFLOW_CONSOLE_DIR="$S/console" FAKE_DIR="$S/fake" FAKE_LOG="$S/fake/dflow.log"
  : > "$FAKE_LOG"; : > "$FAKE_DIR/tss.log"; : > "$FAKE_DIR/queue"; : > "$FAKE_DIR/terms"
}
mksess() {  # mksess <세션8> <pid> <handle> [key] [user] [host]
  jq -n --arg k "${4:-$ID/coord:$1}" --arg h "$3" --argjson p "$2" --arg s "$1" \
    --arg u "${5:-jji-test}" --arg ho "${6:-$host}" \
    '{key:$k, session_id:$s, host:$ho, user:$u, pid:$p, handle:$h, sent_at:"2026-10-06T00:00:00+09:00", slots:0, busy:0}' > "$S/state/_session/$1.json"
}
mkrun() {  # mkrun <run-id> <session_id> <coordinator pid> [coordinator handle] [office.user — 기본 jji-test, - 이면 없음]
  mkdir -p "$S/state/$1"
  jq -n --arg id "$1" --arg sid "$2" --argjson p "$3" --arg h "${4:-}" --arg u "${5:-jji-test}" \
    '{schema:1, run:{id:$id, closed_at:null, coordinator:{session_id:$sid, pid:$p, handle:$h}}, lanes:{}, merge:{in_flight:null},
      office:(if $u == "-" then {} else {user:$u} end)}' > "$S/state/$1/state.json"
}
runset() {  # runset <run-id> <jq 식>
  jq "$2" "$S/state/$1/state.json" > "$S/state/$1/s.tmp" && mv "$S/state/$1/s.tmp" "$S/state/$1/state.json"
}
addlane() {  # addlane <run-id> <레인> <handle> [state] [보낸 키] [lane pid]
  local f="$S/state/$1/state.json"
  jq --arg l "$2" --arg h "$3" --arg st "${4:-active}" --arg k "${5:-}" --argjson p "${6:-0}" \
    '.lanes[$l] = {session:{handle:$h, pid:$p}, state:$st} | if $k != "" then .office.sent[$l] = $k else . end' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
}
mklead() {  # mklead <파일 이름> <pid> <handle> [agent]
  jq -n --argjson p "$2" --arg h "$3" --arg a "${4:-$ID/lead}" '{agent:$a, repo:"/repo/main", handle:$h, pid:$p, at:"x", slots:2, busy:1, until_label:"18:00", project:null}' > "$S/console/lead/$1.json"
}
CR_ID_DEF="jji-test"   # res·hdr·targets 가 쓰는 신원(CR_IDENT). 두 신원 시험에서 바꾼다
res() { ( CR_IDENT="$CR_ID_DEF" CR_HOST="$host"; . "$SD/lib/common.sh"; . "$SD/lib/term.sh"; . "$SD/lib/console-resolve.sh"; out="$(console_resolve "$1" "$2")"; rc=$?; echo "$rc:$out" ); }
hdr() { ( CR_IDENT="$CR_ID_DEF" CR_HOST="$host"; . "$SD/lib/common.sh"; . "$SD/lib/console-resolve.sh"; console_header_ref "$1" "$2" ); }
targets() { ( CR_IDENT="$CR_ID_DEF" CR_HOST="$host"; . "$SD/lib/common.sh"; . "$SD/lib/term.sh"; . "$SD/lib/console-resolve.sh"; console_list_targets ) | sort; }
log() { cat "$FAKE_LOG" 2>/dev/null; }
wait_for() {  # wait_for <초> <명령…> — 참이 될 때까지(0.1초 간격). 걸린 시간(초, 소수 1자리)을 WAITED 에
  local lim="$1" i=0; shift
  until "$@"; do i=$((i + 1)); [ "$i" -ge $((lim * 10)) ] && { WAITED="timeout"; return 1; }; sleep 0.1; done
  WAITED="$(awk -v i="$i" 'BEGIN { printf "%.1f", i / 10 }')"
}
pid_of_lock() { cat "$DFLOW_CONSOLE_DIR/poller-jji-test.lock/pid" 2>/dev/null; }

# =================================================================================================
# 1. 대상 해석(console-resolve)
newenv resolve
mksess aaaa1111 $$ hL1
mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk1; addlane r1 dup hd1; addlane r1 gone hg closed
mkrun r2 bbbb2222-0000 $$ hL2           # 세션 기록 없음 → 회차의 .run.coordinator.pid·handle
addlane r2 dup hd2
mksess dead0000 "$DEAD" hDead
mkrun r3 dead0000-0000 "$DEAD"
addlane r3 zombie hz
mkrun r4 dddd4444-0000 $$; runset r4 '.run.closed_at = "2026-10-06T00:00:00+09:00"'; addlane r4 old ho
mkrun r5 eeee5555-0000 "$DEAD"          # 세션 기록이 reap 으로 지워진 죽은 세션
addlane r5 orphan hor
mkrun r6 ffff6666-0000 $$; runset r6 '.office.finished = true'; addlane r6 fin hf
mkrun r7 9999aaaa-0000 0                # pid 를 모르는 세션(기록 없음) → 센다
addlane r7 nopid hnp
mksess cccc3333 $$ hOld "$ID/coord"      # 옛 키(식별자 없음)
eq "coord_lane: 열린 회차의 레인" "$(res coord_lane kit)" "0:hk1"
eq "coord_lane: 열린 회차 둘에 같은 이름 → ambiguous(2)" "$(res coord_lane dup)" "2:"
eq "coord_lane: closed 레인 제외" "$(res coord_lane gone)" "1:"
eq "coord_lane: 세션 기록 pid 가 죽은 회차 제외" "$(res coord_lane zombie)" "1:"
eq "coord_lane: 마감된 회차 제외" "$(res coord_lane old)" "1:"
eq "coord_lane: 기록 없고 회차 pid 가 죽음 → 제외" "$(res coord_lane orphan)" "1:"
eq "coord_lane: .office.finished 회차 제외" "$(res coord_lane fin)" "1:"
eq "coord_lane: pid 를 모르면 센다" "$(res coord_lane nopid)" "0:hnp"
eq "coord_lane: 없는 레인 → not-found(1)" "$(res coord_lane nope)" "1:"
eq "coord_lane: 형식이 틀린 ref → not-found" "$(res coord_lane '../x')" "1:"
eq "coord_lead: 세션 기록의 handle" "$(res coord_lead aaaa1111)" "0:hL1"
eq "coord_lead: 기록이 없으면 열린 회차의 .run.coordinator.handle" "$(res coord_lead bbbb2222)" "0:hL2"
eq "coord_lead: 죽은 세션 → not-found" "$(res coord_lead dead0000)" "1:"
eq "coord_lead: 없는 세션 → not-found" "$(res coord_lead zzzz9999)" "1:"
mklead L1 $$ hT
mklead L0 "$DEAD" hTdead
eq "team_lead: pid 가 산 기록의 handle(죽은 기록 제외)" "$(res team_lead lead)" "0:hT"
mklead L2 $$ hT2
eq "team_lead: 산 기록 둘 → ambiguous" "$(res team_lead lead)" "2:"
rm -f "$S/console/lead/L2.json"
printf '%s\n' 'RUN start=x backend=orca slots=2' \
  'SLOT 1 abcd1234 tsk=TSK-1 order=o1 kind=new state=spawn resolve=0 worktree=/w1 handle=hw1' \
  'SLOT 2 ef567890 tsk=TSK-2 order=o2 kind=new state=blocked resolve=0 worktree=/w2 handle=-' > "$FAKE_DIR/slots"
eq "team_worker: SLOT 줄의 handle" "$(res team_worker w1)" "0:hw1"
eq "team_worker: lead-state 를 팀장 기록의 agent·repo 로 부름" "$(tail -1 "$FAKE_DIR/ls.log")" "--agent $ID/lead --repo /repo/main"
eq "team_worker: handle=- 이면 not-found" "$(res team_worker w2)" "1:"
eq "team_worker: 없는 슬롯 → not-found" "$(res team_worker w3)" "1:"
eq "team_worker: 형식이 틀린 ref → not-found" "$(res team_worker x1)" "1:"
eq "머리글 ref: coord_lane = 레인 이름" "$(hdr coord_lane kit)" kit
eq "머리글 ref: coord_lead = lead" "$(hdr coord_lead aaaa1111)" lead
eq "머리글 ref: team_lead = lead" "$(hdr team_lead lead)" lead
eq "머리글 ref: team_worker = 슬롯의 id8" "$(hdr team_worker w1)" abcd1234
eq "머리글 ref: 형식이 틀리면 lead" "$(hdr coord_lane 'a b')" lead
want="$(printf '%s\n' "coord_lane	kit	hk1" "coord_lane	nopid	hnp" "coord_lead	aaaa1111	hL1" "team_lead	lead	hT" "team_worker	w1	hw1" | sort)"
eq "console_list_targets: 해석되는 대상 전부(옛 …/coord·ambiguous·죽은·closed 제외)" "$(targets)" "$want"
# 레인 세션 pid 생존(리뷰 1a): pid 가 0 이 아니고 죽은 레인은 해석하지 않는다(탭이 셸로 돌아갔을 수 있다)
addlane r1 deadl hdl active "" "$DEAD"; addlane r1 livel hll active "" $$
eq "coord_lane: 레인 session.pid 가 죽음 → not-found" "$(res coord_lane deadl)" "1:"
eq "coord_lane: 레인 session.pid 가 삶 → 해석" "$(res coord_lane livel)" "0:hll"
mkrun r1b 1b1b1b1b-0000 $$; addlane r1b deadl hdl2   # 같은 이름이 다른 회차에 살아 있으면 그쪽 하나로 해석
eq "coord_lane: 죽은 레인은 ambiguous 셈에도 빠진다" "$(res coord_lane deadl)" "0:hdl2"
rm -rf "$S/state/r1b"
# 팀원 생존(리뷰 1c): SLOT 줄의 state 가 살아 있는 팀원 상태(spawn·blocked)인 것만
printf '%s\n' 'SLOT 1 abcd1234 tsk=TSK-1 order=o1 kind=new state=spawn resolve=0 worktree=/w1 handle=hw1' \
  'SLOT 3 cdcd3434 tsk=TSK-3 order=o3 kind=new state=blocked resolve=0 worktree=/w3 handle=hw3' \
  'SLOT 4 dede4545 tsk=TSK-4 order=o4 kind=new state=result resolve=0 worktree=/w4 handle=hw4' \
  'SLOT 5 efef5656 tsk=TSK-5 order=o5 kind=new state=lost resolve=0 worktree=/w5 handle=hw5' > "$FAKE_DIR/slots"
eq "team_worker: state=blocked 는 살아 있는 팀원" "$(res team_worker w3)" "0:hw3"
eq "team_worker: state=result 는 해석하지 않는다" "$(res team_worker w4)" "1:"
eq "team_worker: state=lost 는 해석하지 않는다" "$(res team_worker w5)" "1:"

# --- 1b. 신원 거르기(리뷰 5): 한 PC 에 두 신원 -------------------------------------------------------
newenv ident
mksess aaaa1111 $$ hA                                              # 내 세션
mkrun r1 aaaa1111-0000 $$; addlane r1 kit hk
mksess bbbb2222 $$ hB "other/$host/coord:bbbb2222" other            # 같은 PC 의 다른 신원
mkrun r2 bbbb2222-0000 $$ hB2 other; addlane r2 okit hok
mkrun r2b b2b2b2b2-0000 $$ "" other; addlane r2b okit2 hok2          # 다른 신원의 회차(세션 기록 없음)
mksess cccc3333 $$ hC "$ID/coord:cccc3333" jji-test otherhost       # 같은 사람·다른 host 의 세션 기록
mkrun r3 cccc3333-0000 $$; addlane r3 hkit hhk
mkrun r4 dddd4444-0000 $$ "" -; addlane r4 oldk hold                # 신원이 없는 옛 회차
mksess eeee5555 $$ hE "$ID/coord:eeee5555" ""; jq 'del(.user) | del(.host)' "$S/state/_session/eeee5555.json" > "$tmp/e.json" && mv "$tmp/e.json" "$S/state/_session/eeee5555.json"
mklead Lm $$ hTm
mklead Lo $$ hTo "other/$host/lead"
mklead Lh $$ hTh "jji-test/otherhost/lead"
printf '%s\n' 'SLOT 1 abcd1234 tsk=T order=o kind=new state=spawn resolve=0 worktree=/w handle=hw1' > "$FAKE_DIR/slots"
eq "신원: 내 레인은 해석" "$(res coord_lane kit)" "0:hk"
eq "신원: 다른 신원의 조정 팀장 → not-found" "$(res coord_lead bbbb2222)" "1:"
eq "신원: 다른 신원 세션의 레인 → not-found" "$(res coord_lane okit)" "1:"
eq "신원: 다른 신원 회차(.office.user)의 레인 → not-found" "$(res coord_lane okit2)" "1:"
eq "신원: 같은 사람 다른 host 의 세션 → not-found" "$(res coord_lead cccc3333)$(res coord_lane hkit)" "1:1:"
eq "신원: 신원 없는 옛 회차·세션 기록 → not-found" "$(res coord_lane oldk)$(res coord_lead eeee5555)" "1:1:"
eq "신원: 팀장 기록은 .agent 앞 두 칸이 같은 것만(다른 신원·다른 host 제외)" "$(res team_lead lead)" "0:hTm"
: > "$FAKE_DIR/ls.log"; res team_worker w1 >/dev/null
eq "신원: 팀원은 내 팀장 기록으로만 lead-state 를 부른다" "$(cat "$FAKE_DIR/ls.log")" "--agent $ID/lead --repo /repo/main"
want="$(printf '%s\n' "coord_lane	kit	hk" "coord_lead	aaaa1111	hA" "team_lead	lead	hTm" "team_worker	w1	hw1" | sort)"
eq "신원: console_list_targets 는 내 대상만" "$(targets)" "$want"
CR_ID_DEF=other
eq "신원(other): 그 신원의 조정 팀장·레인·팀장" "$(res coord_lead bbbb2222)|$(res coord_lane okit)|$(res coord_lane okit2)|$(res team_lead lead)" "0:hB|0:hok|0:hok2|0:hTo"
eq "신원(other): jji-test 의 레인은 not-found" "$(res coord_lane kit)" "1:"
CR_ID_DEF=""
eq "신원이 비면 아무것도 해석하지 않는다" "$(res coord_lane kit)$(res team_lead lead)$(targets | grep -c .)" "1:1:0"
CR_ID_DEF=jji-test
# 폴러 경로로도: 다른 신원 대상은 target-not-found, 보내지 않는다
echo "hk hok hB" > "$FAKE_DIR/terms"
pidi() { printf '2222bbbb-0000-0000-0000-%012d' "$1"; }
jq -nc --arg id "$(pidi 1)" '{id:$id, target_kind:"coord_lane", target_ref:"okit", text:"남의 레인", claim_token:"tok-SECRET-i1"}' >> "$FAKE_DIR/queue"
jq -nc --arg id "$(pidi 2)" '{id:$id, target_kind:"coord_lead", target_ref:"bbbb2222", text:"남의 팀장", claim_token:"tok-SECRET-i2"}' >> "$FAKE_DIR/queue"
bash "$CP" --once 2>/dev/null
eq "신원(폴러): 다른 신원 대상 → refused target-not-found 두 건" "$(grep -c 'refused --reason target-not-found' "$FAKE_LOG")" 2
eq "신원(폴러): 남의 터미널에 넣지 않는다" "$(grep -c . "$FAKE_DIR/tss.log")" 0

# =================================================================================================
# 2. 프롬프트 전달(--once): 한 건씩 claim → 전달 → ack
newenv deliver
mksess aaaa1111 $$ hL
mkrun r1 aaaa1111-0000 $$
for l in kit:hk busy1:hb ghost:hgh pr:hp dr:hd er:he; do addlane r1 "${l%%:*}" "${l#*:}"; done
mklead L1 $$ hT
printf '%s\n' 'SLOT 1 abcd1234 tsk=T order=o kind=new state=spawn resolve=0 worktree=/w handle=hw1' > "$FAKE_DIR/slots"
echo "hk hL hT hw1 hb hp hd he" > "$FAKE_DIR/terms"     # hgh 는 목록에 없음(stale)
echo "REFUSED hb compacting" > "$FAKE_DIR/tss/hb"
echo "REFUSED hp prompt-open" > "$FAKE_DIR/tss/hp"
echo "REFUSED hd draft-in-input" > "$FAKE_DIR/tss/hd"
echo "exit" > "$FAKE_DIR/tss/he"
pid_n() { printf '1111aaaa-0000-0000-0000-%012d' "$1"; }
mkp() { jq -nc --arg id "$(pid_n "$1")" --arg k "$2" --arg r "$3" --arg t "$4" --arg tok "tok-SECRET-$1" \
  '{id:$id, target_kind:$k, target_ref:$r, text:$t, claim_token:$tok, expires_at:"2026-10-06T10:00:00Z"}' >> "$FAKE_DIR/queue"; }
mkp 1 coord_lane kit "안녕
하세요	탭"
mkp 2 coord_lead aaaa1111 "조정 팀장에게"
mkp 3 team_lead lead "팀장에게"
mkp 4 team_worker w1 "팀원에게"
mkp 5 coord_lane nope "없는 대상"
mkp 6 coord_lane kit "위험!"
mkp 7 coord_lane busy1 "압축 중"
mkp 8 coord_lane ghost "핸들 stale"
mkp 9 coord_lane pr "확인 창"
mkp 10 coord_lane dr "쓰다 만 글"
mkp 11 coord_lane er "보내기 실패"
mkp 12 coord_lane kit "   "
bash "$CP" --once > "$tmp/once.out" 2> "$tmp/once.err"
eq "--once: stdout 없음" "$(wc -c < "$tmp/once.out" | tr -d ' ')" 0
acks="$(grep '^console-ack ' "$FAKE_LOG")"
ackof() { printf '%s\n' "$acks" | grep -- " $(pid_n "$1") " | cut -d' ' -f3-; }
eq "ack: coord_lane SENT → sent --detail turn_started" "$(ackof 1)" "tok-SECRET-1 sent --detail turn_started"
eq "ack: coord_lead SENT" "$(ackof 2)" "tok-SECRET-2 sent --detail turn_started"
eq "ack: team_lead SENT" "$(ackof 3)" "tok-SECRET-3 sent --detail turn_started"
eq "ack: team_worker SENT" "$(ackof 4)" "tok-SECRET-4 sent --detail turn_started"
eq "ack: 없는 대상 → refused target-not-found" "$(ackof 5)" "tok-SECRET-5 refused --reason target-not-found"
eq "ack: ! → refused bang-in-text" "$(ackof 6)" "tok-SECRET-6 refused --reason bang-in-text"
eq "ack: REFUSED compacting → retry compacting" "$(ackof 7)" "tok-SECRET-7 retry --reason compacting"
eq "ack: 목록에 없는 핸들 → refused stale" "$(ackof 8)" "tok-SECRET-8 refused --reason stale"
eq "ack: REFUSED prompt-open → refused prompt-open" "$(ackof 9)" "tok-SECRET-9 refused --reason prompt-open"
eq "ack: REFUSED draft-in-input → refused draft-in-input" "$(ackof 10)" "tok-SECRET-10 refused --reason draft-in-input"
eq "ack: term-send-safe 비정상 종료 → refused error" "$(ackof 11)" "tok-SECRET-11 refused --reason error"
eq "ack: 정리 뒤 빈 본문 → refused error" "$(ackof 12)" "tok-SECRET-12 refused --reason error"
eq "ack: 프롬프트마다 한 번씩(12건)" "$(printf '%s\n' "$acks" | grep -c .)" 12
seq_got="$(grep -E '^console-(poll|ack) ' "$FAKE_LOG" | cut -d' ' -f1 | sed 's/console-poll/P/;s/console-ack/A/' | paste -sd' ' -)"
# p7(compacting)은 retry ack 를 poll 이 끝난 뒤로 미룬다(서버가 retry 행을 바로 다시 내주어 같은 주기에 맴돌지 않게)
eq "순서: poll 한 건 → ack → 다음 poll(빈 응답까지), retry ack 는 맨 끝" "$seq_got" "P A P A P A P A P A P A P P A P A P A P A P A P A"
eq "retry ack 뒤 서버는 그 행을 다시 pending 으로(가짜 대기열 맨 앞)" "$(head -1 "$FAKE_DIR/queue" | jq -r .id)" "$(pid_n 7)"
eq "compacting 대상에는 이 주기에 한 번만 넣어 본다" "$(grep -c '^h=hb ' "$FAKE_DIR/tss.log")" 1
eq "poll 마다 --limit 1(키 입력 답하기 기본 꺼짐 — accepts 없음)" "$(grep '^console-poll ' "$FAKE_LOG" | sort -u)" "console-poll --host $host --limit 1"
eq "보낸 글: 한 줄 머리글·줄바꿈과 탭은 공백(레인)" "$(grep '^h=hk ' "$FAKE_DIR/tss.log")" "h=hk busy=yes text=[오피스→kit] 프롬프트: 안녕 하세요 탭"
eq "보낸 글: coord_lead 는 lead" "$(grep '^h=hL ' "$FAKE_DIR/tss.log")" "h=hL busy=yes text=[오피스→lead] 프롬프트: 조정 팀장에게"
eq "보낸 글: team_lead 는 lead" "$(grep '^h=hT ' "$FAKE_DIR/tss.log")" "h=hT busy=yes text=[오피스→lead] 프롬프트: 팀장에게"
eq "보낸 글: team_worker 는 주문 id8" "$(grep '^h=hw1 ' "$FAKE_DIR/tss.log")" "h=hw1 busy=yes text=[오피스→abcd1234] 프롬프트: 팀원에게"
eq "term-send-safe 는 늘 --allow-busy 로" "$(grep -c 'busy=no' "$FAKE_DIR/tss.log")" 0
eq "term-send-safe 호출 수(해석·stale·! ·빈 본문은 부르지 않음)" "$(grep -c . "$FAKE_DIR/tss.log")" 8
eq "ack 가 성공하면 inflight 파일을 지운다" "$(ls "$DFLOW_CONSOLE_DIR/inflight" 2>/dev/null | wc -l | tr -d ' ')" 0
plog_f="$DFLOW_CONSOLE_DIR/poller-jji-test.log"
eq "로그가 남는다" "$([ -s "$plog_f" ] && echo yes)" yes
eq "로그·stderr 에 claim_token 없음" "$(cat "$plog_f" "$tmp/once.err" | grep -c 'tok-SECRET')" 0
eq "로그·stderr 에 프롬프트 본문 없음" "$(cat "$plog_f" "$tmp/once.err" | grep -cE '안녕|팀원에게|위험|압축 중')" 0
eq "--once 뒤 잠금이 풀린다" "$([ -d "$DFLOW_CONSOLE_DIR/poller-jji-test.lock" ] && echo held || echo free)" free

# --- 2a. compacting 이 앞에 있어도 뒤 프롬프트가 같은 주기에 나간다 -----------------------------------
: > "$FAKE_LOG"; : > "$FAKE_DIR/tss.log"   # 대기열 맨 앞에는 위에서 retry 로 돌아온 p7(compacting)이 있다
mkp 13 coord_lane kit "뒤 프롬프트"
bash "$CP" --once 2>/dev/null
eq "retry: compacting 행은 한 주기에 한 번만 시도(맴돌지 않음)" "$(grep -c '^h=hb ' "$FAKE_DIR/tss.log")" 1
eq "retry: 그 id 의 retry ack 는 한 번" "$(grep -c -- " $(pid_n 7) tok-SECRET-7 retry --reason compacting" "$FAKE_LOG")" 1
eq "retry: 뒤 프롬프트는 같은 주기에 보냈다" "$(grep -c '뒤 프롬프트' "$FAKE_DIR/tss.log")" 1
eq "retry: 뒤 프롬프트의 sent ack 가 retry ack 보다 먼저" \
  "$(grep '^console-ack ' "$FAKE_LOG" | awk '{print $4}' | paste -sd, -)" "sent,retry"
: > "$FAKE_DIR/queue"

# --- 2a'. retry 를 미루는 나이는 claim 시각부터 잰다(리뷰 7) ------------------------------------------
# hb 의 term-send-safe 가 3초 걸린 뒤 compacting. 붙잡는 상한을 2초로 낮추면, 나이를 claim(poll 직전)부터 재므로 다음 poll 전에
# retry ack 를 먼저 보낸다(전에는 term-send-safe 가 끝난 뒤부터 재서 다음 건을 처리한 뒤에야 보냈다). 돌려보낸 행이 같은 주기에
# 다시 나오면 넣어 보지 않고 다시 붙잡는다(hb 에는 한 번만 넣는다).
: > "$FAKE_LOG"; : > "$FAKE_DIR/tss.log"; : > "$FAKE_DIR/queue"
echo 3 > "$FAKE_DIR/tss_sleep_hb"
mkp 51 coord_lane busy1 "느린 압축"
mkp 52 coord_lane kit "그 뒤 프롬프트"
COORD_CONSOLE_HELD_MAX_S=2 bash "$CP" --once 2>/dev/null
seq7="$(grep -E '^console-(poll|ack) ' "$FAKE_LOG" | awk '{ print ($1 == "console-poll") ? "P" : "A:" $4 }' | paste -sd' ' -)"
eq "retry 나이: claim 뒤 상한이 지나면 다음 poll 전에 retry, 다시 나온 행은 붙잡고 뒤 건을 보낸다" "$seq7" "P A:retry P P A:sent P A:retry"
eq "retry 나이: compacting 대상에는 한 주기에 한 번만 넣는다" "$(grep -c '^h=hb ' "$FAKE_DIR/tss.log")" 1
eq "retry 나이: 뒤 프롬프트는 같은 주기에 보냈다" "$(grep -c '그 뒤 프롬프트' "$FAKE_DIR/tss.log")" 1
rm -f "$FAKE_DIR/tss_sleep_hb"; : > "$FAKE_DIR/queue"

# --- 2b. ack 네트워크 실패 재시도·retry 의 404 -------------------------------------------------
: > "$FAKE_LOG"; : > "$FAKE_DIR/tss.log"
mkp 21 coord_lane kit "재시도"
printf '6\n6\n0\n' > "$FAKE_DIR/ack_rc"
bash "$CP" --once 2>/dev/null
eq "ack rc 6 → 같은 인자로 다시(3번째 성공)" "$(grep -c -- " $(pid_n 21) tok-SECRET-21 sent --detail turn_started" "$FAKE_LOG")" 3
eq "재시도 끝에 성공하면 inflight 를 지운다" "$([ -f "$DFLOW_CONSOLE_DIR/inflight/$(pid_n 21)" ] && echo left || echo gone)" gone
: > "$FAKE_LOG"
mkp 22 coord_lane busy1 "압축 재시도"
printf '6\n7\n' > "$FAKE_DIR/ack_rc"
bash "$CP" --once 2>/dev/null
eq "retry ack: 네트워크 실패 뒤 404 는 이미 반영된 것으로 본다(2번 부르고 끝)" "$(grep -c -- " $(pid_n 22) " "$FAKE_LOG")" 2
eq "retry ack 404 뒤 inflight 를 지운다" "$([ -f "$DFLOW_CONSOLE_DIR/inflight/$(pid_n 22)" ] && echo left || echo gone)" gone
: > "$FAKE_LOG"
mkp 23 coord_lane kit "끝내 실패"
printf '6\n6\n6\n6\n6\n' > "$FAKE_DIR/ack_rc"
bash "$CP" --once 2>/dev/null
eq "ack rc 6 네 번이면 포기(처음 + 다시 3번)" "$(grep -c -- " $(pid_n 23) " "$FAKE_LOG")" 4
eq "포기하면 inflight 가 남는다" "$([ -f "$DFLOW_CONSOLE_DIR/inflight/$(pid_n 23)" ] && echo left || echo gone)" left
: > "$FAKE_DIR/ack_rc"

# --- 2c. 1회 전달: inflight 가 남은 id 는 다시 보내지 않는다 ---------------------------------------
: > "$FAKE_LOG"; : > "$FAKE_DIR/tss.log"
mkp 23 coord_lane kit "끝내 실패"            # 서버가 같은 id 를 다시 내준 경우(위 2b 의 남은 inflight)
printf '%s\n' "2026-10-06T00:00:00+09:00 coord_lane/kit" > "$DFLOW_CONSOLE_DIR/inflight/$(pid_n 24)"   # ack 직전에 죽은 것처럼
mkp 24 coord_lane kit "죽기 전에 보낸 것"
mkp 25 coord_lane kit "새 프롬프트"
bash "$CP" --once 2>/dev/null
eq "1회 전달: inflight 가 남은 id(23·24)는 보내지 않는다" "$(grep -c -E '끝내 실패|죽기 전에' "$FAKE_DIR/tss.log")" 0
eq "1회 전달: 그 id 는 ack 도 하지 않는다(서버가 unknown 으로 닫음)" "$(grep -c -E -- " ($(pid_n 23)|$(pid_n 24)) " "$FAKE_LOG")" 0
eq "1회 전달: 다른 새 프롬프트는 보낸다" "$(grep -c '새 프롬프트' "$FAKE_DIR/tss.log")" 1
eq "1회 전달: 남은 inflight 파일은 정리" "$(ls "$DFLOW_CONSOLE_DIR/inflight" | wc -l | tr -d ' ')" 0

# =================================================================================================
# 3. 화면 올리기(가림 라이브러리 연결)
newenv screens
mksess aaaa1111 $$ hL
mksess cccc3333 $$ hOld "$ID/coord"          # 옛 키 — 올리지 않는다
mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk
echo "hk hL hOld" > "$FAKE_DIR/terms"
SECRET1="sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"
SECRET2="dflow_pat_AAAA1111_BBBBccccDDDDeeee"
printf '%s\n' "작업 중 화면" "export ANTHROPIC_API_KEY=$SECRET1" "token: $SECRET2" "❯ " > "$FAKE_DIR/screens/hk.txt"
printf '%s\n' "조정 팀장 화면" > "$FAKE_DIR/screens/hL.txt"
printf '%s\n' "옛 키 화면" > "$FAKE_DIR/screens/hOld.txt"
bash "$CP" --once 2>/dev/null
s1="$FAKE_DIR/screen.1.json"
eq "화면: 41줄을 읽는다(term.sh 가 orca 에 --limit 41)" "$(grep '^terminal read ' "$FAKE_DIR/orca.log" | grep -c -- '--screen --limit 41 ')" 2
eq "화면: 40줄 읽기는 없다" "$(grep '^terminal read ' "$FAKE_DIR/orca.log" | grep -vc -- '--limit 41 ')" 0
eq "화면: 첫 주기에 한 번 올린다" "$(grep -c '^console-screen ' "$FAKE_LOG")" 1
eq "화면: console-screen --host" "$(grep '^console-screen ' "$FAKE_LOG" | cut -d' ' -f1-3)" "console-screen --host $host"
eq "화면: 첫 주기는 전체(lines 포함)" "$(jq -r '[.[] | select(.target_kind == "coord_lane" and .target_ref == "kit") | has("lines")] | .[0]' "$s1")" true
eq "화면: 비밀 원문이 올라가지 않는다" "$(grep -c -e "$SECRET1" -e "$SECRET2" -e 'AbCdEfGhIjKl' "$s1")" 0
eq "화면: 가린 자리 [가림]" "$(jq -r '.[] | select(.target_ref == "kit") | .lines | map(select(contains("[가림]"))) | length' "$s1")" 2
eq "화면: sha 는 64자 hex" "$(jq -r '.[0].sha' "$s1" | grep -cE '^[0-9a-f]{64}$')" 1
eq "화면: 옛 …/coord 키 대상은 올리지 않는다" "$(jq -r '[.[] | select(.target_ref == "cccc3333")] | length' "$s1")$(grep -c '옛 키 화면' "$s1")" "00"
eq "화면: 새 키 조정 팀장은 올린다" "$(jq -r '[.[] | select(.target_kind == "coord_lead" and .target_ref == "aaaa1111")] | length' "$s1")" 1
eq "화면: stored 이면 sha 를 기록" "$(cat "$DFLOW_CONSOLE_DIR/screens/coord_lane_kit.sha")" "$(jq -r '.[] | select(.target_ref == "kit") | .sha' "$s1")"
bash "$CP" --once 2>/dev/null
eq "화면: 같은 화면이면 touch(lines 없음)" "$(jq -r '[.[] | has("lines")] | any' "$FAKE_DIR/screen.2.json")" false
eq "화면: touch 도 sha·captured_at 은 싣는다" "$(jq -r '.[] | select(.target_ref == "kit") | "\(.sha | length) \(.captured_at != null)"' "$FAKE_DIR/screen.2.json")" "64 true"
echo "새 줄" >> "$FAKE_DIR/screens/hk.txt"
bash "$CP" --once 2>/dev/null
eq "화면: 바뀐 대상만 전체" "$(jq -r '[.[] | select(has("lines")) | .target_ref] | join(",")' "$FAKE_DIR/screen.3.json")" kit
echo need_full > "$FAKE_DIR/screen_mode"
bash "$CP" --once 2>/dev/null
eq "화면: need_full 응답이면 sha 기록을 지운다" "$([ -f "$DFLOW_CONSOLE_DIR/screens/coord_lane_kit.sha" ] && echo kept || echo gone)" gone
rm -f "$FAKE_DIR/screen_mode"
bash "$CP" --once 2>/dev/null
eq "화면: need_full 다음 주기는 전체" "$(jq -r '[.[] | select(.target_ref == "kit") | has("lines")] | .[0]' "$FAKE_DIR/screen.5.json")" true
echo "hk" > "$FAKE_DIR/terms"
bash "$CP" --once 2>/dev/null
eq "화면: 터미널 목록에 없는 대상은 건너뜀" "$(jq -r '[.[] | .target_ref] | join(",")' "$FAKE_DIR/screen.6.json")" kit
eq "화면: captured_at 은 UTC ISO 8601(…Z)" "$(jq -r '.[0].captured_at' "$FAKE_DIR/screen.6.json" | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$')" 1
old_sha="$(cat "$DFLOW_CONSOLE_DIR/screens/coord_lane_kit.sha")"
echo 6 > "$FAKE_DIR/screen_rc"; echo "또 바뀜" >> "$FAKE_DIR/screens/hk.txt"
bash "$CP" --once 2>/dev/null
eq "화면: 올리기 실패(exit 6)면 sha 기록을 바꾸지 않는다" "$(cat "$DFLOW_CONSOLE_DIR/screens/coord_lane_kit.sha")" "$old_sha"
rm -f "$FAKE_DIR/screen_rc"
bash "$CP" --once 2>/dev/null
eq "화면: 실패 다음 주기에 전체를 다시 보낸다" "$(jq -r '[.[] | select(.target_ref == "kit") | has("lines")] | .[0]' "$FAKE_DIR/screen.8.json")" true
mkrun r2 abab1212-0000 $$; addlane r2 kit hk2; echo "hk hk2 hL" > "$FAKE_DIR/terms"
bash "$CP" --once 2>/dev/null
eq "화면: 같은 레인 이름이 두 회차에 있으면(ambiguous) 올리지 않고 한 요청에 같은 대상이 두 번 없다" \
  "$(jq -r '[.[] | "\(.target_kind)/\(.target_ref)"] | (map(select(. == "coord_lane/kit")) | length | tostring) + " " + ((length == (unique | length)) | tostring)' "$FAKE_DIR/screen.9.json")" "0 true"

# =================================================================================================
# 4. 옛 서버(console-poll exit 7): ②③ 건너뛰고 ① reap 은 계속
newenv oldsrv
mksess aaaa1111 $$ hL
mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk
mksess dead0001 "$DEAD" hX
mkrun r9 dead0001-0000 "$DEAD"
echo "hk hL" > "$FAKE_DIR/terms"
printf '%s\n' "화면" > "$FAKE_DIR/screens/hk.txt"
echo 7 > "$FAKE_DIR/poll_rc"
bash "$CP" --once 2>/dev/null
eq "옛 서버 --once: console-screen 안 함" "$(grep -c '^console-screen' "$FAKE_LOG")" 0
eq "옛 서버 --once: reap 은 했다(죽은 세션 팀장 stop)" "$(grep -c -- "--agent $ID/coord:dead0001 --stop" "$FAKE_LOG")" 1
: > "$FAKE_LOG"
eq "옛 서버 루프: start" "$(bash "$CP" start | cut -d' ' -f1-2)" "CONSOLE_POLLER started"
wait_for 10 grep -q '^console-poll' "$FAKE_LOG"
sleep 1.5
mksess dead0002 "$DEAD" hY                 # 루프 도중 죽은 세션
mkrun r8 dead0002-0000 "$DEAD"
wait_for 10 grep -q -- "--agent $ID/coord:dead0002 --stop" "$FAKE_LOG"
eq "옛 서버 루프: 뒤 주기에도 reap 은 돈다" "$([ "$WAITED" = timeout ] && echo no || echo yes)" yes
eq "옛 서버 루프: console-poll 은 첫 주기 한 번뿐(10분 쉼)" "$(grep -c '^console-poll' "$FAKE_LOG")" 1
eq "옛 서버 루프: console-screen 없음" "$(grep -c '^console-screen' "$FAKE_LOG")" 0
eq "옛 서버 루프: stop" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
rm -f "$FAKE_DIR/poll_rc"

# =================================================================================================
# 4b. 프로젝트 한정 PAT(poll 이 exit 5 + forbidden_role): 전달만 끄고 reap·화면은 계속
newenv forbidden
mksess aaaa1111 $$ hL
mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk
mksess dead0005 "$DEAD" hX
mkrun r9 dead0005-0000 "$DEAD"
echo "hk hL" > "$FAKE_DIR/terms"
printf '%s\n' "화면" > "$FAKE_DIR/screens/hk.txt"
echo forbidden > "$FAKE_DIR/poll_mode"
mkp 41 coord_lane kit "한정 PAT"
bash "$CP" --once 2> "$tmp/forb.err"
MSG="프로젝트 한정 PAT 라 오피스 프롬프트 전달 불가. 한정 없는 PAT 필요"
eq "forbidden_role --once: stderr 에 안내 한 번" "$(grep -c "$MSG" "$tmp/forb.err")" 1
eq "forbidden_role --once: ack 없음" "$(grep -c '^console-ack' "$FAKE_LOG")" 0
eq "forbidden_role --once: 화면은 올린다" "$(grep -c '^console-screen' "$FAKE_LOG")" 1
eq "forbidden_role --once: reap 은 했다" "$(grep -c -- "--agent $ID/coord:dead0005 --stop" "$FAKE_LOG")" 1
: > "$FAKE_LOG"
st="$(bash "$CP" start)"
eq "forbidden_role 루프: start" "$(echo "$st" | cut -d' ' -f1-2)" "CONSOLE_POLLER started"
screens2() { [ "$(grep -c '^console-screen' "$FAKE_LOG")" -ge 3 ]; }
wait_for 15 screens2
eq "forbidden_role 루프: 화면 올리기는 주기마다 계속" "$([ "$WAITED" = timeout ] && echo no || echo yes)" yes
eq "forbidden_role 루프: poll 은 첫 주기 한 번뿐(이 프로세스 동안 끔)" "$(grep -c '^console-poll' "$FAKE_LOG")" 1
eq "forbidden_role 루프: 로그 안내는 한 번(시작한 프로세스마다)" "$(grep -c "$MSG" "$DFLOW_CONSOLE_DIR/poller-jji-test.log")" 2
eq "forbidden_role 루프: stop" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
# 기본 30분이 아니라 2초로 줄이면 지난 뒤 poll 을 한 번 더 시도하고, 안내는 그 프로세스에서 한 번뿐이다
: > "$FAKE_LOG"; before="$(grep -c "$MSG" "$DFLOW_CONSOLE_DIR/poller-jji-test.log")"
st="$(COORD_CONSOLE_OFF_RETRY_S=2 bash "$CP" start)"
eq "forbidden_role 재시도: start" "$(echo "$st" | cut -d' ' -f1-2)" "CONSOLE_POLLER started"
polls2() { [ "$(grep -c '^console-poll' "$FAKE_LOG")" -ge 2 ]; }
wait_for 20 polls2
eq "forbidden_role 재시도: 2초 뒤 poll 을 다시 시도한다" "$([ "$WAITED" = timeout ] && echo no || echo yes)" yes
eq "forbidden_role 재시도: 안내는 이 프로세스에서 한 번만" "$(( $(grep -c "$MSG" "$DFLOW_CONSOLE_DIR/poller-jji-test.log") - before ))" 1
echo ok > "$FAKE_DIR/poll_mode"; : > "$FAKE_LOG"
polls3() { [ "$(grep -c '^console-poll' "$FAKE_LOG")" -ge 1 ]; }
wait_for 20 polls3
eq "forbidden_role 재시도: 한정이 풀리면(poll 이 성공) 전달을 다시 한다" "$([ "$WAITED" = timeout ] && echo no || echo yes)" yes
eq "forbidden_role 재시도: stop" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
rm -f "$FAKE_DIR/poll_mode"

# =================================================================================================
# 5. DRY: 아무 것도 보내지 않는다
newenv dry
mksess aaaa1111 $$ hL
mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk
mksess dead0003 "$DEAD" hZ
mkrun r9 dead0003-0000 "$DEAD"
echo "hk hL" > "$FAKE_DIR/terms"
printf '%s\n' "화면" > "$FAKE_DIR/screens/hk.txt"
mkp 31 coord_lane kit "드라이"
COORD_DRY=1 bash "$CP" --once 2> "$tmp/dry.err"
bash "$CP" --once --dry-run 2>> "$tmp/dry.err"
eq "DRY: dflow.sh 호출 없음(poll·ack·screen·stop)" "$(grep -cE '^(console-|watch)' "$FAKE_LOG")" 0
eq "DRY: term-send-safe 호출 없음" "$(grep -c . "$FAKE_DIR/tss.log")" 0
eq "DRY: 세션 기록은 그대로(reap 안 함)" "$([ -f "$S/state/_session/dead0003.json" ] && echo kept)" kept
eq "DRY: 하려던 일을 stderr 에 DRY 로" "$(grep -c '^DRY office.sh reap' "$tmp/dry.err")$(grep -c '^DRY dflow.sh console-screen' "$tmp/dry.err")" "22"
eq "DRY: 프롬프트는 claim 하지 않는다(대기열 그대로)" "$(grep -c . "$FAKE_DIR/queue")" 1
eq "DRY: start 는 skipped dry" "$(COORD_DRY=1 bash "$CP" start)" "CONSOLE_POLLER skipped dry"

# =================================================================================================
# 6. 잠금: start·running·status·stop·죽은 잠금 탈취
newenv lock
mksess aaaa1111 $$ hL
mkrun r1 aaaa1111-0000 $$
out1="$(bash "$CP" start)"
p1="${out1##*pid=}"
eq "잠금: 첫 start → started" "$(echo "$out1" | cut -d' ' -f1-2)" "CONSOLE_POLLER started"
eq "잠금: 잠금 폴더의 pid = 루프 pid" "$(pid_of_lock)" "$p1"
eq "잠금: 두 번째 start → running 같은 pid" "$(bash "$CP" start)" "CONSOLE_POLLER running pid=$p1"
eq "잠금: status → up" "$(bash "$CP" status | sed -E 's/since=[^ ]+/since=X/')" "CONSOLE_POLLER up pid=$p1 since=X cycle=1"
eq "잠금: --once 는 돌고 있으면 running" "$(bash "$CP" --once)" "CONSOLE_POLLER running pid=$p1"
eq "잠금: stop → stopped" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
eq "잠금: stop 뒤 프로세스 없음" "$(kill -0 "$p1" 2>/dev/null && echo alive || echo dead)" dead
eq "잠금: stop 뒤 잠금 폴더 없음" "$([ -d "$DFLOW_CONSOLE_DIR/poller-jji-test.lock" ] && echo held || echo free)" free
eq "잠금: 다시 stop → none" "$(bash "$CP" stop)" "CONSOLE_POLLER none"
eq "잠금: status → down" "$(bash "$CP" status)" "CONSOLE_POLLER down"
mkdir -p "$DFLOW_CONSOLE_DIR/poller-jji-test.lock"; echo "$DEAD" > "$DFLOW_CONSOLE_DIR/poller-jji-test.lock/pid"
out2="$(bash "$CP" start)"; p2="${out2##*pid=}"
eq "잠금: 죽은 pid 잠금은 탈취 → started" "$(echo "$out2" | cut -d' ' -f1-2)" "CONSOLE_POLLER started"
eq "잠금: 탈취 뒤 pid 가 새 루프" "$(pid_of_lock)" "$p2"
eq "잠금: 탈취 뒤 stop" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
newenv lock-idle
eq "start: 할 일이 없으면 skipped idle" "$(bash "$CP" start)" "CONSOLE_POLLER skipped idle"
jq '.office.enabled = false' "$tmp/repo/.coord.local.json" > "$tmp/c.json" && cp "$tmp/repo/.coord.local.json" "$tmp/c.bak" && mv "$tmp/c.json" "$tmp/repo/.coord.local.json"
mksess aaaa1111 $$ hL
eq "start: office.enabled=false 이면 skipped disabled" "$(bash "$CP" start)" "CONSOLE_POLLER skipped disabled"
mv "$tmp/c.bak" "$tmp/repo/.coord.local.json"

# =================================================================================================
# 7. pid 사망 → 주기 안에 표시 내림(생존 감시)
newenv death
sleep 300 & SPID=$!; BG="$BG $SPID"
mksess aaaa1111 "$SPID" hA
mkrun rA aaaa1111-0000 "$SPID"
addlane rA l1 hl1 active "$ID/임시:l1·첫 레인"
mksess bbbb2222 $$ hB
mkrun rB bbbb2222-0000 $$
addlane rB l2 hl2 active "$ID/임시:l2·살아 있는 레인"
echo "hA hB hl1 hl2" > "$FAKE_DIR/terms"
st="$(bash "$CP" start)"; DP="${st##*pid=}"
eq "생존 감시: 폴러 start" "$(echo "$st" | cut -d' ' -f1-2)" "CONSOLE_POLLER started"
wait_for 10 grep -q '^console-poll' "$FAKE_LOG"
eq "생존 감시: 첫 주기(살아 있을 때)는 stop 없음" "$(grep -c -- '--stop' "$FAKE_LOG")" 0
kill "$SPID"; wait "$SPID" 2>/dev/null
both_stopped() { grep -q -- "--agent $ID/coord:aaaa1111 --stop" "$FAKE_LOG" && grep -q -- "--agent $ID/임시:l1·첫 레인 --stop" "$FAKE_LOG"; }
wait_for 30 both_stopped
DEATH_S="$WAITED"
echo "     (pid 사망 → 팀장·팀원 stop 까지 ${DEATH_S}초, 주기 1초)"
eq "생존 감시: 죽은 세션의 팀장·팀원 키 stop(30초가 아니라 주기 안)" "$(awk -v w="$DEATH_S" 'BEGIN { print (w != "timeout" && w + 0 <= 5) ? "fast" : "slow:" w }')" fast
rec_gone() { [ ! -f "$S/state/_session/aaaa1111.json" ]; }
wait_for 5 rec_gone   # stop 뒤 같은 reap 안에서 지운다
eq "생존 감시: 죽은 세션 기록을 지운다" "$([ -f "$S/state/_session/aaaa1111.json" ] && echo kept || echo gone)" gone
eq "생존 감시: 죽은 회차의 .office.sent.l1 을 비운다" "$(jq -r '.office.sent.l1 // "null"' "$S/state/rA/state.json")" null
eq "생존 감시: 살아 있는 세션은 건드리지 않는다" "$(grep -cE -- "coord:bbbb2222 --stop|l2·살아 있는 레인 --stop" "$FAKE_LOG")" 0
eq "생존 감시: 살아 있는 세션이 있으면 폴러는 계속 돈다" "$(kill -0 "$DP" 2>/dev/null && echo alive)" alive
eq "생존 감시: stop" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
eq "생존 감시: 잠금이 풀렸다" "$([ -d "$DFLOW_CONSOLE_DIR/poller-jji-test.lock" ] && echo held || echo free)" free

# =================================================================================================
# 8. 할 일이 없는 주기가 두 번이면 스스로 끝난다
newenv selfexit
mksess dead0004 "$DEAD" hQ
mkrun rQ dead0004-0000 "$DEAD"
st="$(bash "$CP" start)"; QP="${st##*pid=}"
eq "자기 종료: start(죽은 세션 기록이 있어 할 일 있음)" "$(echo "$st" | cut -d' ' -f1-2)" "CONSOLE_POLLER started"
lock_gone() { [ ! -d "$DFLOW_CONSOLE_DIR/poller-jji-test.lock" ] && ! kill -0 "$QP" 2>/dev/null; }
wait_for 15 lock_gone
eq "자기 종료: reap 뒤 빈 주기 두 번 → 잠금을 풀고 끝남" "$([ "$WAITED" = timeout ] && echo still-running || echo exited)" exited
eq "자기 종료: 그 전에 죽은 세션 팀장 키를 내렸다" "$(grep -c -- "--agent $ID/coord:dead0004 --stop" "$FAKE_LOG")" 1

# =================================================================================================
# 9. 팀장 핸들 기록
newenv leadrec
out="$(ORCA_TERMINAL_HANDLE=hTeam CLAUDE_PID=$$ bash "$CP" handle-record team --agent "$ID/lead" --repo /x/main --slots 3 --busy 1 --until-label '18:00' --project p1)"
f="${out#OK }"
eq "handle-record: OK <경로>, 경로 = lead/<MAIN cksum>.json" "$f" "$DFLOW_CONSOLE_DIR/lead/$(printf '%s' /x/main | cksum | cut -d' ' -f1).json"
eq "handle-record: 칸" "$(jq -r '"\(.agent) \(.repo) \(.handle) \(.pid) \(.slots) \(.busy) \(.until_label) \(.project) \(.at != null)"' "$f")" "$ID/lead /x/main hTeam $$ 3 1 18:00 p1 true"
bash "$CP" handle-record team --agent "$ID/lead" --repo /x/main --busy 2 >/dev/null
eq "handle-record: 다시 쓰면 갱신(환경에 없는 handle·pid 는 유지)" "$(jq -r '"\(.handle) \(.pid) \(.slots) \(.busy)"' "$f")" "hTeam $$ 3 2"
eq "handle-record: 해석에 쓰인다(team_lead)" "$(res team_lead lead)" "0:hTeam"
eq "handle-clear: OK" "$(bash "$CP" handle-clear team --repo /x/main)" OK
eq "handle-clear: 파일을 지운다" "$([ -f "$f" ] && echo kept || echo gone)" gone

# =================================================================================================
# 10. coord-state.sh init: 핸들 기록·폴러 기동
newenv init
out="$(ORCA_TERMINAL_HANDLE=hInit COORD_SESSION_ID=init1234-xx CLAUDE_PID=$$ bash "$SD/coord-state.sh" init ri1 2>/dev/null)"
eq "init: 첫 줄 RUN 그대로" "$(echo "$out" | head -1 | cut -d' ' -f1-2)" "RUN ri1"
eq "init: stdout 에 폴러 줄이 섞이지 않는다" "$(echo "$out" | grep -c CONSOLE_POLLER)" 0
eq "init: .run.coordinator.handle = ORCA_TERMINAL_HANDLE" "$(jq -r '.run.coordinator.handle' "$S/state/ri1/state.json")" hInit
eq "init: 세션 기록에도 handle" "$(jq -r '.handle' "$S/state/_session/init1234.json")" hInit
eq "init: 실제 기록자가 남긴 신원(회차 .office.user·세션 .user/.host)이 폴러 신원과 같다" \
  "$(jq -r '.office.user' "$S/state/ri1/state.json") $(jq -r '"\(.user)/\(.host)"' "$S/state/_session/init1234.json")" "jji-test $ID"
eq "init: 실제 기록으로 조정 팀장이 해석된다(신원 거르기 통과)" "$(res coord_lead init1234)" "0:hInit"
eq "init: 폴러가 떠 있다" "$(bash "$CP" status | cut -d' ' -f1-2)" "CONSOLE_POLLER up"
eq "init: 폴러 stop" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
COORD_CONSOLE_POLL=0 COORD_SESSION_ID=init5678-xx bash "$SD/coord-state.sh" init ri2 >/dev/null 2>&1
eq "init: COORD_CONSOLE_POLL=0 이면 폴러를 띄우지 않는다" "$(bash "$CP" status)" "CONSOLE_POLLER down"
eq "init: 핸들이 없으면 빈 값" "$(jq -r '.run.coordinator.handle' "$S/state/ri2/state.json")" ""
COORD_DRY=1 COORD_SESSION_ID=init9999-xx bash "$SD/coord-state.sh" init ri3 >/dev/null 2>&1
eq "init: COORD_DRY=1 이면 폴러를 띄우지 않는다" "$(bash "$CP" status)" "CONSOLE_POLLER down"

# 이 시험이 띄운 폴러·시간 감시자가 남지 않는다(같은 경로의 run 프로세스 수가 시작 때와 같다)
n_run() { pgrep -f "$CP run" 2>/dev/null | grep -c .; }
back_to_start() { [ "$(n_run)" -le "$RUN0" ]; }
no_fakes() { ! pgrep -f "$tmp/bin/" >/dev/null 2>&1; }
lockdir() { echo "$DFLOW_CONSOLE_DIR/poller-jji-test.lock"; }
lock_free() { [ ! -d "$(lockdir)" ]; }

# =================================================================================================
# 11. 멈춘 orca·lead-state·dflow.sh: 시간 상한·stop 뒤 고아 0(리뷰 2)
# 11a. 화면 읽기가 멈춤 → 구간 상한(2초)에서 버리고 경고, 다음 주기는 계속 돈다
newenv hang-read
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$; addlane r1 kit hk
echo "hk hL" > "$FAKE_DIR/terms"; printf '%s\n' "화면" > "$FAKE_DIR/screens/hk.txt"
: > "$FAKE_DIR/hang_read"
st="$(COORD_CONSOLE_PHASE_MAX_S=2 bash "$CP" start)"
eq "멈춘 read: start" "$(echo "$st" | cut -d' ' -f1-2)" "CONSOLE_POLLER started"
warned() { grep -q "경고: '화면 읽기' 이 2초 상한을 넘어" "$DFLOW_CONSOLE_DIR/poller-jji-test.log" 2>/dev/null; }
wait_for 10 warned
eq "멈춘 read: 화면 읽기 구간을 상한에서 버리고 경고 한 줄" "$([ "$WAITED" = timeout ] && echo no || echo yes)" yes
polls2() { [ "$(grep -c '^console-poll' "$FAKE_LOG")" -ge 2 ]; }
wait_for 10 polls2
eq "멈춘 read: 다음 주기가 이어진다" "$([ "$WAITED" = timeout ] && echo no || echo yes)" yes
eq "멈춘 read: 화면을 못 읽은 주기는 올리지 않는다" "$(grep -c '^console-screen' "$FAKE_LOG")" 0
TD="$(head -1 "$(lockdir)/tmpd" 2>/dev/null)"
is_tmpd() { case "$1" in */coord-console.*) [ -d "$1" ] && echo yes ;; esac; }
eq "잠금 폴더에 루프의 임시 폴더 경로" "$(is_tmpd "$TD")" yes
eq "멈춘 read: stop" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
wait_for 3 no_fakes
eq "멈춘 read: stop 뒤 가짜 orca 고아 없음" "$(no_fakes && echo 0 || pgrep -f "$tmp/bin/" | grep -c .)" 0
eq "멈춘 read: stop 뒤 임시 폴더 없음" "$([ -d "$TD" ] && echo left || echo gone)" gone
rm -f "$FAKE_DIR/hang_read"

# 11b. 터미널 목록·console-poll 이 멈춤 → stop 은 TERM 으로 바로 끝난다
for what in list console-poll; do
  newenv "hang-$what"
  mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$; addlane r1 kit hk
  echo "hk hL" > "$FAKE_DIR/terms"
  : > "$FAKE_DIR/hang_$what"
  bash "$CP" start >/dev/null
  hung() { [ -f "$FAKE_DIR/hung_$what" ]; }
  wait_for 10 hung
  eq "멈춘 $what: 멈춘 호출에 들어갔다" "$([ "$WAITED" = timeout ] && echo no || echo yes)" yes
  TD="$(head -1 "$(lockdir)/tmpd" 2>/dev/null)"
  t0="$(date +%s)"
  eq "멈춘 $what: stop" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
  eq "멈춘 $what: stop 이 기다리지 않고 끝난다(5초 안)" "$([ $(( $(date +%s) - t0 )) -le 5 ] && echo fast || echo slow)" fast
  wait_for 3 no_fakes
  eq "멈춘 $what: 고아 없음·임시 폴더 없음·잠금 없음" "$(no_fakes && echo 0 || echo n)$([ -d "$TD" ] && echo left || echo gone)$(lock_free && echo free)" "0gonefree"
done

# 11c. lead-state 가 멈춤(팀원 프롬프트 해석 중 — 포그라운드라 TERM 이 미뤄짐) → stop 의 KILL 분기가 자손·임시 폴더를 치운다
newenv hang-ls
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$
mklead L1 $$ hT
echo "hL hT hw1" > "$FAKE_DIR/terms"
: > "$FAKE_DIR/hang_ls"
mkp 71 team_worker w1 "팀원에게"
bash "$CP" start >/dev/null
hung_ls() { [ -f "$FAKE_DIR/hung_ls" ]; }
wait_for 10 hung_ls
eq "멈춘 lead-state: 멈춘 호출에 들어갔다" "$([ "$WAITED" = timeout ] && echo no || echo yes)" yes
TD="$(head -1 "$(lockdir)/tmpd" 2>/dev/null)"
eq "멈춘 lead-state: 그동안 임시 폴더에 claim_token·본문이 든 파일이 없다(읽은 프롬프트 파일은 바로 지움)" \
  "$(grep -rlE 'tok-SECRET-71|팀원에게' "$TD" 2>/dev/null | grep -c .)" 0
eq "멈춘 lead-state: stop(TERM 1초 뒤 KILL)" "$(COORD_CONSOLE_STOP_WAIT_S=1 bash "$CP" stop)" "CONSOLE_POLLER stopped"
eq "멈춘 lead-state: KILL 분기를 탔다(로그)" "$(grep -c '자손까지 KILL·임시 폴더 정리' "$DFLOW_CONSOLE_DIR/poller-jji-test.log")" 1
wait_for 3 no_fakes
eq "멈춘 lead-state: 고아 없음·임시 폴더 없음·잠금 없음" "$(no_fakes && echo 0 || echo n)$([ -d "$TD" ] && echo left || echo gone)$(lock_free && echo free)" "0gonefree"
wait_for 3 back_to_start
eq "멈춘 lead-state: 폴러 프로세스 없음" "$(back_to_start && echo ok)" ok

# 11d. 주기는 겹치지 않는다(느린 화면 읽기 1.5초, 주기 1초)
newenv serial
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$; addlane r1 kit hk
echo "hk" > "$FAKE_DIR/terms"; printf '%s\n' "화면" > "$FAKE_DIR/screens/hk.txt"
echo 1.5 > "$FAKE_DIR/slow_read"
bash "$CP" start >/dev/null
reads3() { local n; n="$(grep -c '^B' "$FAKE_DIR/read.trace" 2>/dev/null)"; [ "${n:-0}" -ge 3 ]; }
wait_for 20 reads3
bash "$CP" stop >/dev/null
eq "직렬: 화면 읽기가 세 주기 이상 돌았다" "$([ "$WAITED" = timeout ] && echo no || echo yes)" yes
eq "직렬: 앞 읽기가 끝나기 전에 다음 읽기가 시작되지 않는다(B E 번갈아)" \
  "$(awk '{ if ($1 == "B" && open) bad = 1; open = ($1 == "B") } END { print bad ? "overlap" : "serial" }' "$FAKE_DIR/read.trace")" serial
rm -f "$FAKE_DIR/slow_read"

# =================================================================================================
# 12. 멈출 때 붙잡아 둔 retry 를 돌려보낸다(리뷰 8)
newenv flushstop
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$
addlane r1 busy1 hb; addlane r1 er he
echo "hL hb he" > "$FAKE_DIR/terms"
echo "REFUSED hb compacting" > "$FAKE_DIR/tss/hb"; : > "$FAKE_DIR/tss_hang_he"
mkp 61 coord_lane busy1 "압축 중"
mkp 62 coord_lane er "멈출 프롬프트"
bash "$CP" start >/dev/null
hung_t() { [ -f "$FAKE_DIR/hung_tss" ]; }
wait_for 10 hung_t
eq "멈출 때 retry: 두 번째 전달에서 멈춤" "$([ "$WAITED" = timeout ] && echo no || echo yes)" yes
eq "멈출 때 retry: 멈추기 전에는 retry ack 없음(붙잡음)" "$(grep -c -- "$(pid_n 61) tok-SECRET-61 retry" "$FAKE_LOG")" 0
eq "멈출 때 retry: stop" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
eq "멈출 때 retry: 붙잡은 행을 retry compacting 으로 돌려보냈다" "$(grep -c -- " $(pid_n 61) tok-SECRET-61 retry --reason compacting" "$FAKE_LOG")" 1
wait_for 3 no_fakes
eq "멈출 때 retry: 멈춘 term-send-safe 고아 없음" "$(no_fakes && echo 0 || echo n)" 0

# =================================================================================================
# 13. office.enabled=false: 폴러가 스스로 끝나고 stop·status 가 찾는다(리뷰 3)
newenv disabled
mksess aaaa1111 $$ hL
cp "$tmp/repo/.coord.local.json" "$tmp/c.bak"
cfg_off() { jq '.office.enabled = false' "$tmp/c.bak" > "$tmp/repo/.coord.local.json"; }
cfg_on() { cp "$tmp/c.bak" "$tmp/repo/.coord.local.json"; }
began() { [ "$(grep -c '폴러 시작' "$DFLOW_CONSOLE_DIR/poller-jji-test.log" 2>/dev/null)" -ge "$1" ]; }
st="$(COORD_CONSOLE_CYCLE_S=30 bash "$CP" start)"
eq "꺼짐: start" "$(echo "$st" | cut -d' ' -f1-2)" "CONSOLE_POLLER started"
wait_for 5 began 1
cfg_off
eq "꺼짐: status 가 찾는다(신원 캐시)" "$(bash "$CP" status | cut -d' ' -f1-2)" "CONSOLE_POLLER up"
eq "꺼짐: stop 이 찾는다(신원 캐시)" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
cfg_on
st="$(COORD_CONSOLE_CYCLE_S=30 bash "$CP" start)"; XP="${st##*pid=}"
wait_for 5 began 2
cfg_off; rm -f "$DFLOW_CONSOLE_DIR"/ident*
eq "꺼짐·캐시 없음: status 는 잠금을 훑어 찾는다" "$(bash "$CP" status | cut -d' ' -f1-3)" "CONSOLE_POLLER up pid=$XP"
eq "꺼짐·캐시 없음: stop 은 잠금을 훑어 멈춘다" "$(bash "$CP" stop)" "CONSOLE_POLLER stopped"
eq "꺼짐·캐시 없음: 프로세스·잠금 없음" "$(kill -0 "$XP" 2>/dev/null && echo alive || echo dead)$(lock_free && echo free)" deadfree
eq "꺼짐·캐시 없음: 다시 stop → none" "$(bash "$CP" stop)" "CONSOLE_POLLER none"
cfg_on
st="$(bash "$CP" start)"; XP="${st##*pid=}"
wait_for 5 began 3
cfg_off
self_off() { lock_free && ! kill -0 "$XP" 2>/dev/null; }
wait_for 10 self_off
eq "꺼짐: 주기마다 확인해 스스로 끝난다" "$([ "$WAITED" = timeout ] && echo still-running || echo exited)" exited
eq "꺼짐: 끝낸 사유를 로그에" "$(grep -c 'office.enabled 가 꺼짐' "$DFLOW_CONSOLE_DIR/poller-jji-test.log")" 1
cfg_on
# start 직후(루프가 설정을 읽기 전) 꺼지면 루프는 잠금을 풀고 끝난다(죽은 pid 잠금을 남기지 않음)
st="$(bash "$CP" start)"; XP="${st##*pid=}"; cfg_off
wait_for 10 self_off
eq "꺼짐: start 직후 꺼져도 잠금을 남기지 않는다" "$([ "$WAITED" = timeout ] && echo left || echo clean)" clean
cfg_on

# =================================================================================================
# 14. pid 0 인 열린 회차는 할 일로 세지 않는다(리뷰 4) — 실제 ~/.coord 의 tooltip-… 두 개와 같은 모양
newenv pid0
mkrun tooltip-mdm-meta-1005 tooltip-mdm-meta-1005 0
mkrun tooltip-1005b tooltip-1005b 0
addlane tooltip-mdm-meta-1005 l1 hx
mksess zero0000 0 hZ                       # pid 를 모르는 세션 기록
eq "pid 0: 대상 해석에서는 센다" "$(res coord_lane l1)" "0:hx"
eq "pid 0: 열린 회차·기록뿐이면 start 는 skipped idle" "$(bash "$CP" start)" "CONSOLE_POLLER skipped idle"
sleep 300 & LP=$!; BG="$BG $LP"
mklead L1 "$LP" hT
st="$(bash "$CP" start)"; QP="${st##*pid=}"
eq "pid 0: 살아 있는 팀장 기록이 있으면 started" "$(echo "$st" | cut -d' ' -f1-2)" "CONSOLE_POLLER started"
kill "$LP"; wait "$LP" 2>/dev/null
self_done() { lock_free && ! kill -0 "$QP" 2>/dev/null; }
wait_for 10 self_done
eq "pid 0: 팀장이 죽으면 pid 0 회차가 남아도 스스로 끝난다" "$([ "$WAITED" = timeout ] && echo still-running || echo exited)" exited
[ "$WAITED" = timeout ] && bash "$CP" stop >/dev/null

# =================================================================================================
# 15. 죽은 잠금 탈취 경쟁: 동시 start 둘 중 하나만 started(리뷰 6)
newenv race
mksess aaaa1111 $$ hL
race_ok=0
for i in 1 2 3 4; do
  if [ $((i % 2)) = 1 ]; then mkdir -p "$(lockdir)"; echo "$DEAD" > "$(lockdir)/pid"; fi   # 홀수 번째: 죽은 잠금이 있는 채로
  bash "$CP" start > "$tmp/ra" 2>/dev/null & A=$!
  bash "$CP" start > "$tmp/rb" 2>/dev/null & B=$!
  wait "$A" "$B"
  n="$(cat "$tmp/ra" "$tmp/rb" | grep -c 'started')"
  [ "$n" = 1 ] && race_ok=$((race_ok + 1)) || echo "     ($i 번째: $(cat "$tmp/ra" "$tmp/rb" | paste -sd'|' -))"
  bash "$CP" stop >/dev/null
  wait_for 3 back_to_start
done
eq "탈취 경쟁: 네 번 모두 started 는 하나" "$race_ok" 4
eq "탈취 경쟁: 옮긴 옛 잠금·탈취 잠금이 남지 않는다" "$(ls -d "$DFLOW_CONSOLE_DIR"/poller-*.lock.* 2>/dev/null | grep -c .)" 0
wait_for 5 back_to_start
eq "정리: 남은 폴러·감시자 프로세스 없음(시작 때 ${RUN0}개 이하)" "$(back_to_start && echo ok || echo "$(n_run)개")" ok

# =================================================================================================
# 16. 입력 요청 감지가 화면 올리기와 같은 읽기에서 돈다(k11 — 세부 상태기계·키 입력은 tests/console-keys.sh)
newenv input
mksess aaaa1111 $$ hL
mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk
mklead L1 $$ hT
printf '%s\n' 'SLOT 1 abcd1234 tsk=T order=o kind=new state=spawn resolve=0 worktree=/w handle=hw1' > "$FAKE_DIR/slots"
echo "hk hL hT hw1" > "$FAKE_DIR/terms"
for h in hk hw1; do cp "$here/fixtures/prompt-permission.txt" "$FAKE_DIR/screens/$h.txt"; done
printf '%s\n' "조정 중" > "$FAKE_DIR/screens/hL.txt"; printf '%s\n' "팀장 작업 중" > "$FAKE_DIR/screens/hT.txt"
printf '#!/bin/sh\n[ "$1" = reap ] && exit 0\necho "COORD_RUN=${COORD_RUN:-} $*" >> "$FAKE_DIR/office.log"\n' > "$tmp/bin/fake-office.sh"; chmod +x "$tmp/bin/fake-office.sh"
: > "$FAKE_DIR/orca.log"
COORD_OFFICE_SH="$tmp/bin/fake-office.sh" bash "$CP" --once 2>/dev/null
eq "입력 요청: 레인 창 → input/coord_lane_kit.json" "$(jq -r .kind "$DFLOW_CONSOLE_DIR/input/coord_lane_kit.json" 2>/dev/null)" permission
eq "입력 요청: 팀원(team_worker)은 기록하지 않는다" "$(ls "$DFLOW_CONSOLE_DIR/input" | grep -c team_worker)" 0
eq "입력 요청: 화면 읽기는 대상마다 한 번(새 읽기 없음)" "$(grep -c '^terminal read ' "$FAKE_DIR/orca.log")" 4
eq "입력 요청: 화면 올리기는 그대로" "$(jq -r '[.[] | select(.target_ref == "kit") | has("lines")] | .[0]' "$FAKE_DIR/screen.1.json")" true
eq "입력 요청: office.sh lane-state 를 그 회차로" "$(cat "$FAKE_DIR/office.log" 2>/dev/null)" "COORD_RUN=r1 lane-state kit auto"

echo "통과 $pass · 실패 $([ "$fail" = 0 ] && echo 0 || echo '1+')"
exit "$fail"
