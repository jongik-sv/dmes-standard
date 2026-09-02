#!/usr/bin/env bash
# be-run.sh — mpn + mcm 백엔드(local 프로파일) 실행 스크립트
#
# 사용법:
#   ./be-run.sh              # .run.env 의 BE_RUN_ARGS 사용
#   ./be-run.sh --all        # mpn + mcm
#   ./be-run.sh --mpn        # mpn 만
#   ./be-run.sh --mcm        # mcm 만
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
    be-mpn) printf '%s' "$DEVLOG_MAGENTA" ;;
    be-mcm) printf '%s' "$DEVLOG_BLUE" ;;
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
    dev_log_error ".run.env 에 BE_RUN_ARGS 가 없습니다."
    dev_log_error "예: BE_RUN_ARGS=\"--all\""
    exit 2
  fi
fi

RUN_MPN=0
RUN_MCM=0
for arg in "$@"; do
  case "$arg" in
    --all|--full) RUN_MPN=1; RUN_MCM=1 ;;
    --mpn) RUN_MPN=1 ;;
    --mcm) RUN_MCM=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) dev_log_error "알 수 없는 옵션: $arg"; exit 2 ;;
  esac
done

[ "$RUN_MPN" = "1" ] || [ "$RUN_MCM" = "1" ] || { dev_log_error "BE 실행 대상을 선택하세요: --all, --mpn, --mcm"; exit 2; }

# ── 사전 점검 ────────────────────────────────────────────────
if [ "$RUN_MPN" = "1" ]; then
  [ -d "$BACKEND_DIR/mpn" ] || { dev_log_error "디렉토리 누락: $BACKEND_DIR/mpn"; exit 1; }
fi
if [ "$RUN_MCM" = "1" ]; then
  [ -d "$BACKEND_DIR/mcm" ] || { dev_log_error "디렉토리 누락: $BACKEND_DIR/mcm"; exit 1; }
fi

# gradlew 실행권한 자동 보정
if [ "$RUN_MPN" = "1" ]; then
  [ -x "$BACKEND_DIR/mpn/gradlew" ] || chmod +x "$BACKEND_DIR/mpn/gradlew" 2>/dev/null || true
fi
if [ "$RUN_MCM" = "1" ]; then
  [ -x "$BACKEND_DIR/mcm/gradlew" ] || chmod +x "$BACKEND_DIR/mcm/gradlew" 2>/dev/null || true
fi

# 포트 사전 점유 체크 (8080=mcm, 8081=mpn)
check_backend_port() {
  local port="$1"
  local tag="$2"
  local pid

  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    pid=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1)
    dev_log_error "$tag 가 사용할 포트 $port 가 이미 점유 중입니다 (pid=$pid)."
    echo "        잔존 BE 프로세스/Gradle 데몬을 정리한 뒤 다시 실행하세요:" >&2
    echo "          kill $pid" >&2
    echo "          (cd $BACKEND_DIR/mpn && ./gradlew --stop) && \\" >&2
    echo "          (cd $BACKEND_DIR/mcm && ./gradlew --stop)" >&2
    exit 1
  fi
}

[ "$RUN_MCM" = "1" ] && check_backend_port 8080 be-mcm
[ "$RUN_MPN" = "1" ] && check_backend_port 8081 be-mpn

# ── 로그 프리픽스 ────────────────────────────────────────────
PIDS=()
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
    dev_log_print "be" "$tag 시작 (pid $run_pid, log $log_pid) — cwd=$dir : $*"
  else
    dev_log_error "$tag 실행 PID 확인 실패 — cwd=$dir : $*"
  fi
  LOG_PIDS+=("$log_pid")
}

# ── 종료 핸들러 ─────────────────────────────────────────────
CLEANUP_DONE=0

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

wait_for_backend_exit() {
  local pid
  local has_backend

  while :; do
    has_backend=0
    for pid in "${PIDS[@]}"; do
      [ -n "$pid" ] || continue
      has_backend=1
      if ! kill -0 "$pid" 2>/dev/null; then
        return 0
      fi
    done
    [ "$has_backend" = "0" ] && return 0

    for pid in "${LOG_PIDS[@]}"; do
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
        return 0
      fi
    done
    sleep 0.5
  done
}

terminate_backend_ports() {
  local signal="$1"
  local entry port tag port_pid

  local entries=()

  [ "$RUN_MCM" = "1" ] && entries+=("8080:be-mcm")
  [ "$RUN_MPN" = "1" ] && entries+=("8081:be-mpn")

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

  if [ "$RUN_MPN" = "1" ]; then
    ( cd "$BACKEND_DIR/mpn" && ./gradlew --stop >/dev/null 2>&1 ) &
    stop_pids+=("$!")
  fi
  if [ "$RUN_MCM" = "1" ]; then
    ( cd "$BACKEND_DIR/mcm" && ./gradlew --stop >/dev/null 2>&1 ) &
    stop_pids+=("$!")
  fi

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
if [ "$RUN_MPN" = "1" ]; then
  run_with_prefix "be-mpn" "$BACKEND_DIR/mpn" \
    ./gradlew :api:bootRun --args='--spring.profiles.active=local' --console=plain
fi
if [ "$RUN_MCM" = "1" ]; then
  run_with_prefix "be-mcm" "$BACKEND_DIR/mcm" \
    ./gradlew :api:bootRun --args='--spring.profiles.active=local' --console=plain
fi

dev_log_print "be" "백엔드 기동 완료. Ctrl+C 로 종료."
wait_for_backend_exit
