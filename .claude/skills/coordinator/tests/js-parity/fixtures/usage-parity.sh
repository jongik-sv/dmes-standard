#!/usr/bin/env bash
# usage-band.sh 를 돌리기 전에 파일 mtime 을 맞춘다. 종료 코드·출력은 usage-band.sh 의 것.
D=${BASH_SOURCE[0]%/*}
node "$D/usage-prep.mjs"
exec bash "$D/../../../scripts/usage-band.sh" "$@"
