#!/usr/bin/env bash
# 레인 화면 캐시(lib/screen-cache.sh): 폴러가 쓰고 prompt-watch.sh 가 읽어 orca 읽기를 줄이는 규칙을 가짜 orca·가짜 dflow.sh 로 확인한다.
# 사용법: bash tests/screen-cache.sh   (실패가 있으면 종료 코드 1, 1분 안팎)
# 실제 서버·~/.coord·~/.dflow·터미널은 쓰지 않는다: HOME·COORD_STATE_ROOT·DFLOW_CONSOLE_DIR·COORD_REPO 를 모두 임시 폴더로 둔다.
# 가짜 orca: terminal list → $FAKE_DIR/terms · terminal read → $FAKE_DIR/screens/<h>.txt 의 마지막 --limit 줄(호출은 $FAKE_DIR/orca.log).
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$(cd "$here/../scripts" && pwd)"
. "$SD/lib/compat.sh"
CP="$SD/console-poll.sh"; PW="$SD/prompt-watch.sh"; AA="$SD/auto-answer.sh"; TSS="$SD/term-send-safe.sh"
fx="$here/fixtures"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/screen-cache-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
BG=""
cleanup() {
  local p
  for p in $BG; do kill "$p" 2>/dev/null; done
  compat_pkill_s "$tmp/bin/"
  rm -rf "$tmp"
}
trap cleanup EXIT
fail=0; pass=0; fail_n=0
chk() { if [ "$1" = ok ]; then pass=$((pass + 1)); echo "ok   $2"; else fail=1; fail_n=$((fail_n + 1)); echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

# ---- 격리·가짜 ----------------------------------------------------------------------------------
unset ORCA_TERMINAL_HANDLE CLAUDE_PID COORD_SESSION_ID CLAUDE_CODE_SESSION_ID COORD_RUN DFLOW_CONFIG_DIR COORD_DRY CONSOLE_POLL_IDENT COORD_CONSOLE_POLL COORD_CONSOLE_KEYS_ENABLED SC_TTL
mkdir -p "$tmp/bin" "$tmp/repo" "$tmp/home"
export HOME="$tmp/home" COORD_REPO="$tmp/repo" COORD_CONSOLE_CYCLE_S=1
export COORD_CONSOLE_KEEP_SCREEN=1   # 폴러가 끝나도 캐시를 남긴다(기존 단언이 --once 뒤 캐시를 본다). 끝날 때 정리 시험(5절)만 이 값을 뺀다
host="$(hostname | cut -d. -f1 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')"
ID="jji-test/$host"
base_cfg() {
  local ex="${1:-}"; [ -n "$ex" ] || ex='{}'
  jq -n --arg st "$tmp/unused-state" --arg ds "$tmp/bin/fake-dflow.sh" --argjson extra "$ex" \
    '{state_dir:$st, terminal_backend:"orca", office:{enabled:true, project_id:null, label_max:40, dflow_script:$ds}} * $extra' > "$tmp/repo/.coord.local.json"
}
base_cfg

cat > "$tmp/bin/fake-dflow.sh" <<'FAKE'
#!/bin/sh
F="$FAKE_DIR"
case "$1" in
  me) printf '{"user_email":"Jji.Test@x.com"}'; exit 0 ;;
  console-poll) echo "$*" >> "$FAKE_LOG"; exit 0 ;;
  console-ack) echo "$*" >> "$FAKE_LOG"; echo "ACK $4"; exit 0 ;;
  console-screen)
    n=$(( $(ls "$F"/screen.*.json 2>/dev/null | wc -l) + 1 ))
    cat > "$F/screen.$n.json"
    echo "$* n=$n" >> "$FAKE_LOG"
    jq -r '.[] | "SCREEN \(.target_kind) \(.target_ref) \(if has("lines") then "stored" else "touched" end)"' "$F/screen.$n.json"
    exit 0 ;;
  *) echo "$*" >> "$FAKE_LOG"; printf '2026-10-06T00:00:00Z'; exit 0 ;;
esac
FAKE
cat > "$tmp/bin/orca" <<'FAKE'
#!/bin/sh
echo "$*" >> "$FAKE_DIR/orca.log"
sub="$2"; h=""; lim=40; prev=""
for a in "$@"; do
  [ "$prev" = "--terminal" ] && h="$a"
  [ "$prev" = "--limit" ] && lim="$a"
  prev="$a"
done
case "$sub" in
  list) jq -nc --arg t "$(cat "$FAKE_DIR/terms" 2>/dev/null)" '{ok:true,result:{terminals:[$t | split(" ")[] | select(. != "") | {handle:., title:"", worktreePath:""}]}}' ;;
  read)
    if [ -f "$FAKE_DIR/screens/$h.txt" ]; then tail -n "$lim" "$FAKE_DIR/screens/$h.txt" | jq -Rnc '[inputs] | {ok:true,result:{terminal:{tail:.}}}'
    else echo '{"ok":false,"error":{"message":"terminal_handle_stale"}}'; fi ;;
  wait) echo '{"ok":true,"result":{"wait":{"satisfied":true}}}' ;;
  *) echo '{"ok":false,"error":{"message":"fake orca: not allowed"}}' ;;
esac
FAKE
cat > "$tmp/bin/fake-lead-state.sh" <<'FAKE'
#!/bin/sh
exit 0
FAKE
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH" COORD_LEAD_STATE="$tmp/bin/fake-lead-state.sh"
eq "격리: 가짜 orca 가 PATH 맨 앞" "$(command -v orca)" "$tmp/bin/orca"

newenv() {
  S="$tmp/$1"
  mkdir -p "$S/state/_session" "$S/console/lead" "$S/fake/screens"
  export COORD_STATE_ROOT="$S/state" DFLOW_CONSOLE_DIR="$S/console" FAKE_DIR="$S/fake" FAKE_LOG="$S/fake/dflow.log"
  : > "$FAKE_LOG"; : > "$FAKE_DIR/orca.log"; : > "$FAKE_DIR/terms"
  base_cfg
}
mksess() {  # mksess <세션8> <pid> <handle>
  jq -n --arg k "$ID/coord:$1" --arg h "$3" --argjson p "$2" --arg s "$1" --arg ho "$host" \
    '{key:$k, session_id:$s, host:$ho, user:"jji-test", pid:$p, handle:$h, sent_at:"2026-10-06T00:00:00+09:00", slots:0, busy:0}' > "$S/state/_session/$1.json"
}
mkrun() {  # mkrun <run-id> <session_id> <coordinator pid>
  mkdir -p "$S/state/$1"
  jq -n --arg id "$1" --arg sid "$2" --argjson p "$3" \
    '{schema:1, run:{id:$id, closed_at:null, coordinator:{session_id:$sid, pid:$p, handle:""}}, lanes:{}, merge:{in_flight:null}, office:{user:"jji-test"}}' > "$S/state/$1/state.json"
}
addlane() {  # addlane <run-id> <레인> <handle>
  local f="$S/state/$1/state.json"
  jq --arg l "$2" --arg h "$3" '.lanes[$l] = {session:{handle:$h, pid:0}, state:"active"}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
}
# 화면 만들기: 앞에 대화 줄을 채워 45줄 안팎(라이브 orca 는 --limit 만큼 끝에서 자른다)
filler() { local i; for i in $(seq 1 "${2:-40}"); do printf '대화 줄 %s\n' "$i"; done > "$1"; }
mk_idle() { filler "$1" 40; cat "$fx/claude-empty-bare-named.txt" >> "$1"; }
mk_perm() { filler "$1" 40; cat "$fx/prompt-permission.txt" >> "$1"; }
mk_question() {  # 맨 위(끝에서 41번째) 줄에 표식을 둔다 — 캐시 41줄에서 마지막 40줄만 써야 발췌에 안 나온다
  { for i in $(seq 1 30); do printf '대화 줄 %s\n' "$i"; done; cat "$fx/prompt-question.txt"; } > "$1.body"
  n="$(wc -l < "$1.body" | tr -d ' ')"
  { sed -n "1,$((n - 41))p" "$1.body"; echo TOP41LINE; tail -n 40 "$1.body"; } > "$1"; rm -f "$1.body"
}
ms_now() {  # 지금 에포크 ms — date +%s.%N(9자리 소수)이면 그것, 아니면 node
  local t; t="$(date +%s.%N 2>/dev/null)"
  if [[ "$t" =~ ^([0-9]+)\.([0-9]{9})$ ]]; then printf '%d' $(( ${BASH_REMATCH[1]} * 1000 + 10#${BASH_REMATCH[2]:0:3} ))
  else node -e 'process.stdout.write(String(Date.now()))'; fi
}
# 폴러의 쓰기를 흉내: 진짜 쓰기 함수로 캐시를 남긴다 — plant <handle> <화면 파일> [나이 초] [창 지문]. 화면은 41줄만 담는다(폴러와 같게)
plant() {
  local h="$1" f="$2" age="${3:-0}" full="${4:-}"
  tail -n 41 "$f" > "$S/plant.scr"
  ( . "$SD/lib/common.sh"; . "$SD/lib/screen-cache.sh"; sc_store "$h" "$S/plant.scr" "$(( $(ms_now) - age * 1000 ))" "$full" ) || echo "plant 실패 $h" >&2
}
CD() { printf '%s/screen' "$DFLOW_CONSOLE_DIR"; }
reads() { grep -c -- '^terminal read ' "$FAKE_DIR/orca.log"; }
resetlog() { : > "$FAKE_DIR/orca.log"; }
pw() { resetlog; bash "$PW" "$@" 2>"$S/pw.err"; }
setcfg() { base_cfg "$1"; }
mode_of() { compat_stat_mode "$1"; }   # GNU·BSD 분기는 compat.sh
SECRET="sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"

# =================================================================================================
# 1. 폴러 --once 가 캐시를 쓴다
newenv w
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk; addlane r1 pm hp
echo "hk hp hL" > "$FAKE_DIR/terms"
mk_idle "$FAKE_DIR/screens/hk.txt"; mk_perm "$FAKE_DIR/screens/hp.txt"; mk_idle "$FAKE_DIR/screens/hL.txt"
t0="$(ms_now)"
bash "$CP" --once 2>"$S/once.err" >/dev/null
t1="$(ms_now)"
d="$(CD)"
eq "쓰기: 캐시 폴더는 700" "$(mode_of "$d")" 700
eq "쓰기: 레인 둘의 .txt·.json 만 있다(임시 파일·조정 팀장 화면 없음)" "$(ls -A "$d" | tr '\n' ' ')" "hk.json hk.txt hp.json hp.txt "
eq "쓰기: 파일은 모두 600" "$(for f in "$d"/*; do mode_of "$f"; done | sort -u | tr '\n' ' ')" "600 "
eq "쓰기: 화면 읽기는 41줄 한 번씩(대상 셋, 추가 읽기 없음)" "$(grep -c -- '^terminal read .*--limit 41 ' "$FAKE_DIR/orca.log")/$(reads)" "3/3"
eq "쓰기: 조용한 레인 kind null" "$(jq -c '.kind' "$d/hk.json")" null
eq "쓰기: 권한 창 레인 kind permission" "$(jq -r '.kind' "$d/hp.json")" permission
eq "쓰기: lines 41" "$(jq -r '.lines' "$d/hp.json")" 41
eq "쓰기: read_at_ms 는 읽은 시각(실행 구간 안)" "$(jq -r --argjson a "$t0" --argjson b "$t1" '(.read_at_ms >= $a and .read_at_ms <= $b) | tostring' "$d/hp.json")" true
eq "쓰기: 창이 있으면 full(64자 hex) 이 있다" "$(jq -r '.full // "" | test("^[0-9a-f]{64}$") | tostring' "$d/hp.json")" true
eq "쓰기: 창이 없으면 full 칸이 없다" "$(jq -r 'has("full") | tostring' "$d/hk.json")" false
eq "쓰기: .txt 는 읽은 화면 원문 그대로(41줄)" "$(tail -n 41 "$FAKE_DIR/screens/hp.txt" | cmp -s - "$d/hp.txt" && echo same)" same
eq "쓰기: 원문(가리기 전)이 로컬 .txt 에는 있다" "$(grep -c -- "$SECRET" "$d/hp.txt")" 1
eq "비밀: 폴러 stderr·로그·올린 화면에 원문이 없다" "$(cat "$S/once.err" "$S/console"/poller-*.log "$FAKE_LOG" "$FAKE_DIR"/screen.*.json 2>/dev/null | grep -c -e "$SECRET" -e AbCdEfGhIjKl)" 0

# 원자적 교체: 쓰는 동안 읽는 쪽이 늘 온전한 쌍(유효한 json·한쪽 화면 전체)만 본다
filler "$S/A.txt" 41; { echo "화면 B"; seq 1 40; } > "$S/B.txt"
plant hz "$S/A.txt"
( . "$SD/lib/common.sh"; . "$SD/lib/screen-cache.sh"
  i=0; while [ "$i" -lt 80 ]; do
    if [ $((i % 2)) = 0 ]; then sc_store hz "$S/B.txt" "$(ms_now)" ""; else sc_store hz "$S/A.txt" "$(ms_now)" ""; fi
    i=$((i + 1)); done ) &
wp=$!
bad=0; reads_n=0
A="$(cat "$S/A.txt")"; B="$(cat "$S/B.txt")"
while kill -0 "$wp" 2>/dev/null; do
  j="$(cat "$d/hz.json" 2>/dev/null)"; t="$(cat "$d/hz.txt" 2>/dev/null)"
  reads_n=$((reads_n + 1))
  printf '%s' "$j" | jq -e '.read_at_ms and .lines' >/dev/null 2>&1 || bad=$((bad + 1))
  [ "$t" = "$A" ] || [ "$t" = "$B" ] || bad=$((bad + 1))
done
wait "$wp" 2>/dev/null
eq "원자적: 교체 중 반쯤 쓴 json·txt 를 본 적 없다(읽기 ${reads_n}회)" "$bad" 0
eq "원자적: 끝난 뒤 임시 파일이 남지 않는다" "$(ls -A "$d" | grep -c '^\.')" 0
rm -f "$d"/hz.*

# 읽기 실패 → 그 handle 의 캐시 삭제, 터미널 목록에서 빠짐 → 삭제
rm -f "$FAKE_DIR/screens/hk.txt"
bash "$CP" --once 2>/dev/null >/dev/null
eq "삭제: 읽기에 실패한 handle 의 캐시는 지운다" "$(ls "$d" | tr '\n' ' ')" "hp.json hp.txt "
echo "hk hL" > "$FAKE_DIR/terms"; mk_idle "$FAKE_DIR/screens/hk.txt"
bash "$CP" --once 2>/dev/null >/dev/null
eq "삭제: 터미널 목록에서 빠진 handle 의 캐시도 지운다(읽은 hk 는 새로 생김)" "$(ls "$d" | tr '\n' ' ')" "hk.json hk.txt "

# 정리: 10분 넘은 파일(임시 파일 포함)은 지우고 새 파일은 둔다
for f in hz.json hz.txt .hz.txt.999; do : > "$d/$f"; chmod 600 "$d/$f"; touch -t 202001010000 "$d/$f"; done
: > "$d/hy.json"; chmod 600 "$d/hy.json"
bash "$CP" --once 2>/dev/null >/dev/null
eq "정리: 오래된 캐시·임시 파일은 폴러 주기에 지워진다" "$(ls -A "$d" | tr '\n' ' ')" "hk.json hk.txt hy.json "

# 설정 0 이면 쓰지 않고 있던 것도 지운다 / dry-run 은 건드리지 않는다
bash "$CP" --once --dry-run 2>/dev/null >/dev/null
eq "dry-run: 캐시를 지우지도 쓰지도 않는다" "$(ls -A "$d" | tr '\n' ' ')" "hk.json hk.txt hy.json "
setcfg '{"approvals":{"screen_cache_s":0}}'
bash "$CP" --once 2>/dev/null >/dev/null
eq "설정 0: 폴러가 캐시를 쓰지 않고 읽은 레인의 기존 캐시를 지운다" "$(ls -A "$d" | tr '\n' ' ')" "hy.json "
setcfg '{}'

# =================================================================================================
# 2. prompt-watch 읽기: 신선한 캐시면 orca 를 부르지 않는다
newenv r
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk; addlane r1 pm hp; addlane r1 qs hq
echo "hk hp hq" > "$FAKE_DIR/terms"
mk_idle "$FAKE_DIR/screens/hk.txt"; mk_perm "$FAKE_DIR/screens/hp.txt"; mk_question "$FAKE_DIR/screens/hq.txt"
d="$(CD)"
# 기준: 캐시 없이 직접 읽은 출력
setcfg '{"approvals":{"screen_cache_s":0}}'
base_k="$(pw --handle hk --follow 0)"; base_p="$(pw --handle hp --follow 0)"; base_q="$(pw --handle hq --follow 0)"
setcfg '{}'
eq "기준(직접): 조용한 레인" "$base_k" "NONE hk"
eq "기준(직접): 권한 창 첫 줄" "$(printf '%s\n' "$base_p" | head -1)" "PROMPT hp permission"
eq "기준(직접): 질문 창 첫 줄" "$(printf '%s\n' "$base_q" | head -1)" "PROMPT hq question"
eq "기준(직접): 질문 발췌에 끝에서 41번째 줄은 없다" "$(printf '%s\n' "$base_q" | grep -c TOP41LINE)" 0

plant hk "$FAKE_DIR/screens/hk.txt"; plant hp "$FAKE_DIR/screens/hp.txt"; plant hq "$FAKE_DIR/screens/hq.txt"
eq "캐시 hit(조용): 출력이 직접 읽기와 같다" "$(pw --handle hk --follow 0)" "$base_k"
eq "캐시 hit(조용): orca 읽기 0회" "$(reads)" 0
eq "캐시 hit(질문): 출력이 직접 읽기와 같다(캐시 41줄에서 마지막 40줄만 쓴다)" "$(pw --handle hq --follow 0)" "$base_q"
eq "캐시 hit(질문): orca 읽기 0회" "$(reads)" 0
eq "캐시 hit(권한): 출력이 직접 읽기와 같다" "$(pw --handle hp --follow 0)" "$base_p"
eq "캐시 hit(권한): 120줄 직접 읽기 한 번만" "$(reads) $(grep -c -- '--limit 120 ' "$FAKE_DIR/orca.log")" "1 1"
eq "캐시 hit: stderr 에 화면 원문이 없다" "$(grep -c -e "$SECRET" -e TOP41LINE "$S/pw.err")" 0
eq "캐시 hit(레인 이름): 같다" "$(resetlog; env COORD_RUN=r1 bash "$PW" kit --follow 0 2>/dev/null; echo "reads=$(reads)")" "$(printf 'NONE hk\nreads=0')"

# 쓸 수 없는 캐시는 조용히 직접 읽는다(출력은 직접 읽기와 같고 읽기 1회)
direct_case() {  # direct_case <이름> — hk 를 단일 모드로 읽어 NONE·읽기 1회인지
  eq "$1: 직접 읽는다(읽기 1회·출력 같음)" "$(pw --handle hk --follow 0; echo "reads=$(reads)")" "$(printf '%s\nreads=1' "$base_k")"
  eq "$1: 오류·stderr 없음" "$(wc -c < "$S/pw.err" | tr -d ' ')" 0
}
plant hk "$FAKE_DIR/screens/hk.txt" 60; direct_case "낡은 캐시(60초 > 20)"
plant hk "$FAKE_DIR/screens/hk.txt" 25; direct_case "기본 20초: 25초 전 캐시"
plant hk "$FAKE_DIR/screens/hk.txt" 15
eq "기본 20초: 15초 전 캐시는 쓴다(읽기 0)" "$(pw --handle hk --follow 0 >/dev/null; reads)" 0
rm -f "$d"/hk.*; direct_case "캐시 없음"
plant hk "$FAKE_DIR/screens/hk.txt"; printf '{' > "$d/hk.json"; direct_case "깨진 json"
plant hk "$FAKE_DIR/screens/hk.txt"; jq 'del(.read_at_ms)' "$d/hk.json" > "$d/x" && mv "$d/x" "$d/hk.json"; chmod 600 "$d/hk.json"; direct_case "read_at_ms 없는 json"
plant hk "$FAKE_DIR/screens/hk.txt"; jq '.kind = "evil"' "$d/hk.json" > "$d/x" && mv "$d/x" "$d/hk.json"; chmod 600 "$d/hk.json"; direct_case "모르는 kind"
plant hk "$FAKE_DIR/screens/hk.txt"; jq '.read_at_ms += 600000' "$d/hk.json" > "$d/x" && mv "$d/x" "$d/hk.json"; chmod 600 "$d/hk.json"; direct_case "미래 시각 read_at_ms"
plant hk "$FAKE_DIR/screens/hk.txt"; jq '.lines = 5' "$d/hk.json" > "$d/x" && mv "$d/x" "$d/hk.json"; chmod 600 "$d/hk.json"; direct_case "줄 수가 txt 와 다른 쌍"
plant hk "$FAKE_DIR/screens/hk.txt"; rm -f "$d/hk.txt"; direct_case "txt 없음"
plant hk "$FAKE_DIR/screens/hk.txt"; jq '.kind = "permission"' "$d/hk.json" > "$d/x" && mv "$d/x" "$d/hk.json"; chmod 600 "$d/hk.json"; direct_case "json 판정이 화면과 다른 쌍(찢어진 쌍·손댄 파일)"
plant hk "$FAKE_DIR/screens/hk.txt"; chmod 644 "$d/hk.json"; direct_case "json 권한 644"
plant hk "$FAKE_DIR/screens/hk.txt"; chmod 666 "$d/hk.txt"; direct_case "txt 권한 666"
plant hk "$FAKE_DIR/screens/hk.txt"; chmod 755 "$d"; direct_case "폴더 권한 755"; chmod 700 "$d"
plant hk "$FAKE_DIR/screens/hk.txt"; mv "$d/hk.txt" "$S/real.txt"; ln -s "$S/real.txt" "$d/hk.txt"; direct_case "txt 가 심볼릭 링크"; rm -f "$d/hk.txt"
plant hk "$FAKE_DIR/screens/hk.txt"
eq "소유 uid 가 다른 캐시(시험용 id 가짜): 직접 읽는다" "$( id() { echo 99999; }; export -f id; pw --handle hk --follow 0 >/dev/null; reads)" 1
eq "소유 uid 가 같으면 쓴다(대조)" "$(pw --handle hk --follow 0 >/dev/null; reads)" 0
setcfg '{"approvals":{"screen_cache_s":10}}'; plant hk "$FAKE_DIR/screens/hk.txt" 20
eq "설정 screen_cache_s=10: 20초 전 캐시는 낡았다" "$(pw --handle hk --follow 0 >/dev/null; reads)" 1
plant hk "$FAKE_DIR/screens/hk.txt" 5
eq "설정 screen_cache_s=10: 5초 전 캐시는 쓴다" "$(pw --handle hk --follow 0 >/dev/null; reads)" 0
setcfg '{"approvals":{"screen_cache_s":0}}'; plant hk "$FAKE_DIR/screens/hk.txt"
eq "설정 screen_cache_s=0: 신선해도 캐시를 끈다" "$(pw --handle hk --follow 0 >/dev/null; reads)" 1
setcfg '{}'
eq "설정 기본값 20·예시 설정 파일에 키가 있다" "$(. "$SD/lib/common.sh"; coord_cfg .approvals.screen_cache_s)/$(jq -r '.approvals.screen_cache_s' "$here/../templates/config.example.json")" "20/20"

# --lanes
plant hk "$FAKE_DIR/screens/hk.txt"; plant hp "$FAKE_DIR/screens/hp.txt"
out="$(resetlog; env COORD_RUN=r1 bash "$PW" --lanes kit,pm --follow 0 2>/dev/null; echo "reads=$(reads)")"
eq "--lanes: 캐시로 판정(권한 창 120줄 직접 읽기 1회만)" "$(printf '%s\n' "$out" | tail -1)" "reads=1"
eq "--lanes: 출력 형식 그대로" "$(printf '%s\n' "$out" | grep -c -e '^pm PROMPT hp permission$' -e '^kit NONE hk$')" 2

# =================================================================================================
# 3. --follow: 캐시가 바뀐 때만 새 판정, 폴러가 꺼지면 직접 읽기
newenv f
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk
echo "hk" > "$FAKE_DIR/terms"
mk_idle "$FAKE_DIR/screens/hk.txt"; mk_perm "$S/perm.txt"; mk_idle "$S/idle.txt"
d="$(CD)"
plant hk "$S/idle.txt"
resetlog
# 시간 의존 구간: JS 스위치(COORD_JS_*=1)가 켜지면 함수 호출마다 node 기동(약 40ms)이 더해져 폴러 한 바퀴가 길어지므로
# 간격(--every)·표본 사이 대기를 3배로 늘린다. 꺼짐(기본)은 예전 값 그대로다.
if env | grep -q '^COORD_JS_[A-Z_]*=1$'; then T_EV=3; T_FW=27; T_1=4.2; T_2=2.4; T_3=3.6; T_OFF_CACHE=9; T_OFF=4.5
else T_EV=1; T_FW=9; T_1=1.4; T_2=0.8; T_3=1.2; T_OFF_CACHE=3; T_OFF=1.5; fi
( env COORD_RUN=r1 bash "$PW" --lanes kit --follow "$T_FW" --every "$T_EV" > "$S/follow.out" 2>/dev/null ) & BG="$BG $!"; fp=$!
sleep "$T_1"; plant hk "$S/perm.txt"                    # 폴러가 권한 창을 읽었다
sleep "$T_2"; cp "$d/hk.txt" "$S/keep.txt"; printf '%s\n' "가짜 화면" > "$d/hk.txt"   # json 은 그대로 — 다시 판정했다면 짝이 안 맞아 직접 읽는다
sleep "$T_3"
plant hk "$S/perm.txt"                                  # 같은 창을 다시 읽음(read_at 만 새로)
sleep "$T_1"; plant hk "$S/idle.txt"                    # 창이 사라짐
sleep "$T_1"; plant hk "$S/perm.txt"                    # 다시 뜸
wait "$fp" 2>/dev/null
eq "follow: 캐시가 바뀐 때만 판정한다(같은 창은 한 번, 사라졌다 다시 뜨면 또 한 번)" "$(grep -c '^kit PROMPT hk permission$' "$S/follow.out")" 2
eq "follow: 바뀌지 않은 캐시는 다시 읽지도 않는다(직접 읽기는 권한 창 120줄 두 번뿐)" "$(reads) $(grep -c -- '--limit 120 ' "$FAKE_DIR/orca.log")" "2 2"
eq "follow: 끝줄 NONE 한 줄은 기존대로" "$(grep -c '^kit NONE' "$S/follow.out")" 1
# 폴러가 꺼짐(캐시가 낡음) → 그때부터 직접 읽기
setcfg "{\"approvals\":{\"screen_cache_s\":$T_OFF_CACHE}}"
mk_idle "$FAKE_DIR/screens/hk.txt"; plant hk "$S/idle.txt"
resetlog
( bash "$PW" --handle hk --follow "$T_FW" --every "$T_EV" > "$S/off.out" 2>/dev/null ) & BG="$BG $!"; fp=$!
sleep "$T_OFF"; r_early="$(reads)"
sleep "$T_OFF"; mk_perm "$FAKE_DIR/screens/hk.txt"      # 캐시는 이제 낡았고(screen_cache_s 초 뒤), 실제 화면에 창이 뜬다
wait "$fp" 2>/dev/null
eq "폴러 꺼짐: 신선한 동안은 읽기 0" "$r_early" 0
eq "폴러 꺼짐: 캐시가 낡으면 직접 읽어 창을 찾는다" "$(head -1 "$S/off.out")" "PROMPT hk permission"
setcfg '{}'

# =================================================================================================
# 4. 보안 경계: 자동 응답 직전 재판정은 늘 직접 읽는다(캐시에 거짓 화면을 심어도 판정은 직접 읽은 화면대로)
newenv s
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk
echo "hk" > "$FAKE_DIR/terms"
mk_idle "$FAKE_DIR/screens/hk.txt"; mk_perm "$S/perm.txt"; mk_idle "$S/idle.txt"
d="$(CD)"
plant hk "$S/perm.txt"       # 캐시: 권한 창(거짓) · 실제 화면: 조용함
eq "대조: prompt-watch 는 이 캐시를 믿는다(감지 단계 전용)" "$(pw --handle hk --follow 0 | head -1)" "PROMPT hk permission"
resetlog
eq "auto-answer: 캐시의 거짓 창을 보지 않고 직접 읽은 화면대로 NONE" "$(env COORD_RUN=r1 bash "$AA" --lane kit --dry-run 2>/dev/null | head -1)" "NONE hk"
eq "auto-answer: 직접 읽기(80줄)를 했다" "$(grep -c -- '--limit 80 ' "$FAKE_DIR/orca.log")" 1
resetlog
eq "term-send-safe --raw: 캐시의 거짓 창을 믿지 않고 거절" "$(bash "$TSS" --handle hk --raw --text 1 --dry-run 2>/dev/null | head -1)" "REFUSED hk no-prompt"
eq "term-send-safe --raw: 화면을 직접 읽었다" "$([ "$(reads)" -ge 1 ] && echo yes)" yes
resetlog
eq "judge-sha: 캐시의 거짓 창을 믿지 않고 직접 읽은 화면대로 NONE" "$(env COORD_RUN=r1 bash "$CP" judge-sha --lane kit 2>/dev/null)" "NONE hk"
eq "judge-sha: 41줄 직접 읽기" "$(grep -c -- '--limit 41 ' "$FAKE_DIR/orca.log")" 1
# 거꾸로: 캐시는 조용함, 실제 화면은 권한 창 → 판정은 창을 본다
cp "$S/perm.txt" "$FAKE_DIR/screens/hk.txt"; plant hk "$S/idle.txt"
eq "대조: prompt-watch 는 조용한 캐시를 믿는다(최대 20초 늦은 감지 — 설계된 한계)" "$(pw --handle hk --follow 0 | head -1)" "NONE hk"
eq "auto-answer: 조용한 캐시를 믿지 않고 창을 본다(NONE 이 아님)" "$(env COORD_RUN=r1 bash "$AA" --lane kit --dry-run 2>/dev/null | head -1 | grep -c '^NONE')" 0
eq "judge-sha: 조용한 캐시를 믿지 않고 창 지문을 낸다" "$(env COORD_RUN=r1 bash "$CP" judge-sha --lane kit 2>/dev/null | cut -d' ' -f1-3)" "JUDGE hk permission"
# 정적 확인: 캐시를 읽는 함수는 prompt-watch.sh 만 부른다(scripts/lib 도 훑는다 — 정의 파일 lib/screen-cache.sh 자신은 뺀다)
eq "정적: sc_load·sc_sig 를 부르는 스크립트(lib 포함)는 prompt-watch.sh 뿐" "$(grep -l -E '(^|[^A-Za-z_])sc_(load|sig)([^A-Za-z_]|$)' "$SD"/*.sh "$SD"/lib/*.sh | grep -v '/lib/screen-cache\.sh$' | xargs -n1 basename | tr '\n' ' ')" "prompt-watch.sh "
eq "정적: 캐시 라이브러리를 읽어 들이는 스크립트(lib 포함)는 폴러(쓰기)와 prompt-watch.sh(읽기)뿐" "$(grep -l 'lib/screen-cache.sh' "$SD"/*.sh "$SD"/lib/*.sh | grep -v '/lib/screen-cache\.sh$' | xargs -n1 basename | tr '\n' ' ')" "console-poll.sh prompt-watch.sh "
eq "정적: 폴러는 읽는 함수(sc_load·sc_sig)를 부르지 않는다" "$(grep -c -E '(^|[^A-Za-z_])sc_(load|sig)([^A-Za-z_]|$)' "$CP")" 0

# =================================================================================================
# 5. 같은 종류의 창이 이어질 때(권한 창 A → B) 지문(full)으로 새 창을 가른다 · 120줄에서 창이 사라지면 40줄 화면으로 발췌
fullof() { ( . "$SD/lib/common.sh"; . "$SD/lib/console-input.sh"; tail -n 41 "$1" | console_full_sha ); }
newenv n
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk
echo "hk" > "$FAKE_DIR/terms"
mk_idle "$FAKE_DIR/screens/hk.txt"
d="$(CD)"
mk_perm "$S/pA.txt"
sed 's/rm -rf build \&\&/rm -rf dist \&\&/' "$S/pA.txt" > "$S/pB.txt"
{ cat "$S/pB.txt"; echo; echo "  ctx 12%"; } > "$S/pB2.txt"      # 창 B 그대로 + 창 밖 상태줄만 다름
FA="$(fullof "$S/pA.txt")"; FB="$(fullof "$S/pB.txt")"; FB2="$(fullof "$S/pB2.txt")"
eq "지문 전제: 창이 다른 A·B 는 지문이 다르다" "$([ -n "$FA" ] && [ -n "$FB" ] && [ "$FA" != "$FB" ] && echo diff)" diff
eq "지문 전제: 상태줄만 다른 B·B2 는 지문이 같다" "$FB" "$FB2"

plant hk "$S/pA.txt" 0 "$FA"
( env COORD_RUN=r1 bash "$PW" --lanes kit --follow 9 --every 1 > "$S/seq.out" 2>/dev/null ) & BG="$BG $!"; fp=$!
sleep 2; plant hk "$S/pB.txt" 0 "$FB"        # 사이에 창 없음 표본 없이 권한 창 A → B
sleep 2; plant hk "$S/pB2.txt" 0 "$FB2"      # 같은 창 B(상태줄만 바뀜) — 다시 알리지 않는다
sleep 2; plant hk "$S/pB.txt" 0 ""           # 지문 없는 같은 종류 — 종류로만 비교해 다시 알리지 않는다(한계)
wait "$fp" 2>/dev/null
eq "연속 창(캐시): A·B 둘 다 알리고 같은 지문·지문 없는 같은 종류는 다시 알리지 않는다" "$(grep -c '^kit PROMPT hk permission$' "$S/seq.out")" 2
eq "연속 창(캐시): 끝줄 NONE 한 줄" "$(grep -c '^kit NONE hk$' "$S/seq.out")" 1
eq "(5) 120줄 화면에 창이 없으면 캐시 40줄 화면으로 발췌한다(블록마다 확인 질문이 있다)" "$(grep -c 'Do you want to proceed?' "$S/seq.out")" 2
eq "연속 창(캐시): B 블록에 새 명령이 담긴다" "$(grep -c 'rm -rf dist' "$S/seq.out")" 1

# 직접 읽기로 후퇴한 표본(캐시 끔): 같은 규칙을 화면에서 계산한 지문으로 적용한다
setcfg '{"approvals":{"screen_cache_s":0}}'
rm -f "$d"/hk.*; mk_idle "$FAKE_DIR/screens/hk.txt"
( env COORD_RUN=r1 bash "$PW" --lanes kit --follow 9 --every 1 > "$S/seq2.out" 2>/dev/null ) & BG="$BG $!"; fp=$!
sleep 2; cp "$S/pA.txt" "$FAKE_DIR/screens/hk.txt"
sleep 2.5; cp "$S/pB.txt" "$FAKE_DIR/screens/hk.txt"       # 창 없음 표본 없이 A → B
sleep 2.5; cp "$S/pB2.txt" "$FAKE_DIR/screens/hk.txt"      # B 에 상태줄만 바뀜
wait "$fp" 2>/dev/null
eq "연속 창(직접 읽기): A·B 둘 다 알리고 상태줄만 바뀐 같은 창은 다시 알리지 않는다" "$(grep -c '^kit PROMPT hk permission$' "$S/seq2.out")" 2
setcfg '{}'

# (5) 단일 모드: 캐시는 권한 창, 실제 화면은 조용함(창이 사라짐) → 첫 줄 PROMPT, 발췌는 40줄(캐시) 화면
mk_idle "$FAKE_DIR/screens/hk.txt"; plant hk "$S/pA.txt" 0 "$FA"
out="$(pw --handle hk --follow 0)"
eq "(5) 단일: 120줄에서 창이 사라져도 PROMPT 첫 줄은 그대로" "$(printf '%s\n' "$out" | head -1)" "PROMPT hk permission"
eq "(5) 단일: 발췌는 40줄(캐시) 화면 — 확인 질문·선택지가 있다" "$(printf '%s\n' "$out" | grep -c -e 'Do you want to proceed?' -e '1. Yes')" 2
eq "(5) 단일: 120줄 직접 읽기는 한 번 했다" "$(reads) $(grep -c -- '--limit 120 ' "$FAKE_DIR/orca.log")" "1 1"

# =================================================================================================
# 6. 폴러 재읽기: 창이 보인 레인만 REREAD_S 초 뒤 한 번 더 읽어 캐시를 바로 갱신한다(상주 폴러 run)
newenv q
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk; addlane r1 pm hp
echo "hk hp hL" > "$FAKE_DIR/terms"
mk_idle "$FAKE_DIR/screens/hk.txt"; mk_perm "$FAKE_DIR/screens/hp.txt"; mk_idle "$FAKE_DIR/screens/hL.txt"
d="$(CD)"
env -u COORD_CONSOLE_KEEP_SCREEN COORD_CONSOLE_CYCLE_S=30 COORD_CONSOLE_REREAD_S=3 bash "$CP" run >/dev/null 2>"$S/run.err" & rp=$!; BG="$BG $rp"
i=0; while [ "$i" -lt 150 ] && [ ! -f "$d/hp.json" ]; do sleep 0.1; i=$((i + 1)); done
at1="$(jq -r '.read_at_ms // 0' "$d/hp.json" 2>/dev/null)"
eq "재읽기 전제: 첫 주기에 권한 창 레인의 캐시가 kind permission 으로 남는다" "$(jq -r '.kind' "$d/hp.json" 2>/dev/null)" permission
mk_idle "$FAKE_DIR/screens/hp.txt"        # 첫 읽기 뒤 창이 사라졌다
i=0; while [ "$i" -lt 150 ] && [ "$(jq -c '.kind' "$d/hp.json" 2>/dev/null)" != null ]; do sleep 0.1; i=$((i + 1)); done
at2="$(jq -r '.read_at_ms // 0' "$d/hp.json" 2>/dev/null)"
eq "재읽기: 다음 주기(30초)를 기다리지 않고 창이 사라진 것을 캐시에 반영한다" "$(jq -c '.kind' "$d/hp.json" 2>/dev/null)" null
eq "재읽기: 읽은 시각이 REREAD_S(3초) 가까이 뒤다" "$([ "$at2" -ge $((at1 + 2500)) ] && [ "$at2" -le $((at1 + 6000)) ] && echo ok)" ok
sleep 1
eq "재읽기: 창이 보인 레인은 두 번(첫 읽기 + 재읽기)·창 없는 레인은 한 번만 읽는다" "$(grep -c -- '--terminal hp ' "$FAKE_DIR/orca.log") $(grep -c -- '--terminal hk ' "$FAKE_DIR/orca.log")" "2 1"
sleep 3
eq "재읽기: 주기당 한 번 — 3초를 더 기다려도 더 읽지 않는다" "$(grep -c -- '--terminal hp ' "$FAKE_DIR/orca.log") $(grep -c -- '--terminal hk ' "$FAKE_DIR/orca.log")" "2 1"
kill -TERM "$rp" 2>/dev/null; wait "$rp" 2>/dev/null
eq "종료 정리: 폴러를 TERM 으로 멈추면 screen/ 에 파일이 없다(.txt·.json·임시 파일)" "$(ls -A "$d" 2>/dev/null | wc -l | tr -d ' ')" 0

# =================================================================================================
# 7. 종료 정리: --once 가 on_exit 까지 끝나면 캐시(화면 원문)를 지운다 · dry-run 은 지우지 않는다
newenv o
mksess aaaa1111 $$ hL; mkrun r1 aaaa1111-0000 $$
addlane r1 kit hk; addlane r1 pm hp
echo "hk hp hL" > "$FAKE_DIR/terms"
mk_idle "$FAKE_DIR/screens/hk.txt"; mk_perm "$FAKE_DIR/screens/hp.txt"; mk_idle "$FAKE_DIR/screens/hL.txt"
d="$(CD)"
bash "$CP" --once 2>/dev/null >/dev/null      # 시험용 KEEP=1 — 대조: 캐시가 남고 hp.txt 에 비밀 문자열이 있다
eq "대조(KEEP=1): 끝난 뒤에도 캐시가 남고 원문이 있다" "$(ls -A "$d" | tr '\n' ' ')/$(grep -c -- "$SECRET" "$d/hp.txt")" "hk.json hk.txt hp.json hp.txt /1"
env -u COORD_CONSOLE_KEEP_SCREEN bash "$CP" --once --dry-run 2>/dev/null >/dev/null
eq "종료 정리: dry-run 은 캐시를 지우지 않는다" "$(ls -A "$d" | tr '\n' ' ')" "hk.json hk.txt hp.json hp.txt "
env -u COORD_CONSOLE_KEEP_SCREEN bash "$CP" --once 2>/dev/null >/dev/null
eq "종료 정리: --once 가 끝나면 screen/ 에 파일이 없다" "$(ls -A "$d" 2>/dev/null | wc -l | tr -d ' ')" 0
eq "종료 정리: 폴더 안 어디에도 비밀 문자열이 남지 않는다(hp.txt 포함)" "$(grep -rl -- "$SECRET" "$d" 2>/dev/null | wc -l | tr -d ' ')" 0

echo "통과 $pass · 실패 $fail_n"
exit "$fail"
