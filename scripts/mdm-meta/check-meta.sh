#!/usr/bin/env bash
# 화면 키 목록으로 업무 모듈 MDM 메타(/api/{module}/mdmMeta/columns)를 불러 hit·missing·unavailable 수를 낸다(C3).
# 컬럼 등록 전후에 같은 키 목록으로 돌려 비교한다. 읽기 전용 호출이다.
#
# 사용:
#   scripts/mdm-meta/check-meta.sh [--base URL] [--module mcm] [--client-key KEY] [--user ID]
#                                  [--names FILE] [--out FILE] [--list]
#   --base        업무 모듈 BE 주소(기본 http://localhost:8100). 포털 5100 은 로그인 쿠키가 필요해 BE 를 직접 부른다.
#   --module      경로의 {module}(기본 mcm).
#   --client-key  BFF 가 보내는 X-Client-Key(기본: 환경변수 BACKEND_CLIENT_KEY, 없으면 로컬 기본값).
#   --user        X-Authenticated-User(기본 meta-check). 권한은 USER 로 보낸다(columns 는 로그인 사용자면 된다).
#   --names       한 줄에 키 하나인 파일(기본: collect-keys.mjs --names 로 화면에서 바로 모은다).
#   --out         응답 JSON 전체를 저장할 파일.
#   --list        missing·unavailable 키 이름도 출력한다.
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
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --module) MODULE="$2"; shift 2 ;;
    --client-key) CLIENT_KEY="$2"; shift 2 ;;
    --user) USER_ID="$2"; shift 2 ;;
    --names) NAMES_FILE="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --list) LIST=1; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
  esac
done

HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ -n "$NAMES_FILE" ]; then
  grep -v '^[[:space:]]*\(#\|$\)' "$NAMES_FILE" > "$TMP/names.txt"
else
  node "$HERE/collect-keys.mjs" --names > "$TMP/names.txt"
fi

jq -R -s 'split("\n") | map(select(length > 0)) | {names: .}' "$TMP/names.txt" > "$TMP/body.json"

curl -sS -f -m 30 -X POST "$BASE/api/$MODULE/mdmMeta/columns" \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: $CLIENT_KEY" \
  -H "X-Authenticated-User: $USER_ID" \
  -H "X-Authenticated-Role: USER" \
  --data-binary @"$TMP/body.json" > "$TMP/resp.json"

[ -n "$OUT" ] && cp "$TMP/resp.json" "$OUT"

jq -r --argjson n "$(jq '.names | length' "$TMP/body.json")" \
  '(.data // .) as $d | "requested=\($n) hit=\($d.items | length) missing=\($d.missing | length) unavailable=\($d.unavailable | length)"' \
  "$TMP/resp.json"

if [ "$LIST" = 1 ]; then
  jq -r '(.data // .) as $d | ($d.missing | map("missing\t" + .)[]), ($d.unavailable | map("unavailable\t" + .)[])' "$TMP/resp.json"
fi
