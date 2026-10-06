#!/usr/bin/env bash
# 시간 제한으로 끊긴 office.sh 가 남긴 잠금이 뒤 호출을 막지 않는지 시험한다(일반 리뷰 6, contract §3.1 coord_lock · §4.1 알림).
#   coord_lock: 주인 pid·pstart 기록, 죽은 주인·오래된(COORD_LOCK_STALE_S) 잠금 탈취, 남의 잠금은 풀지 않음
#   office.sh: TERM 으로 끊겨도(폴러 run_limited 의 kill_tree 와 같은 방식) 잠금·임시 폴더·자식 프로세스를 남기지 않음
#   죽은 pid 의 세션 기록 잠금이 남아 있어도 lead-sync·console-poll input-handled 가 바로 끝남
# 사용법: bash tests/office-locks.sh   (네트워크·실제 D'Flow·터미널을 쓰지 않는다. 상태·콘솔 폴더·HOME·TMPDIR 은 모두 임시 폴더)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$(cd "$here/../scripts" && pwd)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/office-locks-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
BG=""
cleanup() { local p; for p in $BG; do kill "$p" 2>/dev/null; done; pkill -f "$tmp/" 2>/dev/null; rm -rf "$tmp"; }
trap cleanup EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

repo="$tmp/repo"; mkdir -p "$repo" "$tmp/tmpd"
unset CLAUDE_CODE_SESSION_ID COORD_STATE_ROOT COORD_DRY ORCA_TERMINAL_HANDLE DFLOW_CONFIG_DIR COORD_LOCK_STALE_S
export COORD_CONSOLE_POLL=0 HOME="$tmp/home" DFLOW_CONSOLE_DIR="$tmp/console"; mkdir -p "$HOME" "$tmp/console/input"
export COORD_REPO="$repo" COORD_RUN=t1 FAKE_LOG="$tmp/fake.log" COORD_SESSION_ID="S1A2B3C4-ffff-0000" CLAUDE_PID=$$
export TMPDIR="$tmp/tmpd"
cat > "$tmp/fake-dflow.sh" <<'EOF'
#!/bin/sh
if [ "$1" = me ]; then printf '{"user_email":"jji.test@x.com"}'; exit 0; fi
[ "$1" = watch ] && [ -f "$FAKE_DIR_D/watch_delay" ] && sleep "$(cat "$FAKE_DIR_D/watch_delay")"
echo "$*" >> "$FAKE_LOG"
printf '2026-10-06T00:00:00Z'
EOF
chmod +x "$tmp/fake-dflow.sh"
export FAKE_DIR_D="$tmp"
jq -n --arg st "$tmp/state" --arg ds "$tmp/fake-dflow.sh" \
  '{state_dir:$st, office:{enabled:true, project_id:null, label_max:40, dflow_script:$ds}}' > "$repo/.coord.local.json"
CS="bash $SD/coord-state.sh"
OFF="$SD/office.sh"
S8=s1a2b3c4
L="$tmp/state/_session/$S8"
lib() { ( . "$SD/lib/common.sh"; "$@" ); }
dead_pid() { sh -c 'exit 0' & local p=$!; wait "$p" 2>/dev/null; echo "$p"; }

# ---- 1. coord_lock: 주인 기록·탈취·남의 잠금 ---------------------------------------------------------
mkdir -p "$tmp/lk"
eq "잠그면 폴더 안에 내 pid" "$(lib bash -c '. "$1/lib/common.sh"; coord_lock "$2/a" && cat "$2/a.lock/pid" && [ "$(cat "$2/a.lock/pid")" = "$$" ] && echo mine' _ "$SD" "$tmp/lk" | tail -1)" mine
eq "내가 풀면 폴더가 없다" "$(lib bash -c '. "$1/lib/common.sh"; coord_lock "$2/b" && coord_unlock "$2/b"; [ -d "$2/b.lock" ] && echo left || echo gone' _ "$SD" "$tmp/lk")" gone
mkdir "$tmp/lk/c.lock"; dead_pid > "$tmp/lk/c.lock/pid"
t0=$(date +%s)
eq "죽은 주인의 잠금은 바로 탈취" "$(lib bash -c '. "$1/lib/common.sh"; coord_lock "$2/c" 2>/dev/null && [ "$(cat "$2/c.lock/pid")" = "$$" ] && echo got' _ "$SD" "$tmp/lk")" got
eq "탈취는 기다리지 않는다(3초 이내)" "$([ $(( $(date +%s) - t0 )) -le 3 ] && echo yes)" yes
sleep 60 & SP=$!; BG="$BG $SP"
mkdir "$tmp/lk/d.lock"; echo "$SP" > "$tmp/lk/d.lock/pid"; touch -t "$(date -v-2M +%Y%m%d%H%M.%S)" "$tmp/lk/d.lock"
eq "산 주인이어도 60초 넘게 오래된 잠금은 탈취" "$(lib bash -c '. "$1/lib/common.sh"; coord_lock "$2/d" 2>/dev/null && [ "$(cat "$2/d.lock/pid")" = "$$" ] && echo got' _ "$SD" "$tmp/lk")" got
mkdir "$tmp/lk/e.lock"; touch -t "$(date -v-2M +%Y%m%d%H%M.%S)" "$tmp/lk/e.lock"
eq "pid 없는 옛 형식 잠금도 오래되면 탈취" "$(lib bash -c '. "$1/lib/common.sh"; coord_lock "$2/e" 2>/dev/null && echo got' _ "$SD" "$tmp/lk")" got
mkdir "$tmp/lk/f.lock"; echo "$SP" > "$tmp/lk/f.lock/pid"
eq "남(산 주인)의 잠금은 풀지 않는다" "$(lib bash -c '. "$1/lib/common.sh"; coord_unlock "$2/f"; [ -d "$2/f.lock" ] && echo kept' _ "$SD" "$tmp/lk")" kept
eq "산 주인의 새 잠금은 탈취하지 않는다(짧은 대기 상한으로 확인)" \
  "$(COORD_LOCK_STALE_S=60 lib bash -c '. "$1/lib/common.sh"; _coord_lock_stale "$2/f.lock" && echo stale || echo live' _ "$SD" "$tmp/lk")" live
kill "$SP" 2>/dev/null; wait "$SP" 2>/dev/null

# ---- 2. 죽은 pid 의 세션 기록 잠금이 남아도 lead-sync 가 바로 끝난다 ------------------------------------------
$CS init t1 --goal "잠금 시험" >/dev/null 2>&1
$CS lane-add a1 '{"brief":"a1","session":{"handle":"h-a1","pid":0}}' >/dev/null 2>&1
bash "$OFF" lead-up >/dev/null 2>&1
eq "준비: 세션 기록이 있다" "$([ -f "$L.json" ] && echo yes)" yes
before="$(jq -r .sent_at "$L.json")"
mkdir "$L.lock"; dead_pid > "$L.lock/pid"     # KILL 로 끊긴 office.sh 가 남긴 잠금 흉내
sleep 1.1; t0=$(date +%s)
bash "$OFF" lead-sync >/dev/null 2>"$tmp/e"
eq "죽은 pid 잠금이 있어도 lead-sync 가 곧바로 끝난다(5초 이내)" "$([ $(( $(date +%s) - t0 )) -le 5 ] && echo yes)" yes
eq "lead-sync 가 세션 기록을 다시 썼다" "$([ "$(jq -r .sent_at "$L.json")" != "$before" ] && echo yes)" yes
eq "잠금이 남지 않는다" "$([ -d "$L.lock" ] && echo left || echo gone)" gone
eq "잠금 실패 경고가 없다" "$(grep -c '잠금 실패' "$tmp/e")" 0
# 폴러의 input-handled → office.sh lead-sync 도 이어서 끝난다
jq -nc '{v:1, kind:"permission", since:"2026-10-06T01:02:03.000Z", excerpt:["Do you want to proceed?"], handled:null}' > "$tmp/console/input/coord_lead_$S8.json"
mkdir "$L.lock"; dead_pid > "$L.lock/pid"
: > "$FAKE_LOG"; t0=$(date +%s)
eq "input-handled --lead: OK" "$(bash "$SD/console-poll.sh" input-handled --lead "$S8" --by coordinator 2>/dev/null)" OK
eq "input-handled 의 office.sh lead-sync 가 곧바로 끝나 잠금을 남기지 않는다" "$([ $(( $(date +%s) - t0 )) -le 8 ] && echo fast):$([ -d "$L.lock" ] && echo left || echo gone)" "fast:gone"
eq "그 lead-sync 가 팀장 watch 를 보냈다(처리됨 → 조정 중)" "$(grep -c -- "--until 조정 중" "$FAKE_LOG")" 1
rm -f "$tmp/console/input/coord_lead_$S8.json"

# ---- 3. office.sh 를 중간에 끊어도(폴러의 kill_tree 와 같은 방식) 잠금·임시 폴더·자식 프로세스가 남지 않는다 ------------
descendants() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do descendants "$c"; echo "$c"; done; }
kill_tree() {  # console-poll.sh 의 kill_tree 와 같은 순서(STOP → TERM → CONT → 0.3초 뒤 KILL)
  local all p; all="$(descendants "$1"; echo "$1")"
  for p in $all; do kill -STOP "$p" 2>/dev/null; done
  for p in $all; do kill -TERM "$p" 2>/dev/null; kill -CONT "$p" 2>/dev/null; done
  sleep 0.3
  for p in $all; do kill -0 "$p" 2>/dev/null && kill -KILL "$p" 2>/dev/null; done
  return 0
}
echo 2 > "$tmp/watch_delay"
bad=""
for off in 0.2 0.6 1.0 1.6 2.3 3.1; do
  bash "$OFF" lane-state a1 "대기" >/dev/null 2>&1 &
  op=$!
  sleep "$off"; kill_tree "$op"; wait "$op" 2>/dev/null
  sleep 0.2
  [ -n "$(ls -d "$tmp"/state/_session/*.lock "$tmp"/state/t1/.lock 2>/dev/null)" ] && bad="$bad lock@$off"
  [ -n "$(ls -d "$TMPDIR"/coord-office.* 2>/dev/null)" ] && bad="$bad tmp@$off"
  pgrep -f "$tmp/fake-dflow.sh" >/dev/null 2>&1 && bad="$bad child@$off"
  rm -rf "$TMPDIR"/coord-office.* 2>/dev/null; pkill -f "$tmp/fake-dflow.sh" 2>/dev/null
  $CS set '.office.label.a1' '"작업 중"' >/dev/null 2>&1   # 다음 반복도 보내게 라벨 기록을 되돌린다
done
eq "중간에 끊어도 잠금·임시 폴더·dflow 자식이 남지 않는다(시점 6곳)" "${bad:-none}" none
rm -f "$tmp/watch_delay"
t0=$(date +%s); bash "$OFF" lead-sync >/dev/null 2>"$tmp/e"
eq "끊긴 뒤 이어서 부른 lead-sync 가 곧바로 끝난다" "$([ $(( $(date +%s) - t0 )) -le 5 ] && echo yes):$(grep -c '잠금 실패' "$tmp/e")" "yes:0"
# TERM 만 받은 office.sh(자손은 살아 있음)도 EXIT trap 이 돌던 dflow.sh 를 거둔다
echo 5 > "$tmp/watch_delay"
bash "$OFF" lead-sync >/dev/null 2>&1 &
op=$!; sleep 1; kill -TERM "$op"; wait "$op" 2>/dev/null; sleep 0.5
eq "TERM 만 보내도 돌던 dflow.sh 와 임시 폴더를 거둔다" "$(pgrep -f "$tmp/fake-dflow.sh" >/dev/null 2>&1 && echo child || echo none):$(ls -d "$TMPDIR"/coord-office.* 2>/dev/null | grep -c .)" "none:0"
rm -f "$tmp/watch_delay"

# ---- 4. 폴러: office.sh 한 번 20초·알림 구간은 주기 몫과 따로 -----------------------------------------------------
eq "폴러 office_call 상한 20초" "$(grep -cE '^OFFICE_TIMEOUT=20 ' "$SD/console-poll.sh")" 1
eq "알림 구간은 run_phase(주기 몫) 밖에서 NOTIFY_MAX 로" "$(grep -c 'run_limited "\$NOTIFY_MAX" /dev/null /dev/stderr /dev/null input_notify' "$SD/console-poll.sh")" 1

for p in $BG; do kill "$p" 2>/dev/null; wait "$p" 2>/dev/null; done; BG=""
eq "정리: 이 시험의 프로세스가 남지 않는다" "$(pgrep -f "$tmp/" 2>/dev/null | grep -c .)" 0
echo "통과 $pass · 실패 $fail"
exit "$fail"
