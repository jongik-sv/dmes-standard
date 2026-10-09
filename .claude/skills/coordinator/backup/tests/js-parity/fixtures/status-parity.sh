#!/usr/bin/env bash
# coord-status.sh 를 돌리기 전에 git 리포·세션 파일을 만든다. 출력·종료 코드는 coord-status.sh 의 것(읽기 전용이라 덤프 없음).
D=${BASH_SOURCE[0]%/*}
node "$D/status-prep.mjs" || exit 97
exec bash "$D/../../../scripts/coord-status.sh" "$@"
