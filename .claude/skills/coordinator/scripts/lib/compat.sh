#!/usr/bin/env bash
# 플랫폼 차이(macOS·Linux·Git Bash(MSYS2))를 한 곳에 모은 함수. source 로만 쓴다.
# 지원 환경: macOS · Git for Windows 의 Git Bash. perl·pgrep·pkill·lsof·BSD 전용 옵션을 스크립트에서 직접 부르지 않고 여기를 거친다.
#
#   COMPAT_WIN                      1 이면 Git Bash(MSYS·Cygwin). 시험은 COMPAT_FORCE_OS=windows|unix 로 덮어쓴다
#   COMPAT_GNU                      1 이면 GNU coreutils(stat -c · date -d). 시험은 COMPAT_FORCE_USERLAND=gnu|bsd 로 덮어쓴다
#   COMPAT_PROC_ROOT                /proc 위치(시험용으로 가짜 트리를 가리킬 수 있다)
#   compat_stat_mtime <파일>        mtime(epoch 초)
#   compat_stat_mode <파일>         8진수 권한(600)
#   compat_epoch_fmt <epoch> <형식> [-u]   epoch → 날짜 글(BSD date -r · GNU date -d @)
#   compat_touch_ago <초> <파일>    mtime 을 <초> 전으로(시험용, touch -t 는 BSD·GNU 공통)
#   compat_ps_table                 한 줄에 `pid ppid args`(args 는 한 줄로 이어 붙임)
#   compat_ps_pairs                 한 줄에 `pid ppid`(args 를 읽지 않아 가볍다)
#   compat_descendants <pid>        후손 pid(깊은 쪽부터, 자기 자신 제외). pgrep -P 재귀를 프로세스 표 한 번으로 바꾼 것
#   compat_kill_tree <pid>          후손부터 TERM → 0.3초 → 남은 것 KILL
#   compat_pgrep_f <정규식>         args 가 맞는 pid(자기 자신·자기 파이프라인 제외). `pgrep -f` 대용
#   compat_pkill_f <정규식>         위 pid 에 TERM
#   compat_pgrep_s / compat_pkill_s <문자열>   위와 같되 정규식이 아니라 고정 문자열(경로 등)
#   compat_posix_path <경로>        Git Bash 에서 C:/x 를 /c/x 꼴로(cygpath), 그 밖에는 그대로
#   compat_norm_path <경로>         Git Bash 에서 C:\x · C:/x · /cygdrive/c/x → /c/x 꼴·끝 / 제거·전체 소문자(비교용, NTFS 대소문자 무시). 그 밖의 OS 는 그대로
#   compat_native_path <경로>       네이티브 프로그램에 넘길 꼴: Git Bash 에서 /c/x → C:/x(cygpath -m), 그 밖에는 그대로
#   compat_is_abs_path <경로>       절대 경로면 0(윈도우는 C:/x · C:\x · \\서버 포함)
#   orca <…>                        (윈도우만 함수) MSYS2_ARG_CONV_EXCL='*' 를 붙여 orca 에 넘기는 /경로 형 인자의 변환을 막는다
#   compat_pid_cwd <pid>            프로세스 작업 폴더(알 수 없으면 빈 출력)
#   compat_pid_alive <pid>          살아 있으면 0(Git Bash 는 네이티브 Windows pid 라 ps -W 로 한 번 더 본다)
#   compat_sha256                   표준입력 → 소문자 hex 64자 한 줄(openssl → sha256sum → shasum → node)
# compat_pgrep_f 주의: 호출한 셸($$)만 뺀다. `$(…)`·파이프라인 서브셸은 호출 셸과 명령줄이 같아, 호출 셸의 명령줄에 패턴이 들어 있으면
#   그 일시 pid 도 잡힌다(pgrep -f 는 이런 서브셸을 잡지 않는다). 패턴은 `^sleep 47$` 같은 앵커나 임시 폴더 경로처럼 고유한 것으로 쓴다.
#   pid 는 2 이상의 정수만 신호를 받는다(0·1·-1 은 프로세스 그룹·전체라 거른다).
# 알려진 한계(Git Bash): /proc 에는 MSYS 가 띄운 프로세스만 보인다 — 네이티브 프로세스(node.exe 등)가 CreateProcess 로 띄운 손자는
#   후손 목록·kill_tree 에서 빠져 시간 초과 정리 때 고아로 남을 수 있다.
# 알려진 한계(Git Bash): 프로세스 누적 CPU 시간·시작 시각·1분 부하는 얻을 수 없다(호출한 쪽이 「관측 불가」로 둔다).

[ -z "${_COMPAT_LOADED:-}" ] || return 0
_COMPAT_LOADED=1

case "${COMPAT_FORCE_OS:-}" in
  windows) COMPAT_WIN=1 ;;
  unix) COMPAT_WIN=0 ;;
  *) case "${OSTYPE:-}" in msys*|cygwin*|mingw*) COMPAT_WIN=1 ;; *) COMPAT_WIN=0 ;; esac ;;
esac
# 윈도우(Git Bash)에는 jq 가 없으므로 동봉본(_shared/bin: jq 래퍼 → jq.exe -b)을 PATH 앞에 둔다. macOS·Linux 는 PATH 를 건드리지 않는다.
# 이미 PATH 에 있으면 다시 넣지 않는다. 폴더가 없으면(킷을 _shared 없이 설치한 경우) 아무것도 하지 않는다.
if [ "$COMPAT_WIN" = 1 ]; then
  _compat_here="${BASH_SOURCE[0]%/*}"; [ "$_compat_here" != "${BASH_SOURCE[0]}" ] || _compat_here=.
  _compat_sbin="$(CDPATH= cd -P -- "$_compat_here/../../../_shared/bin" 2>/dev/null && pwd)"
  case ":$PATH:" in *":$_compat_sbin:"*) ;; *) [ -z "$_compat_sbin" ] || PATH="$_compat_sbin:$PATH" ;; esac
  unset _compat_here _compat_sbin
fi
# GNU 판별은 stat -c 가 되는지 한 번만 본다(BSD stat 은 `illegal option` 으로 rc 1). GNU 의 `stat -f` 는 파일시스템 모드라
# `stat -f %m 파일` 이 `?` 를 내고 rc 0 으로 끝나므로, BSD 형을 먼저 시도하는 `||` 사슬은 GNU 에서 대안으로 넘어가지 못한다.
case "${COMPAT_FORCE_USERLAND:-}" in
  gnu) COMPAT_GNU=1 ;;
  bsd) COMPAT_GNU=0 ;;
  *)
    # 프로세스를 새로 띄우지 않는 판별: macOS 기본 stat 은 /usr/bin/stat(BSD), 그 밖의 OS(Linux·Git Bash)는 GNU.
    # macOS 에서 PATH 앞에 GNU coreutils(gnubin)가 있으면 /usr/bin/stat 이 아니므로 stat -c 로 한 번 시험한다.
    case "${OSTYPE:-}" in
      darwin*) if [ "$(command -v stat)" = /usr/bin/stat ]; then COMPAT_GNU=0; elif stat -c %Y / >/dev/null 2>&1; then COMPAT_GNU=1; else COMPAT_GNU=0; fi ;;
      *) COMPAT_GNU=1 ;;
    esac ;;
esac

compat_stat_mtime() {
  if [ "$COMPAT_GNU" = 1 ]; then stat -c %Y "$1" 2>/dev/null; else stat -f %m "$1" 2>/dev/null; fi
}
compat_stat_mode() {
  if [ "$COMPAT_GNU" = 1 ]; then stat -c %a "$1" 2>/dev/null; else stat -f %Lp "$1" 2>/dev/null; fi
}

compat_stat_info() {  # <파일> → `<소유 uid> <8진 권한> <mtime> <크기>` 한 줄(못 읽으면 rc 1)
  local o
  if [ "$COMPAT_GNU" = 1 ]; then o="$(stat -c '%u %a %Y %s' "$1" 2>/dev/null)"; else o="$(stat -f '%u %Lp %m %z' "$1" 2>/dev/null)"; fi
  case "$o" in *[!0-9\ ]*|'') return 1 ;; esac
  printf '%s' "$o"
}

compat_epoch_fmt() {  # <epoch> <형식(+ 없이)> [-u]
  local e="$1" f="$2" u=""
  [ "${3:-}" = -u ] && u="-u"
  if [ "$COMPAT_GNU" = 1 ]; then date $u -d "@$e" "+$f" 2>/dev/null; else date $u -r "$e" "+$f" 2>/dev/null; fi
}
compat_touch_ago() {  # <초> <파일>
  # 형식화와 touch 를 같은 시간대(UTC)로 맞춘다(서머타임 겹침 구간에서 1시간 어긋나지 않게)
  local t; t="$(TZ=UTC compat_epoch_fmt $(( $(date +%s) - $1 )) %Y%m%d%H%M.%S)" || return 1
  [ -n "$t" ] && TZ=UTC touch -t "$t" "$2"
}

# ---- 프로세스 -----------------------------------------------------------------------------------------------------
# Git Bash 의 ps 는 Cygwin 판이라 -o·-x 를 모른다. 대신 /proc/<pid>/ppid·cmdline 을 bash 내장만으로 읽는다(fork 0).
_compat_proc_scan() {  # <1=args 포함 | 0=pid ppid 만>
  local root="${COMPAT_PROC_ROOT:-/proc}" d p pp a w
  for d in "$root"/[0-9]*; do
    p="${d##*/}"; pp=""
    { IFS= read -r pp < "$d/ppid" || [ -n "$pp" ]; } 2>/dev/null || continue   # 끝 줄바꿈이 없어도 값을 읽는다
    case "$pp" in ''|*[!0-9]*) continue ;; esac
    if [ "$1" = 1 ]; then
      a=""
      # 인자 속 줄바꿈은 공백으로 바꾼다 — 한 프로세스가 표에서 여러 줄로 갈라지면 둘째 줄의 첫 낱말이 pid 로 읽힌다
      while IFS= read -r -d '' w || [ -n "$w" ]; do a="$a ${w//$'\n'/ }"; done < "$d/cmdline" 2>/dev/null
      printf '%s %s%s\n' "$p" "$pp" "$a"
    else
      printf '%s %s\n' "$p" "$pp"
    fi
  done
}
compat_ps_table() {
  if [ "$COMPAT_WIN" = 1 ]; then _compat_proc_scan 1; else ps -axo pid=,ppid=,args= 2>/dev/null; fi
}
compat_ps_pairs() {
  if [ "$COMPAT_WIN" = 1 ]; then _compat_proc_scan 0; else ps -axo pid=,ppid= 2>/dev/null; fi
}

compat_ps_pidargs() {  # 한 줄에 `pid args`(ppid 없음)
  if [ "$COMPAT_WIN" = 1 ]; then _compat_proc_scan 1 | sed -E 's/^([0-9]+) [0-9]+/\1/'; else ps -axo pid=,args= 2>/dev/null; fi
}

compat_proc_cwds() {  # pid 콤마 목록 → 한 줄에 `<pid>\t<cwd>`(lsof 가 있으면 한 번에, 없으면 /proc)
  local root="${COMPAT_PROC_ROOT:-/proc}" p c
  [ -n "${1:-}" ] || return 0
  if [ ! -e "$root/self/cwd" ] && command -v lsof >/dev/null 2>&1; then
    lsof -a -d cwd -p "$1" -Fpn 2>/dev/null | awk '/^p/ { p = substr($0, 2) } /^n/ { print p "\t" substr($0, 2) }'
    return 0
  fi
  local IFS=,
  for p in $1; do c="$(compat_pid_cwd "$p")"; [ -z "$c" ] || printf '%s\t%s\n' "$p" "$c"; done
  return 0
}

# 프로세스 그룹(시험 정리용): 그룹 전체에 KILL·생존 확인. `kill -- -<pgid>` 는 macOS·Git Bash 모두 내장이다.
compat_kill_pgroup() { _compat_pid_ok "${1:-}" && kill -KILL -- "-$1" 2>/dev/null; return 0; }
# 주의(Git Bash): 네이티브 Windows pid 가 리더인 그룹(node detached 등)은 MSYS 의 kill 이 알지 못해 늘 「없음」으로 나온다 — MSYS 가 만든 그룹에만 유효하다.
compat_pgroup_alive() { _compat_pid_ok "${1:-}" && kill -0 -- "-$1" 2>/dev/null; }

compat_descendants() {  # 깊은 쪽부터(후위 순회) — 부모를 죽여도 자식을 잃지 않게 후손부터 보낼 수 있다
  [ -n "${1:-}" ] || return 0
  compat_ps_pairs | awk -v root="$1" '
    { kids[$2] = kids[$2] " " $1 }
    function walk(p,   n, a, i) {
      n = split(kids[p], a, " ")
      for (i = 1; i <= n; i++) { walk(a[i]); print a[i] }
    }
    END { walk(root) }'
}
# 신호를 보내도 되는 pid 인가(2 이상의 정수만 — 0·1·-1 은 프로세스 그룹·전체에 가므로 절대 보내지 않는다)
_compat_pid_ok() { case "${1:-}" in ''|*[!0-9]*|0|1) return 1 ;; esac; return 0; }
compat_kill_tree() {
  local all p
  all="$(compat_descendants "$1"; echo "$1")"
  for p in $all; do _compat_pid_ok "$p" && kill -TERM "$p" 2>/dev/null; done
  sleep 0.3
  for p in $all; do
    _compat_pid_ok "$p" && kill -0 "$p" 2>/dev/null || continue
    kill -KILL "$p" 2>/dev/null
    # MSYS 의 kill 내장은 네이티브 프로세스를 못 끝낼 수 있다 — /usr/bin/kill -f 가 WINPID 로 강제 종료한다
    if [ "$COMPAT_WIN" = 1 ] && kill -0 "$p" 2>/dev/null; then /usr/bin/kill -f "$p" 2>/dev/null; fi
  done
  return 0
}

# 후보 판정 공용 본체: <f=정규식|s=고정 문자열> <패턴>. 호출 셸($$)과 그 셸의 복제(`a | b`·`$(…)` 서브셸은 호출 셸과 명령줄이 같다)는 뺀다 —
# pgrep -f 가 자기 자신·자기 파이프라인을 잡지 않는 것과 같게. 호출 셸의 일반 자식(다른 명령줄)은 그대로 잡힌다.
_compat_pgrep() {
  [ -n "${2:-}" ] || return 0
  # 패턴은 환경 변수로 넘긴다 — awk 의 인자에 두면 awk 자신의 명령줄이 패턴에 맞아 잡힌다.
  compat_ps_table | COMPAT_PAT="$2" COMPAT_MODE="$1" awk -v me="$$" '
    $1 !~ /^[0-9]+$/ { next }
    { a = $0; sub(/^ *[0-9]+ +[0-9]+ */, "", a); pid[NR] = $1; args[NR] = a; if ($1 == me) mine = a }
    END {
      for (i = 1; i <= NR; i++) {
        if (pid[i] == me || (mine != "" && args[i] == mine)) continue
        if (ENVIRON["COMPAT_MODE"] == "s" ? index(args[i], ENVIRON["COMPAT_PAT"]) > 0 : args[i] ~ ENVIRON["COMPAT_PAT"]) print pid[i]
      }
    }'
}
compat_pgrep_f() { _compat_pgrep f "${1:-}"; }
# 고정 문자열 판(정규식 아님): 임시 폴더 경로처럼 공백·`(`·`+` 가 들어 있을 수 있는 값은 이쪽을 쓴다.
compat_pgrep_s() { _compat_pgrep s "${1:-}"; }
compat_pkill_s() {
  local p
  for p in $(compat_pgrep_s "$1"); do _compat_pid_ok "$p" && kill -TERM "$p" 2>/dev/null; done
  return 0
}
compat_pkill_f() {
  local p
  for p in $(compat_pgrep_f "$1"); do _compat_pid_ok "$p" && kill -TERM "$p" 2>/dev/null; done
  return 0
}

# Git Bash 의 경로 꼴 맞춤: C:\x·C:/x → /c/x(cygpath 가 있을 때). 그 밖의 OS·cygpath 없음이면 그대로.
compat_posix_path() {
  local o
  if [ "$COMPAT_WIN" = 1 ] && command -v cygpath >/dev/null 2>&1 && o="$(cygpath -u "$1" 2>/dev/null)" && [ -n "$o" ]; then printf '%s' "$o"; else printf '%s' "$1"; fi
}

# 경로 비교용 정규형. Git Bash 에서 `C:\x`·`C:/x`·`/cygdrive/c/x` 를 모두 `/c/x` 꼴로 맞추고 끝 `/` 를 뗀다.
# 비교용 값이라 경로 전체를 소문자로 맞춘다(NTFS 는 대소문자 무시). 이 값으로 파일을 열지 않는다. 그 밖의 OS 는 입력을 그대로 낸다(macOS 동작 불변).
_COMPAT_BASH4=0; [ "${BASH_VERSINFO[0]:-3}" -ge 4 ] && _COMPAT_BASH4=1   # bash 4+ 는 ${p,,}, 3.2 는 tr
compat_norm_path() {
  local p="$1"
  [ "$COMPAT_WIN" = 1 ] || { printf '%s' "$p"; return 0; }
  p="${p//\\//}"
  case "$p" in
    /cygdrive/[A-Za-z]|/cygdrive/[A-Za-z]/*) p="${p#/cygdrive}" ;;
    [A-Za-z]:|[A-Za-z]:/*) p="/${p%%:*}${p#?:}" ;;
  esac
  # NTFS 는 대소문자를 가리지 않으므로 비교용으로 전체를 소문자로 맞춘다(bash 4+ 는 `${p,,}`, 3.2 는 tr). 이 값으로 파일을 열지 않는다.
  if [ "$_COMPAT_BASH4" = 1 ]; then eval 'p=${p,,}'; else p="$(printf '%s' "$p" | tr '[:upper:]' '[:lower:]')"; fi
  while [ "${#p}" -gt 1 ] && [ "${p%/}" != "$p" ]; do p="${p%/}"; done
  printf '%s' "$p"
}
# 네이티브 프로그램(orca 등)에 넘길 경로: Git Bash 에서 /c/x → C:/x(cygpath -m). cygpath 가 없거나 그 밖의 OS 는 그대로.
compat_native_path() {
  local o
  if [ "$COMPAT_WIN" = 1 ] && command -v cygpath >/dev/null 2>&1 && o="$(cygpath -m "$1" 2>/dev/null)" && [ -n "$o" ]; then printf '%s' "$o"; else printf '%s' "$1"; fi
}
# 절대 경로인가(0). POSIX `/x` 는 어디서나, 윈도우에서는 `C:/x`·`C:\x`·`\\서버\공유` 도 절대 경로다.
compat_is_abs_path() {
  case "${1:-}" in
    /*) return 0 ;;
    [A-Za-z]:[/\\]*|\\\\*) [ "$COMPAT_WIN" = 1 ] ;;
    *) return 1 ;;
  esac
}
# 윈도우의 orca 는 네이티브 exe 라 MSYS 가 `/compact …` 같은 인자를 C:/Program Files/Git/compact 로 바꾼다 — orca 호출에서만 변환을 끈다.
# (전체에 걸면 node.exe 에 넘기는 /c/x 경로가 깨진다.) macOS·Linux 에서는 함수를 만들지 않는다.
if [ "$COMPAT_WIN" = 1 ]; then orca() { MSYS2_ARG_CONV_EXCL='*' command orca "$@"; }; fi

compat_pid_cwd() {
  local root="${COMPAT_PROC_ROOT:-/proc}" c=""
  [ -n "${1:-}" ] || return 0
  if [ -e "$root/$1/cwd" ] || [ -L "$root/$1/cwd" ]; then
    c="$(readlink "$root/$1/cwd" 2>/dev/null)"
  elif command -v lsof >/dev/null 2>&1; then
    c="$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  fi
  [ -z "$c" ] || printf '%s\n' "$c"
  return 0
}

compat_pid_alive() {
  [ -n "${1:-}" ] && [ "$1" != 0 ] && [ "$1" != null ] || return 1
  kill -0 "$1" 2>/dev/null && return 0
  [ "$COMPAT_WIN" = 1 ] || return 1
  ps -W 2>/dev/null | awk -v pid="$1" '
    NR==1 { for (i=1;i<=NF;i++) if ($i=="WINPID") c=i; next }
    c && $c==pid { found=1 }
    END { exit !found }'
}

# ---- 해시 ---------------------------------------------------------------------------------------------------------
# openssl 우선(shasum 은 perl 이라 호출당 5배쯤 든다) → sha256sum(GNU·Git Bash) → shasum(macOS) → node(드문 경로).
compat_sha256() {
  local h
  if command -v openssl >/dev/null 2>&1; then h="$(openssl dgst -sha256 -r 2>/dev/null)" || return 1
  elif command -v sha256sum >/dev/null 2>&1; then h="$(sha256sum 2>/dev/null)" || return 1
  elif command -v shasum >/dev/null 2>&1; then h="$(shasum -a 256 2>/dev/null)" || return 1
  elif command -v node >/dev/null 2>&1; then
    h="$(node -e 'const c=require("crypto").createHash("sha256");process.stdin.on("data",d=>c.update(d)).on("end",()=>console.log(c.digest("hex")))' 2>/dev/null)" || return 1
  else return 1
  fi
  h="${h%% *}"
  case "$h" in ''|*[!0-9a-f]*) return 1 ;; esac
  printf '%s\n' "$h"
}
