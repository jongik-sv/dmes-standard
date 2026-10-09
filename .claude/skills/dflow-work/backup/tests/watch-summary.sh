#!/usr/bin/env bash
# dflow.sh watch 의 요약 칸(--summary-json·--lead-summary-json·--input-request-json)과 응답 summary_error 처리 시험(계약 §2.12).
# 실행: bash .claude/skills/dflow-work/tests/watch-summary.sh   (가짜 curl — 서버·네트워크·실제 PAT 를 쓰지 않는다)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DFLOW="$HERE/../scripts/dflow.sh"
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2 — $3"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

tmp="$(mktemp -d "${TMPDIR:-/tmp}/dflow-watch-sum.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/work" "$tmp/cache" "$tmp/home"
# 가짜 curl: 본문(--data-binary @- 로 표준입력에서 읽는다)을 한 줄로 기록하고 $FAKE_CODE/$FAKE_BODY 로 응답한다.
cat > "$tmp/bin/curl" <<'FAKE'
#!/bin/sh
out=""; data=""; url=""
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
printf '%s\n' "$data" > "$FAKE_LOG"
printf '%s' "${FAKE_BODY:-{\}}" > "$out"
printf '%s' "${FAKE_CODE:-200}"
FAKE
chmod +x "$tmp/bin/curl"
export PATH="$tmp/bin:$PATH" FAKE_LOG="$tmp/log"
export DFLOW_API_BASE="http://fake.invalid" DFLOW_PAT="dflow_pat_AAAAAAAAAAAA_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
export XDG_CACHE_HOME="$tmp/cache" HOME="$tmp/home"
unset DFLOW_PATS DFLOW_AS DFLOW_CONFIG_DIR DFLOW_PROJECT_ID
cd "$tmp/work" || exit 1
run() { : > "$FAKE_LOG"; "$DFLOW" "$@"; }
body() { jq -rcS "$1" "$FAKE_LOG"; }

export FAKE_CODE=200 FAKE_BODY='{"ok":true,"expires_at":"2026-10-06T10:00:00Z"}'
SUM='{"v":1,"lane":"a1","state":"active","brief":"한글 요약","items_done":1,"items_total":2}'
LSUM='{"v":1,"runs":[{"run":"r1"}]}'
INREQ='{"v":1,"kind":"question","since":"2026-10-06T01:02:03.000Z","excerpt":["a","b"],"handled":null}'

# ---- 칸 싣기 ----
out="$(run watch --agent 'u/h/임시:a1' --until '작업 중' --summary-json "$SUM" --input-request-json "$INREQ" 2>"$tmp/err")"; rc=$?
eq "레인: rc 0·stdout 은 expires_at" "$rc $out" "0 2026-10-06T10:00:00Z"
eq "레인: summary 가 객체 그대로" "$(body .summary)" "$(printf '%s' "$SUM" | jq -cS .)"
eq "레인: input_request 그대로" "$(body .input_request)" "$(printf '%s' "$INREQ" | jq -cS .)"
eq "레인: lead_summary 칸 없음" "$(body 'has("lead_summary")')" false
eq "레인: 기존 칸(agent·until) 유지" "$(body '[.agent,.until] | join(",")')" "u/h/임시:a1,작업 중"
eq "레인: stderr 없음" "$(wc -c < "$tmp/err" | tr -d ' ')" 0
run watch --agent 'u/h/임시:a1' --input-request-json null >/dev/null 2>&1
eq "input_request null 도 칸으로 싣는다" "$(body '[has("input_request"), .input_request] | tojson')" '[true,null]'
run watch --agent 'u/h/coord:s1' --slots 1 --busy 0 --until '조정 중' --lead-summary-json "$LSUM" >/dev/null 2>&1
eq "팀장: lead_summary·until" "$(body '[.lead_summary.runs[0].run, .until, .slots] | tojson')" '["r1","조정 중",1]'
eq "팀장: summary·input_request 칸 없음" "$(body '[has("summary"), has("input_request")] | tojson')" '[false,false]'
run watch --agent 'u/h/임시:a1' >/dev/null 2>&1
eq "옵션 없으면 요약 칸 없음(옛 동작)" "$(body 'keys | join(",")')" "agent,host"

# ---- 잘못된 JSON 은 exit 2(요청을 보내지 않는다) ----
for bad in '{"a":' '[1,2]' '"str"' '{"a":1} {"b":2}'; do
  eq "summary 잘못된 값 exit 2: $bad" "$(run watch --agent x --summary-json "$bad" >/dev/null 2>&1; echo "$? $(wc -c < "$FAKE_LOG" | tr -d ' ')")" "2 0"
done
eq "summary null 은 거절(객체만)" "$(run watch --agent x --summary-json null >/dev/null 2>&1; echo $?)" 2
eq "lead_summary 잘못된 JSON exit 2" "$(run watch --agent x --lead-summary-json 'nope' >/dev/null 2>&1; echo $?)" 2
eq "input_request 배열 exit 2" "$(run watch --agent x --input-request-json '[]' >/dev/null 2>&1; echo $?)" 2
eq "빈 값 exit 2" "$(run watch --agent x --summary-json '' >/dev/null 2>&1; echo $?)" 2
eq "--stop 은 요약 칸을 싣지 않는다" "$(run watch --agent x --stop --summary-json "$SUM" 2>/dev/null; body 'keys | join(",")')" "stopped
agent,stop"

# ---- 응답 summary_error ----
FAKE_BODY='{"ok":true,"expires_at":"2026-10-06T10:00:00Z","summary_error":"summary: too_long | input_request: bad_since"}' \
  run watch --agent x --summary-json "$SUM" >"$tmp/out" 2>"$tmp/err"; rc=$?
eq "summary_error: rc 0" "$rc" 0
eq "summary_error: stdout 불변" "$(cat "$tmp/out")" "2026-10-06T10:00:00Z"
eq "summary_error: stderr 한 줄" "$(cat "$tmp/err")" "SUMMARY_ERROR summary: too_long | input_request: bad_since"
FAKE_BODY='{"ok":true,"expires_at":"x","summary_error":"a\nb"}' run watch --agent x --json --summary-json "$SUM" >"$tmp/out" 2>"$tmp/err"; rc=$?
eq "summary_error(--json): rc 0·본문 그대로" "$rc $(jq -r .expires_at "$tmp/out")" "0 x"
eq "summary_error 개행은 공백으로 한 줄" "$(cat "$tmp/err")" "SUMMARY_ERROR a b"
FAKE_BODY='{"ok":true,"expires_at":"x","summary_error":{"summary":"bad"}}' run watch --agent x >/dev/null 2>"$tmp/err"
eq "summary_error 가 객체여도 JSON 한 줄" "$(cat "$tmp/err")" 'SUMMARY_ERROR {"summary":"bad"}'
FAKE_BODY='{"ok":true,"expires_at":"x","summary_error":null}' run watch --agent x >/dev/null 2>"$tmp/err"
eq "summary_error null 이면 stderr 없음" "$(wc -c < "$tmp/err" | tr -d ' ')" 0
eq "4xx 는 기존대로 exit 2" "$(FAKE_CODE=400 FAKE_BODY='{"error":"x"}' run watch --agent x --summary-json "$SUM" >/dev/null 2>&1; echo $?)" 2

echo "통과 $pass · 실패 $fail"
exit "$fail"
