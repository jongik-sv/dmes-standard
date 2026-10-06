#!/usr/bin/env bash
# 웹 키 입력 답하기 꺼짐(기본 — 설정 console.keys_enabled=false) 시험(contract §4.1 「키 입력 답하기」). 켠 상태의 시험은 tests/console-keys.sh.
#   키 행을 받아도 키를 보내지 않고 refused·keys_disabled 로 ack 하는지, poll 에 accepts 가 없는지, 설정·환경변수로 켜지는지.
# 사용법: bash tests/console-keys-off.sh   (실패가 있으면 종료 코드 1)
# 실제 서버·~/.coord·~/.dflow·터미널은 쓰지 않는다: HOME·COORD_STATE_ROOT·DFLOW_CONSOLE_DIR·COORD_REPO 를 모두 임시 폴더로 둔다.
# 가짜(모두 $FAKE_DIR 파일로 움직인다):
#   dflow.sh   me · console-poll(queue 첫 줄) · console-ack(인자 기록) · console-screen(stored) · watch(인자 기록)
#   orca       terminal list → terms · terminal read → screens/<h>.<n>.txt(n 번째 읽기, 없으면 screens/<h>.txt, read_delay.<h> 가 있으면 그 초만큼 늦게)
#              의 마지막 --limit 줄(실제 터미널처럼 41줄 읽기에는 그 위가 안 보인다)
#              terminal send → send.log 에 `h=<h> enter=<y|n> json=<y|n> hex=<바이트 hex>`, 결과는 send_mode/<h>(ok|stale|error)
#   office.sh  COORD_OFFICE_SH — `COORD_RUN=<회차> <인자>` 를 office.log 에
#   tmux       send-keys 인자를 tmux.log 에
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$(cd "$here/../scripts" && pwd)"
CP="$SD/console-poll.sh"
FX="$here/fixtures"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/console-keys-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
BG=""
cleanup() {
  local p
  for p in $BG; do kill "$p" 2>/dev/null; done
  pkill -f "$tmp/bin/" 2>/dev/null
  rm -rf "$tmp"
}
trap cleanup EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass + 1)); echo "ok   $2"; else fail=1; echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

unset ORCA_TERMINAL_HANDLE CLAUDE_PID COORD_SESSION_ID CLAUDE_CODE_SESSION_ID COORD_RUN DFLOW_CONFIG_DIR COORD_DRY CONSOLE_POLL_IDENT COORD_CONSOLE_POLL
mkdir -p "$tmp/bin" "$tmp/repo" "$tmp/home"
export HOME="$tmp/home" COORD_REPO="$tmp/repo" COORD_CONSOLE_CYCLE_S=1
export COORD_TERM_SEND_SAFE="$tmp/bin/fake-tss.sh" COORD_LEAD_STATE="$tmp/bin/fake-lead-state.sh" COORD_OFFICE_SH="$tmp/bin/fake-office.sh"
export COORD_CONSOLE_SENT_GRACE_S=0     # 보낸 직후 표식은 따로 시험한다
jq -n --arg st "$tmp/unused-state" --arg ds "$tmp/bin/fake-dflow.sh" \
  '{state_dir:$st, terminal_backend:"orca", office:{enabled:true, project_id:null, label_max:40, dflow_script:$ds}}' > "$tmp/repo/.coord.local.json"

cat > "$tmp/bin/fake-dflow.sh" <<'FAKE'
#!/bin/sh
F="$FAKE_DIR"
case "$1" in
  me) printf '{"user_email":"Jji.Test@x.com"}'; exit 0 ;;
  console-poll)
    echo "$*" >> "$FAKE_LOG"
    l="$(head -1 "$F/queue" 2>/dev/null)"
    tail -n +2 "$F/queue" > "$F/q.tmp" 2>/dev/null; mv "$F/q.tmp" "$F/queue"
    [ -n "$l" ] && printf '%s\n' "$l"
    exit 0 ;;
  console-ack) echo "$*" >> "$FAKE_LOG"; echo "ACK $4"; exit 0 ;;
  console-screen) cat > /dev/null; echo "$*" >> "$FAKE_LOG"; exit 0 ;;
  *) echo "$*" >> "$FAKE_LOG"; printf '2026-10-06T00:00:00Z'; exit 0 ;;
esac
FAKE
cat > "$tmp/bin/orca" <<'FAKE'
#!/bin/bash
echo "$1 $2" >> "$FAKE_DIR/orca.log"
sub="$2"; h=""; prev=""; text=""; enter=n; json=n; lim=100000
for a in "$@"; do
  [ "$prev" = "--terminal" ] && h="$a"
  [ "$prev" = "--text" ] && text="$a"
  [ "$prev" = "--limit" ] && lim="$a"
  [ "$a" = "--enter" ] && enter=y
  [ "$a" = "--json" ] && json=y
  prev="$a"
done
case "$sub" in
  list) jq -nc --arg t "$(cat "$FAKE_DIR/terms" 2>/dev/null)" '{ok:true,result:{terminals:[$t | split(" ")[] | select(. != "") | {handle:., title:"", worktreePath:""}]}}' ;;
  read)
    [ -f "$FAKE_DIR/read_delay.$h" ] && sleep "$(cat "$FAKE_DIR/read_delay.$h")"
    n=$(( $(cat "$FAKE_DIR/reads.$h" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$FAKE_DIR/reads.$h"
    f="$FAKE_DIR/screens/$h.$n.txt"; [ -f "$f" ] || f="$FAKE_DIR/screens/$h.txt"
    if [ -f "$f" ]; then tail -n "$lim" "$f" | jq -Rnc '[inputs] | {ok:true,result:{terminal:{tail:.}}}'
    else echo '{"ok":false,"error":{"message":"terminal_handle_stale"}}'; fi ;;
  send)
    printf 'h=%s enter=%s json=%s hex=%s\n' "$h" "$enter" "$json" "$(printf '%s' "$text" | od -An -tx1 | tr -d ' \n')" >> "$FAKE_DIR/send.log"
    case "$(cat "$FAKE_DIR/send_mode/$h" 2>/dev/null)" in
      stale) echo '{"ok":false,"error":{"message":"terminal_handle_stale"}}' ;;
      error) echo '{"ok":false,"error":{"message":"boom"}}' ;;
      *) echo '{"ok":true,"result":{"accepted":true}}' ;;
    esac ;;
  *) echo '{"ok":false,"error":{"message":"fake orca: not allowed"}}' ;;
esac
FAKE
cat > "$tmp/bin/tmux" <<'FAKE'
#!/bin/sh
echo "$*" >> "$FAKE_DIR/tmux.log"
FAKE
cat > "$tmp/bin/fake-tss.sh" <<'FAKE'
#!/bin/sh
echo "$*" >> "$FAKE_DIR/tss.log"; echo "SENT x accepted"
FAKE
cat > "$tmp/bin/fake-lead-state.sh" <<'FAKE'
#!/bin/sh
exit 0
FAKE
cat > "$tmp/bin/fake-office.sh" <<'FAKE'
#!/bin/sh
[ "$1" = reap ] && exit 0
echo "COORD_RUN=${COORD_RUN:-} $*" >> "$FAKE_DIR/office.log"
FAKE
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH"
eq "격리: 가짜 orca 가 PATH 맨 앞" "$(command -v orca)" "$tmp/bin/orca"

host="$(hostname | cut -d. -f1 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')"
ID="jji-test/$host"
VEC=7e18f737311b2dc3b2f269dd78396b0351f14fb66efa879f768cb23181883c78
SECRET="sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"

newenv() {
  S="$tmp/$1"
  mkdir -p "$S/state/_session" "$S/console/lead" "$S/fake/screens" "$S/fake/send_mode"
  export COORD_STATE_ROOT="$S/state" DFLOW_CONSOLE_DIR="$S/console" FAKE_DIR="$S/fake" FAKE_LOG="$S/fake/dflow.log"
  : > "$FAKE_LOG"; : > "$FAKE_DIR/queue"; : > "$FAKE_DIR/terms"; : > "$FAKE_DIR/send.log"; : > "$FAKE_DIR/office.log"; : > "$FAKE_DIR/tss.log"
}
mksess() {  # <세션8> <pid> <handle>
  jq -n --arg k "$ID/coord:$1" --arg h "$3" --argjson p "$2" --arg s "$1" --arg u jji-test --arg ho "$host" \
    '{key:$k, session_id:$s, host:$ho, user:$u, pid:$p, handle:$h, sent_at:"2026-10-06T00:00:00+09:00", slots:0, busy:0}' > "$S/state/_session/$1.json"
}
mkrun() {  # <run-id> <session_id> <pid>
  mkdir -p "$S/state/$1"
  jq -n --arg id "$1" --arg sid "$2" --argjson p "$3" \
    '{schema:1, run:{id:$id, closed_at:null, coordinator:{session_id:$sid, pid:$p, handle:""}}, lanes:{}, merge:{in_flight:null}, office:{user:"jji-test"}}' > "$S/state/$1/state.json"
}
addlane() {  # <run-id> <레인> <handle> [state]
  local f="$S/state/$1/state.json"
  jq --arg l "$2" --arg h "$3" --arg st "${4:-active}" '.lanes[$l] = {session:{handle:$h, pid:0}, state:$st}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
}
runset() { jq "$2" "$S/state/$1/state.json" > "$S/state/$1/s.tmp" && mv "$S/state/$1/s.tmp" "$S/state/$1/state.json"; }
once() { bash "$CP" --once > "$tmp/once.out" 2> "$tmp/once.err"; }
rec() { cat "$DFLOW_CONSOLE_DIR/input/$1.json" 2>/dev/null; }
recf() { rec "$1" | jq -r "$2" 2>/dev/null; }
offcount() { grep -c . "$FAKE_DIR/office.log" 2>/dev/null | tr -d ' '; }
lib() { ( . "$SD/lib/common.sh"; . "$SD/lib/term.sh"; . "$SD/lib/console-redact.sh"; . "$SD/lib/console-input.sh"; "$@" ); }
sha_of_rec() { rec "$1" | jq -c '.excerpt' | lib console_excerpt_sha_json; }
resetreads() { rm -f "$FAKE_DIR"/reads.*; }

# =================================================================================================
# 웹 키 입력 답하기 꺼짐(기본) — 설정·환경변수 모두 끔
unset COORD_CONSOLE_KEYS_ENABLED
newenv off
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk
echo "hk hL" > "$FAKE_DIR/terms"
printf '%s\n' "조정 중" > "$FAKE_DIR/screens/hL.txt"
cp "$FX/prompt-permission.txt" "$FAKE_DIR/screens/hk.txt"
once
kid() { printf '3333cccc-0000-0000-0000-%012d' "$1"; }
FUT="$(date -u -r $(( $(date +%s) + 120 )) +%Y-%m-%dT%H:%M:%S.000Z)"
mkkey() {  # <n> <keys JSON> — 창이 맞아도(유효한 요청이어도) 꺼져 있으면 보내지 않는다
  jq -nc --arg id "$(kid "$1")" --argjson k "$2" --arg ik "$(recf coord_lane_kit .kind)" --arg is "$(recf coord_lane_kit .since)" --arg sh "$(sha_of_rec coord_lane_kit)" --arg ex "$FUT" \
    '{id:$id, target_kind:"coord_lane", target_ref:"kit", claim_token:("tok-KEY-" + ($id | .[-3:])), expires_at:$ex, kind:"keys", keys:$k,
      input_request:{kind:$ik, since:$is, sha:$sh}}' >> "$FAKE_DIR/queue"
}
ackof() { grep '^console-ack ' "$FAKE_LOG" | grep -- " $(kid "$1") " | cut -d' ' -f3-; }
eq "꺼짐 준비: 입력 요청 기록은 만든다(감지는 설정과 무관)" "$(recf coord_lane_kit .kind)" permission
: > "$FAKE_LOG"; : > "$FAKE_DIR/send.log"; : > "$FAKE_DIR/tss.log"; rm -f "$FAKE_DIR/orca.log"; : > "$FAKE_DIR/tmux.log"
mkkey 1 '["Down","Enter"]'
once
eq "꺼짐: poll 요청에 accepts 가 없다" "$(grep '^console-poll ' "$FAKE_LOG" | sort -u)" "console-poll --host $host --limit 1"
eq "꺼짐: 받은 키 행은 refused keys_disabled" "$(ackof 1)" "tok-KEY-001 refused --reason keys_disabled"
eq "꺼짐: 키 전송 0(가짜 orca send 기록 없음)" "$(grep -c . "$FAKE_DIR/send.log")" 0
eq "꺼짐: 재판정을 위한 orca 읽기·send 호출도 키 행 때문에 늘지 않는다(send 만 확인)" "$(grep -c '^terminal send' "$FAKE_DIR/orca.log" 2>/dev/null | tr -d ' ')" 0
eq "꺼짐: tmux send-keys 호출 없음" "$(grep -c . "$FAKE_DIR/tmux.log")" 0
eq "꺼짐: 소비 목록에 넣지 않는다" "$(ls "$DFLOW_CONSOLE_DIR/input/consumed" 2>/dev/null | wc -l | tr -d ' ')" 0
eq "꺼짐: 입력 요청 기록은 그대로(레인 키에 싣는 감지는 계속)" "$(recf coord_lane_kit .kind)" permission

# 설정 console.keys_enabled=true 면 켠다(poll 에 accepts 를 싣는다)
cfg0="$(cat "$tmp/repo/.coord.local.json")"
jq '.console = {keys_enabled: true}' "$tmp/repo/.coord.local.json" > "$tmp/repo/.coord.tmp" && mv "$tmp/repo/.coord.tmp" "$tmp/repo/.coord.local.json"
: > "$FAKE_LOG"; once
eq "설정 켬: poll 에 --accepts keys" "$(grep '^console-poll ' "$FAKE_LOG" | sort -u)" "console-poll --host $host --accepts keys --limit 1"
printf '%s\n' "$cfg0" > "$tmp/repo/.coord.local.json"
: > "$FAKE_LOG"; COORD_CONSOLE_KEYS_ENABLED=1 once
eq "환경변수 켬: poll 에 --accepts keys" "$(grep '^console-poll ' "$FAKE_LOG" | sort -u)" "console-poll --host $host --accepts keys --limit 1"

# =================================================================================================
echo "남은 프로세스 확인"
for p in $BG; do kill "$p" 2>/dev/null; wait "$p" 2>/dev/null; done; BG=""
eq "정리: 이 시험의 폴러·sleep 이 남지 않는다" "$(pgrep -f "$tmp" 2>/dev/null | grep -c .)" 0
echo "통과 $pass · 실패 $([ "$fail" = 0 ] && echo 0 || echo '1+')"
exit "$fail"
