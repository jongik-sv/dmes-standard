#!/bin/zsh
# P3 보조 지표(getMyMenus 응답 시간) 측정 — 기준(A)·변경(B)을 번갈아 돌린다(docs/refactor-2026-10/perf-mcm.md P3, README.md 참조).
#
# 방법: 같은 폴더의 MyMenusLatencyPerfTest.java 를 회차마다 작업용 워크트리의 mcm/api src/test 에 복사해
#       :api:test --tests ... --rerun 을 돌리고, 결과를 TSV 에 남긴 뒤 복사본을 지운다(trap 으로 중단 때도 지운다). 메인 체크아웃·서버는 건드리지 않는다.
#
# 사용법
#   perf-mcm-p3.sh prepare [기준 ref] [변경 ref]      작업용 워크트리 2개 만들기(이미 있으면 HEAD 확인) + 워밍업 빌드(시간은 결과에서 뺀다)
#   perf-mcm-p3.sh run [회차 수=3] [warmup=300] [iters=500]   회차마다 A(기준)→B(변경) 순서로 1회씩
#   perf-mcm-p3.sh cleanup                            복사본 확인·삭제 → 깨끗하면 git worktree remove(--force 쓰지 않음)
#   perf-mcm-p3.sh all [회차 수=3] [기준 ref] [변경 ref] [--cleanup] [warmup] [iters]
#   예) 실제 측정: perf-mcm-p3.sh all 3 --cleanup        (기준 refactor-2026-10-base, 변경 dev)
#       dry-run  : perf-mcm-p3.sh all 1 refactor-2026-10-base HEAD --cleanup 20 50
#
# 환경 변수(기본값·뜻은 README.md 표): PERF_REPO_DIR JAVA_HOME PERF_OUT_DIR PERF_WT_ROOT PERF_BASE_REF PERF_AFTER_REF PERF_GRADLE_LOCK HEAVY_CMD
#
# 결과: $PERF_OUT_DIR/perf-mcm-p3-results.tsv (조건마다 한 줄 — 기준 nocache, 변경 hit·miss)
#   load1 은 각 쪽 gradle 실행 직전의 1분 부하(sysctl vm.loadavg), gradle_s 는 그 쪽 gradle 실행 전체 벽시계(초).
#   측정값(median_ms·p90_ms…)은 테스트 JVM 안에서 nanoTime 으로 잰 getMyMenus 한 번(트랜잭션 포함)의 지연이다.

emulate -L zsh
setopt pipe_fail
zmodload zsh/datetime

HERE=${0:A:h}
SELF=${0:A}
GIT=/usr/bin/git
[[ -x $GIT ]] || GIT=git

print_usage() { sed -n "2,19p" $SELF }

die() { print -u2 "[perf-p3] 오류: $*"; exit 1 }
log() { print -u2 "[perf-p3] $(date +%H:%M:%S) $*" }

# ---- 환경 ----
REPO=${PERF_REPO_DIR:-$($GIT -C $HERE rev-parse --show-toplevel 2>/dev/null)}
[[ -n $REPO && -d $REPO ]] || die "저장소 경로를 찾지 못함 — PERF_REPO_DIR 로 지정"
# JDK 21 만 받는다(17·26 이면 기준 측정과 런타임이 달라지거나 빌드가 실패한다). java_home -v 21 은 21 이상을 돌려줄 수 있어 결과 버전도 확인한다.
java_major() { "$1/bin/java" -version 2>&1 | sed -n '1s/.*version "\([0-9][0-9]*\).*/\1/p' }
if [[ -z $JAVA_HOME ]]; then
  local_c=
  for local_c in "$([[ -x /usr/libexec/java_home ]] && /usr/libexec/java_home -v 21 2>/dev/null)" /opt/homebrew/opt/openjdk@21 /usr/local/opt/openjdk@21; do
    [[ -n $local_c && -x $local_c/bin/java && $(java_major $local_c) == 21 ]] && { JAVA_HOME=$local_c; break }
  done
  [[ -n $JAVA_HOME ]] || die "JAVA_HOME 이 비어 있고 JDK 21 도 찾지 못함 — JDK 21 경로를 JAVA_HOME 으로 지정"
fi
[[ -x $JAVA_HOME/bin/java ]] || die "JAVA_HOME($JAVA_HOME)에 bin/java 가 없음"
[[ $(java_major $JAVA_HOME) == 21 ]] || die "JAVA_HOME($JAVA_HOME)의 Java major 버전이 21 이 아님 — JDK 21 경로를 JAVA_HOME 으로 지정"
export JAVA_HOME
OUT=${PERF_OUT_DIR:-${TMPDIR:-/tmp}/dmes-perf/mcm}
OUT=${OUT%/}
mkdir -p $OUT || die "결과 폴더를 만들지 못함: $OUT"
OUT=${OUT:A}
WT_ROOT=${PERF_WT_ROOT:-$REPO/.claude/worktrees}
BASE_REF=${PERF_BASE_REF:-refactor-2026-10-base}
AFTER_REF=${PERF_AFTER_REF:-dev}
LOCKFILE=${PERF_GRADLE_LOCK:-}
HEAVY=${HEAVY_CMD:-}
if [[ -n $HEAVY ]]; then   # 첫 단어가 상대 경로면 저장소 기준 절대 경로로(run_gradle 이 다른 폴더에서 실행하므로)
  _h=${HEAVY%% *}; _r=${HEAVY#$_h}
  [[ $_h == /* ]] || { [[ -e $REPO/$_h ]] && HEAVY=$REPO/$_h$_r }
fi

SRC_CLASS=$HERE/MyMenusLatencyPerfTest.java
TEST_FQN=com.dongkuk.dmes.mcm.perf.MyMenusLatencyPerfTest
REL_PKG_DIR=src/backend/mcm/api/src/test/java/com/dongkuk/dmes/mcm/perf
RESULTS=$OUT/perf-mcm-p3-results.tsv
PREP=$OUT/perf-mcm-p3-prepare.tsv
LOGDIR=$OUT/logs
STATE=$OUT/state
typeset -A WT
WT[base]=$WT_ROOT/perf-mcm-base
WT[after]=$WT_ROOT/perf-mcm-after

load1() { sysctl -n vm.loadavg | awk '{print $2}' }
now() { print -r -- $EPOCHREALTIME }
elapsed() { awk -v a=$1 -v b=$2 'BEGIN{printf "%.1f", b-a}' }

# gradle 한 번: 선택 줄 세우기(HEAVY_CMD) · 선택 잠금(PERF_GRADLE_LOCK, lockf)
run_gradle() {   # $1=모듈 폴더(src/backend/mcm) $2...=gradle 인자
  local dir=$1; shift
  (
    cd $dir || exit 2
    local -a pre=()
    [[ -n $HEAVY ]] && pre+=( ${=HEAVY} )
    [[ -n $LOCKFILE ]] && pre+=( lockf -k $LOCKFILE )
    $pre ../gradlew --max-workers=2 --offline "$@"
  )
}

copy_class() {   # $1=워크트리
  mkdir -p $1/$REL_PKG_DIR || return 1
  cp $SRC_CLASS $1/$REL_PKG_DIR/ || return 1
}

remove_class() { # $1=워크트리 — 복사본과 (비면) perf 폴더를 지운다
  rm -f $1/$REL_PKG_DIR/MyMenusLatencyPerfTest.java
  [[ -d $1/$REL_PKG_DIR ]] && rmdir $1/$REL_PKG_DIR 2>/dev/null
  return 0
}

# 중단(INT·TERM)·정상 종료 때 복사본을 지운다
remove_all_classes() {
  local side
  for side in base after; do
    [[ -d ${WT[$side]} ]] && remove_class ${WT[$side]}
  done
}
trap 'remove_all_classes' EXIT
trap 'remove_all_classes; exit 130' INT TERM

ensure_wt() {    # $1=side $2=ref
  local side=$1 want wt=${WT[$1]}
  want=$($GIT -C $REPO rev-parse --verify "$2^{commit}") || die "$2 커밋을 찾지 못함"
  if [[ -d $wt ]]; then
    local head=$($GIT -C $wt rev-parse HEAD 2>/dev/null)
    [[ $head == $want ]] || die "$wt 이 이미 있고 HEAD($head) 가 대상($want)과 다름 — cleanup 뒤 다시"
    log "$side 워크트리 재사용 $wt ($want)"
  else
    mkdir -p $WT_ROOT
    $GIT -C $REPO worktree add --detach $wt $want >>$LOGDIR/worktree.log 2>&1 || die "worktree add 실패($wt) — $LOGDIR/worktree.log"
    log "$side 워크트리 생성 $wt ($want)"
  fi
  print -r -- "$side=$want" >> $STATE.tmp
}

cmd_prepare() {
  local base=${1:-$BASE_REF} after=${2:-$AFTER_REF}
  [[ -f $SRC_CLASS ]] || die "측정 클래스 없음: $SRC_CLASS"
  rm -f $STATE.tmp
  ensure_wt base $base
  ensure_wt after $after
  mv $STATE.tmp $STATE
  [[ -f $PREP ]] || print -r -- $'ts\tside\tcommit\ttask\tgradle_s\tstatus' > $PREP
  local side
  for side in base after; do
    local wt=${WT[$side]} commit=$(grep "^$side=" $STATE | cut -d= -f2)
    copy_class $wt || die "복사 실패"
    log "$side 워밍업 빌드(:api:testClasses) 시작 — 결과에서 뺀다"
    local t0=$(now) st=OK
    run_gradle $wt/src/backend/mcm :api:testClasses >$LOGDIR/prepare-$side.log 2>&1 || st=FAIL
    local t1=$(now)
    remove_class $wt
    print -- "$(date '+%F %T')\t$side\t${commit:0:8}\t:api:testClasses\t$(elapsed $t0 $t1)\t$st" >> $PREP
    log "$side 워밍업 빌드 $st $(elapsed $t0 $t1)s (로그 $LOGDIR/prepare-$side.log)"
    [[ $st == OK ]] || die "$side 워밍업 빌드 실패 — $LOGDIR/prepare-$side.log"
  done
}

run_side() {     # $1=round $2=side $3=warmup $4=iters
  local round=$1 side=$2 warmup=$3 iters=$4 wt=${WT[$2]}
  local commit=$(grep "^$side=" $STATE | cut -d= -f2)
  local outdir=$wt/src/backend/mcm/api/build/perf-mcm-p3
  mkdir -p $outdir
  rm -f $outdir/result.tsv
  print -r -- "warmup=$warmup"$'\n'"iters=$iters" > $outdir/config.properties
  copy_class $wt || die "복사 실패"
  local l1=$(load1) t0=$(now) st=OK
  log "회차 $round $side(${commit:0:8}) 시작 load1=$l1"
  run_gradle $wt/src/backend/mcm :api:test --tests $TEST_FQN --rerun >$LOGDIR/run-r$round-$side.log 2>&1 || st=FAIL
  local t1=$(now)
  local gs=$(elapsed $t0 $t1)
  remove_class $wt
  local ts=$(date '+%F %T')
  if [[ $st == OK && -s $outdir/result.tsv ]]; then
    local line
    while IFS= read -r line; do
      [[ -n $line ]] && print -- "$ts\t$round\t$side\t${commit:0:8}\t$line\t$l1\t$gs\tOK" >> $RESULTS
    done < $outdir/result.tsv
    log "회차 $round $side 끝 ${gs}s"
    cat $outdir/result.tsv >&2
  else
    print -- "$ts\t$round\t$side\t${commit:0:8}\t-\t$warmup\t$iters\t\t\t\t\t\t\t\t\t\t\t\t$l1\t$gs\tFAIL" >> $RESULTS
    log "회차 $round $side 실패 ${gs}s — $LOGDIR/run-r$round-$side.log"
  fi
}

cmd_run() {
  local rounds=${1:-3} warmup=${2:-300} iters=${3:-500} r side
  [[ -f $STATE ]] || die "prepare 를 먼저"
  [[ -f $RESULTS ]] || print -r -- $'ts\tround\tside\tcommit\tcondition\twarmup\titers\tmedian_ms\tp90_ms\tmean_ms\tmin_ms\tmax_ms\trows\tmenu\tobj\tfld\trolemap\tseed_ms\tload1\tgradle_s\tstatus' > $RESULTS
  for (( r = 1; r <= rounds; r++ )); do
    for side in base after; do   # A·B 번갈아
      run_side $r $side $warmup $iters
    done
  done
}

cmd_cleanup() {
  local side wt dirty
  for side in base after; do
    wt=${WT[$side]}
    [[ -d $wt ]] || { log "$side 워크트리 없음"; continue }
    remove_class $wt
    dirty=$($GIT -C $wt status --porcelain)
    if [[ -n $dirty ]]; then
      log "$side 워크트리가 깨끗하지 않아 지우지 않음(--force 금지):"; print -u2 -r -- $dirty
      continue
    fi
    $GIT -C $REPO worktree remove $wt && log "$side 워크트리 제거 $wt"
  done
  rm -f $STATE
}

cmd=$1
case $cmd in
  prepare|run|cleanup|all) mkdir -p $LOGDIR ;;
  *) print_usage; exit 2 ;;
esac
shift
case $cmd in
  prepare) cmd_prepare "$@" ;;
  run)     cmd_run "$@" ;;
  cleanup) cmd_cleanup ;;
  all)
    typeset cl=0
    typeset -a pos=()
    typeset a
    for a in "$@"; do
      if [[ $a == --cleanup ]]; then cl=1; else pos+=($a); fi
    done
    typeset rounds=${pos[1]:-3} base=${pos[2]:-$BASE_REF} after=${pos[3]:-$AFTER_REF}
    typeset T0=$(now)
    cmd_prepare $base $after
    typeset T1=$(now)
    cmd_run $rounds ${pos[4]:-300} ${pos[5]:-500}
    typeset T2=$(now)
    log "준비(워밍업 빌드) $(elapsed $T0 $T1)s · 측정 $(elapsed $T1 $T2)s"
    if (( cl )); then cmd_cleanup; fi
    ;;
esac
