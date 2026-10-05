#!/usr/bin/env bash
# db-snapshot/<db>/ 의 SQL 로 SQLite DB 를 복원한다.
# 사용: scripts/db-snapshot/import.sh <db이름> [대상경로]   (기본 대상: src/backend/data/<db이름>.db)
# 대상 파일이 있으면 지우지 않고 <파일>.bak-<YYYYMMDD-HHMMSS> 로 옮겨 둔다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
[ $# -ge 1 ] || { echo "사용: $0 <db이름> [대상경로]" >&2; exit 1; }
db="$1"
target="${2:-$ROOT/src/backend/data/$db.db}"
snap="$ROOT/db-snapshot/$db"
[ -f "$snap/_schema.sql" ] || { echo "스냅샷 없음: $snap/_schema.sql" >&2; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 가 필요합니다" >&2; exit 1; }

mkdir -p "$(dirname "$target")"
bak=""
if [ -e "$target" ]; then
  bak="$target.bak-$(date +%Y%m%d-%H%M%S)"
  mv "$target" "$bak"
  echo "기존 파일을 옮겨 둠: $bak"
fi
rm -f "$target-wal" "$target-shm"

restore_on_fail() { rc=$?; if [ $rc -ne 0 ]; then rm -f "$target"; [ -n "$bak" ] && mv "$bak" "$target" && echo "실패: 기존 파일 복구함" >&2; fi; }
trap restore_on_fail EXIT

{
  echo "PRAGMA foreign_keys=OFF;"
  cat "$snap/_schema.sql"
  echo "BEGIN;"
  for f in "$snap"/*.sql; do
    n="$(basename "$f")"
    case "$n" in _schema.sql|sqlite_sequence.sql) continue;; esac
    cat "$f"
  done
  [ -f "$snap/sqlite_sequence.sql" ] && cat "$snap/sqlite_sequence.sql"
  echo "COMMIT;"
} | sqlite3 -bail "$target"

echo "복원 완료: $target"
echo "표 수: $(sqlite3 "$target" "select count(*) from sqlite_master where type='table'")"
if [ "$db" = "mdm" ]; then
cat <<'MSG'

[다음 단계] 용어 임베딩(TB_MDM_TERM.EMBEDDING, EMBEDDING_MODEL)은 스냅샷에 없어 NULL 입니다. 다시 계산하세요.
  1) KURE-v1 INT8 모델 폴더 준비(model.onnx sha256 1808718e…): ~/.cache/kure-v1-onnx-int8
  2) cd docs/mdm/dict-std && uv venv .venv && uv pip install numpy onnxruntime tokenizers
  3) MODEL_DIR=~/.cache/kure-v1-onnx-int8 .venv/bin/python embed_terms.py --db <복원한 mdm.db 경로>
     (NULL 인 행만 채움, 8천 건 맥 CPU 약 8분 30초. 서버 껐다 켜면 캐시가 다시 읽힘)
  자세한 내용: db-snapshot/README.md
MSG
fi
