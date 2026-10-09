#!/usr/bin/env bash
# statusline-dump.sh 를 돌린 뒤 작업 폴더·홈의 파일 내용을 찍는다. 종료 코드는 statusline-dump.sh 의 것(늘 0).
D=${BASH_SOURCE[0]%/*}
bash "$D/../../../scripts/statusline-dump.sh"; rc=$?
node "$D/statusline-dump-dump.mjs"
exit "$rc"
