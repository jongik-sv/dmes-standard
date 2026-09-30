#!/usr/bin/env bash
# E2E 시험 데이터 정리 — 마루 코드·룰에 남은 E2E_USR_* (및 E2E_*) 데이터를 지운다.
#
# 왜 필요한가:
#   2026-09-28 이전 E2E 는 시험 데이터 ID 에 실행 번호(RUN)를 붙였다(`E2E_USR_CD_L1H8E1`).
#   그래서 실행할 때마다 마루 코드 목록에 한 벌씩 쌓였고, 6회 실행 기준 57건이 남았다.
#   `uid()` 가 실행 번호를 떼도록 고친 뒤에도, 이미 쌓인 것과 다른 규약(별도 스크립트)으로 만든
#   것이 남아 있을 수 있어 이 스크립트로 한 번에 비운다.
#
# 무엇을 지우는가 (접두 `E2E` 가 붙은 이름·ID 인 것만):
#   마루 코드  TB_MDM_CODE / _VER / _CATE / _ITEM / _CATE_ITEM / _RECV
#   룰       TB_MDM_RULE 와 그 하위(VER·VAR·ROW·TEST_CASE·SYSTEM·RECV), E2E 만 참조하는 룰 세트
#   마루 데이터 TB_MDM_DATA / _CATE / _ITEM / _CATE_ITEM / _SYSTEM / _RECV / _RECV_ITEM
#     (dmd 스펙이 만든 E2E_USR_DM*_<시각>·E2EDM<접미> 등. 마루 데이터는 화면에서 지울 수 없어 실행마다 쌓인다)
#     ※ 픽스처 마루 데이터(E2E_DM_·E2E_DC_·E2E_DI_ 의 고정 7개)는 남긴다 — 화면 스펙이 e2e/fixtures/*.sql 을 다시
#       넣지 않고 그대로 쓰기 때문이다. 그것까지 지우려면 --include-fixtures (지운 뒤 픽스처 SQL 을 다시 적용해야 한다).
#   용어·도메인·컬럼 사전 TB_MDM_TERM / TB_MDM_DOMAIN / TB_MDM_COLUMN ( dma 스펙이 만든 것 )
#   ※ dma 는 시험 데이터를 만들되 정리를 하지 않아 여기까지 왔었다. 삭제는 자식 → 부모 순으로 한다.
# 지우지 않는 것:
#   샘플 데이터(EQP_CD·LINE_CD·PROC_CD·STEEL_STD·SURF_GRD·QLTY_GRD_JDG·BASE_SPD_LKP 등) — 접두가 E2E 가 아니다.
#
# 사용:
#   ./tools/e2e-clean-data.sh            # 확인만(기본). 지우려면 --apply
#   ./tools/e2e-clean-data.sh --apply    # 실제로 지운다
#   ./tools/e2e-clean-data.sh --apply --include-fixtures   # 픽스처 마루 데이터(E2E_DM_PORT 등)까지 지운다
#   ./tools/e2e-clean-data.sh --apply --data-only          # 마루 데이터(TB_MDM_DATA*)만 지운다 — 코드·룰·사전은 남긴다
#     (마루 데이터 목록만 정리하고 싶을 때. 다른 마루 데이터 쪽 잔여분은 그대로 둔다)
#
# 되돌림: 지우기 직전에 mdm.db 를 <파일>.bak-e2eclean-<시각> 으로 복사한다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${E2E_CLEAN_DB:-$ROOT/src/backend/data/mdm.db}"
APPLY=0
INCLUDE_FIXTURES=0
DATA_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --include-fixtures) INCLUDE_FIXTURES=1 ;;
    --data-only) DATA_ONLY=1 ;;
    *) echo "[e2e-clean] 알 수 없는 인자: $arg" >&2; exit 1 ;;
  esac
done

# 픽스처 마루 데이터(e2e/fixtures/mdm-dataMng.sql·mdm-dataItem.sql) — 기본은 남긴다.
FIXTURE_DATA="'E2E_DM_PORT','E2E_DM_CUST','E2E_DC_PORT','E2E_DI_PORT','E2E_DI_CUST','E2E_DI_EMPTY','E2E_DI_CSV'"
if [ "$INCLUDE_FIXTURES" -eq 1 ]; then
  DATA_WHERE="MARU_DATA_ID LIKE 'E2E%'"
else
  DATA_WHERE="MARU_DATA_ID LIKE 'E2E%' AND MARU_DATA_ID NOT IN ($FIXTURE_DATA)"
fi

if [ ! -f "$DB" ]; then
  echo "[e2e-clean] DB 가 없다: $DB" >&2
  exit 1
fi

count() { sqlite3 "$DB" "SELECT COUNT(*) FROM $1 WHERE $2 LIKE 'E2E%';"; }
q() { sqlite3 "$DB" "$1"; }
count_where() { sqlite3 "$DB" "SELECT COUNT(*) FROM $1 WHERE $2;"; }

echo "[e2e-clean] 대상 DB: $DB"

# ── 대상 집계 ────────────────────────────────────────────────
T_DATA=$(count_where TB_MDM_DATA "$DATA_WHERE")
T_DATAITEM=$(count_where TB_MDM_DATA_ITEM "$DATA_WHERE")

if [ "$DATA_ONLY" -eq 1 ]; then
  # --data-only — 마루 데이터 계열만 본다. 코드·룰·사전 집계는 아래 else 로 빠진다.
  TOTAL=$((T_DATA + T_DATAITEM))
  echo "[e2e-clean] 범위: 마루 데이터만 (--data-only) — 마루 코드·룰·사전은 건드리지 않는다"
  echo "[e2e-clean] E2E 데이터: 마루 데이터 ${T_DATA}(항목 ${T_DATAITEM})  (합계 ${TOTAL})"
  if [ "$INCLUDE_FIXTURES" -eq 0 ]; then
    echo "[e2e-clean] 남길 픽스처 마루 데이터: $(q "SELECT IFNULL(GROUP_CONCAT(MARU_DATA_ID, ' '), '(없음)') FROM TB_MDM_DATA WHERE MARU_DATA_ID IN ($FIXTURE_DATA);")"
  fi
  echo "[e2e-clean] 남길 비-E2E 마루 데이터: $(q "SELECT IFNULL(GROUP_CONCAT(MARU_DATA_ID, ' '), '(없음)') FROM TB_MDM_DATA WHERE MARU_DATA_ID NOT LIKE 'E2E%';")"
else
  T_CODE=$(count TB_MDM_CODE MARU_CODE_ID)
  T_CATE=$(count TB_MDM_CODE_CATE MARU_CODE_ID)
  T_ITEM=$(count TB_MDM_CODE_ITEM MARU_CODE_ID)
  T_CATEITEM=$(count TB_MDM_CODE_CATE_ITEM MARU_CODE_ID)
  T_RULE=$(count TB_MDM_RULE MARU_RULE_ID)
  T_TERM=$(q "SELECT COUNT(*) FROM TB_MDM_TERM WHERE TERM_NAME LIKE 'E2E%' OR ENG_ABBR LIKE 'E2E%' OR TERM_ID LIKE 'E2E%';")
  T_DOMAIN=$(q "SELECT COUNT(*) FROM TB_MDM_DOMAIN WHERE DOMAIN_NAME LIKE 'E2E%' OR DOMAIN_ID LIKE 'E2E%';")
  T_COLUMN=$(q "SELECT COUNT(*) FROM TB_MDM_COLUMN WHERE COLUMN_NAME LIKE 'E2E%' OR COLUMN_ID LIKE 'E2E%';")
  TOTAL=$((T_CODE + T_CATE + T_ITEM + T_CATEITEM + T_RULE + T_DATA + T_DATAITEM + T_TERM + T_DOMAIN + T_COLUMN))

  echo "[e2e-clean] E2E 데이터: 코드 ${T_CODE} · 카테고리 ${T_CATE} · 항목 ${T_ITEM} · 카테고리항목 ${T_CATEITEM} · 룰 ${T_RULE} · 마루 데이터 ${T_DATA}(항목 ${T_DATAITEM}) · 용어 ${T_TERM} · 도메인 ${T_DOMAIN} · 컬럼 ${T_COLUMN}  (합계 ${TOTAL})"
  echo "[e2e-clean] 남길 샘플 코드: $(q "SELECT IFNULL(GROUP_CONCAT(MARU_CODE_ID, ' '), '(없음)') FROM TB_MDM_CODE WHERE MARU_CODE_ID NOT LIKE 'E2E%';")"
  echo "[e2e-clean] 남길 샘플 룰  : $(q "SELECT COUNT(*) FROM TB_MDM_RULE WHERE MARU_RULE_ID NOT LIKE 'E2E%';")건"
fi

if [ "$TOTAL" -eq 0 ]; then
  echo "[e2e-clean] 지울 것이 없다. 종료."
  exit 0
fi

if [ "$APPLY" -ne 1 ]; then
  EXTRA=""
  [ "$INCLUDE_FIXTURES" -eq 1 ] && EXTRA="$EXTRA --include-fixtures"
  [ "$DATA_ONLY" -eq 1 ] && EXTRA="$EXTRA --data-only"
  echo "[e2e-clean] 확인 모드 — 지우려면: $0 --apply$EXTRA"
  exit 0
fi

# ── 백업 ────────────────────────────────────────────────────
BAK="${DB}.bak-e2eclean-$(date +%Y%m%d-%H%M%S)"
cp "$DB" "$BAK"
echo "[e2e-clean] 백업: $BAK"

# ── 삭제 (자식 → 부모 순. FK 는 껐다 켠다) ───────────────────
# 마루 데이터 블록은 항상 도는다. --data-only 면 나머지 블록(룰·코드·사전)은 빼고 이 블록만 실행한다.
SQL_DATA="DELETE FROM TB_MDM_DATA_RECV_ITEM WHERE RECV_ID IN (SELECT RECV_ID FROM TB_MDM_DATA_RECV WHERE $DATA_WHERE);
DELETE FROM TB_MDM_DATA_RECV      WHERE $DATA_WHERE;
DELETE FROM TB_MDM_DATA_SYSTEM    WHERE $DATA_WHERE;
DELETE FROM TB_MDM_DATA_CATE_ITEM WHERE $DATA_WHERE;
DELETE FROM TB_MDM_DATA_ITEM      WHERE $DATA_WHERE;
DELETE FROM TB_MDM_DATA_CATE      WHERE $DATA_WHERE;
DELETE FROM TB_MDM_DATA           WHERE $DATA_WHERE;"

if [ "$DATA_ONLY" -eq 1 ]; then
  SQL_DELETE="$SQL_DATA"
else
  SQL_DELETE="$SQL_DATA
-- 룰과 그 하위
DELETE FROM TB_MDM_RULE_TEST_CASE WHERE MARU_RULE_ID LIKE 'E2E%';
DELETE FROM TB_MDM_RULE_ROW        WHERE MARU_RULE_ID LIKE 'E2E%';
DELETE FROM TB_MDM_RULE_VAR        WHERE MARU_RULE_ID LIKE 'E2E%';
DELETE FROM TB_MDM_RULE_SYSTEM     WHERE MARU_RULE_ID LIKE 'E2E%';
DELETE FROM TB_MDM_RULE_RECV       WHERE MARU_RULE_ID LIKE 'E2E%';
DELETE FROM TB_MDM_RULE_VER        WHERE MARU_RULE_ID LIKE 'E2E%';
DELETE FROM TB_MDM_RULE            WHERE MARU_RULE_ID LIKE 'E2E%';
-- 룰 세트는 RULE_IDS(JSON 배열 텍스트)로 참조하므로 E2E 를 참조하는 것을 지운다
DELETE FROM TB_MDM_RULE_SET WHERE RULE_IDS LIKE '%E2E%';
-- 마루 코드(자식 → 부모)
DELETE FROM TB_MDM_CODE_CATE_ITEM WHERE MARU_CODE_ID LIKE 'E2E%';
DELETE FROM TB_MDM_CODE_ITEM      WHERE MARU_CODE_ID LIKE 'E2E%';
DELETE FROM TB_MDM_CODE_CATE      WHERE MARU_CODE_ID LIKE 'E2E%';
DELETE FROM TB_MDM_CODE_VER       WHERE MARU_CODE_ID LIKE 'E2E%';
DELETE FROM TB_MDM_CODE           WHERE MARU_CODE_ID LIKE 'E2E%';
DELETE FROM TB_MDM_CODE_RECV      WHERE MARU_CODE_ID LIKE 'E2E%';
-- dma 스펙이 만든 용어·도메인·컬럼 사전(자식 → 부모)
DELETE FROM TB_MDM_COLUMN  WHERE COLUMN_NAME LIKE 'E2E%' OR COLUMN_ID LIKE 'E2E%';
DELETE FROM TB_MDM_DOMAIN  WHERE DOMAIN_NAME LIKE 'E2E%' OR DOMAIN_ID LIKE 'E2E%';
DELETE FROM TB_MDM_TERM    WHERE TERM_NAME LIKE 'E2E%' OR ENG_ABBR LIKE 'E2E%' OR TERM_ID LIKE 'E2E%';"
fi

sqlite3 "$DB" <<SQL
PRAGMA foreign_keys=OFF;
$SQL_DELETE
PRAGMA foreign_keys=ON;
SQL

echo "[e2e-clean] 삭제 완료 — 무결성 확인"
INTEG=$(sqlite3 "$DB" "PRAGMA integrity_check;")
FK=$(sqlite3 "$DB" "PRAGMA foreign_key_check;")
[ "$INTEG" = "ok" ] || { echo "[e2e-clean] 무결성 실패: $INTEG" >&2; exit 1; }
[ -z "$FK" ] || { echo "[e2e-clean] FK 위반: $FK" >&2; exit 1; }
echo "[e2e-clean] integrity=ok · FK 이상 없음"
if [ "$DATA_ONLY" -eq 1 ]; then
  echo "[e2e-clean] 남은 마루 데이터: $(sqlite3 "$DB" "SELECT COUNT(*) FROM TB_MDM_DATA;")건 (E2E $(sqlite3 "$DB" "SELECT COUNT(*) FROM TB_MDM_DATA WHERE MARU_DATA_ID LIKE 'E2E%';")건 = 픽스처만)"
else
  echo "[e2e-clean] 남은 코드: $(sqlite3 "$DB" "SELECT COUNT(*) FROM TB_MDM_CODE;")건 · 남은 룰: $(sqlite3 "$DB" "SELECT COUNT(*) FROM TB_MDM_RULE;")건"
fi
