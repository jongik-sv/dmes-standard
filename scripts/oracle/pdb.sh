#!/usr/bin/env bash
# pdb.sh — scripts/oracle/pdb.mjs 호출 래퍼(macOS·Linux). 사용법: ./scripts/oracle/pdb.sh help
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pdb.mjs" "$@"
