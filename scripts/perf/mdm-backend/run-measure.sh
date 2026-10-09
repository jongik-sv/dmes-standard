#!/bin/bash
# MDM 백엔드·엔진 레인 성능 측정 실행기 — 사용법·환경변수·지표·출력 형식은 같은 폴더 README.md.
#   run-measure.sh <base|dev|ab> <P1|P2|P3|P4|P5|all> [회차 수] [--dry-run] [--keep-rounds] [--exclusive]
# 측정 시험 소스(이 폴더 src/)는 실행할 때만 각 측정 워크트리 test 폴더에 복사하고, gradle 이 끝나면 지운다
# (측정 워크트리 git status 가 깨끗해야 한다). 이 저장소의 빌드·시험 대상에는 들어가지 않는다.
# DB 는 Oracle 시험 PDB 의 MDMAPUSER 다(P1~P4). gradle 은 build-logic 의 시험 하니스(-Pdmes.ora.*)로 돌린다 — 기본은 빌드마다
#   T_<레인> PDB 를 복제했다 지우고, MEASURE_ORA_PDB 를 주면 있는 PDB 를 그대로 쓴다. 이 스크립트는 Oracle 에 직접 접속하지 않는다
#   (PC 잠금은 하니스가 빌드 전 구간에서 쥔다). P5(엔진 단위 시험)는 DB 가 없어 하니스를 켜지 않는다.
# 모든 gradle 은 heavy.mjs 슬롯(PC 전역 세마포어) 아래에서 한 번에 하나씩 돈다. 커밋하지 않는다. JDK 21, --max-workers=2.
# --exclusive(정식 측정): 이 스크립트 자신을 heavy.mjs --exclusive 로 한 번 다시 실행한다 — 모든 회차가
#   PC 전역 일반 슬롯 K개를 쥔 한 번의 독점 안에서 돈다(회차 사이에 독점을 풀었다 잡지 않는다). --dry-run 과 함께 쓰지 않는다.
#
# 환경변수(자세한 표는 README §3):
#   JAVA_HOME                JDK 21 홈(필수)
#   MEASURE_BASE_WT          기준 워크트리 경로(base·ab 에 필수) — Oracle 시험 기반이 있는 커밋이어야 한다
#   MEASURE_DEV_WT           변경 워크트리 경로(dev·ab 에 필수)
#   MDM_MEASURE_SNAPSHOT_DIR P3·P4 데이터 폴더(기본 <저장소>/db-snapshot/MDMAPUSER). 두 쪽 모두 이 한 폴더를 쓴다
#   MEASURE_ORA_PDB          있는 시험 PDB 이름(T_*). 없으면 빌드마다 T_<레인> 을 복제했다 지운다
#   MEASURE_ORA_ALLOW        T_ 가 아닌 PDB 를 쓸 때 그 이름을 그대로 적는다(FREEPDB1·TPL_*·L_* 는 어떤 값으로도 거부)
#   MEASURE_ORA_TEMPLATE     복제 원본 템플릿(기본은 하니스 기본값 TPL_EMPTY)
#   MEASURE_BASE_REV·MEASURE_DEV_REV  HEAD 기대값(선택). 주면 다를 때 결과 파일에 경고 줄
#   MEASURE_RESULTS_DIR      결과 폴더(기본 ${TMPDIR}/mdm-backend-perf)

HARNESS=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$HARNESS/../../.." && pwd)
HEAVY=$REPO_ROOT/.claude/skills/dflow-dev/scripts/heavy.mjs
GIT=/usr/bin/git
TMP_ROOT=${TMPDIR:-/tmp}
TMP_ROOT=${TMP_ROOT%/}
BASE_REV_EXPECTED=${MEASURE_BASE_REV:-}   # 선택
DEV_REV_EXPECTED=${MEASURE_DEV_REV:-}

usage() {
  echo "사용법: $0 <base|dev|ab> <P1|P2|P3|P4|P5|all> [회차 수(기본 3)] [--dry-run] [--keep-rounds] [--exclusive]" >&2
  echo "환경변수: JAVA_HOME(필수) MEASURE_BASE_WT·MEASURE_DEV_WT(쓰는 쪽 필수) MEASURE_ORA_PDB(선택) — README.md" >&2
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

# wt_of_early <base|dev> — 환경 점검용(워크트리 변수가 정해진 뒤 쓴다).
wt_of_early() { if [ "$1" = base ]; then echo "$BASE_WT"; else echo "$DEV_WT"; fi; }

# tracked_tests <P> — 그 P 가 측정 시험과 같이 돌리는, 워크트리에 이미 추적되는 시험 클래스(FQCN).
tracked_tests() {
  case "$1" in
    P2) echo "com.dongkuk.dmes.mdm.dmb.layoutConfirm.LayoutHeaderImpactEquivalenceSqliteTest" ;;
    P4) echo "com.dongkuk.dmes.mdm.dma.columnMng.ColumnMngSearchCharacterizationTest" ;;
  esac
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

need_source=0   # P3·P4: 스냅샷 CSV 필요
need_ora=0      # P1~P4: Oracle 시험 PDB 필요(P5 는 엔진 단위 시험이라 DB 없음)
for p in "${PS[@]}"; do
  case "$p" in P3|P4) need_source=1 ;; esac
  case "$p" in P1|P2|P3|P4) need_ora=1 ;; esac
done
SNAPSHOT_DIR=$(abs_path "${MDM_MEASURE_SNAPSHOT_DIR:-$REPO_ROOT/db-snapshot/MDMAPUSER}")
if [ "$need_source" = 1 ]; then
  for t in TB_MDM_TERM TB_MDM_DOMAIN TB_MDM_COLUMN TB_MDM_COLUMN_SYSTEM; do
    if [ -z "$SNAPSHOT_DIR" ] || [ ! -f "$SNAPSHOT_DIR/$t.csv" ]; then
      echo "P3·P4 데이터 스냅샷 CSV 가 없다: ${SNAPSHOT_DIR:-${MDM_MEASURE_SNAPSHOT_DIR:-$REPO_ROOT/db-snapshot/MDMAPUSER}}/$t.csv" >&2
      echo "  db-snapshot/MDMAPUSER 를 두거나 MDM_MEASURE_SNAPSHOT_DIR 로 폴더를 준다 — README §2.2" >&2
      exit 2
    fi
  done
fi
[ -n "$SNAPSHOT_DIR" ] && export MDM_MEASURE_SNAPSHOT_DIR=$SNAPSHOT_DIR

# Oracle 시험 PDB — 있는 PDB(MEASURE_ORA_PDB)를 쓰거나(비우면 빌드마다 T_<레인> 복제·삭제) 이름 규칙을 지킨다.
# FREEPDB1·CDB$ROOT·PDB$SEED·TPL_*·L_*(레인 개발 PDB·템플릿)는 어떤 값으로도 거부한다. T_ 가 아니면 MEASURE_ORA_ALLOW 에 같은 이름을 적어야 한다.
# (시험 쪽 MdmSharedTestDb·SourceDb 가 실제 접속 PDB 로 한 번 더 막는다.)
ORA_PDB=${MEASURE_ORA_PDB:-}
ORA_ALLOW_OPT=
if [ "$need_ora" = 1 ] && [ -n "$ORA_PDB" ]; then
  case "$ORA_PDB" in *[!A-Za-z0-9_\$]*) echo "MEASURE_ORA_PDB 이름이 올바르지 않다: $ORA_PDB" >&2; exit 2 ;; esac
  up=$(printf '%s' "$ORA_PDB" | tr '[:lower:]' '[:upper:]')
  allow=$(printf '%s' "${MEASURE_ORA_ALLOW:-}" | tr '[:lower:]' '[:upper:]')
  case "$up" in
    FREEPDB1|'CDB$ROOT'|'PDB$SEED'|TPL_*|L_*)
      echo "MEASURE_ORA_PDB=$ORA_PDB — 이 PDB 는 측정이 지우지 않는다(FREEPDB1·CDB\$ROOT·PDB\$SEED·TPL_*·L_*). T_ 시험 PDB 를 쓴다" >&2
      exit 2 ;;
    T_*) ;;
    *)
      if [ "$allow" != "$up" ]; then
        echo "MEASURE_ORA_PDB=$ORA_PDB — T_ 로 시작하는 시험 PDB 만 쓴다. 레인이 정한 이 PDB 를 써도 되면 MEASURE_ORA_ALLOW=$ORA_PDB 로 같은 이름을 적는다" >&2
        exit 2
      fi
      ORA_ALLOW_OPT="-Pdmes.ora.allowReset=$ORA_PDB" ;;
  esac
fi

RESULTS_BASE=$(abs_new "${MEASURE_RESULTS_DIR:-$TMP_ROOT/mdm-backend-perf}")
export MEASURE_RESULTS_DIR=$RESULTS_BASE

# 이 하니스는 Oracle 시험 기반(MdmSharedTestDb 의 dmes.ora.url)이 있는 커밋에서만 돈다 — SQLite 시절 커밋에는 돌지 않는다.
# P2·P4 가 같이 돌리는 추적 시험(동치·특성)도 그 워크트리에 이미 있어야 한다(예전처럼 사본을 복사해 주지 않는다).
if [ "$need_ora" = 1 ]; then
  for side in "${SIDES[@]}"; do
    wt=$(wt_of_early "$side")
    mdb=$wt/src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/testdb/MdmSharedTestDb.java
    if [ ! -f "$wt/scripts/oracle/pdb.mjs" ] || ! grep -q 'dmes.ora.url' "$mdb" 2>/dev/null; then
      echo "$side 워크트리에 Oracle 시험 기반이 없다(scripts/oracle/pdb.mjs·MdmSharedTestDb 의 dmes.ora.url): $wt" >&2
      echo "  이 하니스는 SQLite 시절 커밋(예: b557ccbd·923aa9a0)에서는 돌지 않는다 — Oracle 전환 이후 두 커밋을 쓴다" >&2
      exit 2
    fi
    # T_ 가 아닌 PDB 허용(-Pdmes.ora.allowReset)은 mdm/build.gradle 이 시험 JVM 으로 옮겨야 효과가 있다(0f9539c67 이후 커밋).
    if [ -n "$ORA_ALLOW_OPT" ] && ! grep -q 'dmes.ora.allowReset' "$wt/src/backend/mdm/build.gradle" 2>/dev/null; then
      echo "$side 워크트리의 mdm/build.gradle 이 dmes.ora.allowReset 을 시험 JVM 으로 넘기지 않는다 — T_ 시험 PDB 를 쓰거나 더 새 커밋을 쓴다: $wt" >&2
      exit 2
    fi
    for p in "${PS[@]}"; do
      for t in $(tracked_tests "$p"); do
        if [ ! -f "$wt/src/backend/mdm/api/src/test/java/$(echo "$t" | tr . /).java" ]; then
          echo "$side 워크트리에 $p 가 같이 돌리는 추적 시험이 없다: $t" >&2
          exit 2
        fi
      done
    done
  done
fi
# heavy.mjs 슬롯 아래에서만 돈다(Oracle 쓰는 gradle 은 PC 전체에서 한 번에 하나).
[ -f "$HEAVY" ] || { echo "heavy.mjs 가 없다(저장소 .claude/skills/dflow-dev/scripts/heavy.mjs): $HEAVY" >&2; exit 2; }

# ── 독점 실행 구분 ───────────────────────────────────────────────────
# 바깥(EXCL=1): heavy.mjs --exclusive 로 자기 자신을 자식으로 다시 부른다(exec 아님 — 신호를 바깥이 맡는다).
# 안쪽(MDM_PERF_EXCL_INNER=1): heavy.mjs 가 일반 슬롯 K개를 모두 잡은 뒤 부른 실행. 이 안에서는 gradle 을 heavy.mjs 로 다시 감싸지 않는다
# (DFLOW_HEAVY_HELD 가 있으면 슬롯을 이미 쥔 것이다).
INNER=0
EXCL_SLOT=-
if [ "${MDM_PERF_EXCL_INNER:-}" = 1 ]; then
  INNER=1
  unset MDM_PERF_EXCL_INNER
  # heavy.mjs 가 슬롯 폴더를 못 만들면(HEAVY_UNLOCKED) 슬롯 없이 그냥 부른다 — 독점이 아닌 측정을 정식 값으로 남기지 않는다.
  if [ -z "${DFLOW_HEAVY_HELD:-}" ] || [ ! -d "$DFLOW_HEAVY_HELD" ]; then
    echo "독점 슬롯이 확인되지 않는다(DFLOW_HEAVY_HELD 없음 — HEAVY_UNLOCKED?) — 측정하지 않는다" >&2
    exit 2
  fi
  EXCL_SLOT=$(basename "$DFLOW_HEAVY_HELD")
elif [ "$EXCL" = 1 ]; then
  if [ "$DRY" = 1 ]; then
    echo "--exclusive 는 --dry-run 과 함께 쓰지 않는다(독점은 정식 측정에만)" >&2
    exit 2
  fi
  [ -f "$HEAVY" ] || { echo "heavy.mjs 가 없다(저장소 .claude/skills/dflow-dev/scripts/heavy.mjs): $HEAVY — --exclusive 를 쓸 수 없다" >&2; exit 2; }
  # 슬롯을 쥔 채 독점을 부르면 heavy.mjs 가 HEAVY_EXCL_NESTED(exit 2)로 거부한다 — 미리 알아듣게 막는다.
  # (acquire 로 붙잡은 슬롯은 heavy.mjs 가 HEAVY_EXCL_NESTED 줄로 알린다.)
  if { [ -n "${DFLOW_HEAVY_HELD:-}" ] && [ -d "$DFLOW_HEAVY_HELD" ]; } \
     || { [ -n "${DFLOW_HEAVY_DOCKER_HELD:-}" ] && [ -d "$DFLOW_HEAVY_DOCKER_HELD" ]; }; then
    echo "이미 heavy.mjs 슬롯 안에서 불렸다 — --exclusive 는 run-measure.sh 를 heavy.mjs 로 감싸지 않고 직접 부른다(HEAVY_EXCL_NESTED 방지)" >&2
    exit 2
  fi
fi

wt_of() { if [ "$1" = base ]; then echo "$BASE_WT"; else echo "$DEV_WT"; fi; }

# ── 정리(한 함수 — 이 실행이 복사한 파일·만든 디렉터리만 지운다) ───────────────────
COPIED=()      # 이 실행이 복사한 파일(절대경로)
MADE_DIRS=()   # 이 실행이 만든 디렉터리(만든 순서 — 지울 때는 거꾸로)
HCHILD=        # 독점 바깥 실행이 띄운 heavy.mjs 자식 pid
remove_copies() {
  local f i
  for f in "${COPIED[@]}"; do rm -f "$f"; done
  COPIED=()
  for ((i=${#MADE_DIRS[@]}-1; i>=0; i--)); do rmdir "${MADE_DIRS[$i]}" 2>/dev/null; done
  MADE_DIRS=()
}
cleanup() {
  remove_copies
}
trap cleanup EXIT
# 독점 바깥 실행은 heavy.mjs 를 & 로 띄우므로 그 자식(과 손자인 안쪽 실행)은 SIGINT 를 무시한다 — TERM 으로 넘기고, 자식이
# 복사본을 지우고 끝날 때까지 기다린 뒤 끝낸다.
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

# ── 독점 바깥 실행: heavy.mjs --exclusive 로 자기 자신을 한 번 다시 부르고 그 rc 로 끝난다 ─────────
# 독점 대기 상한은 heavy.mjs 의 DFLOW_HEAVY_WAIT(기본 90초)를 그대로 따른다(환경변수로 넘기면 된다).
# 위에서 절대경로로 바꾼 MEASURE_*·MDM_MEASURE_SNAPSHOT_DIR·JAVA_HOME 은 export 돼 안쪽 실행에 그대로 넘어간다.
# 측정 중복 방지는 heavy.mjs 독점(일반 슬롯 K개 전부)과 하니스의 Oracle PC 잠금이 맡는다(이 스크립트는 따로 잠금을 두지 않는다).
if [ "$EXCL" = 1 ] && [ "$INNER" = 0 ]; then
  echo ">> heavy.mjs --exclusive 로 측정 전체를 한 번에 돈다(인자: ${INNER_ARGS[*]})" >&2
  MDM_PERF_EXCL_INNER=1 \
    node "$HEAVY" --exclusive /bin/bash "$HARNESS/run-measure.sh" "${INNER_ARGS[@]}" &
  HCHILD=$!
  wait "$HCHILD"; rc=$?
  HCHILD=
  case "$rc" in
    75) echo "독점 슬롯을 못 잡았다(HEAVY_BUSY) — 측정하지 않았다. 180초(DFLOW_HEAVY_EXCL_TTL) 안에 같은 명령을 다시 부르면 순번이 이어진다" >&2 ;;
    2)  echo "heavy.mjs 가 독점을 거부했거나(HEAVY_EXCL_NESTED — 위 줄 참고, acquire 한 슬롯이면 release 뒤 다시) 안쪽 실행의 사용법·점검 오류다" >&2 ;;
  esac
  exit "$rc"
fi

# ── 복사 ─────────────────────────────────────────────────────────────
# copy_one <원본> <대상> — 대상이 이미 있으면 추적되지 않는 잔여물이므로 중단한다.
copy_one() {
  local src=$1 dst=$2 d missing=()
  if [ -e "$dst" ]; then
    echo "대상이 이미 있다(추적되지 않는 잔여물?): $dst" >&2
    return 1
  fi
  d=$(dirname "$dst")
  while [ ! -d "$d" ]; do missing=("$d" "${missing[@]}"); d=$(dirname "$d"); done
  for d in "${missing[@]}"; do mkdir "$d" || return 1; MADE_DIRS+=("$d"); done
  cp "$src" "$dst" || return 1
  COPIED+=("$dst")
}

# install <side> <P> — 그 P 에 필요한 시험 소스를 복사한다(P2·P4 가 같이 돌리는 동치·특성 시험은 워크트리에 이미 추적돼 있다 — 사전 점검).
install() {
  local side=$1 p=$2 wt f
  wt=$(wt_of "$side")
  if [ "$p" = P5 ]; then
    copy_one "$HARNESS/src/maru-mdm-engine/kr/dongkuk/maru/mdm/engine/rule/MeasureP5RuleSetBenchTest.java" \
      "$wt/src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/rule/MeasureP5RuleSetBenchTest.java" || return 1
    return 0
  fi
  local troot=$wt/src/backend/mdm/api/src/test/java
  for f in "$HARNESS"/src/mdm-api/com/dongkuk/dmes/mdm/measure/*.java; do
    copy_one "$f" "$troot/com/dongkuk/dmes/mdm/measure/$(basename "$f")" || return 1
  done
}

# ── gradle ───────────────────────────────────────────────────────────
filters() {
  case "$1" in
    P1) echo "com.dongkuk.dmes.mdm.measure.MeasureP1MasterCodeFlushTest" ;;
    P2) echo "com.dongkuk.dmes.mdm.measure.MeasureP2HeaderImpactTest $(tracked_tests P2)" ;;
    P3) echo "com.dongkuk.dmes.mdm.measure.MeasureP3TermSearchTest" ;;
    P4) echo "com.dongkuk.dmes.mdm.measure.MeasureP4ColumnSearchTest $(tracked_tests P4)" ;;
    P5) echo "kr.dongkuk.maru.mdm.engine.rule.MeasureP5RuleSetBenchTest" ;;
  esac
}

# run_gradle <side> <P> <로그> — heavy.mjs 슬롯 아래에서 gradle 한 번. 독점 안쪽이면(DFLOW_HEAVY_HELD) 이미 슬롯을 쥔 것이라 다시 감싸지 않는다.
# mdm(P1~P4)은 Oracle 시험 하니스를 켠다: MEASURE_ORA_PDB 가 있으면 -Pdmes.ora.pdb(있는 PDB), 없으면 -Pdmes.ora.test=clone(T_<레인> 복제·삭제).
# 환경에 남은 DMES_ORA_PDB·DMES_ORA_URL·DMES_ORA_TEST 는 치운다 — 하니스는 DMES_ORA_PDB 가 있으면 clone 대신 그 PDB 를 쓴다.
run_gradle() {
  local side=$1 p=$2 log=$3 wt t targs=() runner=() ora=()
  wt=$(wt_of "$side")
  for t in $(filters "$p"); do targs+=(--tests "$t"); done
  local envs=(MDM_MEASURE=1)
  [ "$DRY" = 1 ] && envs+=(MDM_MEASURE_DRY=1)
  [ -z "${DFLOW_HEAVY_HELD:-}" ] && runner=(node "$HEAVY")
  if [ "$p" = P5 ]; then
    (cd "$wt/src/backend/maru-mdm-engine" && env "${envs[@]}" "${runner[@]}" ../gradlew test --rerun --console=plain -i --max-workers=2 "${targs[@]}") >"$log" 2>&1
  else
    if [ -n "$ORA_PDB" ]; then ora=("-Pdmes.ora.pdb=$ORA_PDB"); else ora=("-Pdmes.ora.test=clone"); fi
    [ -n "${MEASURE_ORA_TEMPLATE:-}" ] && ora+=("-Pdmes.ora.template=$MEASURE_ORA_TEMPLATE")
    # mdm/build.gradle 이 -Pdmes.ora.allowReset 을 시험 JVM 의 시스템 속성으로 넘긴다(0f9539c67 이후 커밋).
    [ -n "$ORA_ALLOW_OPT" ] && ora+=("$ORA_ALLOW_OPT")
    (cd "$wt/src/backend/mdm" && env -u DMES_ORA_PDB -u DMES_ORA_URL -u DMES_ORA_TEST "${envs[@]}" "${runner[@]}" \
      ../gradlew :api:test --rerun --console=plain -i --max-workers=2 "${ora[@]}" "${targs[@]}") >"$log" 2>&1
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
# 스냅샷 출처: 네 CSV 의 git blob 해시 앞 8자(두 쪽이 같은 폴더를 쓰므로 한 번만). 시험 쪽이 SHA-1 요약을 `MEASURE P3|P4 data source=…` 로도 남긴다.
SNAPSHOT_IDS=-
if [ "$need_source" = 1 ]; then
  SNAPSHOT_IDS=$(for t in TB_MDM_TERM TB_MDM_DOMAIN TB_MDM_COLUMN TB_MDM_COLUMN_SYSTEM; do $GIT hash-object "$SNAPSHOT_DIR/$t.csv" 2>/dev/null | cut -c1-8; done | tr '\n' ',')
  SNAPSHOT_IDS=${SNAPSHOT_IDS%,}
fi
uptime_line() { if command -v uptime >/dev/null 2>&1; then uptime; else echo -; fi; }

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
  expected=${expected:0:8}
  {
    echo "# side=$side wt=$wt head=$rev expected=${expected:--} P=$p round=$r/$n dry=$DRY exclusive=$INNER heavy_slot=$EXCL_SLOT"
    echo "# ora=$([ "$p" = P5 ] && echo none || echo "${ORA_PDB:-clone}") snapshot_dir=${SNAPSHOT_DIR:--} snapshot_blobs=$SNAPSHOT_IDS"
    echo "# started=$(date '+%Y-%m-%d %H:%M:%S')"
    echo "# uptime_before: $(uptime_line)"
  } >"$out"
  if [ -n "$expected" ] && [ "$rev" != "$expected" ]; then echo "# 경고: HEAD 가 기대값과 다르다" >>"$out"; fi
  echo ">> $side $p 회차 $r/$n → $out" >&2
  if ! install "$side" "$p"; then
    remove_copies
    echo "# 복사 실패" >>"$out"
    return 1
  fi
  run_gradle "$side" "$p" "$log"
  rc=$?
  remove_copies
  if [ "$rc" -eq 75 ]; then
    rm -f "$out"
    echo "heavy.mjs 슬롯을 못 잡았다(HEAVY_BUSY, 종료 75) — 측정하지 않았다. 같은 명령을 다시 부른다(DFLOW_HEAVY_WAIT 로 대기 상한을 늘릴 수 있다) — $log" >&2
    exit 75
  fi
  collect "$log" >>"$out"
  lines=$(grep -c '^MEASURE ' "$out")
  {
    echo "# uptime_after: $(uptime_line)"
    echo "# finished=$(date '+%Y-%m-%d %H:%M:%S') gradle_exit=$rc measure_lines=$lines"
    grep -a -E ' (FAILED|SKIPPED)$|tests completed|BUILD (SUCCESSFUL|FAILED) in' "$log" | sed -E 's/^[[:space:]]*/# gradle: /'
    # 하니스가 남기는 PDB·세션·VM 한 줄(복제·삭제한 PDB 이름, sessions max, 실패 때의 VM available·load)
    grep -a -E '\[dmes-ora\]' "$log" | sed -E 's/^[[:space:]]*/# ora: /'
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
