#!/usr/bin/env bash
# office.sh(에이전트 오피스 표시)와 그 연결 지점을 가짜 dflow.sh 로 확인한다. 네트워크·실제 D'Flow·터미널은 쓰지 않는다.
# 사용법: bash tests/office-sh.sh   (실패가 있으면 종료 코드 1, 5초 제한 시험 때문에 10초쯤 걸린다)
# 가짜 dflow.sh(office.dflow_script 로 꽂음)는 받은 인자·cwd·DFLOW_CONFIG_DIR 을 $FAKE_LOG 에 한 줄로 적고, FAKE_MODE 로 동작한다:
#   ok(기본) · fail(rc 1) · noconfig(rc 2) · slow(30초 대기). `me` 는 {"user_email":"Jji.Test@x.com"} 를 낸다.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$here/../scripts"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/office-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0
chk() { if [ "$1" = ok ]; then echo "ok   $2"; else echo "FAIL $2${3:+ — $3}"; fail=1; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

repo="$tmp/repo"; mkdir -p "$repo"
export COORD_REPO="$repo" COORD_RUN=t1 FAKE_LOG="$tmp/fake.log"
cat > "$tmp/fake-dflow.sh" <<'EOF'
#!/bin/sh
# 가짜 dflow.sh — 인자·cwd·설정 폴더를 적는다.
if [ "$1" = me ]; then printf '{"user_email":"Jji.Test@x.com"}'; echo "ME" >> "$FAKE_LOG"; exit 0; fi
echo "$* | cwd=$(pwd -P) cfg=${DFLOW_CONFIG_DIR:-}" >> "$FAKE_LOG"
case "${FAKE_MODE:-ok}" in
  fail) echo "boom" >&2; exit 1 ;;
  noconfig) echo "NO_LOCAL x" >&2; exit 2 ;;
  slow) sleep 30; exit 0 ;;
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

# --- 1. init → 팀장 등록 ------------------------------------------------------
: > "$FAKE_LOG"
$CS init t1 --goal "시험 회차" >/dev/null
eq "init: 팀장 키 $ID/coord" "$(log | grep -c -- "--agent $ID/coord --slots 0 --busy 0 --project proj-1")" 1
eq "init: 레인이 없으면 slots 0 busy 0" "$(log | grep -c -- "--agent $ID/coord --slots 0 --busy 0")" 1
eq "init: dflow 는 리포 루트에서 설정 폴더 지정 후 실행" "$(log | grep -c "cwd=$repo cfg=$repo")" 1
eq "init: 팀장 키 기록(._lead)" "$(sent _lead)" "$ID/coord"
eq "init: 신원 /me 는 한 번만(state 캐시)" "$(log | grep -c '^ME$')" 1

# --- 2. lane-up ---------------------------------------------------------------
$CS lane-add a1 '{"brief":"툴팁 사전 정리","session":{"handle":"h1"}}' >/dev/null
reset
$OFF lane-up a1 >"$tmp/o.out" 2>"$tmp/o.err"
eq "lane-up: 종료 코드 0·무출력" "$(wc -c < "$tmp/o.out" | tr -d ' ')$(wc -c < "$tmp/o.err" | tr -d ' ')" "00"
eq "lane-up: 팀원 키·until·project" "$(log | grep -c -- "--agent $ID/임시:a1·툴팁 사전 정리 --until 작업 중 --project proj-1")" 1
eq "lane-up: 팀장 slots=1 busy=1" "$(log | grep -c -- "--agent $ID/coord --slots 1 --busy 1")" 1
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
eq "hold 훅: 팀장 busy 4→3" "$(log | grep -c -- "--agent $ID/coord --slots 4 --busy 3")" 1
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
eq "lane-down: 팀장 slots 3" "$(log | grep -c -- "--agent $ID/coord --slots 3")" 1
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

# --- 12a. finish(마감 표식이 서면 뒤 시험이 막히므로 마지막 쪽에 둔다) ----------------------------------------------------------------
reset
$CS event run-closed - '{}' >/dev/null; cp "$FAKE_LOG" "$tmp/fin.log"
# a2 는 state 에 active 로 남아 있어 앞 beat 가 다시 등록했다(lane-down 은 state 를 바꾸지 않는다 — close-lane.sh 가 closed 로 먼저 쓴다)
eq "run-closed 이벤트 → finish: 팀원 a1·a2·a4 와 팀장 stop" "$(log | grep -c -- '--stop')" 4
eq "finish: 팀장 stop" "$(log | grep -c -- "--agent $ID/coord --stop")" 1
eq "finish: 기록 비움" "$($CS get '[.office.sent[]? | select(. != null)] | length')" 0

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
eq "워크트리에서: 메인 루트 설정(.coord.local.json) 사용" "$(log | grep -c -- "--agent $ID/coord")" 1
eq "워크트리에서: cwd·DFLOW_CONFIG_DIR 이 메인 체크아웃 루트" "$(log | grep -c "cwd=$main cfg=$main")" 1

exit "$fail"
