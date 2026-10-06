#!/usr/bin/env bash
# dflow.sh console-poll·console-ack·console-screen 시험(계약 §2.12). 가짜 curl 로 요청 본문·경로를 대조한다.
# 실행: bash .claude/skills/dflow-work/tests/console-cmds.sh   (서버·네트워크·실제 PAT 를 쓰지 않는다)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DFLOW="$HERE/../scripts/dflow.sh"
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2 — $3"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

tmp="$(mktemp -d "${TMPDIR:-/tmp}/dflow-console-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/work" "$tmp/cache"
# 가짜 curl: 마지막 인자(URL)·--data 를 기록하고 $FAKE_CODE/$FAKE_BODY 로 응답한다(-o 파일에 본문, -w 로 상태 코드).
cat > "$tmp/bin/curl" <<'FAKE'
#!/bin/sh
out=""; data=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    --data) data="$2"; shift 2 ;;
    -w|-X|-H) shift 2 ;;
    -sS) shift ;;
    *) url="$1"; shift ;;
  esac
done
printf '%s %s\n' "$url" "$data" >> "$FAKE_LOG"
printf '%s' "${FAKE_BODY:-{\}}" > "$out"
printf '%s' "${FAKE_CODE:-200}"
FAKE
chmod +x "$tmp/bin/curl"
export PATH="$tmp/bin:$PATH" FAKE_LOG="$tmp/log"
export DFLOW_API_BASE="http://fake.invalid" DFLOW_PAT="dflow_pat_AAAAAAAAAAAA_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
export XDG_CACHE_HOME="$tmp/cache" HOME="$tmp/home"; mkdir -p "$HOME"
unset DFLOW_PATS DFLOW_AS DFLOW_CONFIG_DIR DFLOW_PROJECT_ID
cd "$tmp/work" || exit 1
run() { : > "$FAKE_LOG"; "$DFLOW" "$@"; }

# ---- console-poll ----
export FAKE_CODE=200 FAKE_BODY='{"ok":true,"prompts":[{"id":"11111111-1111-1111-1111-111111111111","target_kind":"coord_lane","target_ref":"kit","text":"안녕 하세요","claim_token":"abcd","expires_at":"2026-10-06T10:00:00Z"},{"id":"22222222-2222-2222-2222-222222222222","target_kind":"team_lead","target_ref":"lead","text":"x","claim_token":"ef01","expires_at":"2026-10-06T10:00:00Z"}]}'
out="$(run console-poll --host mac-1 --limit 3 2>/dev/null)"; rc=$?
eq "poll: rc 0" "$rc" 0
eq "poll: 프롬프트마다 한 줄" "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" 2
eq "poll: 첫 줄 필드" "$(printf '%s\n' "$out" | head -1 | jq -r '[.id,.target_kind,.target_ref,.claim_token] | join(" ")')" "11111111-1111-1111-1111-111111111111 coord_lane kit abcd"
eq "poll: 요청 경로" "$(cut -d' ' -f1 "$FAKE_LOG")" "http://fake.invalid/api/v1/agent/console/poll"
eq "poll: 요청 본문" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -c .)" '{"host":"mac-1","limit":3}'
run console-poll --host mac-1 >/dev/null 2>&1
eq "poll: limit 없으면 본문에 없음" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -c .)" '{"host":"mac-1"}'
run console-poll >/dev/null 2>&1
eq "poll: host 기본값은 슬러그" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -r '.host | test("^[a-z0-9-]+$")')" true
FAKE_BODY='{"ok":true,"prompts":[]}' run console-poll --host mac-1 2>/dev/null | wc -c | tr -d ' ' | { read -r n; eq "poll: 프롬프트 없으면 빈 출력" "$n" 0; }
eq "poll: host 형식 오류 exit 2" "$(run console-poll --host 'Bad_Host' >/dev/null 2>&1; echo $?)" 2
eq "poll: limit 범위 오류 exit 2" "$(run console-poll --host a --limit 11 >/dev/null 2>&1; echo $?)" 2
eq "poll: 옛 서버 404 → exit 7" "$(FAKE_CODE=404 run console-poll --host mac-1 >/dev/null 2>&1; echo $?)" 7
eq "poll: 인증 401 → exit 3" "$(FAKE_CODE=401 run console-poll --host mac-1 >/dev/null 2>&1; echo $?)" 3

# ---- console-ack ----
ID=11111111-1111-1111-1111-111111111111
export FAKE_BODY='{"ok":true,"status":"sent"}'
eq "ack sent: 출력" "$(run console-ack $ID abcd sent --detail turn_started 2>/dev/null)" "ACK sent"
eq "ack sent: 본문" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -cS .)" '{"claim_token":"abcd","detail":"turn_started","id":"11111111-1111-1111-1111-111111111111","result":"sent"}'
eq "ack: 경로" "$(cut -d' ' -f1 "$FAKE_LOG")" "http://fake.invalid/api/v1/agent/console/ack"
FAKE_BODY='{"ok":true,"status":"sent","already":true}' run console-ack $ID abcd sent 2>/dev/null | { read -r l; eq "ack: 이미 반영" "$l" "ACK sent already"; }
FAKE_BODY='{"ok":true,"status":"pending"}' run console-ack $ID abcd retry --reason compacting 2>/dev/null | { read -r l; eq "ack retry: 출력" "$l" "ACK pending"; }
eq "ack retry: 본문 reason" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -r .reason)" compacting
eq "ack refused: reason 없으면 exit 2" "$(run console-ack $ID abcd refused >/dev/null 2>&1; echo $?)" 2
eq "ack retry: reason 없으면 exit 2" "$(run console-ack $ID abcd retry >/dev/null 2>&1; echo $?)" 2
eq "ack: 결과 값 오류 exit 2" "$(run console-ack $ID abcd done >/dev/null 2>&1; echo $?)" 2
eq "ack: 인자 부족 exit 2" "$(run console-ack $ID abcd >/dev/null 2>&1; echo $?)" 2
eq "ack: id 형식 오류 exit 2" "$(run console-ack 'x;y' abcd sent >/dev/null 2>&1; echo $?)" 2
eq "ack: 409 conflict → exit 4" "$(FAKE_CODE=409 FAKE_BODY='{"code":"conflict"}' run console-ack $ID abcd sent >/dev/null 2>&1; echo $?)" 4
eq "ack: 404 → exit 7" "$(FAKE_CODE=404 run console-ack $ID abcd retry --reason compacting >/dev/null 2>&1; echo $?)" 7

# ---- console-screen ----
export FAKE_BODY='{"ok":true,"results":[{"target_kind":"coord_lane","target_ref":"kit","status":"stored"},{"target_kind":"team_lead","target_ref":"lead","status":"rejected","reason":"unknown_target"}]}'
out="$(printf '%s' '[{"target_kind":"coord_lane","target_ref":"kit","sha":"aa","captured_at":"t","lines":["a","b"]}]' | run console-screen --host mac-1 2>/dev/null)"
eq "screen: 결과 줄" "$out" "SCREEN coord_lane kit stored
SCREEN team_lead lead rejected unknown_target"
eq "screen: 경로" "$(cut -d' ' -f1 "$FAKE_LOG")" "http://fake.invalid/api/v1/agent/console/screen"
eq "screen: 본문 host·items" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -c '[.host, (.items|length), .items[0].lines]')" '["mac-1",1,["a","b"]]'
printf '%s' '{"items":[{"target_kind":"coord_lane","target_ref":"kit","sha":"aa"}]}' | run console-screen --host mac-1 >/dev/null 2>&1
eq "screen: {items:[…]} 형태도 받는다" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -r '.items[0].target_ref')" kit
eq "screen: JSON 아님 exit 2" "$(printf 'nope' | run console-screen --host mac-1 >/dev/null 2>&1; echo $?)" 2
eq "screen: 배열 아님 exit 2" "$(printf '{"a":1}' | run console-screen --host mac-1 >/dev/null 2>&1; echo $?)" 2
many="$(jq -nc '[range(0;21) | {target_kind:"coord_lane", target_ref:"l\(.)", sha:"aa"}]')"
eq "screen: 21개 exit 2" "$(printf '%s' "$many" | run console-screen --host mac-1 >/dev/null 2>&1; echo $?)" 2

echo "통과 $pass · 실패 $fail"
exit "$fail"
