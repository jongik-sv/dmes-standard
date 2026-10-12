-- ============================================================================
-- MCM_BACKUP 컬럼 순서 재배치 — 자동 생성 파일. 직접 고치지 말고 생성기를 다시 돌린다.
--   생성기: node scripts/db-order/gen.mjs relocate --base <기존 DB 기준 ref> --write
--   규칙: PK(PK 제약 순서) → 엔티티 필드 선언 순서 → 버전(VER·AUD_VER·ROW_VERSION) → 감사 8개(scripts/db-order/lib/rule.mjs)
-- 방식: 표마다 앞에 둘 PK 컬럼만 남기고 나머지를 INVISIBLE 로 숨긴 뒤 규칙 순서대로 하나씩 VISIBLE 로 되돌린다.
--   VISIBLE 로 돌아온 컬럼은 맨 끝에 붙으므로 결과 = 규칙 순서. 데이터·타입·NULL·기본값·제약·인덱스는 그대로다.
--   새 DB(V1 부터 적용)·기존 DB 모두 이 파일 뒤 규칙 순서가 된다. 다시 적용해도 결과가 같다(멱등).
-- 운영(Flyway 끔): DBA 가 앞 V 파일 다음 차례로 이 파일을 그대로 적용한다.
-- ============================================================================

-- TB_MCM_CODE_CATEGORY: 앞에 남김 MASTER_CODE,CATEGORY_ID
alter table TB_MCM_CODE_CATEGORY modify (CATEGORY_NM invisible, SORT_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_CODE_CATEGORY modify (CATEGORY_NM visible);
alter table TB_MCM_CODE_CATEGORY modify (SORT_SEQ visible);
alter table TB_MCM_CODE_CATEGORY modify (VER visible);
alter table TB_MCM_CODE_CATEGORY modify (C_USR_ID visible);
alter table TB_MCM_CODE_CATEGORY modify (C_AT visible);
alter table TB_MCM_CODE_CATEGORY modify (C_SVC_ID visible);
alter table TB_MCM_CODE_CATEGORY modify (C_PGM_ID visible);
alter table TB_MCM_CODE_CATEGORY modify (U_USR_ID visible);
alter table TB_MCM_CODE_CATEGORY modify (U_AT visible);
alter table TB_MCM_CODE_CATEGORY modify (U_SVC_ID visible);
alter table TB_MCM_CODE_CATEGORY modify (U_PGM_ID visible);

-- TB_MCM_CODE_MASTER: 앞에 남김 CODE_ID
alter table TB_MCM_CODE_MASTER modify (CODE_NM invisible, CODE_DESC invisible, CODE_VER invisible, MASTER_CODE invisible, MASTER_CODE_REF1 invisible, MASTER_CODE_REF2 invisible, MASTER_CODE_REF3 invisible, MASTER_CODE_REF4 invisible, MASTER_CODE_REF5 invisible, USE_TP invisible, START_ACTIVE_DATE invisible, END_ACTIVE_DATE invisible, CODE_OWNER_DEPT_NM invisible, CODE_OWNER_EMP_NO invisible, CODE_CHARACTER invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCM_CODE_MASTER modify (CODE_NM visible);
alter table TB_MCM_CODE_MASTER modify (CODE_DESC visible);
alter table TB_MCM_CODE_MASTER modify (CODE_VER visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE_REF1 visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE_REF2 visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE_REF3 visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE_REF4 visible);
alter table TB_MCM_CODE_MASTER modify (MASTER_CODE_REF5 visible);
alter table TB_MCM_CODE_MASTER modify (USE_TP visible);
alter table TB_MCM_CODE_MASTER modify (START_ACTIVE_DATE visible);
alter table TB_MCM_CODE_MASTER modify (END_ACTIVE_DATE visible);
alter table TB_MCM_CODE_MASTER modify (CODE_OWNER_DEPT_NM visible);
alter table TB_MCM_CODE_MASTER modify (CODE_OWNER_EMP_NO visible);
alter table TB_MCM_CODE_MASTER modify (CODE_CHARACTER visible);
alter table TB_MCM_CODE_MASTER modify (VER visible);
alter table TB_MCM_CODE_MASTER modify (C_USR_ID visible);
alter table TB_MCM_CODE_MASTER modify (C_AT visible);
alter table TB_MCM_CODE_MASTER modify (C_SVC_ID visible);
alter table TB_MCM_CODE_MASTER modify (C_PGM_ID visible);
alter table TB_MCM_CODE_MASTER modify (U_USR_ID visible);
alter table TB_MCM_CODE_MASTER modify (U_AT visible);
alter table TB_MCM_CODE_MASTER modify (U_SVC_ID visible);
alter table TB_MCM_CODE_MASTER modify (U_PGM_ID visible);
