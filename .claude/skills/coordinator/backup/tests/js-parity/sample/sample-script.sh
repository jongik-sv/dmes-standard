#!/usr/bin/env bash
# 스크립트 전체를 옮기는 경우의 표본(coord-state·office 같은 CLI). 인자를 줄마다 찍고 개수 % 3 으로 종료한다.
_D="${BASH_SOURCE[0]%/*}"; case "$_D" in /*) ;; *) _D="$PWD/$_D" ;; esac
. "$_D/../../../scripts/lib/js-bridge.sh"
if _jsb_on SAMPLE_SCRIPT; then _jsb_exec "$_D/sample-script" "$@"; fi
echo "args=$#"
for a in "$@"; do echo "[$a]"; done
exit $(( $# % 3 ))
