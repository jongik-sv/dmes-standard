#!/usr/bin/env bash
# local-run.sh — BE + FE 동시 실행 스크립트
#                be-run.sh 와 fe-run.sh 를 함께 실행한다.
#
# 사용법:
#   ./local-run.sh              # .run.env 의 LOCAL_RUN_ARGS 사용 (기본 --all)
#   ./local-run.sh --all        # BE 전체 모듈 + FE 전체 실행
#   ./local-run.sh --all -q     # FE 설치/빌드 건너뛰고 전체 실행
#   ./local-run.sh --mpn --build # BE + FE(MPN build 포함) 실행
#   ./local-run.sh --install    # FE pnpm install 먼저 실행
#   ./local-run.sh --clean      # FE m-mcm/.next 캐시 삭제
#   ./local-run.sh --no-install # FE pnpm install 건너뜀
#   ./local-run.sh --no-build   # FE pnpm install + build 건너뜀
#
# 백엔드만:  ./be-run.sh [--all|--mpn|--mcm|--mls|--mqc|--mpp|--analog]
# 프론트만:  ./fe-run.sh [--all|--mpn] [--install|--build|--clean|-q]
#
# BE 대상 모듈은 .run.env 의 BE_RUN_ARGS 가 정한다 (본 스크립트 인자는 FE 로만 전달).
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
      --all|--full|--mpn|--mpn-only|--mdm|--mdm-only) return 0 ;;
    esac
  done
  return 1
}

for arg in "$@"; do
  case "$arg" in
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
  esac
done

if ! has_scope_arg "$@"; then
  if load_default_args LOCAL_RUN_ARGS; then
    set -- "${ENV_ARGS[@]}" "$@"
    echo "[launcher] .run.env 기본 옵션 사용: LOCAL_RUN_ARGS=${LOCAL_RUN_ARGS}"
  else
    # .run.env 는 개인 설정이라 git 에 없다(.gitignore). 폴백으로 전체 실행.
    set -- --all "$@"
    echo "[launcher] .run.env 없음 — 기본값 --all 로 진행 (.run.env.example 복사해 조정)"
  fi
fi

FE_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --all|--full|--mpn|--mpn-only|--mdm|--mdm-only|--install|--build|--clean|--no-install|--no-build|-q) FE_ARGS+=("$arg") ;;
    # BE 모듈 플래그는 be-run.sh 가 .run.env(BE_RUN_ARGS)에서 읽는다 — 여기서는 무시하고 통과시킨다.
    --mcm|--mls|--mqc|--mpp|--analog) ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "알 수 없는 옵션: $arg" >&2; exit 2 ;;
  esac
done

PIDS=()
CLEANUP_DONE=0

# be-run.sh / fe-run.sh 가 TERM 을 못 받고 죽는 경우(강제 종료·OOM 등) 자식 트리가 고아로 남는다.
# 그러면 "프론트만 살아 있고 백엔드는 없는" 상태가 되어, 화면은 뜨는데 로그인만 실패한다.
# 종료 시 이 저장소 경로를 명령줄에 물고 있는 프로세스를 한 번 더 쓸어 담아 그 상태를 막는다.
terminate_repo_stragglers() {
  local signal="$1"
  local pid

  for pid in $(pgrep -f "$ROOT_DIR/src/" 2>/dev/null || true); do
    [ "$pid" = "$$" ] && continue
    kill -0 "$pid" 2>/dev/null || continue
    kill "-$signal" "$pid" 2>/dev/null || true
  done
}

cleanup() {
  local pid

  trap - INT TERM EXIT
  [ "$CLEANUP_DONE" = "1" ] && return 0
  CLEANUP_DONE=1

  echo
  echo "[launcher] 종료 신호 수신, 자식 스크립트 정리 중..."
  for pid in "${PIDS[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait "${PIDS[@]}" 2>/dev/null || true

  terminate_repo_stragglers TERM
  sleep 2
  terminate_repo_stragglers KILL

  echo "[launcher] 정리 완료."
}
trap cleanup INT TERM EXIT

"$ROOT_DIR/be-run.sh" &
BE_PID="$!"
PIDS+=("$BE_PID")

"$ROOT_DIR/fe-run.sh" "${FE_ARGS[@]}" &
FE_PID="$!"
PIDS+=("$FE_PID")

echo "[launcher] BE + FE 모두 기동. Ctrl+C 로 종료."
echo "[launcher]   포털 http://localhost:5100  (초기 계정 admin / admin123)"
echo "[launcher]   백엔드 기동에는 시간이 더 걸린다 — be-mcm 이 뜨기 전에는 로그인이 실패한다."

# 어느 쪽이 먼저 끝났는지 알려준다. 한쪽만 조용히 죽어 원인을 못 찾는 상황을 막는다.
while :; do
  if ! kill -0 "$BE_PID" 2>/dev/null; then
    echo "[launcher] 백엔드(be-run.sh)가 종료됐습니다. 위 [be] 로그에서 원인을 확인하세요." >&2
    break
  fi
  if ! kill -0 "$FE_PID" 2>/dev/null; then
    echo "[launcher] 프론트엔드(fe-run.sh)가 종료됐습니다. 위 [fe] 로그에서 원인을 확인하세요." >&2
    break
  fi
  sleep 1
done
