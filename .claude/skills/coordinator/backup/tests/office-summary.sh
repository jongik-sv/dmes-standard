#!/usr/bin/env bash
# office.sh 의 요약 칸(레인 summary·팀장 lead_summary·input_request)과 「답 대기」 라벨을 가짜 dflow.sh 로 확인한다(contract §4 「레인 요약·팀장 자리 요약·입력 요청」).
# 사용법: bash tests/office-summary.sh   (네트워크·실제 D'Flow·터미널을 쓰지 않는다. 상태·콘솔 폴더·HOME 은 모두 임시 폴더)
# 가짜 dflow.sh 는 받은 인자를 JSON 배열 한 줄로 $FAKE_LOG 에 적는다. FAKE_SUMERR=1 이면 stderr 에 SUMMARY_ERROR 한 줄을 낸다(rc 0).
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$here/../scripts"
. "$SD/lib/compat.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/office-sum-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

repo="$tmp/repo"; mkdir -p "$repo"
unset CLAUDE_CODE_SESSION_ID COORD_STATE_ROOT COORD_DRY ORCA_TERMINAL_HANDLE DFLOW_CONFIG_DIR COORD_OFFICE_SUM_MAX COORD_OFFICE_LEAD_MAX
export COORD_CONSOLE_POLL=0 HOME="$tmp/home" DFLOW_CONSOLE_DIR="$tmp/console"; mkdir -p "$HOME" "$tmp/console/input"
export COORD_REPO="$repo" COORD_RUN=t1 FAKE_LOG="$tmp/fake.log" COORD_SESSION_ID="S1A2B3C4-ffff-0000" CLAUDE_PID=$$
cat > "$tmp/fake-dflow.sh" <<'EOF'
#!/bin/sh
if [ "$1" = me ]; then printf '{"user_email":"jji.test@x.com"}'; exit 0; fi
jq -nc '$ARGS.positional' --args -- "$@" >> "$FAKE_LOG"
[ "${FAKE_SUMERR:-0}" = 1 ] && echo "SUMMARY_ERROR summary: too_long" >&2
printf '2026-10-06T00:00:00Z'
EOF
jq -n --arg st "$tmp/state" --arg ds "$tmp/fake-dflow.sh" \
  '{state_dir:$st, office:{enabled:true, project_id:"proj-1", label_max:40, dflow_script:$ds}}' > "$repo/.coord.local.json"
CS="bash $SD/coord-state.sh"
OFF="bash $SD/office.sh"
IN="$tmp/console/input"
S8=s1a2b3c4
reset() { : > "$FAKE_LOG"; }
calls() { grep -c . "$FAKE_LOG" 2>/dev/null || true; }
# 인자 배열 줄 중 --agent 값에 $1 이 들어 있고 --stop 이 아닌 것
pick() { jq -c --arg s "$1" 'select((index("--stop") | not) and ((.[(index("--agent") // -9) + 1] // "") | contains($s)))' "$FAKE_LOG"; }
argof() { jq -r --arg f "$1" 'index($f) as $i | if $i == null then "<없음>" else .[$i + 1] end'; }   # stdin = 인자 배열 한 줄
lastsum() { pick "임시:$1" | tail -1 | argof --summary-json; }
lastlead() { pick "/coord:${2:-$S8}" | tail -1 | argof "${1:---lead-summary-json}"; }
iso_ago() { compat_epoch_fmt $(( $(date +%s) - $1 )) %Y-%m-%dT%H:%M:%SZ -u; }   # <초> 전 UTC ISO
bytes() { printf '%s' "$1" | wc -c | tr -d ' '; }

# ---- 1. 레인 summary: 모든 필드·정리·비밀 미포함 ----------------------------------------
$CS init t1 --goal "첫 회차 목표
둘째 줄" >/dev/null
$CS set '.run.created_at' '"2026-10-06T08:00:00+09:00"' >/dev/null
brief="$(printf '요약\t탭\n줄바꿈\001벨\177끝')"
$CS lane-add a1 "$(jq -nc --arg b "$brief" '{brief:$b, branch:"feat/a1", worktree:"/Users/secret/wt-a1", memo:"/Users/secret/memo-a1.md",
  session:{handle:"term-handle-xyz", pid:43210, session_id:"sess-secret-1", name:"secret-name"},
  items:[{id:"1",done:true},{id:"2",done:true},{id:"3",done:false}],
  ctx:{pct:41.7, tokens:417000, window:1000000}, compact:{pending:true}}')" >/dev/null 2>&1
$CS set '.lanes.a1.last_report_at' '"2026-10-06T10:00:00+09:00"' >/dev/null
$CS set '.lanes.a1.last_instr_at' '"2026-10-06T10:00:00"' >/dev/null   # 시간대 없음 → null
reset
$OFF lane-up a1 >"$tmp/o" 2>"$tmp/e"
eq "lane-up: 종료 코드 0·무출력" "$(wc -c < "$tmp/o" | tr -d ' ')$(wc -c < "$tmp/e" | tr -d ' ')" "00"
s="$(lastsum a1)"
eq "summary 칸 이름" "$(printf '%s' "$s" | jq -r 'keys_unsorted | join(",")')" \
  "v,lane,state,brief,items_done,items_total,hold,branch,last_report_at,last_instr_at,ctx_pct,compact_pending,lead"
eq "summary 값(v·lane·state·items·hold·branch)" "$(printf '%s' "$s" | jq -c '[.v,.lane,.state,.items_done,.items_total,.hold,.branch]')" '[1,"a1","active",2,3,null,"feat/a1"]'
eq "summary brief: 탭·줄바꿈은 공백, 제어 문자는 삭제" "$(printf '%s' "$s" | jq -r .brief)" "요약 탭 줄바꿈벨끝"
eq "summary 시각: 시간대 있으면 그대로, 없으면 null" "$(printf '%s' "$s" | jq -c '[.last_report_at,.last_instr_at]')" '["2026-10-06T10:00:00+09:00",null]'
eq "summary lead = 이 회차 조정 팀장 키(coord:<세션8>)의 세션8" "$(printf '%s' "$s" | jq -r .lead)" "$S8"
sid_old="$($CS get '.run.coordinator.session_id')"
$CS set '.run.coordinator.session_id' '""' >/dev/null; $CS set '.run.coordinator.pid' 0 >/dev/null; $CS set '.run.id' '""' >/dev/null
reset; $OFF lane-up a1 >/dev/null 2>&1
eq "summary lead: 세션 id·pid·회차 id 를 모두 모르면 칸을 뺀다" "$(lastsum a1 | jq -c 'has("lead")')" false
$CS set '.run.id' '"t1"' >/dev/null; $CS set '.run.coordinator.session_id' "$(jq -nc --arg s "$sid_old" '$s')" >/dev/null
reset; $OFF lane-up a1 >/dev/null 2>&1
eq "summary ctx_pct 정수·compact_pending" "$(printf '%s' "$s" | jq -c '[.ctx_pct,.compact_pending]')" '[41,true]'
eq "summary 에 핸들·pid·세션 id·경로·memo 없음" "$(printf '%s' "$s" | grep -c 'term-handle\|43210\|sess-secret\|/Users\|secret\|memo')" 0
eq "lane-up: 입력 요청 기록이 없으면 --input-request-json null" "$(pick '임시:a1' | tail -1 | argof --input-request-json)" null
eq "요약 해시를 .office.sumhash.a1 에 기록(sha256 64자)" "$($CS get '.office.sumhash.a1' | grep -cE '^[0-9a-f]{64}$')" 1

# ---- 2. 길이 상한(코드포인트)·바이트 상한 --------------------------------------------------
rep() { local s="" i; for i in $(seq 1 "$2"); do s="$s$1"; done; printf '%s' "$s"; }
$CS lane-add a2 "$(jq -nc --arg b "$(rep 가 300)" --arg br "$(rep b 200)" '{brief:$b, branch:$br}')" >/dev/null 2>&1
$CS set '.lanes.a2.session' '{"handle":"h-a2","pid":0}' >/dev/null   # 입력 요청 기록의 handle 과 맞춘다(아래 3)
$CS hold a2 "$(rep 사 150)" >/dev/null
s="$(lastsum a2)"
eq "길이: brief 200·hold 100·branch 120(코드포인트)" "$(printf '%s' "$s" | jq -c '[(.brief|length),(.hold|length),(.branch|length)]')" '[200,100,120]'
eq "hold 는 사유 문자열" "$(printf '%s' "$s" | jq -r '.hold[0:3]')" "사사사"
emo="😀"
$CS lane-add a3 "$(jq -nc --arg b "$(rep "$emo" 200)" --arg br "$(rep "$emo" 120)" '{brief:$b, branch:$br, state:"active"}')" >/dev/null 2>&1
$CS set '.lanes.a3.hold' "$(jq -nc --arg r "$(rep "$emo" 100)" '{reason:$r, until:null}')" >/dev/null
reset; $OFF lane-up a3
s="$(lastsum a3)"; b3="$(bytes "$s")"
eq "최대 길이(이모지 4바이트) 요약도 2048바이트 이하" "$([ "$b3" -le 2048 ] && echo yes || echo "no:$b3")" yes
echo "     (이모지 최대 요약 실측 ${b3}바이트)"
reset; COORD_OFFICE_SUM_MAX=700 $OFF lane-up a3
s="$(lastsum a3)"
eq "상한을 넘으면 brief 를 줄여 맞춘다(시험 상한 700)" "$([ "$(bytes "$s")" -le 700 ] && echo yes)$(printf '%s' "$s" | jq -r '(.brief|length) < 200')" "yestrue"
eq "줄인 brief 는 이모지를 쪼개지 않는다" "$(printf '%s' "$s" | jq -r '.brief | explode | all(. == 128512)')" true

# ---- 3. 레인 「답 대기」(입력 요청 기록) -------------------------------------------------------
$CS set '.lanes.a3.state' '"closed"' >/dev/null; $OFF lane-down a3
lines15="$(jq -nc '[range(1;16) | "줄\(.)"] | .[13] = ("x" * 300) | .[14] = "❯ 1. Yes\u0007\tend"')"
jq -nc --argjson ex "$lines15" '{v:1, kind:"question", since:"2026-10-06T01:02:03.456Z", excerpt:$ex, handled:null, run:"t1", handle:"h-a2"}' > "$IN/coord_lane_a2.json"
reset; $OFF lane-state a2 auto
c="$(pick '임시:a2' | tail -1)"
eq "입력 요청 있음: 대기 → 답 대기" "$(printf '%s' "$c" | argof --until)" "답 대기"
ir="$(printf '%s' "$c" | argof --input-request-json)"
eq "input_request 칸(v·kind·since·handled)" "$(printf '%s' "$ir" | jq -c '[.v,.kind,.since,.handled]')" '[1,"question","2026-10-06T01:02:03.456Z",null]'
eq "발췌는 아래쪽 10줄" "$(printf '%s' "$ir" | jq -c '[(.excerpt|length), .excerpt[0]]')" '[10,"줄6"]'
eq "발췌 줄은 200자 이내·제어 문자(탭 포함) 삭제" "$(printf '%s' "$ir" | jq -c '[(.excerpt[8]|length), .excerpt[9]]')" '[200,"❯ 1. Yesend"]'
eq "답 대기 기록" "$($CS get '.office.label.a2')" "답 대기"
for k in usage-limit trust; do
  jq -nc --arg k "$k" '{v:1, kind:$k, since:"2026-10-06T01:02:03Z", excerpt:["a"], handled:null, run:"t1", handle:"h-a2"}' > "$IN/coord_lane_a2.json"
  reset; $OFF lane-state a2 auto; c="$(pick '임시:a2' | tail -1)"
  eq "$k 는 답 대기가 아니다(원래 라벨 대기)·칸은 싣는다" "$(printf '%s' "$c" | argof --until) $(printf '%s' "$c" | argof --input-request-json | jq -r .kind)" "대기 $k"
done
jq -nc '{v:1, kind:"permission", since:"2026-10-06T01:02:03Z", excerpt:["a"], handled:{by:"coordinator", at:"2026-10-06T01:03:00Z"}, run:"t1", handle:"h-a2"}' > "$IN/coord_lane_a2.json"
reset; $OFF lane-state a2 auto; c="$(pick '임시:a2' | tail -1)"
eq "handled 면 답 대기가 아니다·처리 기록은 싣는다" "$(printf '%s' "$c" | argof --until) $(printf '%s' "$c" | argof --input-request-json | jq -r .handled.by)" "대기 coordinator"
printf '{"v":1,"kind":"question",' > "$IN/coord_lane_a2.json"
reset; $OFF lane-state a2 auto; c="$(pick '임시:a2' | tail -1)"
eq "깨진 JSON 은 없는 것(대기·null)" "$(printf '%s' "$c" | argof --until) $(printf '%s' "$c" | argof --input-request-json)" "대기 null"
jq -nc '{v:1, kind:"question", since:"2026-10-06T01:02:03", excerpt:["a"], handled:null, run:"t1", handle:"h-a2"}' > "$IN/coord_lane_a2.json"
reset; $OFF lane-state a2 auto
eq "since 에 시간대가 없으면 없는 것" "$($CS get '.office.label.a2')" "대기"
jq -nc '{v:1, kind:"question", since:"2026-10-06T01:02:03Z", excerpt:["a"], handled:null, run:"t1", handle:"h-a2"}' > "$IN/coord_lane_a2.json"
$OFF lane-state a2 auto
rm -f "$IN/coord_lane_a2.json"
reset; $OFF lane-state a2 auto; c="$(pick '임시:a2' | tail -1)"
eq "기록을 지우면 원래 라벨·input_request null" "$(printf '%s' "$c" | argof --until) $(printf '%s' "$c" | argof --input-request-json)" "대기 null"
# 머지 중 레인도 답 대기가 이긴다
$CS set '.merge.in_flight' '{"lane":"a1","branch":"feat/a1","expected_tree":"t","granted_at":"x"}' >/dev/null
eq "머지 중 라벨" "$($CS get '.office.label.a1')" "머지 중"
jq -nc '{v:1, kind:"choice", since:"2026-10-06T01:02:03Z", excerpt:["❯ 1. a"], handled:null, run:"t1", handle:"term-handle-xyz"}' > "$IN/coord_lane_a1.json"
$OFF lane-state a1 auto
eq "우선순위: 답 대기 > 머지 중" "$($CS get '.office.label.a1')" "답 대기"
rm -f "$IN/coord_lane_a1.json"; $OFF lane-state a1 auto
eq "기록이 사라지면 머지 중으로 복귀" "$($CS get '.office.label.a1')" "머지 중"
reset; $OFF lane-state a1 "답 대기"
eq "lane-state 명시 라벨 답 대기 허용" "$(pick '임시:a1' | tail -1 | argof --until)" "답 대기"
$OFF lane-state a1 auto

# ---- 3b. 입력 요청 기록의 회차·핸들(같은 PC 의 두 조정 세션이 같은 레인 이름) · 내부 칸은 서버로 보내지 않는다 ---------------
jq -nc '{v:1, kind:"question", since:"2026-10-06T01:02:03Z", excerpt:["q"], handled:null, full:("f" * 64), run:"t1", handle:"h-a2"}' > "$IN/coord_lane_a2.json"
reset; $OFF lane-state a2 auto
ir="$(pick '임시:a2' | tail -1 | argof --input-request-json)"
eq "input_request 는 {v,kind,since,excerpt,handled} 만(full·run·handle 은 싣지 않는다)" "$(printf '%s' "$ir" | jq -c 'keys_unsorted')" '["v","kind","since","excerpt","handled"]'
eq "회차·핸들이 맞으면 답 대기" "$($CS get '.office.label.a2')" "답 대기"
# neg <설명> <기록 JSON> — 맞는 기록으로 답 대기를 만든 뒤 그 기록으로 바꾸면 대기·null 로 돌아와야 한다
neg() {
  jq -nc '{v:1, kind:"question", since:"2026-10-06T01:02:03Z", excerpt:["q"], handled:null, run:"t1", handle:"h-a2"}' > "$IN/coord_lane_a2.json"
  $OFF lane-state a2 auto
  printf '%s\n' "$2" > "$IN/coord_lane_a2.json"
  reset; $OFF lane-state a2 auto; c="$(pick '임시:a2' | tail -1)"
  eq "$1" "$(printf '%s' "$c" | argof --until) $(printf '%s' "$c" | argof --input-request-json)" "대기 null"
}
neg "다른 회차의 같은 이름 레인 기록은 쓰지 않는다(대기·null)" '{"v":1,"kind":"question","since":"2026-10-06T01:02:03Z","excerpt":["q"],"handled":null,"run":"other-run","handle":"h-a2"}'
neg "레인 핸들이 다른 기록은 쓰지 않는다(대기·null)" '{"v":1,"kind":"question","since":"2026-10-06T01:02:03Z","excerpt":["q"],"handled":null,"run":"t1","handle":"h-other"}'
neg "run·handle 이 없는 옛 기록은 쓰지 않는다(대기·null)" '{"v":1,"kind":"question","since":"2026-10-06T01:02:03Z","excerpt":["q"],"handled":null}'
# 둘째 조정 세션(다른 세션 id)의 회차 o1 에 같은 이름 레인 a2(다른 핸들)와 그 회차의 기록 — t1 의 a2 칸·팀장 라벨에 섞이지 않는다
COORD_RUN=o1 COORD_SESSION_ID="OTHER777-0000" $CS init o1 --goal "옆 세션" >/dev/null 2>&1
COORD_RUN=o1 COORD_SESSION_ID="OTHER777-0000" $CS lane-add a2 '{"brief":"옆 a2","session":{"handle":"h-o1-a2","pid":0}}' >/dev/null 2>&1
neg "옆 세션 회차(o1)의 기록은 이 회차(t1) a2 칸에 실리지 않는다" '{"v":1,"kind":"permission","since":"2026-10-06T01:02:03Z","excerpt":["o1"],"handled":null,"run":"o1","handle":"h-o1-a2"}'
reset; COORD_RUN=o1 COORD_SESSION_ID="OTHER777-0000" $OFF lane-state a2 auto
c="$(pick "임시:a2" | tail -1)"
eq "그 회차(o1)에서는 자기 기록으로 답 대기" "$(printf '%s' "$c" | argof --until) $(printf '%s' "$c" | argof --input-request-json | jq -r .excerpt[0])" "답 대기 o1"
COORD_RUN=o1 COORD_SESSION_ID="OTHER777-0000" $CS set '.lanes.a2.state' '"closed"' >/dev/null 2>&1
COORD_RUN=o1 COORD_SESSION_ID="OTHER777-0000" $CS set '.run.closed_at' '"2026-10-06T00:00:00Z"' >/dev/null 2>&1
rm -f "$IN/coord_lane_a2.json"; $OFF lane-state a2 auto

# ---- 4. 요약만 바뀐 경우 추가 전송 / 안 바뀐 경우 미전송 ------------------------------------------
$OFF beat
reset; $OFF lane-state a1 auto
eq "아무것도 안 바뀌면 보내지 않는다" "$(calls)" 0
$CS set '.lanes.a1.ctx' '{"pct":55}' >/dev/null    # office 훅이 없는 쓰기
reset; $OFF lane-state a1 auto
eq "요약만 바뀌면(같은 키·라벨) 팀원 한 건 추가 전송" "$(pick '임시:a1' | wc -l | tr -d ' ') $(lastsum a1 | jq .ctx_pct) $(calls)" "1 55 1"
reset; $OFF lane-state a1 auto
eq "다시 부르면 보내지 않는다" "$(calls)" 0
$CS set '.usage' '{"band":"O","five":81.9,"week":250,"src":"t","at":null}' >/dev/null
reset; $OFF lane-state a1 auto
eq "팀장 요약만 바뀌면(같은 slots/busy) 팀장 한 건" "$(pick "/coord:$S8" | wc -l | tr -d ' ') $(lastlead | jq -c '.runs[0].resource | [.band,.five,.week]')" '1 ["O",81,100]'
reset; $OFF lane-state a1 auto
eq "팀장도 다시 부르면 보내지 않는다" "$(calls)" 0
eq "세션 기록에 팀장 요약 해시" "$(jq -r '.sumhash' "$tmp/state/_session/$S8.json" | grep -cE '^[0-9a-f]{64}$')" 1

# ---- 5. lead_summary: 같은 세션 회차 둘, 다른 세션 회차 제외 -----------------------------------
$CS set '.lanes.a1.last_report_at' "\"$(iso_ago 7200)\"" >/dev/null        # 2시간 조용 → quiet
$CS set '.lanes.a2.last_report_at' "\"$(iso_ago 60)\"" >/dev/null          # 1분 전 → quiet 아님
$CS set '.merge.queue' '["a2",{"lane":"zz"}]' >/dev/null
$CS set '.load' '{"soft_ticks":0,"hard_ticks":2,"release_ticks":0,"banned":["a2"]}' >/dev/null
$CS set '.run.last_tick_at' '"2026-10-06T09:47:00+09:00"' >/dev/null
COORD_RUN=t2 $CS init t2 --goal "둘째 회차" >/dev/null 2>&1
COORD_RUN=t2 $CS set '.run.created_at' '"2026-10-06T09:00:00+09:00"' >/dev/null
COORD_RUN=t2 $CS lane-add b1 '{"brief":"b1","items":[{"id":"1","done":true},{"id":"2","done":false}]}' >/dev/null 2>&1
COORD_RUN=t2 $CS set '.lanes.b1.last_instr_at' "\"$(iso_ago 3600)\"" >/dev/null    # 보고 없음 → 지시 기준 1시간 → quiet
COORD_RUN=t3 COORD_SESSION_ID="OTHER999-0000" $CS init t3 --goal "다른 세션" >/dev/null 2>&1
COORD_RUN=t3 COORD_SESSION_ID="OTHER999-0000" $CS lane-add c1 '{"brief":"c1"}' >/dev/null 2>&1
COORD_RUN=t2 $CS set '.pending_user' "$(jq -nc '[{at:"x", text:"push 해도 되나요?\n둘째 줄"}]')" >/dev/null   # lead-sync 훅
L="$(lastlead)"
eq "회차 둘이면 runs 2(오래된 순), 다른 세션 회차 없음" "$(printf '%s' "$L" | jq -c '[.v, [.runs[].run]]')" '[1,["t1","t2"]]'
eq "팀장 until: pending_user 가 있으면 답 대기" "$(lastlead --until)" "답 대기"
r1="$(printf '%s' "$L" | jq -c '.runs[0]')"; r2="$(printf '%s' "$L" | jq -c '.runs[1]')"
eq "t1 merge·progress" "$(printf '%s' "$r1" | jq -c '[.merge.in_flight, .merge.queue, .progress.goal, .progress.started_at, .progress.items_done, .progress.items_total]')" \
  '["a1",["a2","zz"],"첫 회차 목표","2026-10-06T08:00:00+09:00",2,3]'
eq "t1 lanes: working(머지 중 포함)·waiting·done·quiet" "$(printf '%s' "$r1" | jq -c '.lanes')" '{"working":1,"waiting":1,"done":1,"quiet":["a1"]}'
eq "t1 resource·alive" "$(printf '%s' "$r1" | jq -c '[.resource, .alive.last_tick_at]')" '[{"band":"O","five":81,"week":100,"load_adjust":2,"banned":true},"2026-10-06T09:47:00+09:00"]'
eq "t2 decision: 건수·첫 건 첫 줄" "$(printf '%s' "$r2" | jq -c '.decision')" '{"pending_user":1,"open":1,"first_title":"push 해도 되나요?"}'
eq "t2 band UNKNOWN 은 null·alive null·지시 기준 quiet" "$(printf '%s' "$r2" | jq -c '[.resource.band, .alive.last_tick_at, .lanes.quiet, .progress.items_done, .progress.items_total]')" '[null,null,["b1"],1,2]'
eq "합산 slots·busy(a1 머지 중·a2 대기·b1 작업 중 → 3·2)" "$(pick "/coord:$S8" | tail -1 | jq -c '[.[(index("--slots"))+1], .[(index("--busy"))+1]]')" '["3","2"]'
eq "lead_summary 에 핸들·pid·경로 없음" "$(printf '%s' "$L" | grep -c 'term-handle\|43210\|/Users\|secret')" 0
COORD_RUN=t2 $CS set '.pending_user' '[]' >/dev/null
eq "pending_user 를 비우면 조정 중" "$(lastlead --until)" "조정 중"
# 팀장 입력 요청 기록
jq -nc '{v:1, kind:"permission", since:"2026-10-06T01:02:03Z", excerpt:["Do you want to proceed?"], handled:null}' > "$IN/coord_lead_$S8.json"
reset; $OFF lead-sync
eq "lead-sync: 팀장 입력 요청 기록 → 답 대기" "$(lastlead --until)" "답 대기"
jq '.handled = {by:"auto", at:"2026-10-06T01:03:00Z"}' "$IN/coord_lead_$S8.json" > "$tmp/x" && mv "$tmp/x" "$IN/coord_lead_$S8.json"
$OFF lead-sync; eq "handled 면 조정 중" "$(lastlead --until)" "조정 중"
jq -nc '{v:1, kind:"usage-limit", since:"2026-10-06T01:02:03Z", excerpt:[], handled:null}' > "$IN/coord_lead_$S8.json"
$OFF lead-sync; eq "usage-limit 이면 조정 중" "$(lastlead --until)" "조정 중"
printf 'not json' > "$IN/coord_lead_$S8.json"
$OFF lead-sync; eq "깨진 기록은 무시(조정 중)" "$(lastlead --until)" "조정 중"
rm -f "$IN/coord_lead_$S8.json"
COORD_RUN=t3 COORD_SESSION_ID="OTHER999-0000" $OFF lead-up
eq "다른 세션 팀장 칸은 자기 회차만" "$(lastlead --lead-summary-json other999 | jq -c '[.runs[].run]')" '["t3"]'

# ---- 6. 팀장 8192바이트·5회차 상한 ------------------------------------------------------
# 회차 상태 파일을 바로 고친다(sjq <회차> <jq 식> [jq 인자…]). 이 구간이 보는 것은 lead-up 의 출력이라 coord-state.sh set 마다 붙는 office 훅(lead-sync,
# set 한 번에 0.3초 CPU)을 거치지 않고 값만 넣는다. init 은 그대로 부른다(세션·회차 기록은 실제 경로로 만든다).
sjq() { local r="$1" e="$2" f; shift 2; f="$tmp/state/$r/state.json"; jq "$@" "$e" "$f" > "$f.tmp" && mv "$f.tmp" "$f"; }
big() { local i; for i in 1 2 3 4 5 6; do
  COORD_RUN=big$i COORD_SESSION_ID="BIGSESS1-0000" $CS init big$i --goal "$(rep "$emo" 130)" >/dev/null 2>&1
  sjq big$i '.run.created_at = $ca | .merge.queue = [range(12) | $q] | .merge.in_flight = {lane:$q} | .pending_user = [{at:"x", text:$t}]' \
    --arg ca "2026-10-06T0$i:00:00Z" --arg q "$(rep "$emo" 70)" --arg t "$(rep "$emo" 120)"
done; }
big
reset; COORD_RUN=big1 $OFF lead-up
L="$(lastlead --lead-summary-json bigsess1)"; lb="$(bytes "$L")"
eq "열린 회차 6개: 8192바이트 이하로 줄인다" "$([ "$lb" -le 8192 ] && echo yes || echo "no:$lb")" yes
eq "줄일 때 오래된 회차부터 빼고 최근 회차는 남긴다" "$(printf '%s' "$L" | jq -r '.runs[-1].run')" big6
eq "회차 칸 상한(queue 10·각 60·goal 120·first_title 100)" "$(printf '%s' "$L" | jq -c '.runs[-1] | [(.merge.queue|length), (.merge.queue[0]|length), (.merge.in_flight|length), (.progress.goal|length), (.decision.first_title|length)]')" '[10,60,60,120,100]'
reset; COORD_RUN=big1 COORD_OFFICE_LEAD_MAX=4000 $OFF lead-up
L="$(lastlead --lead-summary-json bigsess1)"
eq "시험 상한 4000: 그 안으로 runs 축소" "$([ "$(bytes "$L")" -le 4000 ] && echo yes)$(printf '%s' "$L" | jq '.runs | length < 5')" "yestrue"
for i in 1 2 3 4 5 6; do sjq big$i '.merge.queue = [] | .pending_user = [] | .merge.in_flight = null'; done
reset; COORD_RUN=big1 $OFF lead-up
eq "작은 회차 6개면 runs 5(최근 5, 오래된 순)" "$(lastlead --lead-summary-json bigsess1 | jq -c '[.runs[].run]')" '["big2","big3","big4","big5","big6"]'

# ---- 7. 칸 누락 방지: lane-up·lane-state·beat 의 모든 watch 호출 -----------------------------------
jq -nc '{v:1, kind:"question", since:"2026-10-06T01:02:03Z", excerpt:["q"], handled:null, run:"t1", handle:"h-a2"}' > "$IN/coord_lane_a2.json"
reset
$OFF lane-up a2; $OFF lane-state a2 auto; $CS report a1 "보고" >/dev/null; $CS hold a2 - >/dev/null; $OFF beat; $OFF lead-up
n_lane="$(pick '임시:' | wc -l | tr -d ' ')"; n_lead="$(pick '/coord:' | wc -l | tr -d ' ')"
eq "팀원 호출이 있었다(lane-up·lane-state·report·hold·beat)" "$([ "$n_lane" -ge 4 ] && echo yes || echo "no:$n_lane")" yes
eq "모든 팀원 호출에 --summary-json·--input-request-json" "$(pick '임시:' | jq -s 'map(select(index("--summary-json") == null or index("--input-request-json") == null)) | length')" 0
eq "모든 팀장 호출에 --lead-summary-json·--until" "$([ "$n_lead" -ge 2 ] && echo yes)$(pick '/coord:' | jq -s 'map(select(index("--lead-summary-json") == null or index("--until") == null)) | length')" yes0
eq "칸 값은 모두 JSON(객체 또는 null)" "$(jq -s '[.[] | . as $a | (["--summary-json","--lead-summary-json","--input-request-json"][] as $f | ($a | index($f)) as $i | select($i != null) | $a[$i+1] | (fromjson? | type) // "bad") | select(. != "object" and . != "null")] | length' "$FAKE_LOG")" 0
eq "beat 의 a2 호출에 입력 요청 칸이 실린다" "$(pick '임시:a2' | tail -1 | argof --input-request-json | jq -r .kind)" question
rm -f "$IN/coord_lane_a2.json"

# ---- 8. SUMMARY_ERROR: 종료 코드 0·stdout 불변·경고 한 줄 --------------------------------------
reset
FAKE_SUMERR=1 $OFF lane-up a1 >"$tmp/o" 2>"$tmp/e"; rc=$?
eq "SUMMARY_ERROR: 종료 코드 0·stdout 없음" "$rc $(wc -c < "$tmp/o" | tr -d ' ')" "0 0"
eq "SUMMARY_ERROR: 호출마다 warn 한 줄(팀원 1 + 팀장 1)" "$(grep -c '요약 칸 오류' "$tmp/e") $(grep -vc '요약 칸 오류' "$tmp/e")" "2 0"
eq "SUMMARY_ERROR: 사유가 경고에 실림" "$(grep -c 'summary: too_long' "$tmp/e")" 2
eq "SUMMARY_ERROR 여도 전송 성공으로 기록(ABORT 아님)" "$($CS get '.office.sent.a1' | grep -c '임시:a1')" 1

# ---- 9. tick.sh 는 beat 전에 last_tick_at 을 쓴다 ----------------------------------------------
tl="$(grep -n "last_tick_at" "$SD/tick.sh" | grep 'coord_state_call set' | head -1 | cut -d: -f1)"
bl="$(grep -n 'office.sh" beat' "$SD/tick.sh" | head -1 | cut -d: -f1)"
eq "tick.sh: last_tick_at 쓰기가 beat 앞(dry-run 제외)" "$([ -n "$tl" ] && [ -n "$bl" ] && [ "$tl" -lt "$bl" ] && echo yes)$(sed -n "${tl}p" "$SD/tick.sh" | grep -c 'dry')" yes1

# ---- 10. 자유 글 가림(brief·hold·pending_user 첫 줄·goal·지시 요약 키) — 다른 세션의 새 회차 rd 에서 ---------------------
SEC="sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"
RD="COORD_RUN=rd COORD_SESSION_ID=REDACT01-0000"
env $RD $CS init rd --goal "목표 api_key=$SEC /var/tmp/x" >/dev/null 2>&1
env $RD $CS lane-add r9 "$(jq -nc --arg s "$SEC" '{brief:("토큰 " + $s + " 와 /Users/jji/secret/plan.md 정리"), session:{handle:"h-r9", pid:0}}')" >/dev/null 2>&1
env $RD $CS hold r9 "password=hunter2xyz /opt/private/db.sqlite 확인" >/dev/null 2>&1
reset; env $RD $OFF lane-up r9
s="$(lastsum r9)"; k="$(pick '임시:r9' | tail -1 | jq -r '.[(index("--agent"))+1]')"
eq "가림: summary brief·hold 에 비밀·경로 원문 없음" "$([ -n "$s" ] && printf '%s' "$s" | grep -c 'AbCdEfGh\|hunter2\|/Users/jji\|/opt/private')" 0
eq "가림: summary brief·hold 는 가린 글([가림]·[경로])" "$(printf '%s' "$s" | jq -r '[(.brief | contains("[가림]") and contains("[경로]")), (.hold | contains("[가림]") and contains("[경로]"))] | all')" true
eq "가림: 팀원 키(지시 요약)에도 비밀·경로 원문 없음" "$([ -n "$k" ] && printf '%s' "$k" | grep -c 'AbCdEfGh\|Usersjji\|secret')" 0
env $RD $CS set '.pending_user' "$(jq -nc --arg s "$SEC" '[{at:"x", text:("배포 키 " + $s + " 를 /Users/jji/.ssh/id_rsa 로 쓸까요?\n둘째 줄")}]')" >/dev/null 2>&1
reset; env $RD $OFF lead-sync
L="$(lastlead --lead-summary-json redact01)"
eq "가림: lead-sync 의 --lead-summary-json 에 비밀·경로 원문 없음" "$([ -n "$L" ] && printf '%s' "$L" | grep -c 'AbCdEfGh\|/Users/jji\|id_rsa\|/var/tmp')" 0
eq "가림: first_title·goal 은 가린 글" "$(printf '%s' "$L" | jq -r '.runs[0] | [(.decision.first_title | contains("[가림]") and contains("[경로]")), (.progress.goal | contains("[가림]") and contains("[경로]"))] | all')" true
# 가림 함수가 실패하면(console_redact_text 가 오류) 그 칸은 비운다(실패 시 닫힘)
mkdir -p "$tmp/kit"; cp -R "$SD" "$tmp/kit/scripts"; printf 'console_redact_text() { return 71; }\n' > "$tmp/kit/scripts/lib/console-redact.sh"
reset; env $RD bash "$tmp/kit/scripts/office.sh" lead-sync
L="$(lastlead --lead-summary-json redact01)"
eq "가림 실패: first_title 은 빈 글·goal 은 null(원문 없음)" "$(printf '%s' "$L" | jq -c '.runs[0] | [.decision.first_title, .progress.goal]'):$(printf '%s' "$L" | grep -c 'AbCdEf')" '["",null]:0'
reset; env $RD bash "$tmp/kit/scripts/office.sh" lane-up r9
eq "가림 실패: brief·hold 는 빈 글(hold 는 null 아님)" "$(lastsum r9 | jq -c '[.brief, .hold]')" '["",""]'
eq "가림 실패: 키에 지시 요약 없음(머리만)" "$(pick '임시:r9' | tail -1 | jq -r '.[(index("--agent"))+1]' | grep -c '·')" 0
env $RD $CS set '.run.closed_at' '"2026-10-06T00:00:00Z"' >/dev/null 2>&1

# ---- 실측(보고용): 레인 5개 summary 합계·lead_summary 한 건 ------------------------------------
for x in m1 m2 m3 m4 m5; do
  $CS lane-add $x "$(jq -nc --arg x "$x" '{brief:("레인 \($x) — 툴팁 사전 정리와 컬럼 설명 카드 반영"), branch:("feat/" + $x + "-tooltip"),
    items:[{id:"1",done:true},{id:"2",done:false},{id:"3",done:false}], ctx:{pct:37}, compact:{pending:false}}')" >/dev/null 2>&1
  $CS set ".lanes.$x.last_report_at" "\"$(iso_ago 600)\"" >/dev/null; $CS set ".lanes.$x.last_instr_at" "\"$(iso_ago 1200)\"" >/dev/null
done
reset; $OFF beat
tot=0; for x in m1 m2 m3 m4 m5; do s="$(lastsum $x)"; tot=$((tot + $(printf '%s' "$s" | jq -r 'tojson | length'))); done
echo "     (실측: 레인 5개 summary 합계 ${tot}자, lead_summary 한 건 $(bytes "$(lastlead)")바이트)"

echo "통과 $pass · 실패 $fail"
exit "$fail"
