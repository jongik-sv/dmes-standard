#!/usr/bin/env bash
# fe-run.sh — 프론트엔드 실행 스크립트
#
# 사용법:
#   ./fe-run.sh              # .run.env 의 FE_RUN_ARGS 사용 (기본 --all)
#   ./fe-run.sh --all        # pnpm install → 화면 라이브러리 전체 build → 전체 dev
#   ./fe-run.sh --all -q     # 설치/빌드 건너뛰고 전체 dev 만 (dist 가 이미 있을 때)
#   ./fe-run.sh --mpn -q     # MPN 만 (shared + m-mpn watch + mcm portal)
#   ./fe-run.sh --mpn --build # shared/m-mpn build → shared/m-mpn/mcm dev
#   ./fe-run.sh --install    # pnpm install 먼저 실행
#   ./fe-run.sh --clean      # m-mcm/.next 캐시 삭제
#   ./fe-run.sh --no-install # pnpm install 건너뜀
#   ./fe-run.sh --no-build   # pnpm install + build 모두 건너뛰고 바로 dev
#   ./fe-run.sh -q           # quick dev (--no-build 와 동일)
#
# 종료: Ctrl+C 로 자식 프로세스(pnpm/node) 일괄 정리.

set -u
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/src/frontend"
RUN_ENV_FILE="$ROOT_DIR/.run.env"
PORTAL_PORT=5100

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
  DEVLOG_CYAN=$'\033[36m'
else
  DEVLOG_RESET=
  DEVLOG_DIM=
  DEVLOG_RED=
  DEVLOG_GREEN=
  DEVLOG_YELLOW=
  DEVLOG_CYAN=
fi

dev_log_print() {
  local tag="$1"
  shift
  printf '%b[%s]%b %s\n' "$DEVLOG_CYAN" "$tag" "$DEVLOG_RESET" "$*"
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
  awk \
    -v tag_color="$DEVLOG_CYAN" \
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
  if (line ~ /(^|[^[:alpha:]])(WARN|WARNING|Warning|warning|deprecated|Deprecated)([^[:alpha:]]|$)/) {
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
  printf "%s[fe]%s %s\n", tag_color, reset, colorize($0)
  fflush()
}
'
}

ENV_ARGS=()

load_default_args() {
  local var_name="$1"
  local value="${!var_name:-}"

  [ -n "$value" ] || return 1
  # Options are intentionally simple whitespace-separated flags.
  # shellcheck disable=SC2206
  ENV_ARGS=($value)
  [ "${#ENV_ARGS[@]}" -gt 0 ]
}

has_scope_arg() {
  local arg

  for arg in "$@"; do
    case "$arg" in
      --all|--full|--mpn|--mpn-only) return 0 ;;
    esac
  done
  return 1
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
  esac
done

if ! has_scope_arg "$@"; then
  if load_default_args FE_RUN_ARGS; then
    set -- "${ENV_ARGS[@]}" "$@"
    dev_log_print "fe" ".run.env 기본 옵션 사용: FE_RUN_ARGS=${FE_RUN_ARGS}"
  else
    # .run.env 는 개인 설정이라 git 에 없다(.gitignore). 새로 clone 한 저장소에서도
    # 인자 없이 바로 뜨도록 --all 로 폴백한다. .run.env.example 을 복사해 조정한다.
    set -- --all
    dev_log_print "fe" ".run.env 없음 — 기본값 --all 로 진행 (.run.env.example 복사해 조정)"
  fi
fi

DO_INSTALL=0
DO_BUILD=0
DO_CLEAN=0
DEV_SCOPE=""
for arg in "$@"; do
  case "$arg" in
    --all|--full) DEV_SCOPE="all"; DO_BUILD=1; DO_INSTALL=1 ;;
    --mpn|--mpn-only) DEV_SCOPE="mpn" ;;
    --install) DO_INSTALL=1 ;;
    --build) DO_BUILD=1 ;;
    --clean) DO_CLEAN=1 ;;
    --no-install) DO_INSTALL=0 ;;
    --no-build|-q) DO_BUILD=0; DO_INSTALL=0 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) dev_log_error "알 수 없는 옵션: $arg"; exit 2 ;;
  esac
done

[ -n "$DEV_SCOPE" ] || { dev_log_error "FE 범위를 선택하세요: --mpn 또는 --all"; exit 2; }

# ── 사전 점검 ────────────────────────────────────────────────
if ! command -v pnpm >/dev/null 2>&1; then
  dev_log_error "pnpm 이 설치되어 있지 않습니다."; exit 1
fi
[ -d "$FRONTEND_DIR" ] || { dev_log_error "디렉토리 누락: $FRONTEND_DIR"; exit 1; }

# ── 종료 핸들러 ─────────────────────────────────────────────
PIDS=()
LOG_PIDS=()
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

terminate_port_listeners() {
  local port="$1"
  local label="$2"
  local pid
  local still_bound=0

  if ! command -v lsof >/dev/null 2>&1; then
    dev_log_error "lsof 를 찾을 수 없어 $label 포트 $port 점유 프로세스를 확인할 수 없습니다."
    return 1
  fi

  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    dev_log_print "fe" "$label 포트 $port 점유 프로세스 종료 중 (TERM pid=$pid)"
    terminate_pid_tree TERM "$pid"
  done

  wait_for_exit $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true) || true

  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    dev_log_print "fe" "$label 포트 $port 점유 프로세스 강제 종료 중 (KILL pid=$pid)"
    terminate_pid_tree KILL "$pid"
  done

  sleep 0.2
  for pid in $(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    [ -n "$pid" ] || continue
    [ "$pid" = "$$" ] && continue
    still_bound=1
  done

  if [ "$still_bound" = "1" ]; then
    dev_log_error "$label 포트 $port 를 비우지 못했습니다."
    return 1
  fi
}

# pnpm --parallel 이 띄운 워커(tsup watch / next dev)는 중간에 재부모화돼
# PIDS 트리 추적을 벗어나는 경우가 있다. 종료 시 이 저장소의 frontend 경로를 명령줄에
# 물고 있는 프로세스만 골라 한 번 더 쓸어 담는다 (다른 프로젝트에는 영향 없음).
terminate_frontend_stragglers() {
  local signal="$1"
  local pid

  for pid in $(pgrep -f "$FRONTEND_DIR" 2>/dev/null || true); do
    [ "$pid" = "$$" ] && continue
    kill -0 "$pid" 2>/dev/null || continue
    kill "-$signal" "$pid" 2>/dev/null || true
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
  dev_log_print "fe" "종료 신호 수신, 자식 프로세스 정리 중..."
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
  wait_for_exit "${PIDS[@]}" || true

  for pid in "${PIDS[@]}"; do
    terminate_pid_tree KILL "$pid"
  done
  for pid in "${LOG_PIDS[@]}"; do
    terminate_pid_tree TERM "$pid"
  done

  # pnpm --parallel 워커 잔존분 정리 — 남겨두면 포트 5100 과 tsup watch 가 계속 물려 있다.
  terminate_frontend_stragglers TERM
  wait_for_exit $(pgrep -f "$FRONTEND_DIR" 2>/dev/null || true) || true
  terminate_frontend_stragglers KILL

  dev_log_print "fe" "정리 완료."

  case "$reason" in
    INT) exit 130 ;;
    TERM) exit 143 ;;
  esac
}
trap 'cleanup INT' INT
trap 'cleanup TERM' TERM
trap 'cleanup EXIT' EXIT

# ── m-mcm 환경변수 부트스트랩 ────────────────────────────────
# NextAuth 는 AUTH_SECRET 이 없으면 기동 자체가 실패한다. 새로 clone 한 저장소에서
# 바로 뜨도록, .env / .env.local 이 하나도 없을 때만 .env.example 을 복사해 만든다.
# 이미 파일이 있으면 절대 건드리지 않는다.
ensure_mcm_env() {
  local mcm_dir="$FRONTEND_DIR/m-mcm"
  local env_file="$mcm_dir/.env"
  local secret

  [ -f "$env_file" ] && return 0
  [ -f "$mcm_dir/.env.local" ] && return 0
  [ -f "$mcm_dir/.env.example" ] || {
    dev_log_error "m-mcm/.env 가 없고 .env.example 도 없습니다. 환경변수를 직접 만들어 주세요."
    return 1
  }

  secret="$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 48 2>/dev/null || echo "local-dev-secret-$$")"
  {
    echo "# fe-run.sh 가 .env.example 로부터 자동 생성한 로컬 개발용 파일이다."
    echo "# 실 프로젝트에서는 AUTH_SECRET 을 비롯한 값들을 반드시 새로 발급해 쓴다."
    sed -e "s|^AUTH_SECRET=.*|AUTH_SECRET=\"$secret\"|" "$mcm_dir/.env.example"
  } > "$env_file"

  dev_log_print "fe" "m-mcm/.env 생성 (.env.example 기반, AUTH_SECRET 자동 발급)"
  dev_log_print "fe" "  운영/공유 환경에 쓸 값이 아니다. 실 프로젝트 착수 시 전부 교체할 것."
  return 0
}

ensure_mcm_env || exit 1

# ── install / build (동기) ───────────────────────────────────
if [ "$DO_INSTALL" = "1" ]; then
  dev_log_print "fe" "pnpm install 실행 ($FRONTEND_DIR)"
  ( cd "$FRONTEND_DIR" && dev_log_run pnpm install ) || { dev_log_error "pnpm install 실패"; exit 1; }
fi

if [ "$DO_CLEAN" = "1" ]; then
  # m-mcm 의 .next 캐시가 stale 일 때 변경된 화면이 반영되지 않는 사고 이력 → 빌드 전 항상 비움
  MCM_NEXT_DIR="$FRONTEND_DIR/m-mcm/.next"
  if [ -d "$MCM_NEXT_DIR" ]; then
    dev_log_print "fe" "m-mcm/.next 캐시 삭제 ($MCM_NEXT_DIR)"
    rm -rf "$MCM_NEXT_DIR"
  fi
fi

if [ "$DO_BUILD" = "1" ]; then
  if [ "$DEV_SCOPE" = "mpn" ]; then
    dev_log_print "fe" "MPN 범위 빌드 실행 (shared + m-mpn)"
    ( cd "$FRONTEND_DIR" && dev_log_run pnpm --filter @dk-oasis/shared build ) || { dev_log_error "shared build 실패"; exit 1; }
    ( cd "$FRONTEND_DIR" && dev_log_run pnpm --filter @dk-oasis/m-mpn build ) || { dev_log_error "m-mpn build 실패"; exit 1; }
  else
    # 화면 라이브러리(dist)만 빌드한다. m-mcm 은 next dev 가 직접 컴파일하므로
    # 여기서 next build 까지 돌릴 이유가 없다(느리고, 프로덕션 빌드는 별도 관심사다).
    dev_log_print "fe" "화면 라이브러리 전체 build 실행 (shared + m-mpn/m-mpp/m-mqc/m-mls/m-analog)"
    ( cd "$FRONTEND_DIR" && dev_log_run pnpm build:libs ) || { dev_log_error "라이브러리 build 실패"; exit 1; }
  fi
fi

# ── dev 서버 실행 ────────────────────────────────────────────
terminate_port_listeners "$PORTAL_PORT" "portal" || exit 1

DEV_COMMAND=(pnpm dev)
if [ "$DEV_SCOPE" = "mpn" ]; then
  DEV_COMMAND=(
    pnpm
    --parallel
    --filter
    @dk-oasis/shared
    --filter
    @dk-oasis/m-mpn
    --filter
    @dk-oasis/mcm
    dev
  )
  dev_log_print "fe" "MPN 범위 dev 실행 (shared + m-mpn watch + mcm portal)"
else
  dev_log_print "fe" "전체 frontend dev 실행 (라이브러리 watch + mcm portal :$PORTAL_PORT)"
fi

PID_FILE="${TMPDIR:-/tmp}/dev-fe-$$.pid"
rm -f "$PID_FILE"
(
  cd "$FRONTEND_DIR" || exit 1
  dev_log_run "${DEV_COMMAND[@]}" 2>&1 &
  CHILD_PID="$!"
  printf '%s\n' "$CHILD_PID" > "$PID_FILE"
  wait "$CHILD_PID" 2>/dev/null || true
) | dev_log_prefix_stream &
LOG_PIDS+=("$!")

RUN_PID=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if [ -s "$PID_FILE" ]; then
    RUN_PID="$(cat "$PID_FILE")"
    break
  fi
  sleep 0.05
done
rm -f "$PID_FILE"

if [ -n "$RUN_PID" ]; then
  PIDS+=("$RUN_PID")
  dev_log_print "fe" "프론트엔드 기동 완료 (pid $RUN_PID). Ctrl+C 로 종료."
else
  dev_log_error "프론트엔드 실행 PID 확인 실패"
fi
wait -n 2>/dev/null || wait
