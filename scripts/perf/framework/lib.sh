#!/bin/bash
# 공통 설정 — 다른 스크립트가 source 한다. 환경 변수 표는 README.md 참조.
# PC 마다 다른 값(저장소 경로·JDK·결과 폴더·워크트리 위치·잠금·줄 세우기)은 전부 환경 변수로 받는다.
export PYTHONDONTWRITEBYTECODE=1   # 하네스 폴더에 __pycache__ 를 만들지 않는다

PERF_NAME=framework
PERF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIT="${GIT:-git}"

# 저장소 경로: 기본은 스크립트 위치에서 git rev-parse --show-toplevel
REPO_DIR="${REPO_DIR:-$($GIT -C "$PERF_DIR" rev-parse --show-toplevel 2>/dev/null)}"
if [ -z "$REPO_DIR" ] || [ ! -d "$REPO_DIR" ]; then
  echo "[lib] 저장소 경로를 알 수 없다. REPO_DIR 환경 변수에 저장소 루트를 지정한다." >&2; exit 1
fi

# JDK 21: 이미 설정된 JAVA_HOME 도 major 버전이 21 인지 확인한다(17·26 이면 기준 측정과 런타임이 달라지거나 jar 가 못 뜬다).
# 비어 있으면 /usr/libexec/java_home -v 21 (21 이상을 돌려줄 수 있으므로 결과 버전을 다시 확인)과 Homebrew openjdk@21 을 시도한다.
# 맞는 JDK 21 이 없으면 안내하고 종료한다. PERF_SKIP_JAVA=1 이면 점검하지 않는다(p2_cleanup.sh 처럼 JDK 가 필요 없는 스크립트용).
java_major() { "$1/bin/java" -version 2>&1 | sed -n '1s/.*version "\([0-9][0-9]*\).*/\1/p'; }
if [ "${PERF_SKIP_JAVA:-}" != 1 ]; then
  if [ -z "${JAVA_HOME:-}" ]; then
    for _c in "$([ -x /usr/libexec/java_home ] && /usr/libexec/java_home -v 21 2>/dev/null)" /opt/homebrew/opt/openjdk@21 /usr/local/opt/openjdk@21; do
      [ -n "$_c" ] && [ -x "$_c/bin/java" ] && [ "$(java_major "$_c")" = 21 ] && { JAVA_HOME="$_c"; break; }
    done
  fi
  if [ -z "${JAVA_HOME:-}" ] || [ ! -x "$JAVA_HOME/bin/java" ]; then
    echo "[lib] JDK 21 을 찾지 못했다. JAVA_HOME 환경 변수에 JDK 21 경로를 지정한다." >&2; exit 1
  fi
  if [ "$(java_major "$JAVA_HOME")" != 21 ]; then
    echo "[lib] JAVA_HOME($JAVA_HOME)의 Java major 버전이 21 이 아니다(기준 측정과 같은 런타임이어야 한다). JDK 21 경로를 JAVA_HOME 으로 지정한다." >&2; exit 1
  fi
  export JAVA_HOME
fi

# 결과 폴더(저장소 밖). DRY=1 이면 그 아래 dryrun/ 에만 쓴다(jar·합성 로그도 그 안).
RESULTS_BASE="${PERF_RESULTS_DIR:-${TMPDIR:-/tmp}/dmes-perf/$PERF_NAME}"
RESULTS_BASE="${RESULTS_BASE//\/\//\/}"
# 상대 경로는 받지 않는다. run_all.sh 가 스크립트 폴더로 cd 한 뒤 source 하므로 상대 경로면 결과가 저장소 안에 생긴다.
case "$RESULTS_BASE" in
  /*) ;;
  *) echo "[lib] PERF_RESULTS_DIR 는 절대 경로로 지정한다(받은 값: $RESULTS_BASE)." >&2; exit 2 ;;
esac
RESULTS="$RESULTS_BASE"
if [ "${DRY:-}" = 1 ]; then RESULTS="$RESULTS_BASE/dryrun"; fi
JARS="$RESULTS/jars"
LOGROOT="$RESULTS/synthetic-logs"
mkdir -p "$RESULTS"

# 작업용(측정용) 워크트리 위치. 이름은 perf-framework-*.
WT_ROOT="${PERF_WT_ROOT:-$REPO_DIR/.claude/worktrees}"
BASE_REF="${BASE_REF:-refactor-2026-10-base}"
CHANGE_REF="${CHANGE_REF:-HEAD}"
BASE_WT="$WT_ROOT/perf-$PERF_NAME-base"
CHANGE_WT="$WT_ROOT/perf-$PERF_NAME-change"
PORT="${ANALOG_PERF_PORT:-18191}"

# gradle 잠금 파일(선택, 비면 lockf 없이) · 무거운 작업 줄 세우기 명령(선택)
GRADLE_LOCK="${GRADLE_LOCK:-}"
HEAVY_CMD="${HEAVY_CMD:-}"
if [ -n "$HEAVY_CMD" ]; then   # 상대 경로면 저장소 기준 절대 경로로(run_gradle 이 cd 하므로)
  _h="${HEAVY_CMD%% *}"; _r="${HEAVY_CMD#"$_h"}"
  case "$_h" in /*) ;; *) [ -e "$REPO_DIR/$_h" ] && HEAVY_CMD="$REPO_DIR/$_h$_r" ;; esac
fi

# 1분 load average (uptime 출력의 "load averages: a b c" 중 a)
load1() { uptime | sed -E 's/.*load averages?: *([0-9.,]+)[ ,].*/\1/' | tr -d ','; }

# gradle 실행(동시 작업자 2개 제한). GRADLE_LOCK 이 있으면 lockf, HEAVY_CMD 가 있으면 그 명령으로 감싼다.
# 사용: run_gradle <디렉터리> <gradle 인자...>
run_gradle() {
  local dir="$1"; shift
  local -a pre=()
  [ -n "$HEAVY_CMD" ] && read -r -a pre <<< "$HEAVY_CMD"
  case "${pre[0]:-}" in *.mjs) pre=(node "${pre[@]}") ;; *.sh) pre=(bash "${pre[@]}") ;; esac   # 확장자로 실행기를 고른다
  [ -n "$GRADLE_LOCK" ] && pre+=(/usr/bin/lockf -k "$GRADLE_LOCK")
  ( cd "$dir" && "${pre[@]}" env JAVA_HOME="$JAVA_HOME" sh "${GRADLEW:-./gradlew}" "$@" --max-workers=2 --console=plain )
}

# detached 워크트리 만들기(--force 없음). 이미 있으면 HEAD 가 ref 와 같을 때만 재사용하고, 다르면 실패한다.
# 쓰는 커밋은 $RESULTS/worktree_commits.txt 에 남긴다. 사용: wt_add <경로> <ref>
wt_add() {
  local want have
  want=$($GIT -C "$REPO_DIR" rev-parse --verify "$2^{commit}") || { echo "[lib] $2 커밋을 찾지 못함" >&2; return 1; }
  if [ -d "$1" ]; then
    have=$($GIT -C "$1" rev-parse HEAD 2>/dev/null)
    if [ "$have" != "$want" ]; then
      echo "[lib] 측정 워크트리 $1 이 이미 있고 HEAD($have)가 대상 $2($want)와 다르다. 이전 실행이 남긴 것이면 p2_cleanup.sh(또는 git worktree remove)로 지운 뒤 다시 실행한다." >&2
      return 1
    fi
    echo "[lib] 측정 워크트리 이미 있음(재사용): $1 @ ${have:0:8}"
  else
    mkdir -p "$(dirname "$1")"
    $GIT -C "$REPO_DIR" worktree add --detach "$1" "$want" || return 1
    CREATED_WTS="$CREATED_WTS $1 "   # 이번 실행이 만든 것만 wt_remove 가 지운다
  fi
  echo "$(date '+%F %T') $(basename "$1") ref=$2 commit=$want" >> "$RESULTS/worktree_commits.txt"
}
# 워크트리 제거(--force 없음). 측정용 복사 파일은 호출 쪽에서 먼저 치운다.
# 이번 실행이 만든 경로(CREATED_WTS)만 지운다. 명시 정리(p2_cleanup.sh)는 WT_REMOVE_ALL=1 로 전부 지운다.
CREATED_WTS=""
wt_remove() {
  [ -d "$1" ] || return 0
  if [ "${WT_REMOVE_ALL:-0}" != 1 ]; then
    case "$CREATED_WTS" in *" $1 "*) ;; *) return 0 ;; esac
  fi
  $GIT -C "$REPO_DIR" worktree remove "$1" || {
    echo "[lib] worktree remove 실패 — 변경 파일이 남았는지 확인($GIT -C $1 status). --force 는 쓰지 않는다." >&2
    return 1
  }
}
base_wt_add()   { wt_add "$BASE_WT" "$BASE_REF"; }
change_wt_add() { wt_add "$CHANGE_WT" "$CHANGE_REF"; }
pair_wt_add()    { base_wt_add && change_wt_add; }
pair_wt_remove() { wt_remove "$BASE_WT"; wt_remove "$CHANGE_WT"; }

# CSV 한 줄 추가: csv_add <파일> <회차> <대상> <지표> <값> <load1>
csv_add() {
  local f="$1"
  [ -s "$f" ] || echo "round,target,metric,value,load1" > "$f"
  echo "$2,$3,$4,$5,$6" >> "$f"
}

# ---- P2 대상 지정 ----
# TARGETS="라벨:ref ..." 기본: A=기준 태그, B=1차 머지 dev(bb8ee036), C=현재 HEAD(변경).
#   모든 대상은 detached 워크트리를 만든다. ref 가 BASE_REF 면 기준 워크트리, CHANGE_REF 면 변경 워크트리를 공유하고,
#   그 밖은 perf-framework-<라벨> 이다.
TARGETS="${TARGETS:-A:$BASE_REF B:bb8ee036 C:$CHANGE_REF}"
target_label() { echo "${1%%:*}"; }
target_ref()   { echo "${1#*:}"; }
target_wt() {  # target_wt <라벨> <ref>
  if [ "$2" = "$BASE_REF" ]; then echo "$BASE_WT"
  elif [ "$2" = "$CHANGE_REF" ]; then echo "$CHANGE_WT"
  else echo "$WT_ROOT/perf-$PERF_NAME-$1"; fi
}
targets_wt_add() {
  local t l r
  for t in $TARGETS; do l=$(target_label "$t"); r=$(target_ref "$t")
    wt_add "$(target_wt "$l" "$r")" "$r" || return 1
  done
}
targets_wt_remove() {
  local t l r
  for t in $TARGETS; do l=$(target_label "$t"); r=$(target_ref "$t")
    wt_remove "$(target_wt "$l" "$r")"
  done
}
