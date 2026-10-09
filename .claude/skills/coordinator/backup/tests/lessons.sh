#!/usr/bin/env bash
# 2026-10-06 회차 교훈 반영 시험: ① lane-add 의 memo 경고(stderr 한 줄, stdout OK 그대로) ② compact 직후 재측정 보조 경로.
# 가짜 orca·ctx-usage·term-send-safe 와 임시 상태 폴더만 쓴다. 실제 서버·~/.coord·터미널은 건드리지 않는다.
# 사용법: bash tests/lessons.sh   (실패가 있으면 종료 코드 1)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$here/../scripts"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/lessons-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0
chk() { if [ "$1" = ok ]; then echo "ok   $2"; else echo "FAIL $2${3:+ — $3}"; fail=1; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

repo="$tmp/repo"; mkdir -p "$repo" "$tmp/home"
export COORD_REPO="$repo" CLAUDE_PID=$$ HOME="$tmp/home" COORD_CONSOLE_POLL=0
unset COORD_RUN COORD_SESSION_ID CLAUDE_CODE_SESSION_ID COORD_DRY COORD_STATE_ROOT ORCA_TERMINAL_HANDLE DFLOW_CONFIG_DIR
jq -n --arg st "$tmp/state" '{state_dir:$st, office:{enabled:false}}' > "$repo/.coord.local.json"
CS="bash $SD/coord-state.sh"
COORD_SESSION_ID=s-lessons $CS init r1 --goal 시험 >/dev/null 2>&1
export COORD_RUN=r1
WARN="WARN lane-add %s: memo(정본 메모 경로)가 비어 있다 — compact 문구가 「정본은 -」 로 나간다"

# --- 1. lane-add memo 경고 ------------------------------------------------------------
out="$($CS lane-add m0 '{"brief":"메모 없음"}' 2>"$tmp/err")"
eq "lane-add(memo 없음): stdout 은 OK" "$out" OK
eq "lane-add(memo 없음): stderr 에 경고 한 줄" "$(cat "$tmp/err")" "$(printf "$WARN" m0)"
out="$($CS lane-add m1 '{"memo":"/x/resume-m1.md"}' 2>"$tmp/err")"
eq "lane-add(memo 있음): stdout 은 OK" "$out" OK
eq "lane-add(memo 있음): 경고 없음" "$(cat "$tmp/err")" ""
out="$($CS lane-add m1 '{"brief":"다시 호출"}' 2>"$tmp/err")"
eq "lane-add(이미 memo 가 있는 레인에 memo 없이 다시): 경고 없음" "$(cat "$tmp/err")" ""
eq "lane-add: memo 값은 유지" "$($CS get '.lanes.m1.memo')" "/x/resume-m1.md"
out="$($CS lane-add m2 '{"memo":""}' 2>"$tmp/err")"
eq "lane-add(memo 빈 문자열): 경고" "$(cat "$tmp/err")" "$(printf "$WARN" m2)"

# --- 2. 화면 판독 함수(가짜 입력) ---------------------------------------------------------
. "$SD/lib/compact-screen.sh"
pct() { printf '%s\n' "$1" | compact_screen_ctx_pct; }
eq "pct: ctx 12%" "$(pct 'foo
 ctx 12% | opus')" 12
eq "pct: Context: 7%" "$(pct 'Context: 7%')" 7
eq "pct: 33% context" "$(pct '33% context used')" 33
eq "pct: 남은 뜻(left)은 뺀다" "$(pct 'Context left until auto-compact: 88%')" ""
eq "pct: 100 초과는 버린다" "$(pct 'ctx 150%')" ""
eq "pct: 없으면 빈 출력" "$(pct 'esc to interrupt')" ""
eq "pct: 마지막 일치를 쓴다" "$(pct 'ctx 80%
...
ctx 9%')" 9
if printf '%s\n' '✻ Conversation compacted (ctrl+o for history)' | compact_screen_compacted; then chk ok "compacted 문구 감지"; else chk fail "compacted 문구 감지"; fi
if printf '%s\n' 'Compacting conversation…' | compact_screen_compacted; then chk fail "Compacting 은 compacted 가 아니다"; else chk ok "Compacting 은 compacted 가 아니다"; fi

# --- 3. compact-lane.sh 재측정 보조 경로(가짜 orca·ctx-usage·term-send-safe) -------------------
sc="$tmp/sc"; mkdir -p "$sc" "$tmp/bin"
cp -R "$SD/." "$sc/"
cat > "$sc/term-send-safe.sh" <<'FAKE'
#!/bin/sh
echo "SENT fake"
FAKE
cat > "$sc/ctx-usage.sh" <<'FAKE'
#!/bin/sh
# 호출 순서대로 $CTX_SEQ(공백으로 나눈 숫자)를 하나씩 낸다. 마지막 값은 반복.
n="$(cat "$CTX_COUNT" 2>/dev/null || echo 0)"; n=$((n + 1)); echo "$n" > "$CTX_COUNT"
v="$(echo "$CTX_SEQ" | cut -d' ' -f"$n")"; [ -n "$v" ] || v="$(echo "$CTX_SEQ" | awk '{print $NF}')"
echo "CTX sid tokens=$v window=200000 pct=0 src=transcript at=x"
FAKE
cat > "$tmp/bin/orca" <<'FAKE'
#!/bin/sh
# terminal read 만 흉내 낸다: 첫 호출은 Compacting 화면, 그 뒤는 $FINAL_SCREEN 파일.
n="$(cat "$READ_COUNT" 2>/dev/null || echo 0)"; n=$((n + 1)); echo "$n" > "$READ_COUNT"
if [ "$n" -eq 1 ]; then f="$FIRST_SCREEN"; else f="$FINAL_SCREEN"; fi
jq -Rn '[inputs]' < "$f" | jq -c '{ok:true, result:{terminal:{tail:.}}}'
FAKE
chmod +x "$sc/term-send-safe.sh" "$sc/ctx-usage.sh" "$tmp/bin/orca"
printf 'Compacting conversation…\n' > "$tmp/first.txt"
export FIRST_SCREEN="$tmp/first.txt" FINAL_SCREEN="$tmp/final.txt" CTX_COUNT="$tmp/ctx.n" READ_COUNT="$tmp/read.n"
OLDPATH="$PATH"; export PATH="$tmp/bin:$PATH"

runcompact() {  # runcompact <레인> <CTX_SEQ> <최종 화면>  → stdout 은 $tmp/cout, stderr 는 $tmp/cerr
  local lane="$1"
  export CTX_SEQ="$2"; printf '%s\n' "$3" > "$FINAL_SCREEN"; rm -f "$CTX_COUNT" "$READ_COUNT"
  $CS lane-add "$lane" '{"memo":"/x/m.md","session":{"kind":"claude","handle":"h-'"$lane"'","session_id":"sid"}}' >/dev/null 2>&1
  $CS set ".lanes.$lane.compact.pre_compact" '"남은 일 하나"' >/dev/null
  bash "$sc/compact-lane.sh" "$lane" > "$tmp/cout" 2> "$tmp/cerr"
}
runcompact c1 "100000" "✻ Conversation compacted
 ctx 12% | opus"
eq "재측정 같음 + 화면 ctx 12%: after 를 어림(12% x 200000)" "$(cat "$tmp/cout")" "COMPACT_DONE c1 before=100000 after=24000"
if grep -q '^COMPACT_NOTE c1 .*ctx 12%' "$tmp/cerr"; then chk ok "보조 경로 알림은 stderr 에만"; else chk fail "보조 경로 알림은 stderr 에만" "$(cat "$tmp/cerr")"; fi
eq "COMPACT_NOTE 는 stdout 에 없다" "$(grep -c COMPACT_NOTE "$tmp/cout")" 0
eq "history 에 어림값 기록" "$($CS get '.lanes.c1.compact.history[-1].after_tokens')" 24000

runcompact c2 "100000" "✻ Conversation compacted"
eq "재측정 같음 + Compacted 만: after=-" "$(cat "$tmp/cout")" "COMPACT_DONE c2 before=100000 after=-"
if grep -q '^COMPACT_NOTE c2 .*Compacted' "$tmp/cerr"; then chk ok "Compacted 확인 알림(stderr)"; else chk fail "Compacted 확인 알림(stderr)" "$(cat "$tmp/cerr")"; fi
eq "history after_tokens 는 null" "$($CS get '.lanes.c2.compact.history[-1].after_tokens')" null

runcompact c3 "100000" "프롬프트만 보인다"
eq "재측정 같음 + 화면 단서 없음: after=-" "$(cat "$tmp/cout")" "COMPACT_DONE c3 before=100000 after=-"
if grep -q '^COMPACT_NOTE c3 .*찾지 못했다' "$tmp/cerr"; then chk ok "단서 없음 경고(stderr)"; else chk fail "단서 없음 경고(stderr)" "$(cat "$tmp/cerr")"; fi

runcompact c4 "100000 30000" "✻ Conversation compacted
 ctx 12%"
eq "재측정이 달라지면 그 값 그대로(보조 경로 안 씀)" "$(cat "$tmp/cout")" "COMPACT_DONE c4 before=100000 after=30000"
eq "정상 재측정이면 COMPACT_NOTE 없음" "$(grep -c COMPACT_NOTE "$tmp/cerr")" 0
export PATH="$OLDPATH"

[ "$fail" = 0 ] && echo "ALL PASS" || echo "SOME FAILED"
exit "$fail"
