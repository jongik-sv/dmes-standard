#!/usr/bin/env bash
# office.sh(에이전트 오피스 표시)와 그 연결 지점을 가짜 dflow.sh 로 확인한다. 네트워크·실제 D'Flow·터미널은 쓰지 않는다.
# 사용법: bash tests/office-sh.sh   (실패가 있으면 종료 코드 1, 5초 제한 시험 때문에 10초쯤 걸린다)
# 가짜 dflow.sh(office.dflow_script 로 꽂음)는 받은 인자·cwd·DFLOW_CONFIG_DIR 을 $FAKE_LOG 에 한 줄로 적고, FAKE_MODE 로 동작한다:
#   ok(기본) · fail(rc 1) · noconfig(rc 2, 글) · reject(rc 2, JSON 본문 = API 4xx) · slow(30초 대기) · slowsub(`x=$(sleep 47)` 손자)
#   · failstop(--stop 만 rc 1) · netstop(--stop 만 rc 6) · slowstop(--stop 만 30초 대기). `me` 는 {"user_email":"Jji.Test@x.com"} 를 낸다.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$here/../scripts"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/office-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0
chk() { if [ "$1" = ok ]; then echo "ok   $2"; else echo "FAIL $2${3:+ — $3}"; fail=1; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

repo="$tmp/repo"; mkdir -p "$repo"
# 조정 세션 식별을 고정한다(Claude Code 안에서 돌려도 실제 세션 id·pid 가 키에 섞이지 않게). <세션8> = s1a2b3c4, pid = 이 셸(살아 있음).
unset CLAUDE_CODE_SESSION_ID COORD_STATE_ROOT COORD_DRY
export COORD_REPO="$repo" COORD_RUN=t1 FAKE_LOG="$tmp/fake.log" COORD_SESSION_ID="S1A2B3C4-ffff-0000" CLAUDE_PID=$$
cat > "$tmp/fake-dflow.sh" <<'EOF'
#!/bin/sh
# 가짜 dflow.sh — 인자·cwd·설정 폴더를 적는다.
if [ "$1" = me ]; then printf '{"user_email":"Jji.Test@x.com"}'; echo "ME" >> "$FAKE_LOG"; exit 0; fi
echo "$* | cwd=$(pwd -P) cfg=${DFLOW_CONFIG_DIR:-}" >> "$FAKE_LOG"
is_stop=0; case " $* " in *" --stop "*) is_stop=1 ;; esac
case "${FAKE_MODE:-ok}" in
  fail) echo "boom" >&2; exit 1 ;;
  noconfig) echo "NO_LOCAL x" >&2; exit 2 ;;
  reject) echo '{"error":"agent 는 1~120자여야 합니다."}' >&2; exit 2 ;;
  slow) sleep 30; exit 0 ;;
  slowsub) x=$(sleep 47); echo "$x"; exit 0 ;;
  failstop) [ "$is_stop" = 1 ] && { echo boom >&2; exit 1; } ;;
  netstop) [ "$is_stop" = 1 ] && { echo net >&2; exit 6; } ;;
  slowstop) [ "$is_stop" = 1 ] && { sleep 30; exit 0; } ;;
esac
printf '2026-10-06T00:00:00Z'
EOF
write_cfg() {  # write_cfg <enabled> [dflow_script]
  jq -n --arg st "$tmp/state" --argjson en "$1" --arg ds "${2-$tmp/fake-dflow.sh}" --arg pid "proj-1" \
    '{state_dir:$st, office:{enabled:$en, project_id:$pid, label_max:40, dflow_script:(if $ds == "" then null else $ds end)}}' > "$repo/.coord.local.json"
}
write_cfg true
CS="bash $SD/coord-state.sh"
OFF="bash $SD/office.sh"
host="$(hostname | cut -d. -f1 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')"
ID="jji-test/$host"
log() { cat "$FAKE_LOG" 2>/dev/null; }
reset() { : > "$FAKE_LOG"; }
lines() { log | grep -c .; }
sent() { $CS get ".office.sent[\"$1\"] // \"\""; }
S8=s1a2b3c4
LK="$ID/coord:$S8"                      # 팀장 키(조정 세션 단위)
SREC="$tmp/state/_session/$S8.json"     # 조정 세션 기록
srec() { jq -r "($1) // empty" "$SREC" 2>/dev/null; }

# --- 1. init → 팀장 등록 ------------------------------------------------------
: > "$FAKE_LOG"
$CS init t1 --goal "시험 회차" >/dev/null
eq "init: 조정 세션 pid(CLAUDE_PID) 기록" "$($CS get .run.coordinator.pid)" "$$"
eq "init: 팀장 키 $LK(세션 id 앞 8자 소문자)" "$(log | grep -c -- "--agent $LK --slots 0 --busy 0 --project proj-1")" 1
eq "init: 레인이 없으면 slots 0 busy 0" "$(log | grep -c -- "--agent $LK --slots 0 --busy 0")" 1
eq "init: dflow 는 리포 루트에서 설정 폴더 지정 후 실행" "$(log | grep -c "cwd=$repo cfg=$repo")" 1
eq "init: 세션 기록 _session/$S8.json 의 key" "$(srec .key)" "$LK"
eq "init: 세션 기록 칸(session_id·user·host·pid·slots·busy·sent_at)" \
  "$(srec '"\(.session_id) \(.user) \(.host) \(.pid) \(.slots) \(.busy) \(.sent_at != "")"')" "S1A2B3C4-ffff-0000 jji-test $host $$ 0 0 true"
eq "init: 회차의 ._lead·.office.lead 는 쓰지 않는다" "$(sent _lead)$($CS get '.office.lead // ""')" ""
eq "init: 신원 /me 는 한 번만(state 캐시)" "$(log | grep -c '^ME$')" 1

# --- 1b. 옛 키(coord:<run-id>·…/coord)는 새 키를 처음 보내는 beat 에서 stop -------------------------
rm -f "$SREC"
$CS set '.office.sent["_lead"]' "\"$ID/coord:t1\"" >/dev/null   # 옛 회차 단위 키가 기록된 회차(시험이 직접 심는다)
reset
FAKE_MODE=failstop $OFF beat 2>/dev/null
eq "옛 키 stop 실패: 새 팀장 키를 보내지 않는다" "$(log | grep -c -- "--agent $LK ")" 0
eq "옛 키 stop 실패: 세션 기록을 만들지 않는다" "$([ -f "$SREC" ] && echo yes || echo no)" no
reset
$OFF beat
eq "옛 키: 첫 beat 의 첫 호출이 옛 키 stop" "$(log | head -1 | sed 's/ | cwd=.*//')" "watch --agent $ID/coord:t1 --stop"
eq "옛 키: 이어 새 키 등록" "$(log | sed -n 2p | cut -d' ' -f1-3)" "watch --agent $LK"
eq "옛 키: 세션 기록이 새 키" "$(srec .key)" "$LK"
eq "옛 키: stop 성공하면 회차의 ._lead 를 비운다" "$(sent _lead)" ""
reset
$OFF beat
eq "옛 키: 다음 beat 는 stop 없음" "$(log | grep -c -- '--stop')" 0
$CS set '.office.sent["_lead"]' "\"$ID/coord\"" >/dev/null   # 옛 형식(식별자 없음)
jq --arg k "$ID/coord:old-run" '.key = $k' "$SREC" > "$tmp/s.json" && mv "$tmp/s.json" "$SREC"   # 세션 기록의 키가 다른 경우
reset
$OFF lead-up
eq "옛 키: 세션 기록의 다른 키와 …/coord 를 모두 stop 한 뒤 새 키" \
  "$(log | sed -n 1,2p | grep -c -- '--stop')$(log | sed -n 3p | cut -d' ' -f1-3)" "2watch --agent $LK"
eq "옛 키: …/coord stop" "$(log | grep -c -- "--agent $ID/coord --stop")" 1
eq "옛 키: 기록 키 stop" "$(log | grep -c -- "--agent $ID/coord:old-run --stop")" 1
eq "옛 키: …/coord 도 stop 뒤 ._lead 가 빔" "$(sent _lead)" ""
# 새 키를 이미 보낸 뒤 옛 ._lead 가 남아 있어도(같은 키·같은 slots/busy 로 일찍 끝나는 길) beat 가 stop 하고 비운다
$CS set '.office.sent["_lead"]' "\"$ID/coord:leftover\"" >/dev/null
reset
$OFF beat
eq "옛 키: 새 키를 이미 보낸 뒤 남은 ._lead 도 stop" "$(log | grep -c -- "--agent $ID/coord:leftover --stop")" 1
eq "옛 키: 남았던 ._lead 를 비움" "$(sent _lead)" ""
$CS set '.office.sent["_lead"]' null >/dev/null

# --- 2. lane-up ---------------------------------------------------------------
$CS lane-add a1 '{"brief":"툴팁 사전 정리","session":{"handle":"h1"}}' >/dev/null
reset
$OFF lane-up a1 >"$tmp/o.out" 2>"$tmp/o.err"
eq "lane-up: 종료 코드 0·무출력" "$(wc -c < "$tmp/o.out" | tr -d ' ')$(wc -c < "$tmp/o.err" | tr -d ' ')" "00"
eq "lane-up: 팀원 키·until·project" "$(log | grep -c -- "--agent $ID/임시:a1·툴팁 사전 정리 --until 작업 중 --project proj-1")" 1
eq "lane-up: 팀장 slots=1 busy=1" "$(log | grep -c -- "--agent $LK --slots 1 --busy 1")" 1
eq "lane-up: 기록(.office.sent.a1)" "$(sent a1)" "$ID/임시:a1·툴팁 사전 정리"
reset
$OFF lane-up a1
eq "lane-up: 같은 키여도 stop 없이 다시 보낸다(하트비트)" "$(log | grep -c -- '--stop')$(log | grep -c -- "임시:a1·툴팁 사전 정리 --until 작업 중")" "01"
$CS lane-add a2 '{"goal":"두 번째 레인 목표"}' >/dev/null
$OFF lane-up a2
eq "lane-up: brief 없으면 레인 목표" "$(sent a2)" "$ID/임시:a2·두 번째 레인 목표"

# --- 3. 요약 정리·길이 제한 -----------------------------------------------------
long="$(printf '가나다라마바사아자차%.0s' 1 2 3 4 5 6)"   # 60자
$CS lane-add a3 "$(jq -nc --arg b "첫째 줄/경로
$long" '{brief:$b}')" >/dev/null
$OFF lane-up a3
k="$(sent a3)"; tail="${k#"$ID/임시:a3·"}"
eq "요약: 개행·슬래시 제거" "$(printf '%s' "$tail" | grep -c '[/]')" 0
eq "요약: label_max(40)자로 자름" "$(printf '%s' "$tail" | jq -Rr 'length')" 40
eq "요약: 첫 글자부터 이어 붙음" "${tail:0:8}" "첫째 줄경로 가"
# 전체 120자 제한: 긴 레인 이름 + label_max 크게
jq '.office.label_max = 200' "$repo/.coord.local.json" > "$tmp/c.json" && mv "$tmp/c.json" "$repo/.coord.local.json"
$CS lane-add a4 "$(jq -nc --arg b "$long$long$long" '{brief:$b}')" >/dev/null
$OFF lane-up a4
eq "전체 키 120자 이내" "$([ "$(sent a4 | jq -Rr 'length')" -le 120 ] && echo yes)" yes
eq "전체 키 120자까지 채움(요약이 잘렸을 뿐 키는 120)" "$(sent a4 | jq -Rr 'length')" 120
write_cfg true
# UTF-16 길이 기준 자르기: 이모지는 2 유닛, 긴 레인 이름은 40자로
u16() { jq -Rr 'explode | map(if . > 65535 then 2 else 1 end) | add // 0'; }
emo="$(printf '😀%.0s' $(seq 1 60))"
lane_long="$(printf 'q%.0s' $(seq 1 60))"
jq '.office.label_max = 200' "$repo/.coord.local.json" > "$tmp/c.json" && mv "$tmp/c.json" "$repo/.coord.local.json"
$CS lane-add emo "$(jq -nc --arg b "$emo" '{brief:$b}')" >/dev/null
# lane-add 는 40자 넘는 이름을 거절하므로(아래 시험), 옛 state 에 이미 있는 긴 이름은 직접 써서 키 자르기만 확인한다.
$CS set ".lanes[\"$lane_long\"]" '{"brief":"긴 이름","state":"active","session":{},"hold":null}' >/dev/null
$OFF lane-up emo; $OFF lane-up "$lane_long"
ke="$(sent emo)"; kl="$(sent "$lane_long")"
eq "이모지 요약: UTF-16 길이 119~120(쌍을 쪼개지 않음)" "$([ "$(printf '%s' "$ke" | u16)" -ge 119 ] && [ "$(printf '%s' "$ke" | u16)" -le 120 ] && echo yes)" yes
eq "이모지 요약: 키가 이모지 쌍으로 끝남(깨진 글자 없음)" "$(printf '%s' "$ke" | grep -c '😀$')" 1
eq "긴 레인 이름: 키에서 40자로 잘림" "$(printf '%s' "${kl#"$ID/임시:"}" | cut -d'·' -f1 | wc -c | tr -d ' ')" 41
eq "긴 레인 이름: 키 120 이내" "$([ "$(printf '%s' "$kl" | u16)" -le 120 ] && echo yes)" yes
for x in emo "$lane_long"; do $CS set ".lanes[\"$x\"].state" '"closed"' >/dev/null; $OFF lane-down "$x"; done
write_cfg true
$OFF lane-up a4   # label_max 를 40 으로 되돌렸으니 키가 다시 짧아진다(옛 키 stop 뒤 새 키)
eq "label_max 를 줄이면 a4 키도 다시 짧아진다" "$(sent a4 | jq -Rr 'length')" "$(printf '%s' "$ID/임시:a4·" | jq -Rr 'length + 40')"

# --- 4. 요약이 바뀌면 옛 키 stop → 새 키 ------------------------------------------
old="$(sent a1)"
reset
$CS lane-add a1 '{"brief":"툴팁 마무리 점검"}' >/dev/null   # 이미 올라간 레인이라 lane-add 훅이 바로 반영한다
first="$(log | head -1)"
eq "키 변경: 첫 호출이 옛 키 stop" "${first%% |*}" "watch --agent $old --stop"
eq "키 변경: 다음이 새 키 등록" "$(log | sed -n 2p | cut -d' ' -f1-3)" "watch --agent $ID/임시:a1·툴팁"
eq "키 변경: 기록이 새 키" "$(sent a1)" "$ID/임시:a1·툴팁 마무리 점검"

# --- 5. 같은 키 재전송(하트비트)은 stop 없이 --------------------------------------
reset
$OFF beat
eq "beat: stop 없음" "$(log | grep -c -- '--stop')" 0
eq "beat: 팀장 1 + 팀원 4 재전송" "$(lines)" 5
eq "beat: 같은 키로 a1 재전송" "$(log | grep -c -- "--agent $ID/임시:a1·툴팁 마무리 점검 --until 작업 중")" 1
reset
$OFF lane-state a1 auto
eq "lane-state auto: 같은 값이면 보내지 않는다" "$(lines)" 0

# --- 6. 상태 라벨: hold·머지·보고 훅 ----------------------------------------------
reset
$CS hold a2 user-wait >/dev/null
eq "hold 훅: a2 대기" "$(log | grep -c -- "임시:a2·두 번째 레인 목표 --until 대기")" 1
eq "hold 훅: 팀장 busy 4→3" "$(log | grep -c -- "--agent $LK --slots 4 --busy 3")" 1
reset
$CS set '.merge.in_flight' '{"lane":"a1","branch":"b","expected_tree":"t","granted_at":"x"}' >/dev/null
eq "머지 훅: a1 머지 중" "$(log | grep -c -- "임시:a1·툴팁 마무리 점검 --until 머지 중")" 1
reset
$CS set '.merge.in_flight' null >/dev/null
eq "머지 끝 훅: a1 작업 중으로 복귀" "$(log | grep -c -- "임시:a1·툴팁 마무리 점검 --until 작업 중")" 1
reset
$CS set '.lanes.a2.priority' 3 >/dev/null
eq "머지와 무관한 set 은 보내지 않는다" "$(lines)" 0
$CS lane-add a1 '{"items":[{"id":"1","title":"항목","weight":1,"done":false}]}' >/dev/null
reset
$CS report a1 "중간 보고" >/dev/null
eq "report 훅: 값이 같으면 보내지 않는다" "$(lines)" 0
$OFF lane-state a1 "머지 중"
eq "lane-state 명시: 머지 중" "$(log | grep -c -- "--until 머지 중")" 1
reset
$OFF lane-state a1 "엉뚱함" 2>/dev/null
eq "lane-state: 모르는 라벨은 보내지 않는다" "$(lines)" 0

# --- 7. lane-down · 끝난 레인은 beat 가 내린다 -----------------------------------
k2="$(sent a2)"
reset
$OFF lane-down a2
eq "lane-down: 기록된 키로 stop" "$(log | head -1 | cut -d'|' -f1)" "watch --agent $k2 --stop "
eq "lane-down: 기록 삭제" "$(sent a2)" ""
eq "lane-down: 팀장 slots 3" "$(log | grep -c -- "--agent $LK --slots 3")" 1
k3="$(sent a3)"
$CS set '.lanes.a3.state' '"closed"' >/dev/null
reset
$OFF beat
eq "beat: closed 레인은 stop" "$(log | grep -c -- "--agent $k3 --stop")" 1
eq "beat: closed 레인 기록 삭제" "$(sent a3)" ""

# --- 9. 실패 정책 ---------------------------------------------------------------
reset
out="$(FAKE_MODE=fail $OFF beat 2>"$tmp/e.err")"; rc=$?
eq "dflow 실패(rc 1): 종료 코드 0" "$rc" 0
eq "dflow 실패: stdout 비어 있음" "$out" ""
eq "dflow 실패: 경고는 stderr" "$([ -s "$tmp/e.err" ] && echo yes)" yes
eq "dflow 실패: 기록은 그대로" "$(sent a1 | grep -c '임시:a1')" 1
reset
out="$(FAKE_MODE=noconfig $OFF beat 2>"$tmp/e.err")"; rc=$?
eq "dflow 설정 없음(rc 2): 종료 코드 0·무출력" "$rc$out$(wc -c < "$tmp/e.err" | tr -d ' ')" "00"
eq "dflow 설정 없음: 첫 호출 뒤 나머지를 건너뜀" "$(lines)" 1
t0=$(date +%s)
out="$(FAKE_MODE=slow $OFF lane-state a1 대기 2>"$tmp/e.err")"; rc=$?
t1=$(date +%s)
eq "5초 초과: 종료 코드 0" "$rc" 0
eq "5초 초과: 5~9초 안에 끝남" "$([ $((t1 - t0)) -ge 5 ] && [ $((t1 - t0)) -le 9 ] && echo yes)" yes
eq "5초 초과: 경고 한 줄" "$(wc -l < "$tmp/e.err" | tr -d ' ')" 1
eq "5초 초과: 기록은 바뀌지 않음(라벨 대기 미기록)" "$($CS get '.office.label.a1')" "작업 중"

# --- 10. 무출력 건너뜀 -------------------------------------------------------------
reset
write_cfg false
out="$($OFF beat 2>&1)"; eq "enabled=false: 무출력" "$out" ""
eq "enabled=false: 호출 없음" "$(lines)" 0
write_cfg true "$tmp/없는-dflow.sh"
out="$($OFF beat 2>&1)"; rc=$?
eq "dflow.sh 없음: 무출력·종료 코드 0" "$out$rc" "0"
write_cfg true
out="$(COORD_DRY=1 $OFF beat 2>&1)"
eq "COORD_DRY=1: DRY 한 줄만, 호출 없음" "$(printf '%s' "$out" | grep -c '^DRY ')$(lines)" "10"
eq "모르는 하위명령: 종료 코드 2" "$($OFF nope 2>/dev/null; echo $?)" 2
out="$(COORD_RUN=없는회차 $OFF beat 2>&1)"; eq "회차 없음: 무출력" "$out" ""

# --- 11. 환경 변수 DFLOW_CONFIG_DIR 우선 ------------------------------------------
reset
DFLOW_CONFIG_DIR="$tmp/cfgdir" $OFF lane-state a1 "대기"
eq "DFLOW_CONFIG_DIR 지정 시 그대로 쓴다" "$(log | grep -c "cfg=$tmp/cfgdir")" 1

# --- 11a. 끝난 레인은 늦은 훅이 다시 올리지 않는다(리뷰 5) -------------------------------
$CS lane-add a5 '{"brief":"닫힐 레인"}' >/dev/null
$OFF lane-up a5
$CS set '.lanes.a5.state' '"closed"' >/dev/null
$OFF lane-down a5
reset
$CS report a5 "늦은 보고" >/dev/null; $CS hold a5 user-wait >/dev/null; $OFF lane-state a5 "작업 중"; $OFF lane-up a5
eq "lane-down 뒤 늦은 report·hold·lane-state·lane-up 이 행을 다시 만들지 않는다" "$(lines)$(sent a5)" "0"
ka1="$(sent a1)"
reset
$OFF lane-state a1 "끝"
eq "라벨 끝: 올리지 않고 기록된 키로 stop" "$(log | head -1 | sed 's/ | cwd=.*//')" "watch --agent $ka1 --stop"
eq "라벨 끝: 기록 삭제" "$(sent a1)" ""
$OFF lane-up a1   # 되살려 둔다

# --- 11b. 옛 키 stop 이 실패하면 새 키를 보내지 않고 옛 기록을 둔다(리뷰 1) ----------------
ka1="$(sent a1)"
reset
FAKE_MODE=failstop $CS lane-add a1 '{"brief":"stop 실패 시험 지시"}' >/dev/null 2>&1
eq "stop 실패: stop 한 번만 시도하고 새 키는 보내지 않는다" "$(lines)$(log | grep -c -- '--stop')" "11"
eq "stop 실패: 옛 키 기록 유지" "$(sent a1)" "$ka1"
reset
$OFF beat
eq "다음 beat 가 stop 을 다시 시도해 새 키로 바뀐다" "$(sent a1)" "$ID/임시:a1·stop 실패 시험 지시"
ka1="$(sent a1)"
t0=$(date +%s)
reset
FAKE_MODE=slowstop $CS lane-add a1 '{"brief":"stop 시간 초과 시험"}' >/dev/null 2>&1
t1=$(date +%s)
eq "stop 시간 초과: 같은 호출 안에서 새 키 전송이 또 5초를 쓰지 않는다(10초 미만)" "$([ $((t1 - t0)) -lt 10 ] && echo yes)$(lines)" "yes1"
eq "stop 시간 초과: 옛 키 기록 유지" "$(sent a1)" "$ka1"
$OFF beat   # 새 키로 맞춰 둔다

# --- 11c. 5초 제한 kill 은 손자까지 죽인다(리뷰 3) ---------------------------------------
pkill -f 'sleep 47' 2>/dev/null
FAKE_MODE=slowsub $OFF lane-state a1 "대기" 2>/dev/null
sleep 1
eq "x=\$(sleep 47) 손자 프로세스가 고아로 남지 않는다" "$(pgrep -f 'sleep 47' | wc -l | tr -d ' ')" 0
pkill -f 'sleep 47' 2>/dev/null

# --- 11d. API 4xx 거절은 그 건만 건너뛰고 나머지는 계속 보낸다(리뷰 4) ----------------------
alive="$($CS get '[.lanes[] | select(.state != "closed")] | length')"
reset
out="$(FAKE_MODE=reject $OFF beat 2>"$tmp/e.err")"; rc=$?
eq "4xx 거절(rc 2 + JSON): 종료 코드 0·stdout 비어 있음" "$rc$out" "0"
eq "4xx 거절: 팀장과 모든 레인에 전송을 시도한다" "$(lines)" "$((alive + 1))"
eq "4xx 거절: 건마다 경고 한 줄" "$(wc -l < "$tmp/e.err" | tr -d ' ')" "$((alive + 1))"
$OFF beat   # 정상으로 되돌림

# --- 12a-0. finish 는 레인마다 ABORT 를 초기화해 모든 stop 을 시도한다(리뷰 2) ----------------
nkeys="$($CS get '[.office.sent | to_entries[] | select(.value != null)] | length')"
reset
FAKE_MODE=netstop $CS event run-closed - '{}' >/dev/null 2>&1
eq "finish(stop 이 네트워크 오류): 기록된 모든 팀원 키와 팀장 키에 stop 을 시도한다" "$(log | grep -c -- '--stop')" "$((nkeys + 1))"
eq "finish: 마감 표식은 남는다" "$($CS get '.office.finished')" true
eq "finish: 실패한 키는 기록에 남는다" "$($CS get '[.office.sent | to_entries[] | select(.value != null)] | length')" "$nkeys"
eq "finish: 팀장 stop 이 실패하면 세션 기록을 둔다" "$(srec .key)" "$LK"
reset
$OFF lane-up a1; $CS report a1 "마감 뒤" >/dev/null
eq "마감 뒤에도 report·lane-up 은 아무것도 보내지 않는다" "$(lines)" 0
$OFF beat
eq "마감 뒤 beat 는 남은 키(팀원·팀장)만 stop(등록은 하지 않는다)" "$(log | grep -c -- '--stop')$(log | grep -vc -- '--stop')" "$((nkeys + 1))0"
eq "마감 뒤 beat: 기록이 모두 비워짐" "$($CS get '[.office.sent | to_entries[] | select(.value != null)] | length')" 0
eq "마감 뒤 beat: 세션 기록 삭제" "$([ -f "$SREC" ] && echo yes || echo no)" no
# 아래 12a 의 finish 시험을 위해 마감 표식을 푼다
$CS set '.office.finished' false >/dev/null; $CS set '.run.closed_at' null >/dev/null
$OFF lead-up; $OFF lane-up a1; $OFF lane-up a2; $OFF lane-up a4

# --- 12a. finish(마감 표식이 서면 뒤 시험이 막히므로 마지막 쪽에 둔다) ----------------------------------------------------------------
reset
$CS event run-closed - '{}' >/dev/null; cp "$FAKE_LOG" "$tmp/fin.log"
# a2 는 state 에 active 로 남아 있어 앞 beat 가 다시 등록했다(lane-down 은 state 를 바꾸지 않는다 — close-lane.sh 가 closed 로 먼저 쓴다)
eq "run-closed 이벤트 → finish: 팀원 a1·a2·a4 와 팀장 stop" "$(log | grep -c -- '--stop')" 4
eq "finish: 팀장 stop" "$(log | grep -c -- "--agent $LK --stop")" 1
eq "finish: 기록 비움" "$($CS get '[.office.sent[]? | select(. != null)] | length')" 0
eq "finish(마지막 열린 회차): 세션 기록 삭제" "$([ -f "$SREC" ] && echo yes || echo no)" no

# --- 12. 연결 지점이 실제로 불러지는지(소스 대조) ----------------------------------
has() { grep -q "$2" "$SD/$1" && echo yes; }
eq "tick.sh 끝에서 beat" "$(has tick.sh 'office.sh" beat')" yes
eq "spawn-lane.sh 에서 lane-up" "$(has spawn-lane.sh 'office.sh" lane-up')" yes
eq "close-lane.sh 에서 lane-down" "$(has close-lane.sh 'office.sh" lane-down')" yes

# --- 13. 마감 뒤에는 훅이 다시 등록하지 않는다 ------------------------------------
eq "finish: 마감 표식" "$($CS get '.office.finished')" true
reset
$CS report a1 "마감 뒤 보고" >/dev/null; $CS hold a1 user-wait >/dev/null; $OFF lane-up a1; $OFF beat
eq "마감 뒤 report·hold·lane-up·beat 는 아무것도 보내지 않는다" "$(lines)" 0

# --- 14. 워크트리에서 부르면 메인 체크아웃 루트에서 설정을 읽는다(COORD_REPO 없이) ----
GIT=/usr/bin/git; [ -x "$GIT" ] || GIT=git
main="$tmp/main"; mkdir -p "$main" && ( cd "$main" && $GIT init -q -b main . && $GIT -c user.email=t@t -c user.name=t commit -q --allow-empty -m init && $GIT worktree add -q "$tmp/wt" -b feat ) >/dev/null 2>&1
jq -n --arg st "$tmp/state2" --arg ds "$tmp/fake-dflow.sh" '{state_dir:$st, office:{dflow_script:$ds}}' > "$main/.coord.local.json"
( cd "$tmp/wt" && env -u COORD_REPO COORD_RUN=w1 bash "$SD/coord-state.sh" init w1 >/dev/null )
reset
( cd "$tmp/wt" && env -u COORD_REPO -u DFLOW_CONFIG_DIR COORD_RUN=w1 bash "$SD/office.sh" lead-up )
eq "워크트리에서: 메인 루트 설정(.coord.local.json) 사용" "$(log | grep -c -- "--agent $LK")" 1
eq "워크트리에서: cwd·DFLOW_CONFIG_DIR 이 메인 체크아웃 루트" "$(log | grep -c "cwd=$main cfg=$main")" 1

# --- 15. 팀장은 조정 세션 단위(회차 둘·마감·세션 둘·reap) ------------------------------------------
st3="$tmp/state3"
jq -n --arg st "$st3" --arg ds "$tmp/fake-dflow.sh" '{state_dir:$st, office:{enabled:true, project_id:"proj-1", label_max:40, dflow_script:$ds}}' > "$repo/.coord.local.json"
leads() { log | grep -v -- '--stop' | grep -o -- "--agent $ID/coord[^ ]*" | sort -u | wc -l | tr -d ' '; }
sfiles() { ls "$st3/_session" 2>/dev/null | grep -c '\.json$'; }
deadpid() { ( : ) & local p=$!; wait "$p" 2>/dev/null; echo "$p"; }
XA="$ID/coord:xa11xa11"
# (a)(b) 한 세션이 회차 둘을 연다 — 앞 회차를 마감하지 않은 채 새 회차 init
reset
COORD_SESSION_ID=xa11xa11-0001 COORD_RUN=ra $CS init ra >/dev/null
COORD_RUN=ra $CS lane-add L1 '{"brief":"가 회차 레인"}' >/dev/null; COORD_RUN=ra $OFF lane-up L1
out="$(COORD_SESSION_ID=xa11xa11-0001 COORD_RUN=rb $CS init rb 2>"$tmp/e.err")"
eq "(b) init: 첫 줄은 그대로 RUN" "$(printf '%s\n' "$out" | head -1 | cut -d' ' -f1-2)" "RUN rb"
eq "(b) init: SESSION_RUNS 줄(새 회차 포함 열린 회차 수)" "$(printf '%s\n' "$out" | grep -c '^SESSION_RUNS xa11xa11 open=2$')" 1
eq "(b) init: SESSION_RUNS 경고는 stderr" "$(grep -c 'SESSION_RUNS xa11xa11' "$tmp/e.err")" 1
eq "(b) init: 앞 회차 ra 는 자동 마감되지 않는다" "$(COORD_RUN=ra $CS get '.run.closed_at')$(COORD_RUN=ra $CS get '.office.finished // false')" "nullfalse"
eq "(b) init: 같은 세션 회차는 STALE_RUN 아님" "$(printf '%s\n' "$out" | grep -c '^STALE_RUN ra ')" 0
eq "(b) init: 팀장 키는 stop 되지 않는다" "$(log | grep -c -- "--agent $XA --stop")" 0
COORD_RUN=rb $CS lane-add L1 '{"brief":"나 회차 레인"}' >/dev/null; COORD_RUN=rb $OFF lane-up L1
eq "(a) 회차 둘: 팀장 키는 하나" "$(leads)" 1
eq "(a) 회차 둘: 세션 기록 하나" "$(sfiles)" 1
eq "(a) 회차 둘: slots·busy 합산(같은 레인 이름 L1 도 둘 다 센다)" "$(log | tail -1 | grep -c -- "--agent $XA --slots 2 --busy 2")" 1
eq "(a) 회차 둘: 세션 기록 slots·busy" "$(jq -r '"\(.slots),\(.busy)"' "$st3/_session/xa11xa11.json")" "2,2"
COORD_RUN=ra $CS hold L1 user-wait >/dev/null
eq "(a) 한 회차 레인이 대기면 busy 만 준다" "$(jq -r '"\(.slots),\(.busy)"' "$st3/_session/xa11xa11.json")" "2,1"
# 마지막 회차를 닫을 때만 팀장이 내려간다
reset
COORD_RUN=ra $CS close-run >/dev/null
eq "앞 회차 마감: 그 회차 팀원만 stop" "$(log | grep -c -- '--stop')$(log | grep -c -- "--agent $ID/임시:L1·가 회차 레인 --stop")" "11"
eq "앞 회차 마감: 팀장 stop 없음" "$(log | grep -c -- "--agent $XA --stop")" 0
eq "앞 회차 마감: 남은 회차 합산을 다시 보낸다(slots 1 busy 1)" "$(log | grep -c -- "--agent $XA --slots 1 --busy 1")" 1
eq "앞 회차 마감: 세션 기록 유지" "$(sfiles)" 1
reset
COORD_RUN=rb $CS close-run >/dev/null
eq "마지막 회차 마감: 팀원·팀장 stop" "$(log | grep -c -- "--agent $ID/임시:L1·나 회차 레인 --stop")$(log | grep -c -- "--agent $XA --stop")" "11"
eq "마지막 회차 마감: 세션 기록 삭제" "$(sfiles)" 0
# (d) session_id 가 다른 조정 세션 둘은 팀장 둘
reset
COORD_SESSION_ID=yb22yb22-0001 COORD_RUN=rc $CS init rc >/dev/null 2>&1
COORD_SESSION_ID=zc33zc33-0001 COORD_RUN=rd $CS init rd >/dev/null 2>&1
eq "(d) 세션 둘: 팀장 키 둘" "$(leads)" 2
eq "(d) 세션 둘: 세션 기록 둘" "$(sfiles)" 2
eq "(d) 세션 둘: 각 키" "$(log | grep -c -- "--agent $ID/coord:yb22yb22 ")$(log | grep -c -- "--agent $ID/coord:zc33zc33 ")" "11"
# 레인 pid 가 죽으면 팀원만 내린다(살아 있는 세션 rc)
lp_dead="$(deadpid)"
eq "시험 준비: 죽은 레인 pid" "$(kill -0 "$lp_dead" 2>/dev/null && echo alive || echo dead)" dead
COORD_RUN=rc $CS lane-add Ldead "$(jq -nc --argjson p "$lp_dead" '{brief:"죽은 레인", session:{pid:$p}}')" >/dev/null
COORD_RUN=rc $CS lane-add Llive "$(jq -nc --argjson p $$ '{brief:"산 레인", session:{pid:$p}}')" >/dev/null
COORD_RUN=rc $CS lane-add Lnopid '{"brief":"pid 모름"}' >/dev/null
for L in Ldead Llive Lnopid; do COORD_RUN=rc $OFF lane-up "$L"; done
reset
out="$(COORD_RUN=rc $OFF reap 2>"$tmp/e.err")"; rc=$?
eq "reap(레인 pid 사망): 종료 코드 0·stdout 없음" "$rc$out" 0
eq "reap(레인 pid 사망): 죽은 레인 팀원 키만 stop" "$(log | grep -c -- '--stop')$(log | grep -c -- "임시:Ldead·죽은 레인 --stop")" "11"
eq "reap(레인 pid 사망): 팀장은 그대로" "$(log | grep -c -- "coord:yb22yb22")" 0
eq "reap(레인 pid 사망): 기록 삭제" "$(COORD_RUN=rc $CS get '.office.sent.Ldead // ""')" ""
eq "reap(레인 pid 사망): 살아 있는 레인 기록 유지" "$(COORD_RUN=rc $CS get '.office.sent.Llive // "" | length > 0')" true
# (c) 조정 세션 pid 사망 → reap 한 번에 팀장·팀원 키 stop(현재 회차 없이, --state-dir 로)
cp_dead="$(deadpid)"
COORD_SESSION_ID=dd44dd44-0001 CLAUDE_PID="$cp_dead" COORD_RUN=re $CS init re >/dev/null 2>&1
COORD_RUN=re $CS lane-add E1 '{"brief":"유령 될 레인"}' >/dev/null; COORD_RUN=re $OFF lane-up E1
COORD_SESSION_ID=dd44dd44-0001 CLAUDE_PID="$cp_dead" COORD_RUN=rf $CS init rf >/dev/null 2>&1
COORD_RUN=rf $CS lane-add F1 '{"brief":"둘째 회차 레인"}' >/dev/null; COORD_RUN=rf $OFF lane-up F1
eq "시험 준비: 죽은 조정 세션의 기록 pid" "$(jq -r .pid "$st3/_session/dd44dd44.json")" "$cp_dead"
rm -f "$st3/current"
reset
out="$(env -u COORD_RUN bash "$SD/office.sh" reap --state-dir "$st3" 2>"$tmp/e.err")"; rc=$?
eq "(c) reap: 종료 코드 0·stdout 없음" "$rc$out" 0
eq "(c) reap: 팀장 키 stop" "$(log | grep -c -- "--agent $ID/coord:dd44dd44 --stop")" 1
eq "(c) reap: 두 회차의 팀원 키 stop" "$(log | grep -c -- "임시:E1·유령 될 레인 --stop")$(log | grep -c -- "임시:F1·둘째 회차 레인 --stop")" "11"
eq "(c) reap: 다른(살아 있는) 세션 키는 건드리지 않는다" "$(log | grep -c -- 'coord:yb22yb22\|coord:zc33zc33\|Llive')" 0
eq "(c) reap: 세션 기록 삭제" "$([ -f "$st3/_session/dd44dd44.json" ] && echo yes || echo no)" no
eq "(c) reap: finished 표식은 남기지 않는다" "$(COORD_RUN=re $CS get '.office.finished // false')$(COORD_RUN=rf $CS get '.office.finished // false')" "falsefalse"
eq "(c) reap: 팀원 기록 삭제" "$(COORD_RUN=re $CS get '.office.sent.E1 // ""')" ""
reset
env -u COORD_RUN bash "$SD/office.sh" reap --state-dir "$st3" 2>/dev/null
eq "(c) 다시 reap: 보낼 것 없음" "$(lines)" 0
eq "reap: 인자 오류는 종료 코드 2" "$(bash "$SD/office.sh" reap --nope 2>/dev/null; echo $?)" 2

# (e) 리뷰 지적 1: 환경 없는 호출이 세션 기록 pid 를 죽은 값으로 되돌리면 안 된다(살아 있는 세션을 reap 이 내리는 오판정)
cp_dead2="$(deadpid)"
COORD_SESSION_ID=gg55gg55-0001 CLAUDE_PID="$cp_dead2" COORD_RUN=rg1 $CS init rg1 >/dev/null 2>&1
COORD_SESSION_ID=gg55gg55-0001 CLAUDE_PID="$cp_dead2" COORD_RUN=rg2 $CS init rg2 >/dev/null 2>&1
COORD_RUN=rg1 $CS lane-add G1 '{"brief":"g1"}' >/dev/null; COORD_RUN=rg1 $OFF lane-up G1
COORD_SESSION_ID=gg55gg55-0001 CLAUDE_PID=$$ COORD_RUN=rg2 $OFF beat 2>/dev/null     # resume 뒤 새(살아 있는) pid
eq "(e) 살아 있는 세션의 beat: 기록 pid 갱신" "$(jq -r .pid "$st3/_session/gg55gg55.json")" "$$"
eq "(e) 같은 세션의 다른 회차에도 pid 전파" "$(COORD_RUN=rg1 $CS get .run.coordinator.pid)" "$$"
env -u COORD_SESSION_ID -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID COORD_RUN=rg1 bash "$SD/office.sh" beat 2>/dev/null   # 환경 없는 호출
eq "(e) 환경 없는 호출은 기록 pid 를 되돌리지 않는다" "$(jq -r .pid "$st3/_session/gg55gg55.json")" "$$"
reset
env -u COORD_RUN bash "$SD/office.sh" reap --state-dir "$st3" 2>/dev/null
eq "(e) reap: 살아 있는 세션의 팀장·팀원은 내리지 않는다" "$(log | grep -c -- 'coord:gg55gg55 --stop\|Llive\|임시:G1')" 0
# 오래 사는 폴러가 죽은 옛 CLAUDE_PID 를 물려받은 호출도 pid 를 덮어쓰지 못한다
CLAUDE_PID="$cp_dead2" COORD_SESSION_ID=gg55gg55-0001 COORD_RUN=rg1 bash "$SD/office.sh" beat 2>/dev/null
eq "(e) 죽은 CLAUDE_PID 를 믿지 않는다" "$(jq -r .pid "$st3/_session/gg55gg55.json")" "$$"

# (f) 리뷰 지적 2: 다른 세션이 죽은 세션의 회차를 닫아도 reap 이 내린 팀장 칸이 되살아나지 않는다
cp_dead3="$(deadpid)"
COORD_SESSION_ID=hh66hh66-0001 CLAUDE_PID="$cp_dead3" COORD_RUN=rh1 $CS init rh1 >/dev/null 2>&1
COORD_SESSION_ID=hh66hh66-0001 CLAUDE_PID="$cp_dead3" COORD_RUN=rh2 $CS init rh2 >/dev/null 2>&1
env -u COORD_RUN bash "$SD/office.sh" reap --state-dir "$st3" 2>/dev/null
eq "(f) 시험 준비: 죽은 세션 기록이 reap 으로 지워짐" "$([ -f "$st3/_session/hh66hh66.json" ] && echo yes || echo no)" no
reset
COORD_SESSION_ID=other-session-9 CLAUDE_PID=$$ COORD_RUN=rh1 $CS close-run >/dev/null 2>&1
eq "(f) 다른 세션의 close-run: 죽은 세션 팀장 키를 다시 보내지 않는다" "$(log | grep -c -- 'coord:hh66hh66 --slots')" 0
eq "(f) 다른 세션의 close-run: 세션 기록이 다시 생기지 않는다" "$([ -f "$st3/_session/hh66hh66.json" ] && echo yes || echo no)" no

n40="$(printf 'a%.0s' $(seq 1 40))"; n41="${n40}b"
eq "lane-add: 40자 이름은 받는다" "$(COORD_RUN=re $CS lane-add "$n40" '{}' >/dev/null 2>&1; echo $?)" 0
eq "lane-add: 41자 이름은 거절한다(rc 2)" "$(COORD_RUN=re $CS lane-add "$n41" '{}' >/dev/null 2>&1; echo $?)" 2

exit "$fail"
