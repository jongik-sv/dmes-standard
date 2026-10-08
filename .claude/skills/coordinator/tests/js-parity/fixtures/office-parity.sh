#!/usr/bin/env bash
# office.sh 를 돌린 뒤 작업 폴더의 파일 내용(fake dflow 로그·state·세션 기록)을 찍는다. 종료 코드는 office.sh 의 것.
D="${BASH_SOURCE[0]%/*}"
bash "$D/../../../scripts/office.sh" "$@"; rc=$?
node "$D/office-dump.mjs"
exit $rc
