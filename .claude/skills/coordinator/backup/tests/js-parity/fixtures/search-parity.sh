#!/usr/bin/env bash
# search.sh 를 돌린 뒤 검색 결과 파일을 찍는다. 종료 코드는 search.sh 의 것.
D=${BASH_SOURCE[0]%/*}
bash "$D/../../../scripts/search.sh" "$@"; rc=$?
node "$D/search-dump.mjs"
exit "$rc"
