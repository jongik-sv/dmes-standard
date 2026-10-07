#!/usr/bin/env bash
# 윈도우(Git Bash) 보강 항목의 시험: screen-cache 모드 검사 건너뜀 · auto-answer 거부 정규식 · coord-state 의 mv 재시도.
# COMPAT_FORCE_OS=windows|unix 로 OS 를 흉내 낸다(실제 윈도우가 아니어도 돈다). 임시 폴더만 쓴다.
# 사용법: bash tests/windows-c1.sh   (실패가 있으면 종료 코드 1)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
SD="$(cd "$here/../scripts" && pwd)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/windows-c1-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0; pass=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

# ---- 1) screen-cache: 윈도우는 권한 700/600·소유 검사를 건너뛴다 -----------------------------------------------------
# 폴더 755·파일 644 는 NTFS 에서 흔한 값이다. unix 흉내에서는 믿지 않고(기존 동작), windows 흉내에서는 믿는다.
mkdir -p "$tmp/c/screen"; chmod 755 "$tmp/c/screen"; : > "$tmp/c/screen/h.json"; chmod 644 "$tmp/c/screen/h.json"
trusted() {  # <os> <파일>
  COMPAT_FORCE_OS="$1" DFLOW_CONSOLE_DIR="$tmp/c" HOME="$tmp" COORD_REPO="$tmp" bash -c '. "$1/lib/common.sh"; . "$1/lib/screen-cache.sh"; _sc_trusted "$2" && echo trusted || echo untrusted' _ "$SD" "$2"
}
eq "screen-cache unix: 755/644 는 믿지 않는다(기존 동작)" "$(trusted unix "$tmp/c/screen/h.json")" untrusted
eq "screen-cache win: 755/644 도 믿는다(모드 검사 건너뜀)" "$(trusted windows "$tmp/c/screen/h.json")" trusted
chmod 700 "$tmp/c/screen"; chmod 600 "$tmp/c/screen/h.json"
eq "screen-cache unix: 700/600 은 믿는다" "$(trusted unix "$tmp/c/screen/h.json")" trusted
ln -s "$tmp/c/screen/h.json" "$tmp/c/screen/link.json"
eq "screen-cache win: 심볼릭 링크는 여전히 믿지 않는다" "$(trusted windows "$tmp/c/screen/link.json")" untrusted
eq "screen-cache win: 없는 파일은 믿지 않는다" "$(trusted windows "$tmp/c/screen/none.json")" untrusted

# ---- 2) auto-answer 거부 정규식(셸 명령 권한 창) — 윈도우 삭제·종료 명령 ---------------------------------------------------
re="$(grep -o "grep -qiE '[^']*'" "$SD/auto-answer.sh" | head -1 | sed "s/^grep -qiE '//; s/'\$//")"
[ -n "$re" ] || chk fail "auto-answer 거부 정규식을 찾지 못했다"
denies() { if printf '%s' "$1" | grep -qiE "$re"; then echo deny; else echo pass; fi; }
for c in "del foo.txt" "del /q /s build" "rd /s /q node_modules" "Remove-Item -Recurse x" "taskkill /F /PID 4" "Stop-Process -Id 3" "rm -rf x"; do
  eq "거부: $c" "$(denies "$c")" deny
done
for c in "git status" "cat model.txt" "ls -la" "node build.js" "echo medal" "pnpm test"; do
  eq "통과: $c" "$(denies "$c")" pass
done

# ---- 3) coord-state: mv 재시도(_atomic_mv) ---------------------------------------------------------------------------
# coord-state.sh 는 source 할 수 없어 함수 본문만 떼어 시험한다. 가짜 mv 는 앞 N번 실패한다(윈도우 파일 잠금 흉내).
fn="$(awk '/^_atomic_mv\(\) \{/,/^\}/' "$SD/coord-state.sh")"
[ -n "$fn" ] || chk fail "_atomic_mv 함수를 찾지 못했다"
mkdir -p "$tmp/mv"
t() {  # <처음 실패할 횟수> → rc 와 대상 내용
  local n="$1"; rm -f "$tmp/mv/cnt" "$tmp/mv/dst"; printf 'new' > "$tmp/mv/src"
  bash -c '
    mv() { local c; c="$(cat "'"$tmp"'/mv/cnt" 2>/dev/null || echo 0)"; c=$((c+1)); echo "$c" > "'"$tmp"'/mv/cnt"
           if [ "$c" -le "'"$n"'" ]; then return 1; fi; command mv "$@"; }
    '"$fn"'
    _atomic_mv "'"$tmp"'/mv/src" "'"$tmp"'/mv/dst"; echo "rc=$? dst=$(cat "'"$tmp"'/mv/dst" 2>/dev/null)"'
}
eq "mv 재시도: 첫 시도 성공" "$(t 0)" "rc=0 dst=new"
eq "mv 재시도: 두 번 실패 뒤 성공" "$(t 2)" "rc=0 dst=new"
eq "mv 재시도: 네 번 실패 뒤 성공(다섯 번째)" "$(t 4)" "rc=0 dst=new"
eq "mv 재시도: 계속 실패하면 rc 1(마지막 시도까지 6번)" "$(t 99 | sed 's/ dst=.*//')" "rc=1"

# ---- 4) spawn-lane --dry-run: 윈도우는 탭 명령을 bash -lc 로 감싼다 · orca 에 MSYS 인자 변환 방지 ---------------------------------
mkdir -p "$tmp/fb"; top="$(cd "$here" && { /usr/bin/git rev-parse --show-toplevel 2>/dev/null || git rev-parse --show-toplevel; })"
printf '#!/bin/sh\ncase "$1 $2" in "worktree list") printf %%s %s ;; *) echo "{\\"ok\\":false}" ;; esac\n' "'{\"ok\":true,\"result\":{\"worktrees\":[{\"path\":\"$top\"}]}}'" > "$tmp/fb/orca"; chmod +x "$tmp/fb/orca"
sp() { (cd "$here" && PATH="$tmp/fb:$PATH" SKILLS_JQ_EXE="$(command -v jq)" COMPAT_FORCE_OS="$1" bash "$SD/spawn-lane.sh" --name t1 --kind claude --dry-run --worktree "$top" 2>&1 | grep 'DRY term_send'); }
eq "spawn-lane unix: 탭 명령은 cd … && … 그대로" "$(sp unix | sed "s/^DRY term_send <h> //; s/ --enter.*//")" "'cd $top && claude --dangerously-skip-permissions -n t1'"
case "$(sp windows)" in "DRY term_send <h> 'bash -lc '\\''cd $top && claude "*) chk ok "spawn-lane win: bash -lc '…' 로 감싼다" ;; *) chk fail "spawn-lane win: bash -lc 로 감싼다" "[$(sp windows)]" ;; esac
eq "spawn-lane unix: C:/x 는 절대 경로가 아니라 rc 2" "$(cd "$here" && PATH="$tmp/fb:$PATH" SKILLS_JQ_EXE="$(command -v jq)" COMPAT_FORCE_OS=unix bash "$SD/spawn-lane.sh" --name t1 --kind claude --dry-run --worktree C:/x >/dev/null 2>&1; echo $?)" 2

# ---- 5) coord-status: UNLINKED 경로 판정(C:\ ↔ C:/ ↔ /c/) · load 관측 불가는 `-` ------------------------------------------------
mkdir -p "$tmp/st/repo" "$tmp/st/sess" "$tmp/st/home" "$tmp/nosys"
printf '#!/bin/sh\nexit 1\n' > "$tmp/nosys/sysctl"; chmod +x "$tmp/nosys/sysctl"
printf '#!/bin/sh\nif [ "$3 $4" = "worktree list" ]; then echo "worktree C:/fake/repo"; exit 0; fi\nexec /usr/bin/git "$@"\n' > "$tmp/st/git"; chmod +x "$tmp/st/git"
jq -n --arg st "$tmp/st/state" --arg sd "$tmp/st/sess" --arg g "$tmp/st/git" '{state_dir:$st, sessions_dir:$sd, git_bin:$g, office:{enabled:false}}' > "$tmp/st/repo/.coord.local.json"
sleep 300 & STRAY=$!   # 조정자·레인이 아닌 살아 있는 세션 흉내(끝날 때 거둔다)
trap 'kill "$STRAY" 2>/dev/null; rm -rf "$tmp"' EXIT
jq -n --argjson p "$STRAY" '{kind:"interactive", pid:$p, sessionId:"zz-stray", cwd:"C:\\fake\\repo\\sub", name:"stray"}' > "$tmp/st/sess/$STRAY.json"
stat_out() {  # <os> [PATH 앞붙임]
  (cd "$tmp/st/repo" && env -u COORD_RUN -u COORD_SESSION_ID COORD_REPO="$tmp/st/repo" HOME="$tmp/st/home" COORD_CONSOLE_POLL=0 CLAUDE_PID=$$ COORD_SESSION_ID=s-st \
    COMPAT_FORCE_OS="$1" SKILLS_JQ_EXE="$(command -v jq)" PATH="${2:+$2:}$PATH" bash "$SD/coord-state.sh" init st1 --goal x >/dev/null 2>&1
   env COORD_RUN=st1 COORD_REPO="$tmp/st/repo" HOME="$tmp/st/home" COMPAT_FORCE_OS="$1" SKILLS_JQ_EXE="$(command -v jq)" PATH="${2:+$2:}$PATH" bash "$SD/coord-status.sh" 2>/dev/null)
}
w="$(stat_out windows)"; u="$(stat_out unix)"
case "$w" in *"UNLINKED stray pid=$STRAY cwd=C:\\fake\\repo\\sub"*) chk ok "coord-status win: C:\\ cwd 가 C:/ 꼴 워크트리 안이면 UNLINKED" ;; *) chk fail "coord-status win: UNLINKED" "[$w]" ;; esac
case "$u" in *UNLINKED*) chk fail "coord-status unix: C:\\ cwd 는 이 리포 밖(기존 동작)" "[$u]" ;; *) chk ok "coord-status unix: C:\\ cwd 는 UNLINKED 아님" ;; esac
if [ ! -r /proc/loadavg ]; then
  case "$(stat_out unix "$tmp/nosys" | grep '^PC ')" in "PC load1=- cpus="*" per_core=- "*) chk ok "coord-status: load 를 못 얻으면 load1=-·per_core=-" ;; *) chk fail "coord-status: load 관측 불가" "[$(stat_out unix "$tmp/nosys" | grep '^PC ')]" ;; esac
  case "$(stat_out unix | grep '^PC ')" in "PC load1="[0-9]*" cpus="*" per_core="[0-9]*) chk ok "coord-status: load 가 있으면 숫자 그대로" ;; *) chk fail "coord-status: load 숫자" "[$(stat_out unix | grep '^PC ')]" ;; esac
fi

echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
