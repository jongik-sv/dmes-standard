#!/usr/bin/env bash
# MDM 메타 BE 응답 시간·크기 반복 측정(C4) — curl 로 기준(A)·변경(B)을 회차마다 번갈아 잰다.
# DB 는 쓰지 않지만 mcm 메타 조회가 mcm 캐시에 있음·없음을 채우므로, C1b 배포 순서(MDM 먼저)를 확인하기 전에는 돌리지 않는다.
#
# 사용:
#   scripts/perf/mdm-meta/run-measure.sh [--pair mcm|feed|screen|all] [--rounds N] [--reps R] [--out DIR] [--tag 이름]
#   --pair    mcm  : mcm /api/mcm/mdmMeta/columns — A 표준 물리명 176개(names-std.txt), B 별칭 이름 137개(names-alias.txt)
#             feed : MDM /api/mdm/oasis/metaFeed/view(COLUMN) — 별칭 이름 137개를 A systemCode=MES, B systemCode=MES,MDM 으로
#             screen: mcm 화면 키 416개(scripts/mdm-meta/keys-2026-10-05.txt) 한 묶음 — A·B 같은 요청(흔들림 폭 확인용)
#             all  : 셋 다(기본)
#   --rounds  회차 수(기본 5). 회차마다 uptime load 를 남기고, A·B 순서를 회차마다 뒤집는다(홀수 회차 A→B, 짝수 회차 B→A).
#   --reps    회차 안에서 한 쪽을 연달아 부르는 횟수(기본 7). 회차 값은 그 중앙값이다. 첫 회차 앞에 양쪽을 한 번씩 부르는 워밍업은 결과에서 뺀다.
#   --out     결과 폴더(기본 ${TMPDIR:-/tmp}/dmes-perf/mdm-meta). <tag>-rounds.tsv·<tag>-summary.tsv 를 쓴다.
#   --tag     결과 파일 이름 머리(기본 시각 YYYYmmdd-HHMMSS). 등록 전후처럼 창을 나눠 잴 때 before·after 로 준다.
#
# 환경 변수: MCM_BASE(기본 http://localhost:8100) MDM_BASE(기본 http://localhost:8096) BACKEND_CLIENT_KEY(기본 로컬 값)
#
# 값: ms = curl time_total(요청 시작 ~ 응답 끝, 로컬 루프백), bytes = 응답 본문 크기, hit = 응답 items 수.
# mcm 은 첫 조회 뒤 캐시에서 답하므로 워밍업 뒤 값은 캐시 적중 경로다. 성능 결론은 반복 측정 없이 내지 않는다(같은 설정도 2배까지 흔들린다).
set -euo pipefail

PAIR=all
ROUNDS=5
REPS=7
OUT="${TMPDIR:-/tmp}/dmes-perf/mdm-meta"
TAG="$(date +%Y%m%d-%H%M%S)"
while [ $# -gt 0 ]; do
  case "$1" in
    --pair) PAIR="${2:?--pair 값}"; shift 2 ;;
    --rounds) ROUNDS="${2:?--rounds 값}"; shift 2 ;;
    --reps) REPS="${2:?--reps 값}"; shift 2 ;;
    --out) OUT="${2:?--out 값}"; shift 2 ;;
    --tag) TAG="${2:?--tag 값}"; shift 2 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
  esac
done
case "$PAIR" in mcm|feed|screen|all) ;; *) echo "--pair 는 mcm|feed|screen|all" >&2; exit 2 ;; esac
for v in "$ROUNDS" "$REPS"; do
  case "$v" in ''|*[!0-9]*|0*) echo "--rounds·--reps 는 1 이상의 정수여야 합니다: $v" >&2; exit 2 ;; esac
done

HERE="$(cd "$(dirname "$0")" && pwd)"
KEYS_SCREEN="$HERE/../../mdm-meta/keys-2026-10-05.txt"
MCM_BASE="${MCM_BASE:-http://localhost:8100}"
MDM_BASE="${MDM_BASE:-http://localhost:8096}"
CLIENT_KEY="${BACKEND_CLIENT_KEY:-dmes-bff-local-client-key-2026}"
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

names_json() { tr -d '\r' < "$1" | { grep -v '^[[:space:]]*\(#\|$\)' || true; } | jq -R -s 'split("\n") | map(select(length > 0))'; }

# 요청 본문 파일: <pair>-<A|B>.json, 그리고 대상 URL
build() {
  local std alias screen
  std="$(names_json "$HERE/names-std.txt")"
  alias="$(names_json "$HERE/names-alias.txt")"
  screen="$(names_json "$KEYS_SCREEN")"
  jq -n --argjson n "$std" '{names: $n}' > "$TMP/mcm-A.json"
  jq -n --argjson n "$alias" '{names: $n}' > "$TMP/mcm-B.json"
  jq -n --argjson n "$screen" '{names: $n}' > "$TMP/screen-A.json"
  cp "$TMP/screen-A.json" "$TMP/screen-B.json"
  jq -n --argjson n "$alias" --arg s MES '{meta: {menuId: "metaFeed"}, params: {type: "COLUMN", systemCode: $s}, grids: {keys: {rows: ($n | map({key: .}))}}}' > "$TMP/feed-A.json"
  jq -n --argjson n "$alias" --arg s MES,MDM '{meta: {menuId: "metaFeed"}, params: {type: "COLUMN", systemCode: $s}, grids: {keys: {rows: ($n | map({key: .}))}}}' > "$TMP/feed-B.json"
}

url() {
  case "$1" in
    mcm|screen) echo "$MCM_BASE/api/mcm/mdmMeta/columns" ;;
    feed) echo "$MDM_BASE/api/mdm/oasis/metaFeed/view" ;;
  esac
}

# 한 번 부르고 "ms bytes hit" 를 낸다. HTTP 200 이 아니면 실패.
once() {
  local pair="$1" side="$2" w code ms bytes hit
  w="$(curl -sS -m 30 -o "$TMP/resp.json" -w '%{http_code} %{time_total} %{size_download}' -X POST "$(url "$pair")" \
    -H "Content-Type: application/json" -H "X-Client-Key: $CLIENT_KEY" \
    -H "X-Authenticated-User: perf-mdm-meta" -H "X-Authenticated-Role: USER" \
    --data-binary @"$TMP/$pair-$side.json")"
  read -r code ms bytes <<< "$w"
  [ "$code" = 200 ] || { echo "HTTP $code: $pair-$side $(head -c 200 "$TMP/resp.json")" >&2; return 1; }
  hit="$(jq '(.data.result // .data // .).items | length' "$TMP/resp.json")" || { echo "응답이 JSON 이 아닙니다: $pair-$side" >&2; return 1; }
  awk -v s="$ms" -v b="$bytes" -v h="$hit" 'BEGIN { printf "%.2f %d %d\n", s * 1000, b, h }'
}

median() { sort -n | awk '{ v[NR] = $1 } END { if (NR == 0) exit 1; if (NR % 2) print v[(NR + 1) / 2]; else printf "%.2f\n", (v[NR / 2] + v[NR / 2 + 1]) / 2 }'; }

# 한 쪽을 REPS 번 불러 "median_ms bytes hit"
side_run() {
  local pair="$1" side="$2" i
  : > "$TMP/ms.txt"
  for ((i = 0; i < REPS; i++)); do
    once "$pair" "$side" > "$TMP/one.txt" || return 1
    cut -d' ' -f1 "$TMP/one.txt" >> "$TMP/ms.txt"
  done
  echo "$(median < "$TMP/ms.txt") $(cut -d' ' -f2,3 "$TMP/one.txt")"
}

pairs=()
case "$PAIR" in all) pairs=(mcm feed screen) ;; *) pairs=("$PAIR") ;; esac

build
ROUNDS_TSV="$OUT/$TAG-rounds.tsv"
SUMMARY_TSV="$OUT/$TAG-summary.tsv"
printf 'tag\tround\tat\tload1\tload5\tload15\tpair\tside\tmedian_ms\tbytes\thit\n' > "$ROUNDS_TSV"

for p in "${pairs[@]}"; do   # 워밍업 — 캐시 적재·JIT 를 결과에서 뺀다
  once "$p" A > /dev/null
  once "$p" B > /dev/null
done

for ((r = 1; r <= ROUNDS; r++)); do
  read -r l1 l5 l15 <<< "$(uptime | sed 's/.*load averages*: *//; s/,/ /g')"
  at="$(date +%H:%M:%S)"
  if ((r % 2)); then order=(A B); else order=(B A); fi
  for p in "${pairs[@]}"; do
    for s in "${order[@]}"; do
      # $(…) 안에서는 errexit 가 꺼지므로 파일로 받아 실패를 직접 본다 — HTTP 오류면 측정을 멈춘다
      side_run "$p" "$s" > "$TMP/side.txt" || { echo "측정 중단: $p-$s 요청 실패(회차 $r)" >&2; exit 1; }
      read -r ms bytes hit < "$TMP/side.txt" || true
      [ -n "$ms" ] || { echo "측정 중단: $p-$s 값이 비었습니다(회차 $r)" >&2; exit 1; }
      printf '%s\t%d\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$TAG" "$r" "$at" "$l1" "$l5" "$l15" "$p" "$s" "$ms" "$bytes" "$hit" >> "$ROUNDS_TSV"
    done
  done
  echo "[mdm-meta perf] 회차 $r/$ROUNDS 끝 (load1 $l1)" >&2
done

printf 'tag\tpair\tside\trounds\tmedian_ms\tmin_ms\tmax_ms\tbytes\thit\n' > "$SUMMARY_TSV"
for p in "${pairs[@]}"; do
  for s in A B; do
    awk -F'\t' -v p="$p" -v s="$s" 'NR > 1 && $7 == p && $8 == s { print $9 }' "$ROUNDS_TSV" > "$TMP/col.txt"
    med="$(median < "$TMP/col.txt")"
    mn="$(sort -n "$TMP/col.txt" | head -1)"
    mx="$(sort -n "$TMP/col.txt" | tail -1)"
    last="$(awk -F'\t' -v p="$p" -v s="$s" 'NR > 1 && $7 == p && $8 == s { b = $10; h = $11 } END { print b "\t" h }' "$ROUNDS_TSV")"
    printf '%s\t%s\t%s\t%d\t%s\t%s\t%s\t%s\n' "$TAG" "$p" "$s" "$ROUNDS" "$med" "$mn" "$mx" "$last" >> "$SUMMARY_TSV"
  done
done
column -t -s $'\t' "$SUMMARY_TSV"
echo "회차별: $ROUNDS_TSV" >&2
