#!/usr/bin/env bash
# bash lib 함수를 node 판(scripts/lib/<모듈>.mjs)으로 넘기는 공용 스위치(source 용). 계약 정본은 tests/js-parity/README.md 「스위치 계약」.
#   각 lib 는 맨 앞에서 이 파일을 source 하고, 함수 첫 줄에 한 줄 분기를 둔다:
#     sc_key() { if _jsb_on SCREEN_CACHE; then _jsb_call screen-cache sc_key "$@"; return; fi; …기존 본문 그대로… }
#     sc_store() { if _jsb_on SCREEN_CACHE; then _jsb_callg screen-cache sc_store "SC_STORED_KIND" "$@"; return; fi; … }
#   _jsb_on <모듈 대문자 이름>            COORD_JS_<이름>=1(또는 이름 변수가 비어 있고 COORD_JS_ALL=1)이고 node 가 있으면 0. 기본(꺼짐)은 기존 bash 본문이다.
#   _jsb_call <모듈 파일 이름> <함수> [인자…]       node <모듈>.mjs <함수> 인자… 를 부른다. stdin 은 그대로 넘기고, stdout 은 바이트 그대로,
#                                         종료 코드도 그대로 돌려준다(node 가 못 뜨거나 내부 오류면 70 — 켜짐에서는 bash 로 되돌아가지 않는다).
#   _jsb_callg <모듈> <함수> "<전역 변수 이름들>" [인자…]   위와 같되, 함수가 설정한 전역 변수(이름은 공백으로 나눔)를 이 셸의 전역 변수에 넣는다.
#                                         node 판이 쓰지 않은 변수는 빈 값으로 만든다(bash 판이 함수 첫머리에서 비우는 것과 같은 효과).
#   _jsb_exec <모듈 파일 이름> [인자…]      (스크립트 전체를 옮긴 경우) 이 프로세스를 node <모듈>.mjs 인자… 로 바꾼다(exec, stdin·stdout·stderr 그대로).
#                                         스크립트 맨 위에서: `. "$LIB/js-bridge.sh"; if _jsb_on COORD_STATE; then _jsb_exec coord-state "$@"; fi`
#                                         node 를 못 찾으면 70 으로 끝난다(켜짐에서는 bash 본문으로 되돌아가지 않는다).
#   _jsb_calld <모듈> <함수> [인자…]       _jsb_callg 에 전역 _JSB_DIE 를 붙인 것 — coord_die 로 끝나는 bash 함수용(위 설명)
#   모든 호출은 환경 변수 COORD_JS_CALLER_PID=<부른 셸의 $$> 를 node 에 넘긴다(잠금 주인 pid·pgrep 제외 등 「부른 셸」이 의미 있는 곳용).
# 한계: 전역 변수는 문자열만, NUL 이 든 값은 못 옮긴다. stdout 에 NUL 이 있으면 bash 의 $(…) 에서 사라진다(bash 판도 같다).
# node 는 source 시점의 절대 경로로 고정한다(이후 PATH 가 바뀌어도 같은 node). 윈도우(Git Bash)는 cygpath -m 경로를 node 에 준다.

[ -z "${_JSB_LOADED:-}" ] || return 0
_JSB_LOADED=1

_JSB_NODE="$(command -v node 2>/dev/null || true)"
_JSB_DIR="${BASH_SOURCE[0]}"
case "$_JSB_DIR" in */*) _JSB_DIR="${_JSB_DIR%/*}" ;; *) _JSB_DIR="." ;; esac
case "$_JSB_DIR" in /*|?:*) ;; *) _JSB_DIR="$PWD/$_JSB_DIR" ;; esac   # 이후 cd 해도 같은 경로

# 모듈 파일 경로(윈도우면 node 가 읽는 C:/x 꼴). 없으면 rc 1
_jsb_path() {
  local p="$_JSB_DIR/$1.mjs"
  case "$1" in */*) p="$1.mjs" ;; esac   # 경로가 든 이름은 그 경로(확장자 .mjs 제외)를 쓴다(하니스의 표본 모듈용)
  [ -f "$p" ] || return 1
  if command -v cygpath >/dev/null 2>&1; then p="$(cygpath -m "$p")" || return 1; fi
  printf '%s' "$p"
}

_jsb_on() {
  local v="COORD_JS_$1" val
  val="${!v:-}"
  # 모듈 변수가 1 이면 켜짐, 0 이면(명시) 꺼짐, 비어 있으면 COORD_JS_ALL=1 을 따른다(전체를 한꺼번에 켜 보는 시험용)
  { [ "$val" = 1 ] || { [ -z "$val" ] && [ "${COORD_JS_ALL:-}" = 1 ]; }; } && [ -n "$_JSB_NODE" ] && [ -x "$_JSB_NODE" ]
}

_jsb_call() {
  local mod="$1" fn="$2" p out rc
  shift 2
  p="$(_jsb_path "$mod")" || return 70
  out="$(COORD_JS_CALLER_PID=$$ "$_JSB_NODE" "$p" "$fn" "$@"; printf '.%d' "$?")"
  rc="${out##*.}"; out="${out%.*}"
  printf '%s' "$out"
  return "$rc"
}

_jsb_callg() {
  local mod="$1" fn="$2" names="$3" p out rc gf kv n
  shift 3
  p="$(_jsb_path "$mod")" || return 70
  gf="$(mktemp "${TMPDIR:-/tmp}/jsb-globals.XXXXXX")" || return 70
  out="$(COORD_JS_GLOBALS_FILE="$gf" COORD_JS_CALLER_PID=$$ "$_JSB_NODE" "$p" "$fn" "$@"; printf '.%d' "$?")"
  rc="${out##*.}"; out="${out%.*}"
  for n in $names; do printf -v "$n" '%s' ''; done
  while IFS= read -r -d '' kv; do
    n="${kv%%=*}"
    case "$n" in ''|[0-9]*|*[!A-Za-z0-9_]*) continue ;; esac
    case " $names " in *" $n "*) printf -v "$n" '%s' "${kv#*=}" ;; esac
  done < "$gf"
  rm -f "$gf"
  printf '%s' "$out"
  return "$rc"
}

# 위와 같되, bash 판이 coord_die(= exit)로 끝나는 함수용: node 판이 전역 _JSB_DIE=1 로 「die 였다」를 알리면 그 종료 코드로 이 셸을 끝낸다
# (서브셸 `$(…)` 안에서 부르면 그 서브셸만 끝나는 것도 bash 판과 같다).
_jsb_calld() {
  local rc
  _jsb_callg "$1" "$2" "_JSB_DIE" "${@:3}"; rc=$?
  [ -z "${_JSB_DIE:-}" ] || exit "$rc"
  return "$rc"
}

_jsb_exec() {
  local mod="$1" p
  shift
  p="$(_jsb_path "$mod")" || exit 70
  COORD_JS_CALLER_PID=$$ exec "$_JSB_NODE" "$p" "$@"
}
