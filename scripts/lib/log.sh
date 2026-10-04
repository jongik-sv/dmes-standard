# scripts/lib/log.sh — be-run.sh·fe-run.sh 공용 로그 출력 (source 전용, 직접 실행하지 않는다)
#
# 부르는 쪽은 .run.env 를 읽은 **뒤에** source 한다 — DEV_LOG_COLOR 를 .run.env 에 둘 수 있다.
# 태그 색은 dev_log_tag_color 가 정한다: be → 초록, be-<모듈> → modules.conf 의 색(be_module_color),
# 그 밖(fe·be-build 등) → 청록. be_module_color 가 없으면(modules.sh 를 안 읽은 스크립트) 모두 청록이다.
# macOS 기본 /bin/bash 3.2 에서 돌아야 하므로 연관 배열·mapfile 을 쓰지 않는다.

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

# modules.conf 의 색 이름(green·blue·magenta·cyan·yellow·red·dim) → 이스케이프. 모르는 이름은 청록.
dev_log_named_color() {
  case "$1" in
    green) printf '%s' "$DEVLOG_GREEN" ;;
    blue) printf '%s' "$DEVLOG_BLUE" ;;
    magenta) printf '%s' "$DEVLOG_MAGENTA" ;;
    cyan) printf '%s' "$DEVLOG_CYAN" ;;
    yellow) printf '%s' "$DEVLOG_YELLOW" ;;
    red) printf '%s' "$DEVLOG_RED" ;;
    dim) printf '%s' "$DEVLOG_DIM" ;;
    *) printf '%s' "$DEVLOG_CYAN" ;;
  esac
}

dev_log_tag_color() {
  local name
  case "$1" in
    be) printf '%s' "$DEVLOG_GREEN"; return ;;
    be-*)
      if command -v be_module_color >/dev/null 2>&1; then
        name="$(be_module_color "${1#be-}")"
        if [ -n "$name" ]; then
          dev_log_named_color "$name"
          return
        fi
      fi
      ;;
  esac
  printf '%s' "$DEVLOG_CYAN"
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

# 표준 입력의 각 줄 앞에 [태그] 를 붙이고, 줄 내용(ERROR·WARN·Started 등)에 따라 색을 입힌다.
#   ... | dev_log_prefix_stream be-mcm
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
