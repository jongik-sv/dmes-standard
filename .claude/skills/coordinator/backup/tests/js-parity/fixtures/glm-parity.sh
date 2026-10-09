#!/usr/bin/env bash
# glm-preflight.sh 를 돌린 뒤 작업 폴더의 파일 내용(state·events)을 찍는다. 종료 코드는 glm-preflight.sh 의 것(늘 0).
D="${BASH_SOURCE[0]%/*}"
bash "$D/../../../scripts/glm-preflight.sh" "$@"; rc=$?
node "$D/glm-dump.mjs"
exit "$rc"
