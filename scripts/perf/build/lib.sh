#!/bin/bash
# 공통 설정: 다른 스크립트가 source 한다. bash 3.2(macOS 기본)에서 돈다. PC 마다 다른 값은 모두 환경 변수다(README.md 참조).
PERF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIT_BIN="${GIT:-/usr/bin/git}"
[ -x "$GIT_BIN" ] || GIT_BIN="$(command -v git)"
# 저장소 루트: 스크립트 위치에서 계산한다(REPO_DIR 로 덮어쓸 수 있다). 측정 워크트리는 기본으로 그 체크아웃의 .claude/worktrees 아래에 만든다(연결 워크트리에서 부르면 그 워크트리 안이 되므로 PERF_WT_ROOT 로 바꿀 수 있다).
REPO_DIR="${REPO_DIR:-$($GIT_BIN -C "$PERF_DIR" rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$REPO_DIR" ] || { echo "[perf] 오류: 저장소 루트를 못 찾음. REPO_DIR 를 지정한다" >&2; exit 1; }
MAIN_REPO="$REPO_DIR"
WT_ROOT="${PERF_WT_ROOT:-$REPO_DIR/.claude/worktrees}"
WT_A="$WT_ROOT/perf-build-a"
WT_B="$WT_ROOT/perf-build-b"
GIT="$GIT_BIN"
# 결과 폴더: 저장소 밖 임시 폴더(절대 경로만. 스크립트가 자기 폴더로 cd 한 뒤 읽으므로 상대 경로는 거부한다).
RESULTS="${PERF_RESULTS:-${TMPDIR:-/tmp}/dmes-perf/build}"
case "$RESULTS" in /*) ;; *) echo "[perf] 오류: PERF_RESULTS 는 절대 경로여야 한다: $RESULTS" >&2; exit 1;; esac
mkdir -p "$RESULTS"

# A = 기준(태그 refactor-2026-10-base), B = 변경. B_REF 를 환경 변수나 run_all.sh 인자로 주지 않으면 저장소 현재 HEAD 다.
A_REF="${A_REF:-refactor-2026-10-base}"
B_REF="${B_REF:-HEAD}"

# 측정용 gradle 환경. gradle 은 늘 이 환경과 --max-workers=2 로 돈다.
# JAVA_HOME 은 호출 환경에서 받는다. 비어 있으면 JDK 21 을 찾아보고, 설정값이든 찾은 값이든 major 가 21 이 아니면 종료한다.
_java_major() { "$1/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1; }
if [ -z "${JAVA_HOME:-}" ]; then
  # java_home -v 21 은 21 이상을 돌려줄 수 있어 결과의 major 를 다시 확인한다.
  for _c in "$(/usr/libexec/java_home -v 21 2>/dev/null)" /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home; do
    [ -n "$_c" ] && [ "$(_java_major "$_c")" = 21 ] && { JAVA_HOME="$_c"; break; }
  done
fi
jmajor="$([ -n "${JAVA_HOME:-}" ] && _java_major "$JAVA_HOME")"
[ "$jmajor" = 21 ] || { echo "[perf] 오류: JDK 21 이 필요하다(JAVA_HOME=${JAVA_HOME:-없음}, major=${jmajor:-없음}). JAVA_HOME 을 JDK 21 로 지정한다" >&2; exit 1; }
export JAVA_HOME
# DFLOW_HEAVY_DIR·DFLOW_HEAVY_SLOTS 는 호출 환경에서 받은 값이 있을 때만 그대로 쓴다(여기서 정하지 않는다).
export DMES_TEST_SLOTS="${DMES_TEST_SLOTS:-0}"

# Gradle 데몬 등록부를 이 측정 전용 사용자 홈으로 분리한다(전역 gradlew --stop 이 다른 레인에 닿지 않게).
# 의존성 캐시(modules-2)와 wrapper 배포본은 기존 ~/.gradle 것을 심볼릭 링크로 읽기 공유한다.
# PERF_GRADLE_HOME=global 이면 분리하지 않는다(P3 는 그러면 실행을 거부한다).
PERF_GRADLE_HOME="${PERF_GRADLE_HOME:-${TMPDIR:-/tmp}/dmes-perf/build-gradle-home}"

# 포트(modules.conf 의 be 모듈). 기준 커밋도 같은 값이다.
BE_PORTS="${BE_PORTS:-8092 8093 8094 8095 8096 8100 8191}"

die() { echo "[perf] 오류: $*" >&2; exit 1; }
log() { echo "[perf $(date '+%H:%M:%S')] $*"; }

now_s()  { perl -MTime::HiRes=time -e 'printf "%.3f", time'; }
now_iso(){ date '+%Y-%m-%dT%H:%M:%S%z'; }
# 1분 load average: sysctl 출력 "{ 1.23 2.34 3.45 }" 의 첫 값
load1()  { sysctl -n vm.loadavg | awk '{print $2}'; }

# 회차 시작 전 load 가 LOAD_MAX(기본 3.0) 이하가 될 때까지 최대 LOAD_WAIT(기본 600)초 기다린다. 그래도 높으면 진행하되 경고를 남긴다(load1 은 CSV 에 기록된다).
wait_quiet() {
  local max="${LOAD_MAX:-3.0}" lim="${LOAD_WAIT:-600}" w=0 l
  while :; do
    l="$(load1)"
    awk -v l="$l" -v m="$max" 'BEGIN{exit !(l<=m)}' && return 0
    [ "$w" -ge "$lim" ] && { echo "[perf] 경고: ${lim}초 기다렸지만 load1=$l > $max. 그대로 진행(이 회차는 load 높음으로 표시)" >&2; return 1; }
    [ "$w" = 0 ] && log "load1=$l > $max, 안정될 때까지 대기(최대 ${lim}s)"
    sleep 15; w=$((w+15))
  done
}

# CSV: round,time,target,mode,metric,value,rc,load1
csv_add() {  # csv_add <파일> <회차> <대상> <모드> <지표> <값> <rc> <load1>
  local f="$1"; shift
  [ -s "$f" ] || echo "round,time,target,mode,metric,value,rc,load1" > "$f"
  echo "$1,$(now_iso),$2,$3,$4,$5,$6,$7" >> "$f"
}

resolve_refs() {
  A_SHA="$($GIT -C "$MAIN_REPO" rev-parse --verify "${A_REF}^{commit}")" || die "A_REF 를 못 찾음: $A_REF"
  B_SHA="$($GIT -C "$MAIN_REPO" rev-parse --verify "${B_REF}^{commit}")" || die "B_REF 를 못 찾음: $B_REF"
  [ "$A_REF" = refactor-2026-10-base ] && case "$A_SHA" in b557ccbd*) ;; *) echo "[perf] 경고: 태그 refactor-2026-10-base 가 b557ccbd 가 아니다($A_SHA)" >&2 ;; esac
  export A_SHA B_SHA
  { echo "A_REF=$A_REF A_SHA=$A_SHA"; echo "B_REF=$B_REF B_SHA=$B_SHA"; echo "host=$(hostname) $(sw_vers -productVersion 2>/dev/null)"; \
    echo "power=$(pmset -g batt 2>/dev/null | head -1)"; echo "lowpowermode=$(pmset -g 2>/dev/null | awk "/lowpowermode/{print \$2}")"; echo "date=$(now_iso)"; } > "$RESULTS/meta.txt"
}

wt_path() { case "$1" in A) echo "$WT_A";; B) echo "$WT_B";; *) die "대상은 A 또는 B: $1";; esac; }
wt_sha()  { case "$1" in A) echo "$A_SHA";; B) echo "$B_SHA";; esac; }

# 안전 장치: 측정용 워크트리 두 곳 밖은 지우거나 건드리지 않는다.
assert_perf_wt() { case "$1" in "$WT_A"|"$WT_B") ;; *) die "측정용 워크트리가 아님: $1";; esac; }

# 만들기 전 존재 확인. 이미 있으면 HEAD 가 같을 때만 재사용한다. --force 는 쓰지 않는다.
wt_ensure() {  # wt_ensure A|B
  local p sha head
  p="$(wt_path "$1")"; sha="$(wt_sha "$1")"
  if [ -e "$p" ]; then
    head="$($GIT -C "$p" rev-parse HEAD 2>/dev/null)" || die "$p 가 있지만 git 워크트리가 아님"
    [ "$head" = "$sha" ] || die "$p 가 다른 커밋($head)에 있음. wt_remove 로 치운 뒤 다시 실행"
    log "워크트리 재사용: $p"; return 0
  fi
  if $GIT -C "$MAIN_REPO" worktree list --porcelain | grep -qx "worktree $p"; then
    die "$p 가 worktree 목록에는 있고 폴더는 없음: git worktree prune 필요(수동)"
  fi
  $GIT -C "$MAIN_REPO" worktree add --detach "$p" "$sha" || die "worktree add 실패: $p"
}

# 제거(force 없음). 실패하면 남은 변경을 알리고 끝낸다.
wt_remove() {  # wt_remove A|B
  local p; p="$(wt_path "$1")"; assert_perf_wt "$p"
  [ -e "$p" ] || return 0
  $GIT -C "$MAIN_REPO" worktree remove "$p" && { log "워크트리 제거: $p"; return 0; }
  echo "[perf] 제거 실패: $p (--force 는 쓰지 않는다). 남은 파일 확인: $GIT -C $p status --ignored --short" >&2
  return 1
}
wt_remove_all() { wt_remove A; wt_remove B; }

# Gradle 사용자 홈 준비
#   인자 없음: 공용 측정 홈(P3: 희생 빌드와 be-run 이 같은 홈을 써야 한다). 인자 A|B: 대상 전용 홈(P1: A 의 전역 --stop 이 B 의 웜 데몬을 죽이지 않게).
gradle_home_prepare() {
  [ "$PERF_GRADLE_HOME" = "global" ] && return 0
  local h="$PERF_GRADLE_HOME"; [ -n "${1:-}" ] && h="$PERF_GRADLE_HOME-$1"
  mkdir -p "$h/caches"
  [ -e "$h/caches/modules-2" ] || ln -s "$HOME/.gradle/caches/modules-2" "$h/caches/modules-2"
  [ -e "$h/wrapper" ] || ln -s "$HOME/.gradle/wrapper" "$h/wrapper"
  if [ -f "$HOME/.gradle/gradle.properties" ] && [ ! -e "$h/gradle.properties" ]; then cp "$HOME/.gradle/gradle.properties" "$h/gradle.properties"; fi
  export GRADLE_USER_HOME="$h"
}

# 워크트리 안에서 쓰는 gradle 환경 옵션(be-run 은 gradle 인자를 못 넘기므로 GRADLE_OPTS 로 전달)
#   모드 cold: 빌드 캐시 끔 + 단발 데몬(새 데몬). warm: 기존 데몬·캐시 설정 그대로.
gradle_opts_for() {  # gradle_opts_for cold|warm
  local o="-Dorg.gradle.workers.max=2"
  [ "$1" = cold ] && o="$o -Dorg.gradle.caching=false -Dorg.gradle.daemon=false"
  echo "$o"
}

# 점유 포트 목록(없으면 빈 출력)
busy_ports() {
  local p out=""
  for p in $BE_PORTS; do
    lsof -nP -tiTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 && out="$out $p"
  done
  echo "$out"
}
# be-run 은 시작할 때 대상 포트를 쥔 프로세스를 TERM·KILL 로 정리한다. 메인 서버가 떠 있으면 죽이므로 먼저 막는다.
preflight_ports() {
  # 다른 체크아웃의 be-run.sh 가 살아 있으면 기준(A)의 종료 정리가 gradlew --stop 을 건너뛰어(other_checkout_be_run_alive) P1·P3 판정이 틀어진다.
  local others; others="$(pgrep -fl 'be-run\.sh' 2>/dev/null | grep -v pgrep)"
  if [ -n "$others" ]; then
    echo "[perf] 다른 be-run.sh 프로세스가 살아 있다. 먼저 정리하거나 조정 세션에 확인:" >&2; echo "$others" >&2; return 3
  fi
  local b; b="$(busy_ports)"
  if [ -n "$b" ]; then
    echo "[perf] 포트 점유 중:$b" >&2
    echo "[perf] 조정 세션에 서버 창 요청 필요: 메인 서버가 내려간 시간에만 P1·P2·P3 를 잴 수 있다(be-run 이 점유 프로세스를 죽인다)." >&2
    return 3
  fi
  return 0
}

# 워크트리 cwd 인 프로세스가 listen 중인 대상 포트만 정리(고아 방지). 남의 프로세스는 건드리지 않는다.
kill_own_listeners() {  # kill_own_listeners <wt>
  local wt="$1" p pid cwd
  for p in $BE_PORTS; do
    for pid in $(lsof -nP -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null); do
      cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
      case "$cwd" in "$wt"|"$wt"/*) kill -TERM "$pid" 2>/dev/null ;; esac
    done
  done
  sleep 2
}

# 워크트리의 git 무시 대상 build/.gradle 폴더(src/backend 아래 깊이 4 이하)만 지운다. 콜드 조건.
clean_cold() {  # clean_cold A|B
  local p d n=0; p="$(wt_path "$1")"; assert_perf_wt "$p"
  [ -d "$p/src/backend" ] || die "src/backend 없음: $p"
  while IFS= read -r d; do
    if $GIT -C "$p" check-ignore -q "$d"; then rm -rf "${p:?}/$d"; n=$((n+1)); else echo "[perf] 무시 대상이 아니라 건너뜀: $d" >&2; fi
  done < <(cd "$p" && find src/backend -maxdepth 4 -type d \( -name build -o -name .gradle \) -prune -print)
  # 검증: 남은 build·.gradle 이 없어야 한다. 2차 뒤 트리는 src/backend/build-logic/{build,.gradle} 도 지워진 상태여야 한다.
  local left; left="$(cd "$p" && find src/backend -maxdepth 6 -type d \( -name build -o -name .gradle \) -prune -print | tr '\n' ' ')"
  [ -n "$left" ] && echo "[perf] 경고: 콜드 정리 뒤에도 남은 폴더(무시 대상이 아니거나 깊이 초과): $left" >&2
  log "콜드 정리($1): build·.gradle $n 곳 삭제"
}

# be-run 시작부터 모든 포트 LISTEN 까지 초를 잰다.
#   be_boot_once <A|B> <cold|warm> <로그파일>  → 전역 BOOT_SECS, BOOT_RC, BOOT_STOP_SECS
#   rc: 0 성공, 124 시간 초과(벽시계 BOOT_TIMEOUT 기본 600초), 5 be-run 조기 종료, 7 모듈 bootRun 조기 종료, 4 종료 뒤 포트 잔존
be_boot_once() {
  local t="$1" mode="$2" logf="$3" wt t0 t1 pid ports_up p waited=0 limit="${BOOT_TIMEOUT:-600}"
  wt="$(wt_path "$t")"; assert_perf_wt "$wt"
  BOOT_SECS=""; BOOT_RC=0; BOOT_STOP_SECS=""
  preflight_ports || { BOOT_RC=3; return 3; }
  gradle_home_prepare "$t"
  t0="$(now_s)"
  # exec 로 서브셸을 be-run 으로 바꿔 $! 가 be-run 의 pid 가 되게 한다(bash 3.2 는 서브셸을 남겨 TERM 이 be-run 에 안 닿는다).
  ( cd "$wt" && GRADLE_OPTS="$(gradle_opts_for "$mode")" exec ./be-run.sh ${BE_ARGS:---all} ) >"$logf" 2>&1 &
  pid=$!
  while :; do
    ports_up=1
    for p in $BE_PORTS; do lsof -nP -tiTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || { ports_up=0; break; }; done
    [ "$ports_up" = 1 ] && { t1="$(now_s)"; break; }
    kill -0 "$pid" 2>/dev/null || { BOOT_RC=5; break; }
    # 모듈 하나라도 bootRun 이 끝나 버리면(기준 A 의 공유 includeBuild 동시 컴파일 충돌 등) 7개가 다 뜰 수 없으므로 기다리지 않고 rc 7 로 끝낸다.
    grep -q '프로세스가 종료됐습니다' "$logf" 2>/dev/null && { BOOT_RC=7; break; }
    # 시간 상한은 벽시계 기준(lsof 7회가 매 반복 시간을 더 쓰므로 sleep 합으로 세면 상한이 늘어진다).
    [ "$(perl -e "print int($(now_s)-$t0)")" -ge "$limit" ] && { BOOT_RC=124; break; }
    sleep "${POLL:-1}"; waited=$((waited+${POLL:-1}))
  done
  [ "$BOOT_RC" = 0 ] && BOOT_SECS="$(perl -e "printf '%.1f', $t1-$t0")"
  # 종료(TERM): be-run 의 trap 이 자기 자식과 이 체크아웃 앱 JVM 을 정리한다.
  local s0 s1; s0="$(now_s)"
  kill -TERM "$pid" 2>/dev/null
  waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 180 ]; do sleep 1; waited=$((waited+1)); done
  kill -0 "$pid" 2>/dev/null && { kill -KILL "$pid" 2>/dev/null; }
  s1="$(now_s)"; BOOT_STOP_SECS="$(perl -e "printf '%.1f', $s1-$s0")"
  wait "$pid" 2>/dev/null
  kill_own_listeners "$wt"
  if [ -n "$(busy_ports)" ]; then BOOT_RC=4; echo "[perf] 종료 뒤 포트 잔존:$(busy_ports)" >&2; fi
  return 0
}
