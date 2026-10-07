#!/usr/bin/env bash
# 로컬 SQLite DB(src/backend/data/<db>.db)를 표별 SQL 텍스트로 db-snapshot/<db>/ 에 내보낸다.
# 사용: scripts/db-snapshot/export.sh [db이름...]   (기본: mdm mcm)
# 출력: _schema.sql(스키마·인덱스·트리거·뷰), <표>.sql(한 줄 = INSERT 한 문, PK/rowid 순), sqlite_sequence.sql
# 실행 중인 서버가 써도 안전하게 .backup 으로 임시 사본을 떠서 그 사본에서 내보낸다.
set -euo pipefail

# ---- 고치기 쉬운 설정 -------------------------------------------------------
# 스키마만 내보내고 데이터는 내보내지 않는 표 (보안·불필요 데이터)
DATA_EXCLUDE=(
  TB_MCM_SEC_USER_PWD      # 비밀번호 해시(USER_ENC_PWD 등)
  TB_SEC_REVOKED_TOKEN     # 폐기된 JWT 식별자
  TB_MCM_SEC_USER_HIS      # 사용자 변경 이력
  TB_MCM_SEC_USER_ROLL_HIS # 사용자 권한 변경 이력
  TB_SEC_KEY_STORE         # JWT 서명 키(PRIVATE_KEY·SECRET 칸)
  TB_SEC_USER              # USER_PASS 칸(비밀번호)
  TB_SEC_LOGIN_LOG         # 로그인 기록(IP·UA), 계속 쌓여 diff 가 흔들림
  TB_SEC_AUDIT_LOG         # 감사 로그
)
# 값을 NULL 로 바꿔 내보내는 칸 (표.칸)
NULLIFY=(
  TB_MDM_TERM.EMBEDDING        # KURE 벡터(BLOB, 전체 크기 대부분) — 복원 뒤 다시 계산
  TB_MDM_TERM.EMBEDDING_MODEL  # NULL 이면 재계산 대상
)
# 사용자 관련 표는 admin 행만 내보낸다 ("표이름|WHERE 조건")
ROW_FILTER=(
  "TB_MCM_SEC_USER|USER_ID='admin'"
  "TB_MCM_SEC_USER_MAPPING|USER_ID='admin'"
  "TB_MCM_SEC_USER_FAVORITE|USER_ID='admin'"
  "TB_MCM_SEC_USER_FAVORITE_FOLD|USER_ID='admin'"
  "TB_MCM_SEC_USER_START_PGM|USER_ID='admin'"
  "TB_MCM_SEC_USER_WIDGET|USER_ID='admin'"
  "TB_MCM_SEC_USER_WIDGET_TAB|USER_ID='admin'"
  "TB_MCM_SEC_USER_WIDGET_CHAT|USER_ID='admin'"
  "TB_MCM_SEC_USER_WIDGET_MEMO|USER_ID='admin'"
  "TB_SEC_SCREEN_USAGE_DAY|USER_ID='admin'"
  "TB_SEC_SCREEN_USAGE_LOG|USER_ID='admin'"
)
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATA_DIR="${DB_DATA_DIR:-$ROOT/src/backend/data}"
OUT_ROOT="$ROOT/db-snapshot"
DBS=("$@"); [ ${#DBS[@]} -eq 0 ] && DBS=(mdm mcm)

command -v sqlite3 >/dev/null || { echo "sqlite3 가 필요합니다" >&2; exit 1; }
TMP="$(mktemp -d "${TMPDIR:-/tmp}/db-snapshot.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

in_list() { local x="$1"; shift; local i; for i in "$@"; do i="${i%%#*}"; i="${i// /}"; [ "$i" = "$x" ] && return 0; done; return 1; }
clean_list() { local i; for i in "$@"; do i="${i%%#*}"; echo "${i// /}"; done; }
EXCL=(); while IFS= read -r l; do [ -n "$l" ] && EXCL+=("$l"); done < <(clean_list "${DATA_EXCLUDE[@]}")
NULLS=(); while IFS= read -r l; do [ -n "$l" ] && NULLS+=("$l"); done < <(clean_list "${NULLIFY[@]}")

for db in "${DBS[@]}"; do
  src="$DATA_DIR/$db.db"
  [ -f "$src" ] || { echo "없음: $src" >&2; exit 1; }
  copy="$TMP/$db.db"
  sqlite3 -readonly "$src" ".backup '$copy'"
  out="$OUT_ROOT/$db"
  rm -rf "$out"; mkdir -p "$out"

  sqlite3 -readonly "$copy" .schema | grep -v '^CREATE TABLE sqlite_sequence' > "$out/_schema.sql" || true  # sqlite_sequence 는 자동 생성

  tables=()
  while IFS= read -r t; do tables+=("$t"); done < <(sqlite3 -readonly "$copy" \
    "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")

  for t in "${tables[@]}"; do
    f="$out/$t.sql"
    where=""
    for rf in "${ROW_FILTER[@]}"; do [ "${rf%%|*}" = "$t" ] && where="where ${rf#*|}"; done
    if in_list "$t" "${EXCL[@]}"; then : > "$f"; echo "-- 데이터 제외(스키마만): $t" > "$f"; continue; fi
    # 칸 표현식: 문자열의 줄바꿈을 char() 이어붙임으로 바꿔 INSERT 를 한 줄로 만든다
    exprs=""; cols=""
    while IFS='|' read -r cname ctype; do
      if in_list "$t.$cname" "${NULLS[@]}"; then e="'NULL'"
      else e="replace(replace(quote(\"$cname\"), char(10), '''||char(10)||'''), char(13), '''||char(13)||''')"; fi
      exprs="${exprs:+$exprs||','||}$e"; cols="${cols:+$cols,}\"$cname\""
    done < <(sqlite3 -readonly "$copy" "select name, type from pragma_table_info('$t')")
    pk="$(sqlite3 -readonly "$copy" "select group_concat('\"'||name||'\"', ',') from (select name from pragma_table_info('$t') where pk>0 order by pk)")"
    if [ -n "$pk" ]; then order="$pk"; else order="rowid"; fi
    if ! sqlite3 -readonly "$copy" "select 1 from \"$t\" limit 0" >/dev/null 2>&1; then echo "읽기 실패: $t" >&2; exit 1; fi
    # WITHOUT ROWID 표는 PK 정렬만 쓴다(위에서 pk 가 있으면 그대로)
    sqlite3 -readonly "$copy" "select 'INSERT INTO \"$t\"($cols) VALUES('||$exprs||');' from \"$t\" $where order by $order" > "$f"
  done

  # AUTOINCREMENT 시퀀스: 마지막에 덮어쓴다
  if sqlite3 -readonly "$copy" "select 1 from sqlite_master where name='sqlite_sequence'" | grep -q 1; then
    { echo "DELETE FROM sqlite_sequence;"
      sqlite3 -readonly "$copy" "select 'INSERT INTO sqlite_sequence(name,seq) VALUES('||quote(name)||','||seq||');' from sqlite_sequence order by name"
    } > "$out/sqlite_sequence.sql"
  fi
  rm -f "$copy"
  echo "내보냄: $out ($(ls "$out" | wc -l | tr -d ' ')개 파일, $(du -sk "$out" | cut -f1) KB)"
done
