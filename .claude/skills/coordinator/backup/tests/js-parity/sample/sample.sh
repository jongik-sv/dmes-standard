#!/usr/bin/env bash
# 하니스·js-bridge 의 표본 모듈(새 모듈을 옮길 때 이 파일 모양을 따른다). 세 함수: stdin 변환, 전역 변수 전달, 파일 쓰기.
_SMP_DIR="${BASH_SOURCE[0]%/*}"
case "$_SMP_DIR" in /*) ;; *) _SMP_DIR="$PWD/$_SMP_DIR" ;; esac
. "$_SMP_DIR/../../../scripts/lib/js-bridge.sh"

smp_upper() {   # stdin 을 대문자로. 빈 입력이면 rc 1
  if _jsb_on SAMPLE; then _jsb_call "$_SMP_DIR/sample" smp_upper "$@"; return; fi
  local s; s="$(LC_ALL=C tr 'a-z' 'A-Z'; printf .)"; s="${s%.}"
  [ -n "$s" ] || return 1
  printf '%s' "$s"
}
SMP_A=""; SMP_B=""
smp_pair() {    # smp_pair <a> <b> — SMP_A=<b> SMP_B=<a> 로 맞바꾸고 둘의 길이 합을 낸다
  if _jsb_on SAMPLE; then _jsb_callg "$_SMP_DIR/sample" smp_pair "SMP_A SMP_B" "$@"; return; fi
  SMP_A="${2:-}"; SMP_B="${1:-}"
  printf '%d' $(( ${#1} + ${#2} ))
}
smp_write() {   # smp_write <이름> — 작업 폴더에 <이름>.txt (권한 600, 내용 "hi")
  if _jsb_on SAMPLE; then _jsb_call "$_SMP_DIR/sample" smp_write "$@"; return; fi
  case "${1:-}" in ''|*/*) return 1 ;; esac
  ( umask 077; printf 'hi' > "$1.txt" )
}
