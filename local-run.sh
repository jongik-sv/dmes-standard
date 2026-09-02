#!/usr/bin/env bash
# local-run.sh — BE(mpn+mcm) + FE 동시 실행 스크립트
#                be-run.sh 와 fe-run.sh 를 함께 실행한다.
#
# 사용법:
#   ./local-run.sh              # .run.env 의 LOCAL_RUN_ARGS 사용
#   ./local-run.sh --all        # BE + FE 전체 실행
#   ./local-run.sh --mpn --build # BE + FE(MPN build 포함) 실행
#   ./local-run.sh --install    # FE pnpm install 먼저 실행
#   ./local-run.sh --clean      # FE m-mcm/.next 캐시 삭제
#   ./local-run.sh --no-install # FE pnpm install 건너뜀
#   ./local-run.sh --no-build   # FE pnpm install + build 건너뜀
#
# 백엔드만:  ./be-run.sh
# 프론트만:  ./fe-run.sh [--all|--mpn] [--install|--build|--clean|-q]
#
# 종료: Ctrl+C 한 번으로 BE/FE 자식 스크립트 일괄 정리.

set -u
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_ENV_FILE="$ROOT_DIR/.run.env"

[ -f "$RUN_ENV_FILE" ] && . "$RUN_ENV_FILE"

ENV_ARGS=()

load_default_args() {
  local var_name="$1"
  local value="${!var_name:-}"

  [ -n "$value" ] || return 1
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
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
  esac
done

if ! has_scope_arg "$@"; then
  if load_default_args LOCAL_RUN_ARGS; then
    set -- "${ENV_ARGS[@]}" "$@"
    echo "[launcher] .run.env 기본 옵션 사용: LOCAL_RUN_ARGS=${LOCAL_RUN_ARGS}"
  else
    echo "[launcher] .run.env 에 LOCAL_RUN_ARGS 가 없습니다." >&2
    echo "[launcher] 예: LOCAL_RUN_ARGS=\"--mpn -q\"" >&2
    exit 2
  fi
fi

FE_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --all|--full|--mpn|--mpn-only|--install|--build|--clean|--no-install|--no-build|-q) FE_ARGS+=("$arg") ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "알 수 없는 옵션: $arg" >&2; exit 2 ;;
  esac
done

PIDS=()

cleanup() {
  echo
  echo "[launcher] 종료 신호 수신, 자식 스크립트 정리 중..."
  for pid in "${PIDS[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait "${PIDS[@]}" 2>/dev/null || true
  echo "[launcher] 정리 완료."
}
trap cleanup INT TERM EXIT

"$ROOT_DIR/be-run.sh" &
PIDS+=("$!")

"$ROOT_DIR/fe-run.sh" "${FE_ARGS[@]}" &
PIDS+=("$!")

echo "[launcher] BE + FE 모두 기동. Ctrl+C 로 종료."
wait -n 2>/dev/null || wait
