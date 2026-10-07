#!/usr/bin/env bash
# lib/compat.sh(macOS·Git Bash 차이를 모은 공용 함수)를 시험한다.
#   1) 이 PC 의 기본 경로(macOS 면 BSD)  2) GNU 경로 강제(PATH 앞에 GNU 흉내 stat·date, 실제 `stat -f` 함정 재현)
#   3) Git Bash 경로 강제(ps -o 가 없는 ps + 가짜 /proc 트리)
# 사용법: bash tests/compat.sh   (네트워크·터미널·실제 D'Flow 를 쓰지 않는다. 임시 폴더만 쓴다)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
LIB="$(cd "$here/../scripts/lib" && pwd)/compat.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/compat-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
. "$LIB"
BG=""
cleanup() { local p; for p in $BG; do kill "$p" 2>/dev/null; done; compat_pkill_f "$tmp/"; rm -rf "$tmp"; }
trap cleanup EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

# 새 셸에서 compat.sh 를 읽고 한 식을 평가한다(환경 덮어쓰기는 앞에 둔다)
run() { bash -c '. "$1"; shift; eval "$*"' _ "$LIB" "$@"; }

f="$tmp/f.txt"; : > "$f"; chmod 640 "$f"
now="$(date +%s)"
# ---- 1) 기본 경로 -------------------------------------------------------------------------------------------------
mt="$(run "compat_stat_mtime '$f'")"
case "$mt" in ''|*[!0-9]*) chk fail "mtime 은 숫자" "[$mt]" ;; *) [ $(( now - mt )) -le 5 ] && chk ok "mtime: 방금 만든 파일" || chk fail "mtime: 방금 만든 파일" "[$mt]" ;; esac
eq "권한: 640" "$(run "compat_stat_mode '$f'")" 640
eq "epoch 형식(UTC)" "$(run "compat_epoch_fmt 86400 %Y-%m-%dT%H:%M:%S -u")" "1970-01-02T00:00:00"
chmod 640 "$f"
eq "stat_info: uid 권한 mtime 크기" "$(run "compat_stat_info '$f'" | awk '{ print ($1 == '"$(id -u)"') "," $2 "," ($3 > 1000000000) "," $4 }')" "1,640,1,0"
eq "stat_info: 없는 파일은 rc 1" "$(run "compat_stat_info '$tmp/nofile' >/dev/null; echo \$?")" 1
eq "후손: ps_pidargs 는 pid 와 args 두 열 뒤에 ppid 가 없다" "$(run 'compat_ps_pidargs' | awk -v me=$$ '$1 == me { print $2 }' | head -1)" "$(ps -o args= -p $$ | awk '{ print $1 }')"
eq "cwds: 자기 셸 pid" "$(cd "$tmp" && run 'compat_proc_cwds $$,$$' | awk -F'\t' 'NR == 1 { print $2 }')" "$tmp"
run "compat_touch_ago 7200 '$f'"
mt="$(run "compat_stat_mtime '$f'")"
d=$(( now - mt )); [ "$d" -ge 7195 ] && [ "$d" -le 7260 ] && chk ok "touch_ago: 2시간 전(분 단위 반올림 허용)" || chk fail "touch_ago: 2시간 전" "차이 ${d}초"
eq "sha256: abc" "$(printf 'abc' | run 'compat_sha256')" "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
eq "sha256: 빈 입력도 64자" "$(printf '' | run 'compat_sha256' | grep -cE '^[0-9a-f]{64}$')" 1

# 프로세스 나무: bash → (sleep 61, 서브셸 → sleep 62)
bash -c 'sleep 61 & ( sleep 62 & wait ) & wait' "$tmp/tree" &
TREE=$!; BG="$BG $TREE"; sleep 0.5
desc="$(run "compat_descendants $TREE" | tr '\n' ' ')"
eq "후손: 자손 3개(sleep 61·서브셸·sleep 62)" "$(printf '%s\n' $desc | grep -c .)" 3
eq "후손: 자기 자신은 목록에 없다" "$(run "compat_descendants $TREE" | awk -v t="$TREE" '$1 == t { bad = 1 } END { print bad + 0 }')" 0
# 후위 순서: 부모는 자기 자식보다 뒤에 나온다(실제 ps 경로)
pairs="$(ps -axo pid=,ppid=)"
eq "후손: 깊은 쪽부터(부모는 자식보다 뒤)" "$(run "compat_descendants $TREE" | PAIRS="$pairs" awk 'BEGIN { n = split(ENVIRON["PAIRS"], L, "\n"); for (i = 1; i <= n; i++) { split(L[i], a, " "); pp[a[1]] = a[2] } } { idx[$1] = NR } END { bad = 0; for (c in idx) if ((pp[c] in idx) && idx[pp[c]] < idx[c]) bad = 1; print bad }')" 0
eq "pgrep_f: sleep 62 를 찾는다" "$(run "compat_pgrep_f '^sleep 62\$'" | grep -c .)" 1
run "compat_kill_tree $TREE"
{ wait "$TREE"; } 2>/dev/null; BG="${BG/$TREE/}"   # 거둔 pid 는 정리 대상에서 뺀다(재사용된 pid 에 TERM 이 가지 않게)
eq "kill_tree: 후손이 모두 사라진다" "$(run "compat_pgrep_f '^sleep 6[12]\$'" | grep -c .)" 0
eq "pid_alive: 죽은 pid" "$(run "compat_pid_alive $TREE && echo y || echo n")" n
eq "pid_alive: 자기 셸" "$(run 'compat_pid_alive $$ && echo y || echo n')" y
eq "pid_cwd: 자기 셸 작업 폴더" "$(cd "$tmp" && run 'compat_pid_cwd $$')" "$tmp"
bash -c 'sleep 63' "$tmp/pk" & PK=$!; BG="$BG $PK"; sleep 0.3
run "compat_pkill_f '^sleep 63\$'"; sleep 0.3; { wait "$PK"; } 2>/dev/null; BG="${BG/$PK/}"
eq "pkill_f: sleep 63 종료" "$(run "compat_pgrep_f '^sleep 63\$'" | grep -c .)" 0

# 고정 문자열 판: 공백·괄호·+ 가 든 경로도 그대로 찾는다(정규식이면 깨진다)
mkdir -p "$tmp/sp (a+b)"; printf '#!/bin/sh\nsleep 66\n' > "$tmp/sp (a+b)/run.sh"; chmod +x "$tmp/sp (a+b)/run.sh"
"$tmp/sp (a+b)/run.sh" & SPP=$!; BG="$BG $SPP"; sleep 0.4
eq "pgrep_s: 공백·괄호·+ 경로를 고정 문자열로 찾는다" "$(run "compat_pgrep_s '$tmp/sp (a+b)/run.sh'" | grep -c .)" 1
eq "pgrep_f: 같은 경로를 정규식으로 주면 못 찾는다(그래서 _s 가 있다)" "$(run "compat_pgrep_f '$tmp/sp (a+b)/run.sh'" | grep -c .)" 0
run "compat_pkill_s '$tmp/sp (a+b)/run.sh'"; { wait "$SPP"; } 2>/dev/null; BG="${BG/$SPP/}"
compat_pkill_f '^sleep 66$'   # 스크립트가 죽어도 자식 sleep 은 남는다
eq "pkill_s: 종료" "$(run "compat_pgrep_s '$tmp/sp (a+b)/run.sh'" | grep -c .)" 0
# common.sh 를 슬래시 없이 source 해도 compat.sh 가 같이 읽힌다
eq "common.sh 슬래시 없는 source" "$(cd "$here/../scripts/lib" && bash -c '. common.sh; type -t compat_stat_mtime')" function
eq "common.sh 상대 경로 source" "$(cd "$here/../scripts" && bash -c '. lib/common.sh; type -t compat_stat_mtime')" function

# 프로세스 그룹: 새 그룹(set -m)의 리더와 자식을 한 번에 끈다
set -m; ( sleep 64 & sleep 65 & wait ) & PGL=$!; set +m; BG="$BG $PGL"; sleep 0.5   # 작업 제어로 서브셸이 새 그룹의 리더(pgid = $PGL)가 된다
eq "pgroup_alive: 살아 있는 그룹" "$(run "compat_pgroup_alive $PGL && echo y || echo n")" y
run "compat_kill_pgroup $PGL"; { wait "$PGL"; } 2>/dev/null; BG="${BG/$PGL/}"; sleep 0.3
eq "kill_pgroup 뒤 sleep 64·65 가 없다" "$(run "compat_pgrep_f '^sleep 6[45]\$'" | grep -c .)" 0
eq "pgroup 가드: 0·1 은 신호를 보내지 않는다" "$(run 'compat_kill_pgroup 0; compat_kill_pgroup 1; compat_pgroup_alive 1 && echo y || echo n')" n

# ---- 2) GNU 경로 강제 ---------------------------------------------------------------------------------------------
# GNU 의 `stat -f` 는 파일시스템 모드: `stat -f %m 파일` 이 `?` 와 rc 0 을 낸다(BSD 먼저 시도하는 || 사슬이 대안으로 못 넘어가는 이유)
mkdir -p "$tmp/gnubin"
cat > "$tmp/gnubin/stat" <<'EOF'
#!/bin/sh
case "$1" in
  -c) case "$2" in %Y) exec /usr/bin/stat -f %m "$3" ;; %a) exec /usr/bin/stat -f %Lp "$3" ;; "%u %a %Y %s") exec /usr/bin/stat -f "%u %Lp %m %z" "$3" ;; esac ;;
  -f) echo "?"; exit 0 ;;
esac
echo "stat: 잘못된 사용" >&2; exit 1
EOF
cat > "$tmp/gnubin/date" <<'EOF'
#!/bin/sh
# GNU date 흉내: -d @N 만 되고 BSD 옵션(-r 숫자·-j·-v)은 오류
u=""; e=""; fmt=""
while [ $# -gt 0 ]; do
  case "$1" in
    -u) u="-u" ;;
    -d) shift; e="${1#@}"; [ "$e" != "$1" ] || { echo "date: 잘못된 날짜" >&2; exit 1; } ;;
    -r|-j|-v*) echo "date: 파일이 없다" >&2; exit 1 ;;
    +*) fmt="$1" ;;
  esac
  shift
done
if [ -n "$e" ]; then exec /bin/date $u -r "$e" "$fmt"; else exec /bin/date $u "$fmt"; fi
EOF
chmod +x "$tmp/gnubin/stat" "$tmp/gnubin/date"
# 이 PC 가 이미 GNU(Git Bash·Linux)이면 흉내 대신 실제 명령을 쓴다(흉내는 BSD stat·date 에 기대므로 macOS 에서만 의미가 있다)
if [ "$COMPAT_GNU" = 1 ]; then
  gnu() { run "$@"; }
  echo "ok   GNU: 이 PC 가 GNU 라 실제 stat·date 로 시험한다"; pass=$((pass+1))
else
  gnu() { PATH="$tmp/gnubin:$PATH" run "$@"; }
  eq "GNU: 흉내 stat 의 -f 함정(대안으로 못 넘어감)이 실제로 재현된다" "$("$tmp/gnubin/stat" -f %m "$f"; echo "rc=$?")" "$(printf '?\nrc=0')"
fi
eq "GNU: 판별" "$(gnu 'echo $COMPAT_GNU')" 1
mt="$(gnu "compat_stat_mtime '$f'")"
d=$(( now - mt )); [ "$d" -ge 7195 ] && [ "$d" -le 7260 ] && chk ok "GNU: mtime 이 숫자로 나온다(? 아님)" || chk fail "GNU: mtime" "[$mt]"
eq "GNU: 권한" "$(gnu "compat_stat_mode '$f'")" 640
eq "GNU: stat_info" "$(gnu "compat_stat_info '$f'" | awk '{ print $2 }')" 640
eq "GNU: epoch 형식(UTC)" "$(gnu "compat_epoch_fmt 86400 %Y-%m-%dT%H:%M:%S -u")" "1970-01-02T00:00:00"
gnu "compat_touch_ago 3600 '$f'"
mt="$(gnu "compat_stat_mtime '$f'")"; d=$(( now - mt ))
[ "$d" -ge 3595 ] && [ "$d" -le 3660 ] && chk ok "GNU: touch_ago" || chk fail "GNU: touch_ago" "차이 ${d}초"
eq "강제 BSD 로 덮어쓰면 판별이 바뀐다" "$(COMPAT_FORCE_USERLAND=bsd gnu 'echo $COMPAT_GNU')" 0

# ---- 3) Git Bash 경로 강제: ps -o 가 없는 ps + 가짜 /proc ------------------------------------------------------------
mkdir -p "$tmp/winbin"
printf '#!/bin/sh\necho "ps: illegal option -- o" >&2\nexit 1\n' > "$tmp/winbin/ps"; chmod +x "$tmp/winbin/ps"
P="$tmp/proc"
mkproc() {  # <pid> <ppid> <인자…> — /proc/<pid>/ppid·cmdline(NUL 구분)
  local pid="$1" pp="$2"; shift 2
  mkdir -p "$P/$pid"; printf '%s\n' "$pp" > "$P/$pid/ppid"; printf '%s\0' "$@" > "$P/$pid/cmdline"
}
mkproc 100 1 init; mkproc 200 100 bash -c "echo hi"; mkproc 300 200 sleep 99; mkproc 400 100 node server.js
mkdir -p "$tmp/wd"; ln -s "$tmp/wd" "$P/200/cwd"
mkdir -p "$P/self"; ln -s "$tmp" "$P/self/cwd"   # 숫자가 아닌 이름은 건너뛴다(self/cwd 는 /proc 이 있다는 표지로도 쓴다)
win() { PATH="$tmp/winbin:$PATH" COMPAT_FORCE_OS=windows COMPAT_PROC_ROOT="$P" run "$@"; }
eq "Win: 후손 순서(깊은 쪽부터)" "$(win 'compat_descendants 100' | tr '\n' ' ')" "300 200 400 "
eq "Win: ps 표는 /proc 에서(ps 를 부르지 않는다)" "$(win 'compat_ps_table' | grep -c .)" 4
eq "Win: ps 표의 args 는 한 줄" "$(win 'compat_ps_table' | grep '^200 ')" "200 100 bash -c echo hi"
eq "Win: pgrep_f" "$(win "compat_pgrep_f 'node server'" | tr '\n' ' ')" "400 "
eq "Win: cwd 는 /proc/<pid>/cwd" "$(win 'compat_pid_cwd 200')" "$tmp/wd"
eq "Win: cwd 없는 pid 는 빈 출력" "$(win 'compat_pid_cwd 400' | grep -c .)" 0
eq "Win: ps_pidargs 는 ppid 를 뺀다" "$(win 'compat_ps_pidargs' | grep '^200 ')" "200 bash -c echo hi"
eq "Win: proc_cwds 는 /proc 에서(lsof 없이)" "$(win 'compat_proc_cwds 200,400')" "$(printf '200\t%s' "$tmp/wd")"
mkdir -p "$tmp/cyg"; printf '#!/bin/sh\n[ "$1" = -u ] && printf "%%s" "$2" | sed "s|^\\([A-Za-z]\\):|/\\1|" | tr A-Z a-z | sed "s|^/\\(.\\)|/\\1|"\n' > "$tmp/cyg/cygpath"; chmod +x "$tmp/cyg/cygpath"
eq "Win: posix_path 는 cygpath 로 C:/x 를 /c/x 꼴로" "$(PATH="$tmp/cyg:$PATH" COMPAT_FORCE_OS=windows run 'compat_posix_path C:/Users/x/wt')" "/c/users/x/wt"
eq "Unix: posix_path 는 그대로" "$(PATH="$tmp/cyg:$PATH" COMPAT_FORCE_OS=unix run 'compat_posix_path C:/Users/x/wt')" "C:/Users/x/wt"
eq "Win: coord_path_in_wt 가 두 꼴을 같게 본다" "$(PATH="$tmp/cyg:$PATH" COMPAT_FORCE_OS=windows COORD_REPO="$tmp" bash -c '. "$1/lib/common.sh"; coord_path_in_wt /c/users/x/wt/sub C:/Users/x/wt && echo in || echo out' _ "$here/../scripts")" in
eq "Win: 후손 없는 pid" "$(win 'compat_descendants 300' | grep -c .)" 0

# 여러 줄 인자·끝 줄바꿈 없는 ppid·숫자가 아닌 첫 낱말(과거 결함: 둘째 줄의 `-1` 이 pid 로 읽혀 kill -TERM -1 이 될 수 있었다)
mkproc 500 100 bash -c $'echo a\n5 MARK_X\n-1 MARK_X'
mkdir -p "$P/600"; printf '100' > "$P/600/ppid"; printf '%s\0' sleep MARK_Y > "$P/600/cmdline"
eq "Win: 인자 속 줄바꿈이 있어도 표는 한 프로세스 한 줄" "$(win 'compat_ps_table' | grep -c '^500 ')" 1
eq "Win: pgrep_f 는 진짜 pid 만(5·-1 같은 가짜가 없다)" "$(win "compat_pgrep_f MARK_X" | tr '\n' ' ')" "500 "
eq "Win: 끝 줄바꿈이 없는 ppid 도 읽는다" "$(win "compat_pgrep_f MARK_Y" | tr '\n' ' ')" "600 "
eq "Win: descendants 에 600 포함(끝 줄바꿈 없는 ppid)" "$(win 'compat_descendants 100' | grep -c '^600$')" 1
eq "신호 가드: 0·1·-1·빈 값은 거른다" "$(run 'for x in 0 1 -1 "" abc 2 4242; do _compat_pid_ok "$x" && printf "%s " "$x"; done')" "2 4242 "

# ---- 동봉 jq(_shared/bin) — 윈도우에서만 PATH 앞에 둔다 -------------------------------------------------------------
SBIN="$(cd "$here/../../_shared/bin" && pwd)"
eq "Win: PATH 맨 앞이 _shared/bin" "$(COMPAT_FORCE_OS=windows run 'echo "${PATH%%:*}"')" "$SBIN"
eq "Win: jq 는 동봉 래퍼를 먼저 찾는다" "$(COMPAT_FORCE_OS=windows run 'command -v jq')" "$SBIN/jq"
eq "Win: 이미 PATH 에 있으면 두 번 넣지 않는다" "$(PATH="$SBIN:$PATH" COMPAT_FORCE_OS=windows run 'echo "$PATH" | tr ":" "\n" | grep -cxF "'"$SBIN"'"')" 1
case "$(COMPAT_FORCE_OS=unix run 'echo "${PATH%%:*}"')" in "$SBIN") chk fail "Unix: PATH 를 건드리지 않는다" ;; *) chk ok "Unix: PATH 를 건드리지 않는다" ;; esac
eq "래퍼: SKILLS_JQ_EXE 의 jq 를 -b 로 실행한다" "$(echo '{"a":[1,2]}' | SKILLS_JQ_EXE="$(command -v jq)" "$SBIN/jq" -c '.a')" "[1,2]"
eq "래퍼: 실행 파일이 없으면 rc 127" "$(SKILLS_JQ_EXE="$tmp/없는-jq" "$SBIN/jq" . </dev/null >/dev/null 2>&1; echo $?)" 127
eq "jq.exe 는 줄끝 변환 없이 보존된다(SHA-256)" "$(compat_sha256 < "$SBIN/jq.exe")" 7451fbbf37feffb9bf262bd97c54f0da558c63f0748e64152dd87b0a07b6d6ab

echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
