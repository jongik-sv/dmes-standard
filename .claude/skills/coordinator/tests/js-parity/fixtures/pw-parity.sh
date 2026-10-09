#!/usr/bin/env bash
# prompt-watch.sh 를 돌리기 전에 화면 캐시를 만들고, 끝나면 가짜 orca 가 받은 호출 줄(orca.log)을 덧붙인다. 종료 코드는 prompt-watch.sh 의 것.
D=${BASH_SOURCE[0]%/*}
node "$D/pw-prep.mjs" || exit 97
bash "$D/../../../scripts/prompt-watch.sh" "$@"; rc=$?
[ -f orca.log ] && { echo "--- orca.log"; cat orca.log; }
exit "$rc"
