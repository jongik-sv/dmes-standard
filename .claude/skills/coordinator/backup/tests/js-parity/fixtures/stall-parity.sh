#!/usr/bin/env bash
# stall-check.sh 를 돌리기 전에 워크트리 리포를 만들고, 돌린 뒤 tick 파일을 찍는다. 종료 코드는 stall-check.sh 의 것.
D=${BASH_SOURCE[0]%/*}
node "$D/stall-prep.mjs" || exit 97
bash "$D/../../../scripts/stall-check.sh" "$@"; rc=$?
node "$D/stall-dump.mjs"
exit "$rc"
