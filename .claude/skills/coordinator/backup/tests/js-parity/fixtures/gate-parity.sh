#!/usr/bin/env bash
# merge-gate.sh 를 돌리기 전에 작업 폴더에 .repo.json 의 git 리포를 만든다. 종료 코드·출력은 merge-gate.sh 의 것.
D=${BASH_SOURCE[0]%/*}
node "$D/gate-prep.mjs" || exit 97
exec bash "$D/../../../scripts/merge-gate.sh" "$@"
