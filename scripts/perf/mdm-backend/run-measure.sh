#!/bin/bash
# MDM 백엔드·엔진 레인 성능 측정 실행기 — 사용법·환경변수·지표·출력 형식은 같은 폴더 README.md.
#   run-measure.sh <base|dev|ab> <P1|P2|P3|P4|P5|all> [회차 수] [--dry-run] [--keep-rounds] [--exclusive]
# 측정 시험 소스(이 폴더 src/)는 실행할 때만 각 측정 워크트리 test 폴더에 복사하고, gradle 이 끝나면 지운다
# (측정 워크트리 git status 가 깨끗해야 한다). 이 저장소의 빌드·시험 대상에는 들어가지 않는다.
# gradle 은 한 번에 1개(측정 잠금), --max-workers=2, JDK 21. 도커 없음, SQLite 만. 커밋하지 않는다.
# --exclusive(정식 측정): 측정 잠금을 잡은 뒤 이 스크립트 자신을 heavy.sh --exclusive 로 한 번 다시 실행한다 — 모든 회차가
#   PC 전역 일반 슬롯 K개를 쥔 한 번의 독점 안에서 돈다(회차 사이에 독점을 풀었다 잡지 않는다). --dry-run 과 함께 쓰지 않는다.
#
# 환경변수(자세한 표는 README §3):
#   JAVA_HOME              필수. JDK 21 홈
#   MEASURE_BASE_WT        기준 워크트리 경로(base·ab 에 필수)
#   MEASURE_DEV_WT         변경 워크트리 경로(dev·ab 에 필수)
#   MDM_MEASURE_SOURCE_DB  P3·P4 에 필수. 로컬 MDM SQLite DB 사본
#   MEASURE_BASE_REV       기준 HEAD 기대값(기본 b557ccbd = 태그 refactor-2026-10-base)
#   MEASURE_DEV_REV        변경 HEAD 기대값(기본 923aa9a0)
#   MEASURE_RESULTS_DIR    결과 폴더(기본 ${TMPDIR}/mdm-backend-perf)
#   MEASURE_LOCK           잠금 디렉터리(기본 ${TMPDIR}/mdm-backend-perf.lock)

HARNESS=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$HARNESS/../../.." && pwd)
HEAVY=$REPO_ROOT/.claude/skills/dflow-dev/scripts/heavy.sh
GIT=/usr/bin/git
TMP_ROOT=${TMPDIR:-/tmp}
TMP_ROOT=${TMP_ROOT%/}
BASE_REV_EXPECTED=${MEASURE_BASE_REV:-b557ccbd}   # 태그 refactor-2026-10-base
DEV_REV_EXPECTED=${MEASURE_DEV_REV:-923aa9a0}

usage() {
  echo "사용법: $0 <base|dev|ab> <P1|P2|P3|P4|P5|all> [회차 수(기본 3)] [--dry-run] [--keep-rounds] [--exclusive]" >&2
  echo "환경변수: JAVA_HOME(필수) MEASURE_BASE_WT·MEASURE_DEV_WT(쓰는 쪽 필수) MDM_MEASURE_SOURCE_DB(P3·P4 필수) — README.md" >&2
  exit 2
}

# abs_path <경로> — 있는 파일·디렉터리를 절대경로로 바꾼다(gradle 은 다른 cwd 에서 돌기 때문). 없으면 빈 문자열.
abs_path() {
  local p=$1
  if [ -d "$p" ]; then (cd "$p" && pwd)
  elif [ -e "$p" ]; then echo "$(cd "$(dirname "$p")" && pwd)/$(basename "$p")"
  fi
}
# abs_new <경로> — 아직 없을 수 있는 경로를 절대경로로(상대경로면 현재 위치 기준).
abs_new() {
  case "$1" in /*) echo "$1" ;; *) echo "$PWD/$1" ;; esac
}

# ── 인자 ─────────────────────────────────────────────────────────────
DRY=0
KEEP_ROUNDS=0
EXCL=0
ARGS=()
INNER_ARGS=()   # 독점 안에서 다시 부를 인자(--exclusive 만 뺀다)
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --keep-rounds) KEEP_ROUNDS=1 ;;
    --exclusive) EXCL=1; continue ;;
    -h|--help) usage ;;
    *) ARGS+=("$a") ;;
  esac
  INNER_ARGS+=("$a")
done
MODE=${ARGS[0]:-}
WHAT=${ARGS[1]:-}
ROUNDS=${ARGS[2]:-3}
case "$MODE" in base|dev|ab) ;; *) usage ;; esac
case "$WHAT" in P1|P2|P3|P4|P5) PS=("$WHAT") ;; all) PS=(P1 P2 P3 P4 P5) ;; *) usage ;; esac
[[ "$ROUNDS" =~ ^[1-9][0-9]*$ ]] || usage
case "$MODE" in base) SIDES=(base) ;; dev) SIDES=(dev) ;; ab) SIDES=(base dev) ;; esac

# ── 환경 ─────────────────────────────────────────────────────────────
if [ -z "${JAVA_HOME:-}" ]; then
  echo "JAVA_HOME 이 없다 — JDK 21 홈을 준다(예: JAVA_HOME=<JDK 21 경로> $0 …)" >&2
  exit 2
fi
[ -x "$JAVA_HOME/bin/java" ] || { echo "JAVA_HOME 에 java 가 없다(JDK 21 필요): $JAVA_HOME" >&2; exit 2; }
export JAVA_HOME

BASE_WT=
DEV_WT=
for side in "${SIDES[@]}"; do
  if [ "$side" = base ]; then var=MEASURE_BASE_WT; raw=${MEASURE_BASE_WT:-}; else var=MEASURE_DEV_WT; raw=${MEASURE_DEV_WT:-}; fi
  [ -n "$raw" ] || { echo "$var 가 없다 — $side 쪽 측정 워크트리 경로를 준다(README §2 워크트리 준비)" >&2; exit 2; }
  wt=$(abs_path "$raw")
  [ -n "$wt" ] && [ -d "$wt/src/backend" ] || { echo "워크트리가 없다($var): $raw" >&2; exit 2; }
  if [ "$side" = base ]; then BASE_WT=$wt; else DEV_WT=$wt; fi
done
[ -n "$BASE_WT" ] && export MEASURE_BASE_WT=$BASE_WT
[ -n "$DEV_WT" ] && export MEASURE_DEV_WT=$DEV_WT

need_source=0
for p in "${PS[@]}"; do case "$p" in P3|P4) need_source=1 ;; esac; done
SOURCE_DB=
if [ -n "${MDM_MEASURE_SOURCE_DB:-}" ]; then
  SOURCE_DB=$(abs_path "$MDM_MEASURE_SOURCE_DB")
  [ -n "$SOURCE_DB" ] || SOURCE_DB=$MDM_MEASURE_SOURCE_DB
fi
if [ "$need_source" = 1 ] && { [ -z "$SOURCE_DB" ] || [ ! -f "$SOURCE_DB" ]; }; then
  echo "P3·P4 데이터 원본(로컬 MDM DB 사본)이 없다: ${MDM_MEASURE_SOURCE_DB:-(MDM_MEASURE_SOURCE_DB 없음)}" >&2
  echo "  MDM_MEASURE_SOURCE_DB 로 사본 경로를 준다 — 만드는 법은 README §2" >&2
  exit 2
fi
[ -n "$SOURCE_DB" ] && export MDM_MEASURE_SOURCE_DB=$SOURCE_DB

LOCK=$(abs_new "${MEASURE_LOCK:-$TMP_ROOT/mdm-backend-perf.lock}")
RESULTS_BASE=$(abs_new "${MEASURE_RESULTS_DIR:-$TMP_ROOT/mdm-backend-perf}")
export MEASURE_LOCK=$LOCK MEASURE_RESULTS_DIR=$RESULTS_BASE

# ── 독점 실행 구분 ───────────────────────────────────────────────────
# 바깥(EXCL=1): 측정 잠금을 잡고 heavy.sh --exclusive 로 자기 자신을 자식으로 다시 부른다(exec 아님 — 잠금·신호를 바깥이 맡는다).
# 안쪽(MDM_PERF_EXCL_INNER=1): heavy.sh 가 일반 슬롯 K개를 모두 잡은 뒤 부른 실행. 잠금은 바깥 것이므로 잡지도 지우지도 않는다.
# 훅은 Bash 도구의 맨 위 명령 줄만 보고 스크립트 안의 ../gradlew 는 감싸지 않는다. 독점 안에서는 heavy.sh 가 DFLOW_HEAVY_HELD 를
# export 하므로 안쪽에서 혹시 heavy.sh 를 또 불러도 슬롯을 새로 기다리지 않는다(이중으로 잡지 않는다).
INNER=0
EXCL_SLOT=-
if [ "${MDM_PERF_EXCL_INNER:-}" = 1 ]; then
  INNER=1
  LOCK_OWNER=${MDM_PERF_LOCK_OWNER:-}
  unset MDM_PERF_EXCL_INNER MDM_PERF_LOCK_OWNER
  # heavy.sh 가 슬롯 폴더를 못 만들면(HEAVY_UNLOCKED) 슬롯 없이 그냥 부른다 — 독점이 아닌 측정을 정식 값으로 남기지 않는다.
  if [ -z "${DFLOW_HEAVY_HELD:-}" ] || [ ! -d "$DFLOW_HEAVY_HELD" ]; then
    echo "독점 슬롯이 확인되지 않는다(DFLOW_HEAVY_HELD 없음 — HEAVY_UNLOCKED?) — 측정하지 않는다" >&2
    exit 2
  fi
  EXCL_SLOT=$(basename "$DFLOW_HEAVY_HELD")
  if [ -z "$LOCK_OWNER" ] || [ "$(cat "$LOCK/pid" 2>/dev/null)" != "$LOCK_OWNER" ]; then
    echo "측정 잠금 보유자가 바깥 실행($LOCK_OWNER)이 아니다 — 측정하지 않는다" >&2
    exit 2
  fi
elif [ "$EXCL" = 1 ]; then
  if [ "$DRY" = 1 ]; then
    echo "--exclusive 는 --dry-run 과 함께 쓰지 않는다(독점은 정식 측정에만)" >&2
    exit 2
  fi
  [ -x "$HEAVY" ] || { echo "heavy.sh 가 없다(저장소 .claude/skills/dflow-dev/scripts/heavy.sh): $HEAVY — --exclusive 를 쓸 수 없다" >&2; exit 2; }
  # 슬롯을 쥔 채 독점을 부르면 heavy.sh 가 HEAVY_EXCL_NESTED(exit 2)로 거부한다 — 미리 알아듣게 막는다.
  # (acquire 로 붙잡은 슬롯은 heavy.sh 가 HEAVY_EXCL_NESTED 줄로 알린다.)
  if { [ -n "${DFLOW_HEAVY_HELD:-}" ] && [ -d "$DFLOW_HEAVY_HELD" ]; } \
     || { [ -n "${DFLOW_HEAVY_DOCKER_HELD:-}" ] && [ -d "$DFLOW_HEAVY_DOCKER_HELD" ]; }; then
    echo "이미 heavy.sh 슬롯 안에서 불렸다 — --exclusive 는 run-measure.sh 를 heavy.sh 로 감싸지 않고 직접 부른다(HEAVY_EXCL_NESTED 방지)" >&2
    exit 2
  fi
fi

wt_of() { if [ "$1" = base ]; then echo "$BASE_WT"; else echo "$DEV_WT"; fi; }

# ── 정리(한 함수 — 잠금과 이 실행이 복사한 파일만 지운다) ───────────────────
COPIED=()      # 이 실행이 복사한 파일(절대경로)
MADE_DIRS=()   # 이 실행이 만든 디렉터리(만든 순서 — 지울 때는 거꾸로)
HAVE_LOCK=0
HCHILD=        # 독점 바깥 실행이 띄운 heavy.sh 자식 pid
remove_copies() {
  local f i
  for f in "${COPIED[@]}"; do rm -f "$f"; done
  COPIED=()
  for ((i=${#MADE_DIRS[@]}-1; i>=0; i--)); do rmdir "${MADE_DIRS[$i]}" 2>/dev/null; done
  MADE_DIRS=()
}
cleanup() {
  remove_copies
  if [ "$HAVE_LOCK" = 1 ]; then rm -rf "$LOCK"; HAVE_LOCK=0; fi
}
trap cleanup EXIT
# 독점 바깥 실행은 heavy.sh 를 & 로 띄우므로 그 자식(과 손자인 안쪽 실행)은 SIGINT 를 무시한다 — TERM 으로 넘기고, 자식이
# 복사본을 지우고 끝날 때까지 기다린 뒤에야(EXIT trap 에서) 측정 잠금을 푼다.
on_signal() {
  if [ -n "$HCHILD" ]; then
    kill -TERM "$HCHILD" 2>/dev/null
    wait "$HCHILD" 2>/dev/null
    HCHILD=
  fi
  echo "중단됨" >&2
  exit 130
}
trap on_signal INT TERM HUP

# ── 사전 점검 ─────────────────────────────────────────────────────────
for side in "${SIDES[@]}"; do
  wt=$(wt_of "$side")
  dirty=$($GIT -C "$wt" status --porcelain)
  if [ -n "$dirty" ]; then
    echo "워크트리가 깨끗하지 않다($side): $wt" >&2; echo "$dirty" >&2
    echo "하네스 잔여물이면 README §7 정리 의 목록대로 지운다(git stash·checkout 금지)." >&2
    exit 2
  fi
done

# ── 잠금 ─────────────────────────────────────────────────────────────
# 측정용 gradle 은 동시에 1개만 돈다. mkdir 원자성으로 잠근다(죽은 보유 pid 면 지우고 다시, 60초마다 대기 알림).
# 측정은 이 스크립트 전체(모든 회차) 동안 잠금을 쥔다 — 회차 사이에 다른 측정 gradle 이 끼어 부하가 바뀌지 않게.
# 독점 실행은 측정 잠금을 먼저 잡고 PC 독점을 기다린다 — 거꾸로 하면 일반 슬롯 K개를 쥔 채 측정 잠금을 기다릴 수 있다.
if [ "$INNER" = 0 ]; then
  mkdir -p "$(dirname "$LOCK")" || exit 2
  waited=0
  until mkdir "$LOCK" 2>/dev/null; do
    owner=$(cat "$LOCK/pid" 2>/dev/null)
    if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then rm -rf "$LOCK"; continue; fi
    [ $((waited % 60)) -eq 0 ] && echo "MEASURE_LOCK 대기 ${waited}s (보유 pid=${owner:-?} $(cat "$LOCK/wt" 2>/dev/null)) — $LOCK" >&2
    sleep 5; waited=$((waited+5))
  done
  HAVE_LOCK=1
  echo $$ > "$LOCK/pid"; echo "mdm-backend-perf $MODE $WHAT$([ "$EXCL" = 1 ] && echo ' exclusive')" > "$LOCK/wt"
fi

# ── 독점 바깥 실행: heavy.sh --exclusive 로 자기 자신을 한 번 다시 부르고 그 rc 로 끝난다 ─────────
# 독점 대기 상한은 heavy.sh 의 DFLOW_HEAVY_WAIT(기본 90초)를 그대로 따른다(환경변수로 넘기면 된다).
# 위에서 절대경로로 바꾼 MEASURE_*·MDM_MEASURE_SOURCE_DB·JAVA_HOME 은 export 돼 안쪽 실행에 그대로 넘어간다.
if [ "$EXCL" = 1 ] && [ "$INNER" = 0 ]; then
  echo ">> heavy.sh --exclusive 로 측정 전체를 한 번에 돈다(인자: ${INNER_ARGS[*]})" >&2
  MDM_PERF_EXCL_INNER=1 MDM_PERF_LOCK_OWNER=$$ \
    "$HEAVY" --exclusive /bin/bash "$HARNESS/run-measure.sh" "${INNER_ARGS[@]}" &
  HCHILD=$!
  wait "$HCHILD"; rc=$?
  HCHILD=
  case "$rc" in
    75) echo "독점 슬롯을 못 잡았다(HEAVY_BUSY) — 측정하지 않았다. 180초(DFLOW_HEAVY_EXCL_TTL) 안에 같은 명령을 다시 부르면 순번이 이어진다" >&2 ;;
    2)  echo "heavy.sh 가 독점을 거부했거나(HEAVY_EXCL_NESTED — 위 줄 참고, acquire 한 슬롯이면 release 뒤 다시) 안쪽 실행의 사용법·점검 오류다" >&2 ;;
  esac
  exit "$rc"
fi

# ── 복사 ─────────────────────────────────────────────────────────────
# copy_one <원본> <대상> <extra 여부> <워크트리> — 대상이 이미 있으면: extra(변경 쪽에 추적되는 특성·동치 시험)이고 추적 파일이면
# 그대로 쓰고, 아니면 중단.
copy_one() {
  local src=$1 dst=$2 extra=$3 wt=$4 d missing=()
  if [ -e "$dst" ]; then
    if [ "$extra" = 1 ] && $GIT -C "$wt" ls-files --error-unmatch "$dst" >/dev/null 2>&1; then
      return 0
    fi
    echo "대상이 이미 있다(추적되지 않는 잔여물?): $dst" >&2
    return 1
  fi
  d=$(dirname "$dst")
  while [ ! -d "$d" ]; do missing=("$d" "${missing[@]}"); d=$(dirname "$d"); done
  for d in "${missing[@]}"; do mkdir "$d" || return 1; MADE_DIRS+=("$d"); done
  cp "$src" "$dst" || return 1
  COPIED+=("$dst")
}

# install <side> <P> — 그 P 에 필요한 시험 소스를 복사한다.
install() {
  local side=$1 p=$2 wt f rel
  wt=$(wt_of "$side")
  if [ "$p" = P5 ]; then
    copy_one "$HARNESS/src/maru-mdm-engine/kr/dongkuk/maru/mdm/engine/rule/MeasureP5RuleSetBenchTest.java" \
      "$wt/src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/MeasureP5RuleSetBenchTest.java" 0 "$wt" || return 1
    return 0
  fi
  local troot=$wt/src/backend/mdm/api/src/test/java
  for f in "$HARNESS"/src/mdm-api/com/dongkuk/dmes/mdm/measure/*.java; do
    copy_one "$f" "$troot/com/dongkuk/dmes/mdm/measure/$(basename "$f")" 0 "$wt" || return 1
  done
  case "$p" in
    P2) rel=com/dongkuk/dmes/mdm/dmb/layoutConfirm/LayoutHeaderImpactEquivalenceSqliteTest.java ;;
    P4) rel=com/dongkuk/dmes/mdm/dma/columnMng/ColumnMngSearchCharacterizationTest.java ;;
    *) rel= ;;
  esac
  if [ -n "$rel" ]; then
    copy_one "$HARNESS/src/extra-base/$rel" "$troot/$rel" 1 "$wt" || return 1
  fi
}

# ── gradle ───────────────────────────────────────────────────────────
filters() {
  case "$1" in
    P1) echo "com.dongkuk.dmes.mdm.measure.MeasureP1MasterCodeFlushTest" ;;
    P2) echo "com.dongkuk.dmes.mdm.measure.MeasureP2HeaderImpactTest com.dongkuk.dmes.mdm.dmb.layoutConfirm.LayoutHeaderImpactEquivalenceSqliteTest" ;;
    P3) echo "com.dongkuk.dmes.mdm.measure.MeasureP3TermSearchTest" ;;
    P4) echo "com.dongkuk.dmes.mdm.measure.MeasureP4ColumnSearchTest com.dongkuk.dmes.mdm.dma.columnMng.ColumnMngSearchCharacterizationTest" ;;
    P5) echo "kr.dongkuk.maru.mdm.engine.rule.MeasureP5RuleSetBenchTest" ;;
  esac
}

run_gradle() {
  local side=$1 p=$2 log=$3 wt t targs=()
  wt=$(wt_of "$side")
  for t in $(filters "$p"); do targs+=(--tests "$t"); done
  local envs=(MDM_MEASURE=1 MDM_MEASURE_SOURCE_DB="$SOURCE_DB")
  [ "$DRY" = 1 ] && envs+=(MDM_MEASURE_DRY=1)
  if [ "$p" = P5 ]; then
    (cd "$wt/src/backend/maru-mdm-engine" && env "${envs[@]}" ../gradlew test --rerun --console=plain -i --max-workers=2 "${targs[@]}") >"$log" 2>&1
  else
    (cd "$wt/src/backend/mdm" && env "${envs[@]}" ../gradlew :api:test --rerun --console=plain -i --max-workers=2 "${targs[@]}") >"$log" 2>&1
  fi
}

# 원 로그에서 MEASURE 줄을 모은다. 복사해 돌리는 특성·동치 시험의 [query-count]·[entity-load] 줄도 MEASURE 형식으로 바꾼다.
collect() {
  local log=$1
  grep -a -E '^[[:space:]]*MEASURE ' "$log" | sed -E 's/^[[:space:]]+//'
  grep -a -E '^[[:space:]]*\[query-count\] headerImpact ' "$log" \
    | sed -E 's/^[[:space:]]*\[query-count\] headerImpact ([^ ]+) = ([0-9]+).*/MEASURE P2 equiv-\1 probeStmts=\2/'
  grep -a -E '^[[:space:]]*\[query-count\] columnMng\.search ' "$log" \
    | sed -E 's/^[[:space:]]*\[query-count\] columnMng\.search ([^ ]+) = ([0-9]+).*/MEASURE P4 char-\1 probeStmts=\2/'
  grep -a -E '^[[:space:]]*\[entity-load\] columnMng\.search ' "$log" \
    | sed -E 's/^[[:space:]]*\[entity-load\] columnMng\.search ([^ ]+) = ([0-9]+).*/MEASURE P4 char-\1 loads=\2/'
}

RESULTS=$RESULTS_BASE
[ "$DRY" = 1 ] && RESULTS=$RESULTS_BASE/dry
mkdir -p "$RESULTS/raw" || exit 2
SOURCE_SHA=-
if [ -n "$SOURCE_DB" ] && [ -f "$SOURCE_DB" ]; then SOURCE_SHA=$(shasum -a 1 "$SOURCE_DB" | cut -d' ' -f1); fi

FAILS=()
# one_run <side> <P> <회차> <총회차>
one_run() {
  local side=$1 p=$2 r=$3 n=$4 wt ts out log rev expected rc lines
  wt=$(wt_of "$side")
  ts=$(date +%Y%m%d-%H%M%S)
  out=$RESULTS/$ts-$side-$p.txt
  log=$RESULTS/raw/$ts-$side-$p.log
  rev=$($GIT -C "$wt" rev-parse --short=8 HEAD)
  if [ "$side" = base ]; then expected=$BASE_REV_EXPECTED; else expected=$DEV_REV_EXPECTED; fi
  {
    echo "# side=$side wt=$wt head=$rev expected=$expected P=$p round=$r/$n dry=$DRY exclusive=$INNER heavy_slot=$EXCL_SLOT"
    echo "# source_db=${SOURCE_DB:--} sha1=$SOURCE_SHA"
    echo "# started=$(date '+%Y-%m-%d %H:%M:%S')"
    echo "# uptime_before: $(uptime)"
  } >"$out"
  [ "$rev" = "$expected" ] || echo "# 경고: HEAD 가 기대값과 다르다" >>"$out"
  echo ">> $side $p 회차 $r/$n → $out" >&2
  if ! install "$side" "$p"; then
    remove_copies
    echo "# 복사 실패" >>"$out"
    return 1
  fi
  run_gradle "$side" "$p" "$log"
  rc=$?
  remove_copies
  collect "$log" >>"$out"
  lines=$(grep -c '^MEASURE ' "$out")
  {
    echo "# uptime_after: $(uptime)"
    echo "# finished=$(date '+%Y-%m-%d %H:%M:%S') gradle_exit=$rc measure_lines=$lines"
    grep -a -E ' (FAILED|SKIPPED)$|tests completed|BUILD (SUCCESSFUL|FAILED) in' "$log" | sed -E 's/^[[:space:]]*/# gradle: /'
  } >>"$out"
  if [ -n "$($GIT -C "$wt" status --porcelain)" ]; then
    echo "워크트리가 정리 뒤에도 깨끗하지 않다: $wt" >&2
    $GIT -C "$wt" status --porcelain >&2
    exit 3
  fi
  if [ "$lines" -eq 0 ]; then
    echo "MEASURE 줄이 없다(건너뜀·컴파일 실패?) — 원 로그: $log" >&2
    exit 4
  fi
  if [ "$rc" -ne 0 ]; then
    FAILS+=("$side $p 회차 $r (gradle_exit=$rc, $log)")
    echo "   gradle 실패(측정 줄 $lines 개는 남김) — $log" >&2
  fi
  return 0
}

for p in "${PS[@]}"; do
  n=$ROUNDS
  if [ "$DRY" = 1 ]; then
    n=1
  elif [ "$KEEP_ROUNDS" = 0 ] && { [ "$p" = P2 ] || [ "$p" = P4 ]; }; then
    n=1   # 결정적 지표만 있는 P
  fi
  for ((r=1; r<=n; r++)); do
    for side in "${SIDES[@]}"; do
      one_run "$side" "$p" "$r" "$n" || exit 5
    done
  done
done

if [ ${#FAILS[@]} -gt 0 ]; then
  echo "gradle 실패가 있었다:" >&2
  printf '  %s\n' "${FAILS[@]}" >&2
  exit 1
fi
echo "끝 — 결과: $RESULTS" >&2
