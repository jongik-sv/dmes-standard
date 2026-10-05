#!/usr/bin/env bash
# 화면 키 목록으로 업무 모듈 MDM 메타(/api/{module}/mdmMeta/columns)를 불러 hit·missing·unavailable 수를 낸다(C3).
# 컬럼 등록 전후에 같은 키 목록으로 돌려 비교한다. 읽기 전용 호출이다.
#
# 사용:
#   scripts/mdm-meta/check-meta.sh [--base URL] [--module mcm] [--client-key KEY] [--user ID]
#                                  [--names FILE] [--out FILE] [--list] [--baseline FILE] [--expect FILE]
#   --base        업무 모듈 BE 주소(기본 http://localhost:8100). 포털 5100 은 로그인 쿠키가 필요해 BE 를 직접 부른다.
#   --module      경로의 {module}(기본 mcm).
#   --client-key  BFF 가 보내는 X-Client-Key(기본: 환경변수 BACKEND_CLIENT_KEY, 없으면 로컬 기본값).
#   --user        X-Authenticated-User(기본 meta-check). 권한은 USER 로 보낸다(columns 는 로그인 사용자면 된다).
#   --names       한 줄에 키 하나인 파일(기본: collect-keys.mjs --names 로 화면에서 바로 모은다).
#   --out         응답 JSON 전체를 저장할 파일.
#   --list        missing·unavailable 키 이름도 출력한다.
#   --baseline    앞서 --out 으로 저장한 응답 JSON. 새로 hit 된 키(gained)·hit 에서 빠진 키(lost)를 함께 낸다. lost 가 있으면 exit 1.
#   --expect      hit 돼야 할 키 목록 파일. 그중 아직 hit 이 아닌 키(not_yet)를 낸다. 하나라도 있으면 exit 1.
#
# 등록 전후 비교(C3): 고정 키 목록 keys-2026-10-05.txt 와 등록 전 응답 baseline-2026-10-05.json 이 이 폴더에 있다.
#   scripts/mdm-meta/check-meta.sh --names scripts/mdm-meta/keys-2026-10-05.txt \
#     --baseline scripts/mdm-meta/baseline-2026-10-05.json --expect scripts/mdm-meta/expected-gain-2026-10-05.txt
#
# 출력 첫 줄: "requested=N hit=H missing=M unavailable=U" — 등록 전후 두 줄을 비교한다.
set -euo pipefail

BASE="http://localhost:8100"
MODULE="mcm"
CLIENT_KEY="${BACKEND_CLIENT_KEY:-dmes-bff-local-client-key-2026}"
USER_ID="meta-check"
NAMES_FILE=""
OUT=""
LIST=0
BASELINE=""
EXPECT=""
need() { [ $# -ge 2 ] && [ -n "$2" ] || { echo "$1 에 값이 없습니다" >&2; exit 2; }; }
while [ $# -gt 0 ]; do
  case "$1" in
    --base) need "$@"; BASE="$2"; shift 2 ;;
    --module) need "$@"; MODULE="$2"; shift 2 ;;
    --client-key) need "$@"; CLIENT_KEY="$2"; shift 2 ;;
    --user) need "$@"; USER_ID="$2"; shift 2 ;;
    --names) need "$@"; NAMES_FILE="$2"; shift 2 ;;
    --out) need "$@"; OUT="$2"; shift 2 ;;
    --list) LIST=1; shift ;;
    --baseline) need "$@"; BASELINE="$2"; shift 2 ;;
    --expect) need "$@"; EXPECT="$2"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
  esac
done

HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 주석·빈 줄을 빼고 CR 을 뗀다. 키가 하나도 없으면 멈춘다.
keys_of() { [ -r "$1" ] || { echo "파일을 읽을 수 없습니다: $1" >&2; exit 2; }; tr -d '\r' < "$1" | grep -v '^[[:space:]]*\(#\|$\)' || true; }
if [ -n "$NAMES_FILE" ]; then
  keys_of "$NAMES_FILE" > "$TMP/names.txt"
else
  node "$HERE/collect-keys.mjs" --names > "$TMP/names.txt"
fi
[ -s "$TMP/names.txt" ] || { echo "보낼 키가 없습니다" >&2; exit 2; }

jq -R -s 'split("\n") | map(select(length > 0)) | {names: .}' "$TMP/names.txt" > "$TMP/body.json"

curl -sS -f -m 30 -X POST "$BASE/api/$MODULE/mdmMeta/columns" \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: $CLIENT_KEY" \
  -H "X-Authenticated-User: $USER_ID" \
  -H "X-Authenticated-Role: USER" \
  --data-binary @"$TMP/body.json" > "$TMP/resp.json"

jq -e '((.data // .).items | type) == "object"' "$TMP/resp.json" > /dev/null \
  || { echo "응답에 items 가 없습니다: $(head -c 300 "$TMP/resp.json")" >&2; exit 1; }
if [ -n "$OUT" ]; then cp "$TMP/resp.json" "$OUT"; fi

jq -r --argjson n "$(jq '.names | length' "$TMP/body.json")" \
  '(.data // .) as $d | "requested=\($n) hit=\($d.items | length) missing=\($d.missing | length) unavailable=\($d.unavailable | length)"' \
  "$TMP/resp.json"

if [ "$LIST" = 1 ]; then
  jq -r '(.data // .) as $d | ($d.missing | map("missing\t" + .)[]), ($d.unavailable | map("unavailable\t" + .)[])' "$TMP/resp.json"
fi

if [ -n "$BASELINE" ]; then
  jq -r --slurpfile b "$BASELINE" '
    ((.data // .).items | keys) as $now
    | (($b[0].data // $b[0]).items | keys) as $was
    | ($now - $was) as $gained | ($was - $now) as $lost
    | "baseline_hit=\($was | length) gained=\($gained | length) lost=\($lost | length)",
      ($gained | map("gained\t" + .)[]),
      ($lost | map("lost\t" + .)[])' "$TMP/resp.json" | tee "$TMP/baseline.out"
  head -1 "$TMP/baseline.out" | grep -q ' lost=0$' || exit 1
fi

if [ -n "$EXPECT" ]; then
  keys_of "$EXPECT" > "$TMP/expect.txt"
  jq -r --rawfile e "$TMP/expect.txt" '
    ((.data // .).items | keys) as $now
    | ($e | split("\n") | map(select(length > 0))) as $want
    | ($want - $now) as $miss
    | "expected=\($want | length) not_yet=\($miss | length)",
      ($miss | map("not_yet\t" + .)[])' "$TMP/resp.json" | tee "$TMP/expect.out"
  head -1 "$TMP/expect.out" | grep -q ' not_yet=0$' || exit 1
fi
