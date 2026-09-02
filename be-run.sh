#!/usr/bin/env bash
# be-run.sh — 백엔드 모듈(local 프로파일) 실행 스크립트
#
# 실행 대상 모듈과 포트:
#   mls 8092 · mqc 8093 · mpp 8094 · mpn 8095 · mcm 8100 · analog 8191
#   (mcm 이 포털 호스트 — FE 는 mcm 8100 을 본다)
#
# 사용법:
#   ./be-run.sh              # .run.env 의 BE_RUN_ARGS 사용 (기본 --all)
#   ./be-run.sh --all        # 전체 모듈
#   ./be-run.sh --mcm        # mcm 만
#   ./be-run.sh --mcm --mpn  # 여러 모듈 조합
#
# 모듈 플래그: --mpn --mcm --mls --mqc --mpp --analog
# --all 은 6개 JVM 을 동시에 띄운다. 메모리가 빠듯하면 필요한 모듈만 골라 쓴다.
#
# 대상 포트를 이미 물고 있는 프로세스가 있으면 정리하고 시작한다.
#   ./be-run.sh --keep-port  # 회수하지 않고 "점유 중" 으로 중단 (종전 동작)
#
# 종료: Ctrl+C 로 자식 프로세스 및 gradle daemon 일괄 정리.

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

if [ "$#" -eq 0 ]; then
  if load_default_args BE_RUN_ARGS; then
    set -- "${ENV_ARGS[@]}"
    dev_log_print "be" ".run.env 기본 옵션 사용: BE_RUN_ARGS=${BE_RUN_ARGS}"
  else
    # .run.env 는 개인 설정이라 git 에 없다(.gitignore). 새로 clone 한 저장소에서도
    # 인자 없이 바로 뜨도록 --all 로 폴백한다. 값을 바꾸려면 .run.env.example 을
    # .run.env 로 복사해 편집한다.
    set -- --all
    dev_log_print "be" ".run.env 없음 — 기본값 --all 로 진행 (.run.env.example 복사해 조정)"
  fi
fi

# ── 모듈 카탈로그 ────────────────────────────────────────────
# 실행 가능한 Spring Boot 모듈. 신규 모듈을 추가하면 아래 3곳만 손보면 된다.
#   (1) BE_ALL_MODULES  (2) be_module_port  (3) dev_log_tag_color 의 be-{모듈} 색상
BE_ALL_MODULES=(mls mqc mpp mpn mcm analog)

be_module_port() {
  case "$1" in
    mls) printf '8092' ;;
    mqc) printf '8093' ;;
    mpp) printf '8094' ;;
    mpn) printf '8095' ;;
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
for arg in "$@"; do
  case "$arg" in
    --keep-port) KEEP_PORT=1 ;;
    --all|--full)
      for m in "${BE_ALL_MODULES[@]}"; do be_select_module "$m"; done ;;
    --mpn|--mcm|--mls|--mqc|--mpp|--analog)
      be_select_module "${arg#--}" ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) dev_log_error "알 수 없는 옵션: $arg"; exit 2 ;;
  esac
done

if [ "${#SELECTED_MODULES[@]}" -eq 0 ]; then
  dev_log_error "BE 실행 대상을 선택하세요: --all 또는 --mpn/--mcm/--mls/--mqc/--mpp/--analog"
  exit 2
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
# 그 cleanup 에는 `gradlew --stop`(전역 데몬 정지)이 들어 있어서, 방금 새로 띄운 모듈들이
#   FAILURE: Gradle build daemon has been stopped: stop command received
# 로 함께 죽는다. 그래서 포트를 건드리기 전에 이전 인스턴스를 먼저 끝내고 기다린다.
terminate_previous_be_runs() {
  local pid
  local victims=()

  command -v pgrep >/dev/null 2>&1 || return 0

  for pid in $(pgrep -f "be-run.sh" 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "$PPID" ] && continue          # local-run.sh 등 부모는 건드리지 않는다
    kill -0 "$pid" 2>/dev/null || continue
    victims+=("$pid")
  done

  [ "${#victims[@]}" -gt 0 ] || return 0

  dev_log_print "be" "이전 be-run.sh 인스턴스 종료 대기 (pid ${victims[*]}) — Gradle 데몬 정리까지 끝나야 안전하다"
  for pid in "${victims[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done

  # cleanup(gradlew --stop 포함)이 끝날 때까지 최대 30초 기다린다.
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
# (fe-run.sh 가 포털 포트 5000 에 대해 하는 것과 같은 동작).
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
      echo "          (cd $BACKEND_DIR && ./gradlew --stop)" >&2
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

terminate_backend_ports() {
  local signal="$1"
  local entry port tag port_pid

  local entries=()
  local m

  for m in "${SELECTED_MODULES[@]}"; do
    entries+=("$(be_module_port "$m"):be-$m")
  done

  for entry in "${entries[@]}"; do
    port="${entry%%:*}"
    tag="${entry##*:}"
    for port_pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
      dev_log_print "be" "$tag 포트 $port 리스너 정리 ($signal pid=$port_pid)"
      terminate_pid_tree "$signal" "$port_pid"
    done
  done
}

stop_gradle_daemons() {
  local stop_pids=()
  local pid
  local alive
  local i

  local m gw

  for m in "${SELECTED_MODULES[@]}"; do
    gw="$(be_module_gradlew "$m")"
    ( cd "$BACKEND_DIR/$m" && "$gw" --stop >/dev/null 2>&1 ) &
    stop_pids+=("$!")
  done

  [ "${#stop_pids[@]}" -gt 0 ] || return 0

  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40; do
    alive=0
    for pid in "${stop_pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        alive=1
      fi
    done
    [ "$alive" = "0" ] && break
    sleep 0.25
  done

  if [ "${alive:-0}" != "0" ]; then
    dev_log_print "be" "gradle daemon stop 지연, 강제 종료 중..."
    for pid in "${stop_pids[@]}"; do
      terminate_pid_tree KILL "$pid"
      wait "$pid" 2>/dev/null || true
    done
  fi
  wait "${stop_pids[@]}" 2>/dev/null || true
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
  if [ "$reason" = "INT" ]; then
    wait_for_exit "${PIDS[@]}" || true
  else
    for pid in "${PIDS[@]}"; do
      terminate_pid_tree "$first_signal" "$pid"
    done
  fi

  for pid in "${PIDS[@]}"; do
    terminate_pid_tree TERM "$pid"
  done
  terminate_backend_ports TERM
  wait_for_exit "${PIDS[@]}" || true

  for pid in "${PIDS[@]}"; do
    terminate_pid_tree KILL "$pid"
  done
  terminate_backend_ports KILL

  for pid in "${LOG_PIDS[@]}"; do
    terminate_pid_tree TERM "$pid"
  done
  wait_for_exit "${LOG_PIDS[@]}" || true

  dev_log_print "be" "gradle daemon 정리 중..."
  stop_gradle_daemons
  dev_log_print "be" "정리 완료."

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
    "$(be_module_gradlew "$m")" :api:bootRun --args='--spring.profiles.active=local' --console=plain
done

dev_log_print "be" "기동 대상: $(printf '%s ' "${SELECTED_MODULES[@]}")"
for m in "${SELECTED_MODULES[@]}"; do
  dev_log_print "be" "  be-$m → http://localhost:$(be_module_port "$m")"
done
dev_log_print "be" "백엔드 기동 완료. Ctrl+C 로 종료."
wait_for_backend_exit
