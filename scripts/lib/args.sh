# scripts/lib/args.sh — be-run.sh·fe-run.sh·local-run.sh 공용 인자 도우미 (source 전용)
# macOS 기본 /bin/bash 3.2 에서 돌아야 하므로 연관 배열·mapfile 을 쓰지 않는다.

ENV_ARGS=()

# .run.env 의 기본 인자 변수(이름을 $1 로 받는다)를 ENV_ARGS 배열로 편다.
# 값이 비었거나 펼친 결과가 없으면 1. 옵션은 공백으로 나뉜 단순 플래그라 일부러 단어 분리한다.
#   load_default_args BE_RUN_ARGS && set -- "$@" "${ENV_ARGS[@]}"
load_default_args() {
  local var_name="$1"
  local value="${!var_name:-}"

  [ -n "$value" ] || return 1
  # shellcheck disable=SC2206
  ENV_ARGS=($value)
  [ "${#ENV_ARGS[@]}" -gt 0 ]
}

# FE 범위 플래그(--all·--mpn·--mdm 과 그 별칭)가 하나라도 있는지. fe-run.sh·local-run.sh 가
# 없으면 .run.env 기본값(FE_RUN_ARGS·LOCAL_RUN_ARGS)을 앞에 붙인다.
has_scope_arg() {
  local arg

  for arg in "$@"; do
    case "$arg" in
      --all|--full|--mpn|--mpn-only|--mdm|--mdm-only) return 0 ;;
    esac
  done
  return 1
}
