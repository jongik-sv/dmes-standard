#!/usr/bin/env bash
# be-run.sh — 백엔드 모듈(local 프로파일) 실행 스크립트
#
# 실행 대상 모듈과 포트:
#   mls 8092 · mqc 8093 · mpp 8094 · mpn 8095 · mdm 8096 · mcm 8100 · analog 8191
#   (mcm 이 포털 호스트 — FE 는 mcm 8100 을 본다)
#
# 사용법:
#   ./be-run.sh              # .run.env 의 BE_RUN_ARGS 사용 (기본 --all)
#   ./be-run.sh --all        # 전체 모듈
#   ./be-run.sh --mcm        # mcm 만
#   ./be-run.sh --mcm --mpn  # 여러 모듈 조합
#   ./be-run.sh --all --dry-run  # 아무것도 끄거나 띄우지 않고, 실행할 명령만 출력
#   ./be-run.sh --dry-run        # 모듈 플래그가 없으면 BE_RUN_ARGS(없으면 --all) 대상으로
#
# 모듈 플래그: --mpn --mcm --mls --mqc --mpp --mdm --analog
# --all 은 7개 JVM 을 동시에 띄운다. 메모리가 빠듯하면 필요한 모듈만 골라 쓴다.
# 옵션(--dry-run·--keep-port)만 주고 모듈 플래그가 없으면 BE_RUN_ARGS(없으면 --all)의 모듈을 쓴다.
#
# 모듈을 2개 이상 띄우면 기동 전에 src/backend 루트 composite 에서 Gradle 한 번으로 선빌드한다
# (공유 includeBuild 를 여러 bootRun 이 동시에 빌드하지 않게). 건너뛰려면 BE_PREBUILD=0.
# 선빌드(또는 그 계획 gradlew -m)가 실패하면 아무 모듈도 띄우지 않고 exit 1 로 끝난다.
#   BE_PREBUILD=0 ./be-run.sh --all           # 선빌드 없이 종전처럼 모듈별 bootRun 이 각자 빌드
#   BE_PREBUILD_CONTINUE=1 ./be-run.sh --all  # 선빌드가 실패해도 기동 (모듈 하나의 오류가 나머지를 막지 않게)
# 선빌드 계획(gradlew -m, 몇 초) 도중 받은 TERM 은 계획 프로세스까지 정리하지 못한다.
#
# 대상 포트를 이미 물고 있는 프로세스가 있으면 정리하고 시작한다.
#   ./be-run.sh --keep-port  # 회수하지 않고 "점유 중" 으로 중단 (종전 동작)
#
# 종료: Ctrl+C 로 이 실행이 띄운 것(gradlew 실행기·이 체크아웃의 bootRun 앱 JVM)만 정리한다.
#   Gradle 데몬은 멈추지 않는다(gradlew --stop 은 같은 버전의 모든 데몬을 멈춰 다른 워크트리 빌드를 깬다).
#   쉬는 데몬은 org.gradle.daemon.idletimeout(10분)으로 스스로 내려간다.
# ── 머리말 끝 (--help 는 여기까지 출력) ──

set -u
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/src/backend"
RUN_ENV_FILE="$ROOT_DIR/.run.env"

[ -f "$RUN_ENV_FILE" ] && . "$RUN_ENV_FILE"

# ── 로그 컬러링 ──────────────────────────────────────────────
case "${DEV_LOG_COLOR:-always}" in
  always|1|true|yes) DEVLOG_COLOR_ENABLED=1 ;;
  never|0|false|no) DEVLOG_COLOR_ENABLED=0 ;;
  auto)
    if [ -n "${NO_COLOR:-}" ] || [ "${TERM:-}" = "dumb" ]; then
      DEVLOG_COLOR_ENABLED=0
    else
      DEVLOG_COLOR_ENABLED=1
    fi
    ;;
  *) DEVLOG_COLOR_ENABLED=1 ;;
esac

if [ "$DEVLOG_COLOR_ENABLED" = "1" ]; then
  DEVLOG_RESET=$'\033[0m'
  DEVLOG_DIM=$'\033[2m'
  DEVLOG_RED=$'\033[31m'
  DEVLOG_GREEN=$'\033[32m'
  DEVLOG_YELLOW=$'\033[33m'
  DEVLOG_BLUE=$'\033[34m'
  DEVLOG_MAGENTA=$'\033[35m'
  DEVLOG_CYAN=$'\033[36m'
else
  DEVLOG_RESET=
  DEVLOG_DIM=
  DEVLOG_RED=
  DEVLOG_GREEN=
  DEVLOG_YELLOW=
  DEVLOG_BLUE=
  DEVLOG_MAGENTA=
  DEVLOG_CYAN=
fi

dev_log_tag_color() {
  case "$1" in
    be) printf '%s' "$DEVLOG_GREEN" ;;
    be-mcm) printf '%s' "$DEVLOG_BLUE" ;;
    be-mpn) printf '%s' "$DEVLOG_MAGENTA" ;;
    be-mls) printf '%s' "$DEVLOG_CYAN" ;;
    be-mqc) printf '%s' "$DEVLOG_YELLOW" ;;
    be-mpp) printf '%s' "$DEVLOG_GREEN" ;;
    be-mdm) printf '%s' "$DEVLOG_RED" ;;
    be-analog) printf '%s' "$DEVLOG_DIM" ;;
    *) printf '%s' "$DEVLOG_CYAN" ;;
  esac
}

dev_log_print() {
  local tag="$1"
  shift
  local color
  color="$(dev_log_tag_color "$tag")"
  printf '%b[%s]%b %s\n' "$color" "$tag" "$DEVLOG_RESET" "$*"
}

dev_log_error() {
  printf '%b[error]%b %s\n' "$DEVLOG_RED" "$DEVLOG_RESET" "$*" >&2
}

dev_log_run() {
  if [ "${DEVLOG_COLOR_ENABLED:-0}" = "1" ]; then
    FORCE_COLOR="${FORCE_COLOR:-1}" "$@"
  else
    "$@"
  fi
}

dev_log_prefix_stream() {
  local tag="$1"
  local tag_color
  tag_color="$(dev_log_tag_color "$tag")"

  awk \
    -v tag="$tag" \
    -v tag_color="$tag_color" \
    -v reset="$DEVLOG_RESET" \
    -v dim="$DEVLOG_DIM" \
    -v red="$DEVLOG_RED" \
    -v green="$DEVLOG_GREEN" \
    -v yellow="$DEVLOG_YELLOW" \
    -v cyan="$DEVLOG_CYAN" '
function paint(line, color) {
  return color == "" ? line : color line reset
}

function colorize(line) {
  if (line ~ /(^|[^[:alpha:]])(ERROR|ERR!|FAIL|FAILED|Failed|failed|Exception|Caused by:)([^[:alpha:]]|$)/) {
    return paint(line, red)
  }
  if (line ~ /(^|[^[:alpha:]])(WARN|WARNING|Warning|warning|Deprecated|deprecated)([^[:alpha:]]|$)/) {
    return paint(line, yellow)
  }
  if (line ~ /(could not|Cannot|Unable to|not found|No such file)/) {
    return paint(line, yellow)
  }
  if (line ~ /(^|[^[:alpha:]])(SUCCESS|SUCCESSFUL|Successful|successful|Ready|ready|Started|started|Compiled|compiled|Listening|listening)([^[:alpha:]]|$)/) {
    return paint(line, green)
  }
  if (line ~ /(Starting|Downloading|Installing|Building|Watching|> Task)/) {
    return paint(line, cyan)
  }
  if (line ~ /(^|[^[:alpha:]])(INFO|Info)([^[:alpha:]]|$)/) {
    return paint(line, cyan)
  }
  if (line ~ /(^|[^[:alpha:]])(DEBUG|TRACE)([^[:alpha:]]|$)/) {
    return paint(line, dim)
  }
  return line
}

{
  printf "%s[%s]%s %s\n", tag_color, tag, reset, colorize($0)
  fflush()
}
'
}

ENV_ARGS=()

load_default_args() {
  local var_name="$1"
  local value="${!var_name:-}"

  [ -n "$value" ] || return 1
  # shellcheck disable=SC2206
  ENV_ARGS=($value)
  [ "${#ENV_ARGS[@]}" -gt 0 ]
}

# 인자가 없거나 옵션(--dry-run·--keep-port)뿐인지. 그러면 모듈 대상은 기본값(BE_RUN_ARGS, 없으면 --all)에서
# 가져온다. 모듈 플래그·--help·모르는 인자가 하나라도 있으면 기본값을 붙이지 않는다.
be_args_options_only() {
  local a
  for a in "$@"; do
    case "$a" in
      --dry-run|--keep-port) ;;
      *) return 1 ;;
    esac
  done
  return 0
}

if be_args_options_only "$@"; then
  if load_default_args BE_RUN_ARGS; then
    set -- "$@" "${ENV_ARGS[@]}"
    dev_log_print "be" ".run.env 기본 옵션 사용: BE_RUN_ARGS=${BE_RUN_ARGS}"
  else
    # .run.env 는 개인 설정이라 git 에 없다(.gitignore). 새로 clone 한 저장소에서도
    # 인자 없이 바로 뜨도록 --all 로 폴백한다. 값을 바꾸려면 .run.env.example 을
    # .run.env 로 복사해 편집한다.
    set -- "$@" --all
    dev_log_print "be" ".run.env 없음 — 기본값 --all 로 진행 (.run.env.example 복사해 조정)"
  fi
fi

# ── 모듈 카탈로그 ────────────────────────────────────────────
# 실행 가능한 Spring Boot 모듈. 신규 모듈을 추가하면 아래 3곳만 손보면 된다.
#   (1) BE_ALL_MODULES  (2) be_module_port  (3) dev_log_tag_color 의 be-{모듈} 색상
BE_ALL_MODULES=(mls mqc mpp mpn mdm mcm analog)

be_module_port() {
  case "$1" in
    mls) printf '8092' ;;
    mqc) printf '8093' ;;
    mpp) printf '8094' ;;
    mpn) printf '8095' ;;
    mdm) printf '8096' ;;
    mcm) printf '8100' ;;
    analog) printf '8191' ;;
    *) printf '' ;;
  esac
}

# 모듈 전용 wrapper 가 있으면 그것을, 없으면 src/backend 공용 wrapper 를 쓴다.
# (표준 템플릿은 wrapper 를 src/backend 한 벌만 두고 모듈별 중복 사본을 두지 않는다.)
be_module_gradlew() {
  if [ -f "$BACKEND_DIR/$1/gradlew" ]; then
    printf './gradlew'
  else
    printf '%s' "$BACKEND_DIR/gradlew"
  fi
}

# 모듈별 bootRun 인자. mdm 은 빈 DB(처음 받은 체크아웃)에만 로컬 샘플 데이터를 한 번 넣는다
# (MdmLocalSampleLoader — 용어 사전이 비어 있을 때만, 이미 쓰던 DB 는 건드리지 않는다). 끄려면 MDM_SAMPLE=0.
# 경로는 bootRun 작업 디렉터리(src/backend/mdm) 기준이다. 자동 테스트·E2E 는 이 스크립트를 거치지 않아 영향이 없다.
be_module_boot_args() {
  local args='--spring.profiles.active=local'
  if [ "$1" = "mdm" ] && [ "${MDM_SAMPLE:-1}" != "0" ]; then
    args="$args --mdm.sample.path=sample/mdm-local-sample.sql"
  fi
  printf '%s' "$args"
}

be_selected_contains() {
  local m
  for m in "${SELECTED_MODULES[@]:-}"; do
    [ "$m" = "$1" ] && return 0
  done
  return 1
}

be_select_module() {
  be_selected_contains "$1" || SELECTED_MODULES+=("$1")
}

SELECTED_MODULES=()
KEEP_PORT=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --keep-port) KEEP_PORT=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --all|--full)
      for m in "${BE_ALL_MODULES[@]}"; do be_select_module "$m"; done ;;
    --mpn|--mcm|--mls|--mqc|--mpp|--mdm|--analog)
      be_select_module "${arg#--}" ;;
    -h|--help) sed -n '2,/^# ── 머리말 끝/p' "$0" | sed '$d'; exit 0 ;;
    *) dev_log_error "알 수 없는 옵션: $arg"; exit 2 ;;
  esac
done

if [ "${#SELECTED_MODULES[@]}" -eq 0 ]; then
  dev_log_error "BE 실행 대상을 선택하세요: --all 또는 --mpn/--mcm/--mls/--mqc/--mpp/--mdm/--analog"
  exit 2
fi

# ── 선빌드 ───────────────────────────────────────────────────
# 모듈마다 따로 bootRun 을 띄우면 Gradle 프로세스 여러 개가 공유 includeBuild(cactus-core·mcm-core·
# maru-mdm-engine 등)를 동시에 빌드하며 서로의 build/classes·jar 를 덮어쓴다. 그래서 모듈이 2개 이상이면
# 기동 전에 src/backend 루트 composite 에서 Gradle 한 번으로 bootRun 이 쓰는 산출물(classes·jar)을 먼저 만든다.
# includeBuild 의 실행 기록은 각 빌드 폴더의 .gradle 에 남으므로, 이어서 모듈 폴더에서 도는 bootRun 은
# 컴파일·jar 가 모두 UP-TO-DATE 라 기동만 한다(기동 방식·프로파일·JVM 옵션·로그는 종전 그대로).
#
# 선빌드할 태스크는 손으로 적지 않고 Gradle 에 묻는다 — 선택 모듈의 bootRun 을 -m(실행 없이 계획만)으로
# 돌려 나온 태스크 중 bootRun 만 뺀다. 의존이 바뀌어도 목록이 따라간다.
# 계획이나 선빌드가 실패하면 기동하지 않고 exit 1 로 끝난다 — 실패한 채 bootRun 을 띄우면 그 7개가 공유
# includeBuild 를 다시 동시에 빌드해 이 단계가 없애려던 경합이 되살아난다. 종전처럼 실패해도 띄우려면
# BE_PREBUILD_CONTINUE=1(모듈 하나의 컴파일 오류가 나머지를 막지 않게), 선빌드 자체를 끄려면 BE_PREBUILD=0.
BE_PREBUILD_TASKS=()
BE_PREBUILD_PLAN_OUTPUT=""

be_prebuild_enabled() {
  [ "${BE_PREBUILD:-1}" != "0" ] && [ "${#SELECTED_MODULES[@]}" -ge 2 ]
}

be_prebuild_plan_args() {
  local m
  for m in "${SELECTED_MODULES[@]}"; do
    printf ':%s:api:bootRun\n' "$m"
  done
}

# BE_PREBUILD_TASKS 를 채운다. 계획 실패·빈 목록이면 1.
be_prebuild_plan() {
  local line rc
  local plan_args=()

  BE_PREBUILD_TASKS=()
  while IFS= read -r line; do
    [ -n "$line" ] && plan_args+=("$line")
  done < <(be_prebuild_plan_args)

  BE_PREBUILD_PLAN_OUTPUT="$(cd "$BACKEND_DIR" && "$BACKEND_DIR/gradlew" "${plan_args[@]}" -m -q --console=plain 2>&1)"
  rc=$?
  [ "$rc" = "0" ] || return 1

  while IFS= read -r line; do
    line="${line%$'\r'}"
    case "$line" in
      :*" SKIPPED")
        line="${line% SKIPPED}"
        case "$line" in
          *:bootRun) ;;
          *) BE_PREBUILD_TASKS+=("$line") ;;
        esac
        ;;
    esac
  done <<< "$BE_PREBUILD_PLAN_OUTPUT"

  [ "${#BE_PREBUILD_TASKS[@]}" -gt 0 ]
}

be_prebuild_continue() {
  [ "${BE_PREBUILD_CONTINUE:-0}" = "1" ]
}

be_prebuild_print_plan_failure() {
  dev_log_error "선빌드 계획(gradlew -m) 실패 — 아래 출력에서 원인을 확인하세요."
  printf '%s\n' "$BE_PREBUILD_PLAN_OUTPUT" | tail -n 15 | dev_log_prefix_stream "be-build" >&2
}

# 선빌드가 실패했을 때: 기본은 아무것도 띄우지 않고 exit 1. BE_PREBUILD_CONTINUE=1 이면 종전처럼 기동을 이어 간다.
be_prebuild_fail() {
  if be_prebuild_continue; then
    dev_log_error "BE_PREBUILD_CONTINUE=1 — 선빌드 실패에도 모듈별 bootRun 으로 기동한다. 실패한 모듈은 자기 로그에 같은 오류를 다시 낸다."
    return 0
  fi
  dev_log_error "선빌드가 실패해 백엔드 모듈을 띄우지 않고 종료한다 (exit 1)."
  dev_log_error "  선빌드 없이 종전처럼 모듈별 bootRun 으로 띄우려면: BE_PREBUILD=0 $0 ${SELECTED_MODULES[*]/#/--}"
  dev_log_error "  선빌드 실패에도 기동을 이어 가려면: BE_PREBUILD_CONTINUE=1 (.run.env 에 둬도 된다)"
  exit 1
}

BE_PREBUILD_BG_PID=""

# 선빌드 도중 TERM·INT 를 받으면 선빌드 트리(서브셸·gradlew 가 exec 한 java 클라이언트·awk)를 함께 끝낸다.
# 선빌드는 종료 트랩보다 앞에서 돌기 때문에, 이 임시 트랩이 없으면 bash 만 죽고 빌드가 고아로 남는다.
# (백그라운드 잡은 비대화형 셸에서 SIGINT 를 무시하므로 Ctrl+C 도 여기서 대신 전한다.)
be_prebuild_abort() {
  local reason="$1"
  trap - INT TERM
  dev_log_error "선빌드 중 종료 신호($reason) 수신 — 선빌드 프로세스 정리 후 종료한다."
  if [ -n "$BE_PREBUILD_BG_PID" ]; then
    terminate_pid_tree TERM "$BE_PREBUILD_BG_PID"
    wait_for_exit "$BE_PREBUILD_BG_PID" || terminate_pid_tree KILL "$BE_PREBUILD_BG_PID"
  fi
  case "$reason" in
    INT) exit 130 ;;
    *) exit 143 ;;
  esac
}

be_run_prebuild() {
  local rc

  if ! be_prebuild_plan; then
    be_prebuild_print_plan_failure
    be_prebuild_fail
    return 0
  fi

  dev_log_print "be" "선빌드 시작 (태스크 ${#BE_PREBUILD_TASKS[@]}개, Gradle 1회) — cwd=$BACKEND_DIR"
  # src/backend/gradlew 는 bootRun 이 아닌 실행을 PC 전역 무거운 명령 슬롯(heavy.sh)에 줄 세운다. 선빌드는
  # 종전에 bootRun 7개가 슬롯 없이 하던 컴파일을 한 번으로 모은 것이라, 슬롯을 기다리게 하면 다른 세션의
  # 테스트가 많을 때 서버 기동이 수십 분 밀린다(종전엔 없던 대기). 그래서 종전처럼 슬롯 없이 돈다.
  # 백그라운드로 띄우고 wait 한다 — 그래야 아래 임시 트랩이 신호를 받는 즉시 트리를 정리할 수 있다.
  # 바깥 서브셸은 gradlew 의 종료 코드(PIPESTATUS[0])로 끝나므로 wait 가 그 값을 돌려준다.
  (
    (
      cd "$BACKEND_DIR" || exit 1
      export DFLOW_GRADLEW_NO_HEAVY=1
      dev_log_run "$BACKEND_DIR/gradlew" "${BE_PREBUILD_TASKS[@]}" --continue --console=plain 2>&1
    ) | dev_log_prefix_stream "be-build"
    exit "${PIPESTATUS[0]}"
  ) &
  BE_PREBUILD_BG_PID="$!"
  trap 'be_prebuild_abort INT' INT
  trap 'be_prebuild_abort TERM' TERM
  wait "$BE_PREBUILD_BG_PID"
  rc=$?
  trap - INT TERM
  BE_PREBUILD_BG_PID=""

  if [ "$rc" = "0" ]; then
    dev_log_print "be" "선빌드 완료 — 이어서 모듈별 bootRun 은 컴파일 없이 기동한다."
    return 0
  fi
  dev_log_error "선빌드 실패 (exit=$rc) — 위 [be-build] 로그에서 원인을 확인하세요."
  be_prebuild_fail
  return 0
}

# ── 드라이런 ─────────────────────────────────────────────────
# 이전 인스턴스 종료·포트 회수·종료 트랩보다 앞에서 끝낸다 — 아무 프로세스도 끄거나 띄우지 않는다.
# 선빌드 태스크 목록을 보이려고 gradlew -m(계획만, 태스크 실행 없음)만 한 번 부른다.
if [ "$DRY_RUN" = "1" ]; then
  dev_log_print "be" "[dry-run] 기동 대상: $(printf '%s ' "${SELECTED_MODULES[@]}")"
  if [ "$KEEP_PORT" = "1" ]; then
    dev_log_print "be" "[dry-run] 포트 점유 시 중단(--keep-port): $(for m in "${SELECTED_MODULES[@]}"; do printf '%s ' "$(be_module_port "$m")"; done)"
  else
    dev_log_print "be" "[dry-run] 이 체크아웃의 이전 be-run.sh 종료 뒤 포트 회수: $(for m in "${SELECTED_MODULES[@]}"; do printf '%s ' "$(be_module_port "$m")"; done)"
  fi

  if be_prebuild_enabled; then
    dev_log_print "be" "[dry-run] 1) 선빌드 계획: (cd $BACKEND_DIR && $BACKEND_DIR/gradlew $(be_prebuild_plan_args | tr '\n' ' ')-m -q --console=plain)"
    if be_prebuild_plan; then
      dev_log_print "be" "[dry-run] 2) 선빌드 (Gradle 1회, 태스크 ${#BE_PREBUILD_TASKS[@]}개): (cd $BACKEND_DIR && DFLOW_GRADLEW_NO_HEAVY=1 $BACKEND_DIR/gradlew <아래 태스크> --continue --console=plain)"
      for t in "${BE_PREBUILD_TASKS[@]}"; do
        dev_log_print "be" "[dry-run]      $t"
      done
    else
      be_prebuild_print_plan_failure
    fi
    if be_prebuild_continue; then
      dev_log_print "be" "[dry-run]    계획·선빌드가 실패해도 기동을 이어 간다 (BE_PREBUILD_CONTINUE=1)."
    else
      dev_log_print "be" "[dry-run]    계획·선빌드가 실패하면 아무 모듈도 띄우지 않고 exit 1 (우회: BE_PREBUILD=0 또는 BE_PREBUILD_CONTINUE=1)."
    fi
  else
    dev_log_print "be" "[dry-run] 선빌드 생략 (모듈 1개 또는 BE_PREBUILD=0) — 종전처럼 bootRun 이 직접 빌드한다."
  fi

  dev_log_print "be" "[dry-run] 기동 순서 (각자 백그라운드, 로그 접두어 [be-<모듈>]):"
  for m in "${SELECTED_MODULES[@]}"; do
    dev_log_print "be" "[dry-run]   be-$m :$(be_module_port "$m") — (cd $BACKEND_DIR/$m && $(be_module_gradlew "$m") :api:bootRun --args=\"$(be_module_boot_args "$m")\" --console=plain)"
  done
  exit 0
fi

# ── 프로세스 유틸 (포트 회수·종료 처리 공용) ─────────────────
terminate_pid_tree() {
  local signal="$1"
  local pid="$2"
  local child

  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0

  while IFS= read -r child; do
    [ -n "$child" ] && terminate_pid_tree "$signal" "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)

  kill "-$signal" "$pid" 2>/dev/null || true
}

wait_for_exit() {
  local pid
  local alive
  local i

  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    alive=0
    for pid in "$@"; do
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        alive=1
      fi
    done
    [ "$alive" = "0" ] && return 0
    sleep 0.25
  done
  return 1
}

# ── 사전 점검 ────────────────────────────────────────────────
for m in "${SELECTED_MODULES[@]}"; do
  [ -d "$BACKEND_DIR/$m" ] || { dev_log_error "디렉토리 누락: $BACKEND_DIR/$m"; exit 1; }
  # gradlew 실행권한 자동 보정 (모듈 전용 wrapper 가 있는 모듈만 해당)
  if [ -f "$BACKEND_DIR/$m/gradlew" ] && [ ! -x "$BACKEND_DIR/$m/gradlew" ]; then
    chmod +x "$BACKEND_DIR/$m/gradlew" 2>/dev/null || true
  fi
done
[ -x "$BACKEND_DIR/gradlew" ] || chmod +x "$BACKEND_DIR/gradlew" 2>/dev/null || true

# local 프로파일 SQLite 파일 위치 — 모든 모듈의 application.yml 이 ../data/{모듈}.db 를 가리킨다.
# bootRun 의 workingDir 이 모듈 루트라 이 디렉토리가 없으면 SQLITE_CANTOPEN 으로 죽는다.
mkdir -p "$BACKEND_DIR/data"

# ── 이전 실행 인스턴스 종료 ──────────────────────────────────
# 포트만 뺏으면 이전 be-run.sh 가 "내 모듈이 다 죽었다" 고 판단해 뒤늦게 cleanup 을 돌린다.
# 그 cleanup 은 이 체크아웃 모듈 포트의 앱 JVM 을 정리하므로, 방금 새로 띄운 같은 포트의 모듈까지
# 함께 죽일 수 있다. 그래서 포트를 건드리기 전에 이전 인스턴스를 먼저 끝내고 기다린다.
#
# 대상은 **이 체크아웃의** be-run.sh 만이다. 같은 PC 의 다른 체크아웃·워크트리(예: /dflow-team 팀원
# 워크트리 dflow-<id8>)에서 도는 be-run.sh 까지 잡으면 남의 서버를 죽인다(2026-09-24 사고: 팀원이
# 워크트리에서 --mdm 을 띄우자 메인 체크아웃의 mcm 8100 이 함께 종료됐다).

# pid 의 작업 디렉터리(절대경로). 알 수 없으면 빈 값.
pid_cwd() {
  local pid="$1"
  if [ -e "/proc/$pid/cwd" ]; then
    readlink "/proc/$pid/cwd" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
  fi
}

# pid 가 이 체크아웃($ROOT_DIR)의 be-run.sh 인지.
# - 명령줄의 be-run.sh 가 절대경로면 그 경로가 이 체크아웃의 것일 때만 참이다.
# - 상대경로(./be-run.sh)면 cwd 로 본다. 서브셸은 모듈 폴더(src/backend/<m>)로 cd 해 있으므로
#   $ROOT_DIR 자체이거나 $ROOT_DIR/src/ 아래면 참이다. 워크트리는 $ROOT_DIR/dflow-<id8>·
#   $ROOT_DIR/.claude/worktrees/ 아래에 생기므로 단순 접두 비교를 쓰지 않는다.
is_own_be_run() {
  local pid="$1" args tok cwd
  args="$(ps -o command= -p "$pid" 2>/dev/null || true)"
  for tok in $args; do
    case "$tok" in
      /*be-run.sh) [ "$tok" = "$ROOT_DIR/be-run.sh" ]; return ;;
      *be-run.sh) break ;;
    esac
  done
  cwd="$(pid_cwd "$pid")"
  case "$cwd" in
    "$ROOT_DIR"|"$ROOT_DIR/src/"*) return 0 ;;
  esac
  return 1
}

terminate_previous_be_runs() {
  local pid
  local victims=()

  command -v pgrep >/dev/null 2>&1 || return 0

  for pid in $(pgrep -f "be-run.sh" 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "$PPID" ] && continue          # local-run.sh 등 부모는 건드리지 않는다
    kill -0 "$pid" 2>/dev/null || continue
    is_own_be_run "$pid" || continue          # 다른 체크아웃·워크트리의 인스턴스는 건드리지 않는다
    victims+=("$pid")
  done

  [ "${#victims[@]}" -gt 0 ] || return 0

  dev_log_print "be" "이전 be-run.sh 인스턴스 종료 대기 (pid ${victims[*]}) — 그 cleanup 이 끝나야 안전하다"
  for pid in "${victims[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done

  # cleanup(앱 JVM 정리 포함)이 끝날 때까지 최대 30초 기다린다.
  local i alive
  for i in $(seq 1 120); do
    alive=0
    for pid in "${victims[@]}"; do
      kill -0 "$pid" 2>/dev/null && alive=1
    done
    [ "$alive" = "0" ] && break
    sleep 0.25
  done

  for pid in "${victims[@]}"; do
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
  done
}

terminate_previous_be_runs

# ── 포트 회수 ────────────────────────────────────────────────
# 이전 실행이 남긴 bootRun JVM 이 포트를 물고 있으면 그냥 정리하고 시작한다
# (fe-run.sh 가 포털 포트 5100 에 대해 하는 것과 같은 동작).
# 다른 프로그램이 쓰는 포트까지 건드리는 게 부담스러우면 --keep-port 로 종전처럼
# "점유 중이면 중단" 동작을 쓴다.
reclaim_backend_port() {
  local port="$1"
  local tag="$2"
  local pid
  local occupied=0

  if ! command -v lsof >/dev/null 2>&1; then
    dev_log_error "lsof 를 찾을 수 없어 포트 $port 점유 여부를 확인할 수 없습니다."
    return 1
  fi

  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    occupied=1

    if [ "$KEEP_PORT" = "1" ]; then
      dev_log_error "$tag 가 사용할 포트 $port 가 이미 점유 중입니다 (pid=$pid)."
      echo "        --keep-port 가 지정돼 회수하지 않습니다. 직접 정리한 뒤 다시 실행하세요:" >&2
      echo "          kill $pid" >&2
      return 1
    fi

    # 무엇을 죽이는지 보이게 남긴다 — 예상 밖의 프로세스면 여기서 알아챌 수 있다.
    dev_log_print "be" "$tag 포트 $port 점유 프로세스 정리 (TERM pid=$pid) — $(ps -o comm= -p "$pid" 2>/dev/null | head -1)"
    terminate_pid_tree TERM "$pid"
  done

  [ "$occupied" = "0" ] && return 0

  wait_for_exit $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true) || true

  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    dev_log_print "be" "$tag 포트 $port 강제 종료 (KILL pid=$pid)"
    terminate_pid_tree KILL "$pid"
  done

  sleep 0.3
  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    dev_log_error "$tag 가 사용할 포트 $port 를 비우지 못했습니다 (pid=$pid). 권한이 없는 프로세스일 수 있습니다."
    return 1
  done

  return 0
}

for m in "${SELECTED_MODULES[@]}"; do
  reclaim_backend_port "$(be_module_port "$m")" "be-$m" || exit 1
done

# 종료 트랩보다 앞에서 돈다 — 띄운 모듈이 아직 없으므로 선빌드 중 Ctrl+C·TERM 은 be_run_prebuild 의
# 임시 트랩이 선빌드 트리만 정리하고 끝낸다. 선빌드가 실패하면 여기서 exit 1(BE_PREBUILD_CONTINUE=1 이면 계속).
if be_prebuild_enabled; then
  be_run_prebuild
fi

# ── 로그 프리픽스 ────────────────────────────────────────────
PIDS=()
PID_TAGS=()   # PIDS 와 같은 인덱스의 모듈 태그 (be-mcm 등) — 어느 모듈이 죽었는지 알리기 위함
LOG_PIDS=()

run_with_prefix() {
  local tag="$1"; shift
  local dir="$1"; shift
  local pid_file="${TMPDIR:-/tmp}/dev-be-${tag}-$$.pid"
  rm -f "$pid_file"

  (
    cd "$dir" || exit 1
    dev_log_run "$@" 2>&1 &
    local child_pid="$!"
    printf '%s\n' "$child_pid" > "$pid_file"
    wait "$child_pid" 2>/dev/null || true
  ) | dev_log_prefix_stream "$tag" &

  local log_pid="$!"
  # Bash reports disowned background pipelines less noisily on Ctrl+C.
  # The real Gradle child PID is tracked separately in PIDS below.
  disown "$log_pid" 2>/dev/null || true
  local run_pid=""
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if [ -s "$pid_file" ]; then
      run_pid="$(cat "$pid_file")"
      break
    fi
    sleep 0.05
  done
  rm -f "$pid_file"

  if [ -n "$run_pid" ]; then
    PIDS+=("$run_pid")
    PID_TAGS+=("$tag")
    dev_log_print "be" "$tag 시작 (pid $run_pid, log $log_pid) — cwd=$dir : $*"
  else
    dev_log_error "$tag 실행 PID 확인 실패 — cwd=$dir : $*"
  fi
  LOG_PIDS+=("$log_pid")
}

# ── 종료 핸들러 ─────────────────────────────────────────────
CLEANUP_DONE=0

# 모듈 하나가 죽어도 나머지는 계속 띄운다.
#
# 종전에는 자식 하나만 끝나도 즉시 return 해서 전체를 정리했다. 모듈이 6개가 되면
# (예: 메모리 부족으로 한 JVM 이 OOM) 멀쩡한 5개와 프론트까지 동반 종료돼,
# 정작 사용자에게는 "왜 백엔드가 통째로 사라졌는지" 가 안 보인다.
# 이제는 죽은 모듈만 이름을 찍어 알리고, 전부 죽었을 때만 빠져나온다.
wait_for_backend_exit() {
  local i pid alive

  while :; do
    alive=0
    for i in "${!PIDS[@]}"; do
      pid="${PIDS[$i]}"
      [ -n "$pid" ] || continue
      if kill -0 "$pid" 2>/dev/null; then
        alive=1
      else
        dev_log_error "${PID_TAGS[$i]} 프로세스가 종료됐습니다 (pid=$pid). 위 로그에서 원인을 확인하세요."
        dev_log_error "  다시 띄우려면: ./be-run.sh --${PID_TAGS[$i]#be-}"
        PIDS[$i]=""
      fi
    done

    [ "$alive" = "0" ] && {
      dev_log_error "실행 중인 백엔드 모듈이 없습니다 — 정리 후 종료합니다."
      return 0
    }
    sleep 0.5
  done
}

# pid 가 이 체크아웃의 모듈($2) bootRun 앱 JVM 인지.
# bootRun 의 앱 JVM 은 be-run 의 프로세스 트리가 아니라 Gradle 데몬의 자식이다. 그래서 gradlew 실행기만
# 끊으면 남는다 — 종료 경로에서 모듈 포트의 리스너를 따로 정리하되, 다른 체크아웃(메인 저장소·다른 워크트리)의
# 같은 포트 서버는 절대 건드리지 않게 여기서 고른다.
# - 이름이 java 인 프로세스만.
# - 작업 디렉터리를 알면 그것으로만 판단한다: bootRun 이 workingDir = rootProject.projectDir 이라
#   이 체크아웃의 모듈 폴더($BACKEND_DIR/<모듈>)와 정확히 같아야 한다(lsof 는 실제 경로를 내므로 pwd -P 도 비교).
#   워크트리는 $ROOT_DIR/.claude/worktrees/·$ROOT_DIR/dflow-<id8> 아래라 정확 비교로 서로 갈린다.
# - 작업 디렉터리를 모르면 명령줄(공백·콜론으로 나눈 classpath 항목)이 그 모듈 폴더 아래 경로로 시작할 때만.
is_own_backend_jvm() {
  local pid="$1"
  local m="$2"
  local mod_dir="$BACKEND_DIR/$m"
  local mod_dir_phys comm cwd args tok
  local IFS=$' \t\n'

  mod_dir_phys="$(cd "$mod_dir" 2>/dev/null && pwd -P)"
  [ -n "$mod_dir_phys" ] || mod_dir_phys="$mod_dir"

  comm="$(ps -o comm= -p "$pid" 2>/dev/null | head -n 1)"
  [ "${comm##*/}" = "java" ] || return 1

  cwd="$(pid_cwd "$pid")"
  if [ -n "$cwd" ]; then
    [ "$cwd" = "$mod_dir" ] || [ "$cwd" = "$mod_dir_phys" ]
    return
  fi

  args="$(ps -ww -o command= -p "$pid" 2>/dev/null || true)"
  IFS=$' \t\n:'
  for tok in $args; do
    case "$tok" in
      "$mod_dir"/*|"$mod_dir_phys"/*) return 0 ;;
    esac
  done
  return 1
}

# 이 실행이 맡은 모듈 포트를 LISTEN 중인 이 체크아웃의 앱 JVM 에 신호를 보낸다.
# 신호를 보낸 pid 는 BE_OWN_PORT_PIDS 에 남는다(호출할 때마다 새로 찾는다 — KILL 단계는 다시 스캔해
# 그사이 끝난 pid 나 새로 바인드한 남의 프로세스를 치지 않는다).
BE_OWN_PORT_PIDS=()
terminate_backend_ports() {
  local signal="$1"
  local m port tag port_pid

  BE_OWN_PORT_PIDS=()
  command -v lsof >/dev/null 2>&1 || return 0

  for m in "${SELECTED_MODULES[@]}"; do
    port="$(be_module_port "$m")"
    tag="be-$m"
    for port_pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
      [ -n "$port_pid" ] || continue
      [ "$port_pid" = "$$" ] && continue
      if is_own_backend_jvm "$port_pid" "$m"; then
        dev_log_print "be" "$tag 포트 $port 앱 JVM 정리 ($signal pid=$port_pid)"
        terminate_pid_tree "$signal" "$port_pid"
        BE_OWN_PORT_PIDS+=("$port_pid")
      elif [ "$signal" = "TERM" ]; then
        dev_log_print "be" "$tag 포트 $port 리스너 pid=$port_pid 는 이 체크아웃의 bootRun JVM 이 아니라 건드리지 않는다 — $(ps -o comm= -p "$port_pid" 2>/dev/null | head -n 1)"
      fi
    done
  done
}

cleanup() {
  local reason="${1:-EXIT}"
  local first_signal="TERM"
  local pid

  trap - INT TERM EXIT
  if [ "$CLEANUP_DONE" = "1" ]; then
    return 0
  fi
  CLEANUP_DONE=1

  echo
  dev_log_print "be" "종료 신호 수신, 자식 프로세스 정리 중..."
  # 배열이 비어도 bash 3.2 + set -u 에서 죽지 않게 ${arr[@]+"${arr[@]}"} 로 편다.
  if [ "$reason" = "INT" ]; then
    wait_for_exit ${PIDS[@]+"${PIDS[@]}"} || true
  else
    for pid in ${PIDS[@]+"${PIDS[@]}"}; do
      terminate_pid_tree "$first_signal" "$pid"
    done
  fi

  # gradlew 실행기 트리 → 이 체크아웃의 앱 JVM(데몬의 자식이라 실행기 트리 밖) 순서로 TERM → 대기 → KILL.
  for pid in ${PIDS[@]+"${PIDS[@]}"}; do
    terminate_pid_tree TERM "$pid"
  done
  terminate_backend_ports TERM
  wait_for_exit ${PIDS[@]+"${PIDS[@]}"} ${BE_OWN_PORT_PIDS[@]+"${BE_OWN_PORT_PIDS[@]}"} || true

  for pid in ${PIDS[@]+"${PIDS[@]}"}; do
    terminate_pid_tree KILL "$pid"
  done
  terminate_backend_ports KILL

  for pid in ${LOG_PIDS[@]+"${LOG_PIDS[@]}"}; do
    terminate_pid_tree TERM "$pid"
  done
  wait_for_exit ${LOG_PIDS[@]+"${LOG_PIDS[@]}"} || true

  # Gradle 데몬은 멈추지 않는다. gradlew --stop 은 같은 사용자·같은 Gradle 버전의 데몬을 모두 멈춰
  # 다른 워크트리에서 도는 빌드·시험을 "Gradle build daemon has been stopped" 로 깨뜨린다.
  # bootRun 을 돌던 데몬은 빌드가 끝나 쉬게 되고, org.gradle.daemon.idletimeout(10분)으로 스스로 내려간다.
  dev_log_print "be" "정리 완료. (Gradle 데몬은 그대로 둔다 — 쉬면 10분 뒤 스스로 내려간다)"

  case "$reason" in
    INT) exit 130 ;;
    TERM) exit 143 ;;
  esac
}
trap 'cleanup INT' INT
trap 'cleanup TERM' TERM
trap 'cleanup EXIT' EXIT

# ── 백엔드 실행 ─────────────────────────────────────────────
for m in "${SELECTED_MODULES[@]}"; do
  run_with_prefix "be-$m" "$BACKEND_DIR/$m" \
    "$(be_module_gradlew "$m")" :api:bootRun --args="$(be_module_boot_args "$m")" --console=plain
done

dev_log_print "be" "기동 대상: $(printf '%s ' "${SELECTED_MODULES[@]}")"
for m in "${SELECTED_MODULES[@]}"; do
  dev_log_print "be" "  be-$m → http://localhost:$(be_module_port "$m")"
done
dev_log_print "be" "백엔드 기동 완료. Ctrl+C 로 종료."
wait_for_backend_exit
