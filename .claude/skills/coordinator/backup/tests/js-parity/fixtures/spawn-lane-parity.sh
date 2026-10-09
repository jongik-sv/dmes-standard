#!/usr/bin/env bash
# spawn-lane.sh 를 돌린 뒤 작업 폴더의 파일(가짜 orca 가 받은 인자·상태·이벤트·콘솔 기록·보낸 표식)과 TMPDIR 에 남은 임시 파일 수를 찍는다. 종료 코드는 spawn-lane.sh 의 것.
D="${BASH_SOURCE[0]%/*}"
bash "$D/../../../scripts/spawn-lane.sh" "$@"; rc=$?
node "$D/spawn-lane-dump.mjs"
exit $rc
