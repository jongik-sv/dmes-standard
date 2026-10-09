#!/usr/bin/env bash
# console-poll.sh 를 돌린 뒤 작업 폴더의 파일 내용(콘솔 폴더·상태·가짜 서버 로그)을 찍는다. 종료 코드는 console-poll.sh 의 것.
D="${BASH_SOURCE[0]%/*}"
bash "$D/../../../scripts/console-poll.sh" "$@"; rc=$?
node "$D/console-poll-dump.mjs"
exit $rc
