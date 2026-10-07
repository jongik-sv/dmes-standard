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
# 가짜 curl: 마지막 인자(URL)와 본문(--data-binary @- 로 표준입력에서 읽는다)을 기록하고 $FAKE_CODE/$FAKE_BODY 로 응답한다(-o 파일에 본문, -w 로 상태 코드).
cat > "$tmp/bin/curl" <<'FAKE'
#!/bin/sh
out=""; data=""; url=""
printf '%s\n' "$*" > "${FAKE_ARGS:-/dev/null}"
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    --data-binary) if [ "$2" = "@-" ]; then data=$(cat); else data="@@unexpected-arg:$2"; fi; shift 2 ;;
    --data) data="@@command-line-body:$2"; shift 2 ;;   # 본문을 명령줄에 싣는 옛 방식 — 시험이 잡아낸다
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
export PATH="$tmp/bin:$PATH" FAKE_LOG="$tmp/log" FAKE_ARGS="$tmp/args"
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
run console-poll --host mac-1 --accepts keys --limit 1 >/dev/null 2>&1
eq "poll --accepts keys: 본문 accepts:['keys']" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -c .)" '{"host":"mac-1","limit":1,"accepts":["keys"]}'
eq "poll --accepts: keys 밖의 값 exit 2" "$(run console-poll --host a --accepts text >/dev/null 2>&1; echo $?)" 2
eq "poll --accepts: 빈 값 없이 끝나면 usage exit 2" "$(run console-poll --host a --accepts >/dev/null 2>&1; echo $?)" 2
KEYROW='{"id":"33333333-3333-3333-3333-333333333333","target_kind":"coord_lane","target_ref":"kit","claim_token":"c0de","expires_at":"2026-10-06T10:00:00Z","kind":"keys","keys":["Down","Enter"],"input_request":{"kind":"choice","since":"2026-10-06T00:00:00.000Z","sha":"aa"}}'
out="$(FAKE_BODY="{\"ok\":true,\"prompts\":[$KEYROW]}" run console-poll --host mac-1 --accepts keys --limit 1 2>/dev/null)"
eq "poll --accepts keys: 키 행 JSON 을 그대로 한 줄로" "$(printf '%s' "$out" | jq -c '[.kind, .keys, .input_request.kind, has("text")]')" '["keys",["Down","Enter"],"choice",false]'
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
FAKE_BODY='{"ok":true,"status":"refused"}' run console-ack $ID abcd refused --reason prompt_changed >/dev/null 2>&1
eq "ack refused prompt_changed: reason 을 검증 없이 그대로 싣는다" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -c '[.result, .reason]')" '["refused","prompt_changed"]'
eq "ack refused: reason 없으면 exit 2" "$(run console-ack $ID abcd refused >/dev/null 2>&1; echo $?)" 2
eq "ack retry: reason 없으면 exit 2" "$(run console-ack $ID abcd retry >/dev/null 2>&1; echo $?)" 2
eq "ack: 결과 값 오류 exit 2" "$(run console-ack $ID abcd done >/dev/null 2>&1; echo $?)" 2
eq "ack: 인자 부족 exit 2" "$(run console-ack $ID abcd >/dev/null 2>&1; echo $?)" 2
eq "ack: id 형식 오류 exit 2" "$(run console-ack 'x;y' abcd sent >/dev/null 2>&1; echo $?)" 2
eq "ack: 409 conflict → exit 4" "$(FAKE_CODE=409 FAKE_BODY='{"code":"conflict"}' run console-ack $ID abcd sent >/dev/null 2>&1; echo $?)" 4
eq "ack: 404 → exit 7" "$(FAKE_CODE=404 run console-ack $ID abcd retry --reason compacting >/dev/null 2>&1; echo $?)" 7
eq "ack retry: 새 라우트의 404 not_found 는 이미 반영됨(exit 0)" "$(FAKE_CODE=404 FAKE_BODY='{"code":"not_found"}' run console-ack $ID abcd retry --reason compacting 2>/dev/null; echo " rc=$?")" "ACK pending already
 rc=0"
eq "ack sent: 404 not_found 는 그대로 exit 7" "$(FAKE_CODE=404 FAKE_BODY='{"code":"not_found"}' run console-ack $ID abcd sent >/dev/null 2>&1; echo $?)" 7
eq "ack retry: code 없는 404(옛 서버)는 exit 7" "$(FAKE_CODE=404 FAKE_BODY='<html>no</html>' run console-ack $ID abcd retry --reason compacting >/dev/null 2>&1; echo $?)" 7
eq "ack: 403 forbidden_role 은 exit 5 이고 본문이 stderr" "$(FAKE_CODE=403 FAKE_BODY='{"code":"forbidden_role"}' run console-ack $ID abcd sent 2>&1 >/dev/null | grep -c forbidden_role)" 1
eq "poll: 403 forbidden_role → exit 5" "$(FAKE_CODE=403 FAKE_BODY='{"code":"forbidden_role"}' run console-poll --host mac-1 >/dev/null 2>&1; echo $?)" 5

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

# ---- 본문은 명령줄이 아니라 표준입력으로(윈도우 명령줄 한도 약 32,767자) ----
big="$(jq -nc '[{target_kind:"coord_lane", target_ref:"kit", sha:"aa", lines:[range(0;3000) | "줄 \(.) " + ("x" * 40)]}]')"
eq "큰 본문 시험 자료가 40000자를 넘는다" "$([ "${#big}" -gt 40000 ] && echo yes || echo no)" yes
out="$(printf '%s' "$big" | run console-screen --host mac-1 2>/dev/null)"; rc=$?
eq "큰 본문: rc 0 · 결과 줄" "$rc:$(printf '%s\n' "$out" | head -1)" "0:SCREEN coord_lane kit stored"
eq "큰 본문: 서버가 받은 줄 수" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -r '.items[0].lines | length')" 3000
eq "큰 본문: 마지막 줄까지 그대로" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -r '.items[0].lines[2999]')" "줄 2999 $(printf 'x%.0s' $(seq 1 40))"
eq "curl 인자는 --data-binary @- 이고 본문이 실리지 않는다" "$(cat "$FAKE_ARGS" | tr -d '\n' | sed 's/.*\(--data-binary @-\).*/\1/' | head -c 20)" "--data-binary @-"
eq "curl 인자 길이가 짧다(1000자 미만)" "$([ "$(wc -c < "$FAKE_ARGS")" -lt 1000 ] && echo yes || echo no)" yes
eq "옛 --data 본문 인자를 쓰지 않는다" "$(grep -c -- '--data ' "$FAKE_ARGS")" 0
run console-poll --host mac-1 >/dev/null 2>&1
eq "본문이 있는 다른 명령(poll)도 stdin 본문" "$(cut -d' ' -f2- "$FAKE_LOG" | jq -c .)" '{"host":"mac-1"}'

echo "통과 $pass · 실패 $fail"
exit "$fail"
