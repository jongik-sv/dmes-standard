#!/usr/bin/env bash
# lib/compat.sh(macOS·Git Bash 차이를 모은 공용 함수)를 시험한다.
#   1) 이 PC 의 기본 경로(macOS 면 BSD)  2) GNU 경로 강제(PATH 앞에 GNU 흉내 stat·date, 실제 `stat -f` 함정 재현)
#   3) Git Bash 경로 강제(ps -o 가 없는 ps + 가짜 /proc 트리)
# 사용법: bash tests/compat.sh   (네트워크·터미널·실제 D'Flow 를 쓰지 않는다. 임시 폴더만 쓴다)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
LIB="$(cd "$here/../scripts/lib" && pwd)/compat.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/compat-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
BG=""
cleanup() { local p; for p in $BG; do kill "$p" 2>/dev/null; done; pkill -f "$tmp/" 2>/dev/null; rm -rf "$tmp"; }
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
eq "후손: 자기 자신은 빼고 서브셸 밑 손자가 서브셸보다 앞" "$(run "compat_descendants $TREE" | awk -v t="$TREE" '$1 == t { bad = 1 } END { print bad + 0 }')" 0
eq "pgrep_f: sleep 62 를 찾는다" "$(run "compat_pgrep_f '^sleep 62\$'" | grep -c .)" 1
run "compat_kill_tree $TREE"
{ wait "$TREE"; } 2>/dev/null
eq "kill_tree: 후손이 모두 사라진다" "$(run "compat_pgrep_f '^sleep 6[12]\$'" | grep -c .)" 0
eq "pid_alive: 죽은 pid" "$(run "compat_pid_alive $TREE && echo y || echo n")" n
eq "pid_alive: 자기 셸" "$(run 'compat_pid_alive $$ && echo y || echo n')" y
eq "pid_cwd: 자기 셸 작업 폴더" "$(cd "$tmp" && run 'compat_pid_cwd $$')" "$tmp"
bash -c 'sleep 63' "$tmp/pk" & BG="$BG $!"; sleep 0.3
run "compat_pkill_f '^sleep 63\$'"; sleep 0.3
eq "pkill_f: sleep 63 종료" "$(run "compat_pgrep_f '^sleep 63\$'" | grep -c .)" 0

# ---- 2) GNU 경로 강제 ---------------------------------------------------------------------------------------------
# GNU 의 `stat -f` 는 파일시스템 모드: `stat -f %m 파일` 이 `?` 와 rc 0 을 낸다(BSD 먼저 시도하는 || 사슬이 대안으로 못 넘어가는 이유)
mkdir -p "$tmp/gnubin"
cat > "$tmp/gnubin/stat" <<'EOF'
#!/bin/sh
case "$1" in
  -c) case "$2" in %Y) exec /usr/bin/stat -f %m "$3" ;; %a) exec /usr/bin/stat -f %Lp "$3" ;; esac ;;
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
gnu() { PATH="$tmp/gnubin:$PATH" run "$@"; }
eq "GNU: 흉내 stat 의 -f 함정(대안으로 못 넘어감)이 실제로 재현된다" "$("$tmp/gnubin/stat" -f %m "$f"; echo "rc=$?")" "$(printf '?\nrc=0')"
eq "GNU: 판별" "$(gnu 'echo $COMPAT_GNU')" 1
mt="$(gnu "compat_stat_mtime '$f'")"
d=$(( now - mt )); [ "$d" -ge 7195 ] && [ "$d" -le 7260 ] && chk ok "GNU: mtime 이 숫자로 나온다(? 아님)" || chk fail "GNU: mtime" "[$mt]"
eq "GNU: 권한" "$(gnu "compat_stat_mode '$f'")" 640
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
mkdir -p "$P/self"   # 숫자가 아닌 이름은 건너뛴다
win() { PATH="$tmp/winbin:$PATH" COMPAT_FORCE_OS=windows COMPAT_PROC_ROOT="$P" run "$@"; }
eq "Win: 후손 순서(깊은 쪽부터)" "$(win 'compat_descendants 100' | tr '\n' ' ')" "300 200 400 "
eq "Win: ps 표는 /proc 에서(ps 를 부르지 않는다)" "$(win 'compat_ps_table' | grep -c .)" 4
eq "Win: ps 표의 args 는 한 줄" "$(win 'compat_ps_table' | grep '^200 ')" "200 100 bash -c echo hi"
eq "Win: pgrep_f" "$(win "compat_pgrep_f 'node server'" | tr '\n' ' ')" "400 "
eq "Win: cwd 는 /proc/<pid>/cwd" "$(win 'compat_pid_cwd 200')" "$tmp/wd"
eq "Win: cwd 없는 pid 는 빈 출력" "$(win 'compat_pid_cwd 400' | grep -c .)" 0
eq "Win: 후손 없는 pid" "$(win 'compat_descendants 300' | grep -c .)" 0

echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
