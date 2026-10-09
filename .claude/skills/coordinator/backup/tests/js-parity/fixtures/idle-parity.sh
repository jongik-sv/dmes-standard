#!/usr/bin/env bash
# idle-check.sh 를 돌린 뒤 상태 폴더(sr/)의 파일을 찍는다. 종료 코드는 idle-check.sh 의 것.
D=${BASH_SOURCE[0]%/*}
bash "$D/../../../scripts/idle-check.sh" "$@"; rc=$?
node "$D/idle-dump.mjs"
exit "$rc"
