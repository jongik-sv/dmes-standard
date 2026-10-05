#!/usr/bin/env bash
# 분류표(docs/mdm-column-dict/classification.json)와 고정 키 목록에서 파생 목록 세 개를 다시 만든다.
#   scripts/mdm-meta/expected-gain-2026-10-05.txt  등록·C1b 뒤 hit 돼야 할 키(NEW·ALIAS·MDM 중 메타를 요청하는 키)
#   scripts/perf/mdm-meta/names-std.txt             측정 A — 사전에 있음·신규·별칭·MDM 별칭 행이 가리키는 표준 물리명
#   scripts/perf/mdm-meta/names-alias.txt           측정 B — 그 행들 중 화면 키가 표준 물리명과 다르고 메타를 요청하는 키
# 분류표나 키 목록을 바꾼 뒤 돌린다. 사용: scripts/mdm-meta/derive-lists.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLASS="$ROOT/docs/mdm-column-dict/classification.json"
KEYS="$ROOT/scripts/mdm-meta/keys-2026-10-05.txt"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

tr -d '\r' < "$KEYS" | sort -u > "$TMP/keys.txt"

jq -r '.[] | select(.class == "NEW" or .class == "ALIAS" or .class == "MDM") | .phys' "$CLASS" | sort -u \
  | comm -12 - "$TMP/keys.txt" > "$ROOT/scripts/mdm-meta/expected-gain-2026-10-05.txt"
jq -r '.[] | select(.class == "EXIST" or .class == "NEW" or .class == "ALIAS" or .class == "MDM") | .stdPhys' "$CLASS" | sort -u \
  > "$ROOT/scripts/perf/mdm-meta/names-std.txt"
jq -r '.[] | select(.class == "NEW" or .class == "ALIAS" or .class == "MDM") | select(.phys != .stdPhys) | .phys' "$CLASS" | sort -u \
  | comm -12 - "$TMP/keys.txt" > "$ROOT/scripts/perf/mdm-meta/names-alias.txt"

wc -l "$ROOT/scripts/mdm-meta/expected-gain-2026-10-05.txt" "$ROOT/scripts/perf/mdm-meta/names-std.txt" "$ROOT/scripts/perf/mdm-meta/names-alias.txt"
