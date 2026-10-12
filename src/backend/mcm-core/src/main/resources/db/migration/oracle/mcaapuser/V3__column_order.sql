-- ============================================================================
-- MCAAPUSER 컬럼 순서 재배치 — 자동 생성 파일. 직접 고치지 말고 생성기를 다시 돌린다.
--   생성기: node scripts/db-order/gen.mjs relocate --base <기존 DB 기준 ref> --write
--   규칙: PK(PK 제약 순서) → 엔티티 필드 선언 순서 → 버전(VER·AUD_VER·ROW_VERSION) → 감사 8개(scripts/db-order/lib/rule.mjs)
-- 방식: 표마다 앞에 둘 PK 컬럼만 남기고 나머지를 INVISIBLE 로 숨긴 뒤 규칙 순서대로 하나씩 VISIBLE 로 되돌린다.
--   VISIBLE 로 돌아온 컬럼은 맨 끝에 붙으므로 결과 = 규칙 순서. 데이터·타입·NULL·기본값·제약·인덱스는 그대로다.
--   새 DB(V1 부터 적용)·기존 DB 모두 이 파일 뒤 규칙 순서가 된다. 다시 적용해도 결과가 같다(멱등).
-- 운영(Flyway 끔): DBA 가 앞 V 파일 다음 차례로 이 파일을 그대로 적용한다.
-- ============================================================================

-- TB_MCA_RULE_COL_LIST: 앞에 남김 COL_SEQ,RULE_ID
alter table TB_MCA_RULE_COL_LIST modify (RULE_VER invisible, COL_ID invisible, COL_NM invisible, OLD_COL_ID invisible, IO_FLAG invisible, COL_TYPE invisible, COL_LEN invisible, COL_PREC_LEN invisible, MES_COL_ID invisible, MASTER_CODE_DIV invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCA_RULE_COL_LIST modify (RULE_VER visible);
alter table TB_MCA_RULE_COL_LIST modify (COL_ID visible);
alter table TB_MCA_RULE_COL_LIST modify (COL_NM visible);
alter table TB_MCA_RULE_COL_LIST modify (OLD_COL_ID visible);
alter table TB_MCA_RULE_COL_LIST modify (IO_FLAG visible);
alter table TB_MCA_RULE_COL_LIST modify (COL_TYPE visible);
alter table TB_MCA_RULE_COL_LIST modify (COL_LEN visible);
alter table TB_MCA_RULE_COL_LIST modify (COL_PREC_LEN visible);
alter table TB_MCA_RULE_COL_LIST modify (MES_COL_ID visible);
alter table TB_MCA_RULE_COL_LIST modify (MASTER_CODE_DIV visible);
alter table TB_MCA_RULE_COL_LIST modify (VER visible);
alter table TB_MCA_RULE_COL_LIST modify (C_USR_ID visible);
alter table TB_MCA_RULE_COL_LIST modify (C_AT visible);
alter table TB_MCA_RULE_COL_LIST modify (C_SVC_ID visible);
alter table TB_MCA_RULE_COL_LIST modify (C_PGM_ID visible);
alter table TB_MCA_RULE_COL_LIST modify (U_USR_ID visible);
alter table TB_MCA_RULE_COL_LIST modify (U_AT visible);
alter table TB_MCA_RULE_COL_LIST modify (U_SVC_ID visible);
alter table TB_MCA_RULE_COL_LIST modify (U_PGM_ID visible);

-- TB_MCA_RULE_MASTER: 앞에 남김 RULE_ID
alter table TB_MCA_RULE_MASTER modify (OLD_RULE_ID invisible, RULE_NM invisible, RULE_DESC invisible, RULE_VER invisible, RULE_TP invisible, RULE_OWNER_DEPT_NM invisible, RULE_OWNER_EMP_NO invisible, USE_TP invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MCA_RULE_MASTER modify (OLD_RULE_ID visible);
alter table TB_MCA_RULE_MASTER modify (RULE_NM visible);
alter table TB_MCA_RULE_MASTER modify (RULE_DESC visible);
alter table TB_MCA_RULE_MASTER modify (RULE_VER visible);
alter table TB_MCA_RULE_MASTER modify (RULE_TP visible);
alter table TB_MCA_RULE_MASTER modify (RULE_OWNER_DEPT_NM visible);
alter table TB_MCA_RULE_MASTER modify (RULE_OWNER_EMP_NO visible);
alter table TB_MCA_RULE_MASTER modify (USE_TP visible);
alter table TB_MCA_RULE_MASTER modify (VER visible);
alter table TB_MCA_RULE_MASTER modify (C_USR_ID visible);
alter table TB_MCA_RULE_MASTER modify (C_AT visible);
alter table TB_MCA_RULE_MASTER modify (C_SVC_ID visible);
alter table TB_MCA_RULE_MASTER modify (C_PGM_ID visible);
alter table TB_MCA_RULE_MASTER modify (U_USR_ID visible);
alter table TB_MCA_RULE_MASTER modify (U_AT visible);
alter table TB_MCA_RULE_MASTER modify (U_SVC_ID visible);
alter table TB_MCA_RULE_MASTER modify (U_PGM_ID visible);
