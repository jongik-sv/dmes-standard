#!/usr/bin/env bash
# measure-window.sh 를 돌리기 전에 잡 폴더를 만들고, 돌린 뒤 상태·heavy.log·sleep 생존을 찍는다. 종료 코드는 measure-window.sh 의 것.
D=${BASH_SOURCE[0]%/*}
node "$D/measure-prep.mjs" || exit 97
bash "$D/../../../scripts/measure-window.sh" "$@"; rc=$?
node "$D/measure-dump.mjs"
exit "$rc"
