-- ============================================================================
-- MDM 컬럼 순서 재배치 — 자동 생성 파일. 직접 고치지 말고 생성기를 다시 돌린다.
--   생성기: node scripts/db-order/gen.mjs relocate --base <기존 DB 기준 ref> --write
--   규칙: PK(PK 제약 순서) → 엔티티 필드 선언 순서 → 버전(VER·AUD_VER·ROW_VERSION) → 감사 8개(scripts/db-order/lib/rule.mjs)
-- 방식: 표마다 앞에 둘 PK 컬럼만 남기고 나머지를 INVISIBLE 로 숨긴 뒤 규칙 순서대로 하나씩 VISIBLE 로 되돌린다.
--   VISIBLE 로 돌아온 컬럼은 맨 끝에 붙으므로 결과 = 규칙 순서. 데이터·타입·NULL·기본값·제약·인덱스는 그대로다.
--   새 DB(V1 부터 적용)·기존 DB 모두 이 파일 뒤 규칙 순서가 된다. 다시 적용해도 결과가 같다(멱등).
-- 운영(Flyway 끔): DBA 가 앞 V 파일 다음 차례로 이 파일을 그대로 적용한다.
-- ============================================================================

-- TB_MDM_CODE: 앞에 남김 MARU_CODE_ID
alter table TB_MDM_CODE modify (MARU_CODE_NAME invisible, STATUS invisible, SOURCE_KIND invisible, SOURCE_SYSTEM invisible, DESCRIPTION invisible, ATTR01_NAME invisible, ATTR02_NAME invisible, ATTR03_NAME invisible, ATTR04_NAME invisible, ATTR05_NAME invisible, ATTR06_NAME invisible, ATTR07_NAME invisible, ATTR08_NAME invisible, ATTR09_NAME invisible, ATTR10_NAME invisible, LVL_CNT invisible, LAST_CHG_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_CODE modify (MARU_CODE_NAME visible);
alter table TB_MDM_CODE modify (STATUS visible);
alter table TB_MDM_CODE modify (SOURCE_KIND visible);
alter table TB_MDM_CODE modify (SOURCE_SYSTEM visible);
alter table TB_MDM_CODE modify (DESCRIPTION visible);
alter table TB_MDM_CODE modify (ATTR01_NAME visible);
alter table TB_MDM_CODE modify (ATTR02_NAME visible);
alter table TB_MDM_CODE modify (ATTR03_NAME visible);
alter table TB_MDM_CODE modify (ATTR04_NAME visible);
alter table TB_MDM_CODE modify (ATTR05_NAME visible);
alter table TB_MDM_CODE modify (ATTR06_NAME visible);
alter table TB_MDM_CODE modify (ATTR07_NAME visible);
alter table TB_MDM_CODE modify (ATTR08_NAME visible);
alter table TB_MDM_CODE modify (ATTR09_NAME visible);
alter table TB_MDM_CODE modify (ATTR10_NAME visible);
alter table TB_MDM_CODE modify (LVL_CNT visible);
alter table TB_MDM_CODE modify (LAST_CHG_SEQ visible);
alter table TB_MDM_CODE modify (VER visible);
alter table TB_MDM_CODE modify (C_USR_ID visible);
alter table TB_MDM_CODE modify (C_AT visible);
alter table TB_MDM_CODE modify (C_SVC_ID visible);
alter table TB_MDM_CODE modify (C_PGM_ID visible);
alter table TB_MDM_CODE modify (U_USR_ID visible);
alter table TB_MDM_CODE modify (U_AT visible);
alter table TB_MDM_CODE modify (U_SVC_ID visible);
alter table TB_MDM_CODE modify (U_PGM_ID visible);

-- TB_MDM_CODE_CATE: 앞에 남김 MARU_CODE_ID,CATE_ID,FROM_VER
alter table TB_MDM_CODE_CATE modify (TO_VER invisible, CATE_NAME invisible, DEF_KIND invisible, DEF_EXPR invisible, DEF_TARGET invisible, DESCRIPTION invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_CODE_CATE modify (TO_VER visible);
alter table TB_MDM_CODE_CATE modify (CATE_NAME visible);
alter table TB_MDM_CODE_CATE modify (DEF_KIND visible);
alter table TB_MDM_CODE_CATE modify (DEF_EXPR visible);
alter table TB_MDM_CODE_CATE modify (DEF_TARGET visible);
alter table TB_MDM_CODE_CATE modify (DESCRIPTION visible);
alter table TB_MDM_CODE_CATE modify (VER visible);
alter table TB_MDM_CODE_CATE modify (C_USR_ID visible);
alter table TB_MDM_CODE_CATE modify (C_AT visible);
alter table TB_MDM_CODE_CATE modify (C_SVC_ID visible);
alter table TB_MDM_CODE_CATE modify (C_PGM_ID visible);
alter table TB_MDM_CODE_CATE modify (U_USR_ID visible);
alter table TB_MDM_CODE_CATE modify (U_AT visible);
alter table TB_MDM_CODE_CATE modify (U_SVC_ID visible);
alter table TB_MDM_CODE_CATE modify (U_PGM_ID visible);

-- TB_MDM_CODE_CATE_ITEM: 앞에 남김 MARU_CODE_ID,CATE_ID,CODE,FROM_VER
alter table TB_MDM_CODE_CATE_ITEM modify (TO_VER invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_CODE_CATE_ITEM modify (TO_VER visible);
alter table TB_MDM_CODE_CATE_ITEM modify (VER visible);
alter table TB_MDM_CODE_CATE_ITEM modify (C_USR_ID visible);
alter table TB_MDM_CODE_CATE_ITEM modify (C_AT visible);
alter table TB_MDM_CODE_CATE_ITEM modify (C_SVC_ID visible);
alter table TB_MDM_CODE_CATE_ITEM modify (C_PGM_ID visible);
alter table TB_MDM_CODE_CATE_ITEM modify (U_USR_ID visible);
alter table TB_MDM_CODE_CATE_ITEM modify (U_AT visible);
alter table TB_MDM_CODE_CATE_ITEM modify (U_SVC_ID visible);
alter table TB_MDM_CODE_CATE_ITEM modify (U_PGM_ID visible);

-- TB_MDM_CODE_ITEM: 앞에 남김 MARU_CODE_ID,CODE,FROM_VER
alter table TB_MDM_CODE_ITEM modify (TO_VER invisible, NAME invisible, ALTER_NAME invisible, SEQ invisible, DESCRIPTION invisible, LVL1 invisible, LVL2 invisible, LVL3 invisible, LVL4 invisible, LVL5 invisible, ATTR01 invisible, ATTR02 invisible, ATTR03 invisible, ATTR04 invisible, ATTR05 invisible, ATTR06 invisible, ATTR07 invisible, ATTR08 invisible, ATTR09 invisible, ATTR10 invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_CODE_ITEM modify (TO_VER visible);
alter table TB_MDM_CODE_ITEM modify (NAME visible);
alter table TB_MDM_CODE_ITEM modify (ALTER_NAME visible);
alter table TB_MDM_CODE_ITEM modify (SEQ visible);
alter table TB_MDM_CODE_ITEM modify (DESCRIPTION visible);
alter table TB_MDM_CODE_ITEM modify (LVL1 visible);
alter table TB_MDM_CODE_ITEM modify (LVL2 visible);
alter table TB_MDM_CODE_ITEM modify (LVL3 visible);
alter table TB_MDM_CODE_ITEM modify (LVL4 visible);
alter table TB_MDM_CODE_ITEM modify (LVL5 visible);
alter table TB_MDM_CODE_ITEM modify (ATTR01 visible);
alter table TB_MDM_CODE_ITEM modify (ATTR02 visible);
alter table TB_MDM_CODE_ITEM modify (ATTR03 visible);
alter table TB_MDM_CODE_ITEM modify (ATTR04 visible);
alter table TB_MDM_CODE_ITEM modify (ATTR05 visible);
alter table TB_MDM_CODE_ITEM modify (ATTR06 visible);
alter table TB_MDM_CODE_ITEM modify (ATTR07 visible);
alter table TB_MDM_CODE_ITEM modify (ATTR08 visible);
alter table TB_MDM_CODE_ITEM modify (ATTR09 visible);
alter table TB_MDM_CODE_ITEM modify (ATTR10 visible);
alter table TB_MDM_CODE_ITEM modify (VER visible);
alter table TB_MDM_CODE_ITEM modify (C_USR_ID visible);
alter table TB_MDM_CODE_ITEM modify (C_AT visible);
alter table TB_MDM_CODE_ITEM modify (C_SVC_ID visible);
alter table TB_MDM_CODE_ITEM modify (C_PGM_ID visible);
alter table TB_MDM_CODE_ITEM modify (U_USR_ID visible);
alter table TB_MDM_CODE_ITEM modify (U_AT visible);
alter table TB_MDM_CODE_ITEM modify (U_SVC_ID visible);
alter table TB_MDM_CODE_ITEM modify (U_PGM_ID visible);

-- TB_MDM_CODE_RECV: 앞에 남김 RECV_ID
alter table TB_MDM_CODE_RECV modify (MARU_CODE_ID invisible, SOURCE_SYSTEM invisible, SOURCE_REF invisible, REQ_KIND invisible, RECEIVED_AT invisible, BODY invisible, RESULT invisible, RESULT_DETAIL invisible, CHG_SEQ invisible, PROCESSED_AT invisible, VER invisible, AUD_VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_CODE_RECV modify (MARU_CODE_ID visible);
alter table TB_MDM_CODE_RECV modify (SOURCE_SYSTEM visible);
alter table TB_MDM_CODE_RECV modify (SOURCE_REF visible);
alter table TB_MDM_CODE_RECV modify (REQ_KIND visible);
alter table TB_MDM_CODE_RECV modify (RECEIVED_AT visible);
alter table TB_MDM_CODE_RECV modify (BODY visible);
alter table TB_MDM_CODE_RECV modify (RESULT visible);
alter table TB_MDM_CODE_RECV modify (RESULT_DETAIL visible);
alter table TB_MDM_CODE_RECV modify (CHG_SEQ visible);
alter table TB_MDM_CODE_RECV modify (PROCESSED_AT visible);
alter table TB_MDM_CODE_RECV modify (VER visible);
alter table TB_MDM_CODE_RECV modify (AUD_VER visible);
alter table TB_MDM_CODE_RECV modify (C_USR_ID visible);
alter table TB_MDM_CODE_RECV modify (C_AT visible);
alter table TB_MDM_CODE_RECV modify (C_SVC_ID visible);
alter table TB_MDM_CODE_RECV modify (C_PGM_ID visible);
alter table TB_MDM_CODE_RECV modify (U_USR_ID visible);
alter table TB_MDM_CODE_RECV modify (U_AT visible);
alter table TB_MDM_CODE_RECV modify (U_SVC_ID visible);
alter table TB_MDM_CODE_RECV modify (U_PGM_ID visible);

-- TB_MDM_CODE_SYSTEM: 앞에 남김 MARU_CODE_ID,SYSTEM_CODE
alter table TB_MDM_CODE_SYSTEM modify (DESCRIPTION invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_CODE_SYSTEM modify (DESCRIPTION visible);
alter table TB_MDM_CODE_SYSTEM modify (VER visible);
alter table TB_MDM_CODE_SYSTEM modify (C_USR_ID visible);
alter table TB_MDM_CODE_SYSTEM modify (C_AT visible);
alter table TB_MDM_CODE_SYSTEM modify (C_SVC_ID visible);
alter table TB_MDM_CODE_SYSTEM modify (C_PGM_ID visible);
alter table TB_MDM_CODE_SYSTEM modify (U_USR_ID visible);
alter table TB_MDM_CODE_SYSTEM modify (U_AT visible);
alter table TB_MDM_CODE_SYSTEM modify (U_SVC_ID visible);
alter table TB_MDM_CODE_SYSTEM modify (U_PGM_ID visible);

-- TB_MDM_CODE_VER: 앞에 남김 MARU_CODE_ID,VER
alter table TB_MDM_CODE_VER modify (VER_KIND invisible, RESTORED_FROM invisible, STATUS invisible, OWNER_ID invisible, APPLY_FROM invisible, APPLY_TO invisible, DESCRIPTION invisible, REQUESTED_BY invisible, REQUESTED_AT invisible, EMERGENCY_YN invisible, EMERGENCY_REASON invisible, APPROVED_BY invisible, APPROVED_AT invisible, REJECT_REASON invisible, RELEASED_AT invisible, CANCELLED_AT invisible, CANCEL_REASON invisible, AUD_VER invisible, ROW_VERSION invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_CODE_VER modify (VER_KIND visible);
alter table TB_MDM_CODE_VER modify (RESTORED_FROM visible);
alter table TB_MDM_CODE_VER modify (STATUS visible);
alter table TB_MDM_CODE_VER modify (OWNER_ID visible);
alter table TB_MDM_CODE_VER modify (APPLY_FROM visible);
alter table TB_MDM_CODE_VER modify (APPLY_TO visible);
alter table TB_MDM_CODE_VER modify (DESCRIPTION visible);
alter table TB_MDM_CODE_VER modify (REQUESTED_BY visible);
alter table TB_MDM_CODE_VER modify (REQUESTED_AT visible);
alter table TB_MDM_CODE_VER modify (EMERGENCY_YN visible);
alter table TB_MDM_CODE_VER modify (EMERGENCY_REASON visible);
alter table TB_MDM_CODE_VER modify (APPROVED_BY visible);
alter table TB_MDM_CODE_VER modify (APPROVED_AT visible);
alter table TB_MDM_CODE_VER modify (REJECT_REASON visible);
alter table TB_MDM_CODE_VER modify (RELEASED_AT visible);
alter table TB_MDM_CODE_VER modify (CANCELLED_AT visible);
alter table TB_MDM_CODE_VER modify (CANCEL_REASON visible);
alter table TB_MDM_CODE_VER modify (AUD_VER visible);
alter table TB_MDM_CODE_VER modify (ROW_VERSION visible);
alter table TB_MDM_CODE_VER modify (C_USR_ID visible);
alter table TB_MDM_CODE_VER modify (C_AT visible);
alter table TB_MDM_CODE_VER modify (C_SVC_ID visible);
alter table TB_MDM_CODE_VER modify (C_PGM_ID visible);
alter table TB_MDM_CODE_VER modify (U_USR_ID visible);
alter table TB_MDM_CODE_VER modify (U_AT visible);
alter table TB_MDM_CODE_VER modify (U_SVC_ID visible);
alter table TB_MDM_CODE_VER modify (U_PGM_ID visible);

-- TB_MDM_COLUMN: 앞에 남김 COLUMN_ID
alter table TB_MDM_COLUMN modify (COLUMN_NAME invisible, LABEL_LONG invisible, LABEL_MID invisible, LABEL_SHORT invisible, PHYS_NAME invisible, DESCRIPTION invisible, DOMAIN_ID invisible, REQUIRED invisible, DEFAULT_VALUE invisible, REF_KIND invisible, REF_TARGET invisible, REF_CATE_ID invisible, TERM_IDS invisible, USAGE_NOTE invisible, CHG_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_COLUMN modify (COLUMN_NAME visible);
alter table TB_MDM_COLUMN modify (LABEL_LONG visible);
alter table TB_MDM_COLUMN modify (LABEL_MID visible);
alter table TB_MDM_COLUMN modify (LABEL_SHORT visible);
alter table TB_MDM_COLUMN modify (PHYS_NAME visible);
alter table TB_MDM_COLUMN modify (DESCRIPTION visible);
alter table TB_MDM_COLUMN modify (DOMAIN_ID visible);
alter table TB_MDM_COLUMN modify (REQUIRED visible);
alter table TB_MDM_COLUMN modify (DEFAULT_VALUE visible);
alter table TB_MDM_COLUMN modify (REF_KIND visible);
alter table TB_MDM_COLUMN modify (REF_TARGET visible);
alter table TB_MDM_COLUMN modify (REF_CATE_ID visible);
alter table TB_MDM_COLUMN modify (TERM_IDS visible);
alter table TB_MDM_COLUMN modify (USAGE_NOTE visible);
alter table TB_MDM_COLUMN modify (CHG_SEQ visible);
alter table TB_MDM_COLUMN modify (VER visible);
alter table TB_MDM_COLUMN modify (C_USR_ID visible);
alter table TB_MDM_COLUMN modify (C_AT visible);
alter table TB_MDM_COLUMN modify (C_SVC_ID visible);
alter table TB_MDM_COLUMN modify (C_PGM_ID visible);
alter table TB_MDM_COLUMN modify (U_USR_ID visible);
alter table TB_MDM_COLUMN modify (U_AT visible);
alter table TB_MDM_COLUMN modify (U_SVC_ID visible);
alter table TB_MDM_COLUMN modify (U_PGM_ID visible);

-- TB_MDM_COLUMN_SYSTEM: 앞에 남김 COLUMN_ID,SYSTEM_CODE,PHYS_NAME
alter table TB_MDM_COLUMN_SYSTEM modify (TRANSFORM invisible, NOTE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_COLUMN_SYSTEM modify (TRANSFORM visible);
alter table TB_MDM_COLUMN_SYSTEM modify (NOTE visible);
alter table TB_MDM_COLUMN_SYSTEM modify (VER visible);
alter table TB_MDM_COLUMN_SYSTEM modify (C_USR_ID visible);
alter table TB_MDM_COLUMN_SYSTEM modify (C_AT visible);
alter table TB_MDM_COLUMN_SYSTEM modify (C_SVC_ID visible);
alter table TB_MDM_COLUMN_SYSTEM modify (C_PGM_ID visible);
alter table TB_MDM_COLUMN_SYSTEM modify (U_USR_ID visible);
alter table TB_MDM_COLUMN_SYSTEM modify (U_AT visible);
alter table TB_MDM_COLUMN_SYSTEM modify (U_SVC_ID visible);
alter table TB_MDM_COLUMN_SYSTEM modify (U_PGM_ID visible);

-- TB_MDM_DATA: 앞에 남김 MARU_DATA_ID
alter table TB_MDM_DATA modify (MARU_DATA_NAME invisible, STATUS invisible, SOURCE_KIND invisible, SOURCE_SYSTEM invisible, CODE_PATTERN invisible, DESCRIPTION invisible, ATTR01_NAME invisible, ATTR02_NAME invisible, ATTR03_NAME invisible, ATTR04_NAME invisible, ATTR05_NAME invisible, ATTR06_NAME invisible, ATTR07_NAME invisible, ATTR08_NAME invisible, ATTR09_NAME invisible, ATTR10_NAME invisible, LVL_CNT invisible, CLOSED_AT invisible, LAST_CHG_SEQ invisible, CHG_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_DATA modify (MARU_DATA_NAME visible);
alter table TB_MDM_DATA modify (STATUS visible);
alter table TB_MDM_DATA modify (SOURCE_KIND visible);
alter table TB_MDM_DATA modify (SOURCE_SYSTEM visible);
alter table TB_MDM_DATA modify (CODE_PATTERN visible);
alter table TB_MDM_DATA modify (DESCRIPTION visible);
alter table TB_MDM_DATA modify (ATTR01_NAME visible);
alter table TB_MDM_DATA modify (ATTR02_NAME visible);
alter table TB_MDM_DATA modify (ATTR03_NAME visible);
alter table TB_MDM_DATA modify (ATTR04_NAME visible);
alter table TB_MDM_DATA modify (ATTR05_NAME visible);
alter table TB_MDM_DATA modify (ATTR06_NAME visible);
alter table TB_MDM_DATA modify (ATTR07_NAME visible);
alter table TB_MDM_DATA modify (ATTR08_NAME visible);
alter table TB_MDM_DATA modify (ATTR09_NAME visible);
alter table TB_MDM_DATA modify (ATTR10_NAME visible);
alter table TB_MDM_DATA modify (LVL_CNT visible);
alter table TB_MDM_DATA modify (CLOSED_AT visible);
alter table TB_MDM_DATA modify (LAST_CHG_SEQ visible);
alter table TB_MDM_DATA modify (CHG_SEQ visible);
alter table TB_MDM_DATA modify (VER visible);
alter table TB_MDM_DATA modify (C_USR_ID visible);
alter table TB_MDM_DATA modify (C_AT visible);
alter table TB_MDM_DATA modify (C_SVC_ID visible);
alter table TB_MDM_DATA modify (C_PGM_ID visible);
alter table TB_MDM_DATA modify (U_USR_ID visible);
alter table TB_MDM_DATA modify (U_AT visible);
alter table TB_MDM_DATA modify (U_SVC_ID visible);
alter table TB_MDM_DATA modify (U_PGM_ID visible);

-- TB_MDM_DATA_CATE: 앞에 남김 MARU_DATA_ID,CATE_ID,VALID_FROM
alter table TB_MDM_DATA_CATE modify (CATE_NAME invisible, DEF_KIND invisible, DEF_EXPR invisible, DEF_TARGET invisible, DESCRIPTION invisible, VALID_TO invisible, CHG_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_DATA_CATE modify (CATE_NAME visible);
alter table TB_MDM_DATA_CATE modify (DEF_KIND visible);
alter table TB_MDM_DATA_CATE modify (DEF_EXPR visible);
alter table TB_MDM_DATA_CATE modify (DEF_TARGET visible);
alter table TB_MDM_DATA_CATE modify (DESCRIPTION visible);
alter table TB_MDM_DATA_CATE modify (VALID_TO visible);
alter table TB_MDM_DATA_CATE modify (CHG_SEQ visible);
alter table TB_MDM_DATA_CATE modify (VER visible);
alter table TB_MDM_DATA_CATE modify (C_USR_ID visible);
alter table TB_MDM_DATA_CATE modify (C_AT visible);
alter table TB_MDM_DATA_CATE modify (C_SVC_ID visible);
alter table TB_MDM_DATA_CATE modify (C_PGM_ID visible);
alter table TB_MDM_DATA_CATE modify (U_USR_ID visible);
alter table TB_MDM_DATA_CATE modify (U_AT visible);
alter table TB_MDM_DATA_CATE modify (U_SVC_ID visible);
alter table TB_MDM_DATA_CATE modify (U_PGM_ID visible);

-- TB_MDM_DATA_CATE_ITEM: 앞에 남김 MARU_DATA_ID,CATE_ID,CODE,VALID_FROM
alter table TB_MDM_DATA_CATE_ITEM modify (VALID_TO invisible, CHG_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_DATA_CATE_ITEM modify (VALID_TO visible);
alter table TB_MDM_DATA_CATE_ITEM modify (CHG_SEQ visible);
alter table TB_MDM_DATA_CATE_ITEM modify (VER visible);
alter table TB_MDM_DATA_CATE_ITEM modify (C_USR_ID visible);
alter table TB_MDM_DATA_CATE_ITEM modify (C_AT visible);
alter table TB_MDM_DATA_CATE_ITEM modify (C_SVC_ID visible);
alter table TB_MDM_DATA_CATE_ITEM modify (C_PGM_ID visible);
alter table TB_MDM_DATA_CATE_ITEM modify (U_USR_ID visible);
alter table TB_MDM_DATA_CATE_ITEM modify (U_AT visible);
alter table TB_MDM_DATA_CATE_ITEM modify (U_SVC_ID visible);
alter table TB_MDM_DATA_CATE_ITEM modify (U_PGM_ID visible);

-- TB_MDM_DATA_ITEM: 앞에 남김 MARU_DATA_ID,CODE,VALID_FROM
alter table TB_MDM_DATA_ITEM modify (NAME invisible, ALTER_NAME invisible, SEQ invisible, DESCRIPTION invisible, VALID_TO invisible, CHG_SEQ invisible, LVL1 invisible, LVL2 invisible, LVL3 invisible, LVL4 invisible, LVL5 invisible, ATTR01 invisible, ATTR02 invisible, ATTR03 invisible, ATTR04 invisible, ATTR05 invisible, ATTR06 invisible, ATTR07 invisible, ATTR08 invisible, ATTR09 invisible, ATTR10 invisible, VER invisible, ROW_VERSION invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_DATA_ITEM modify (NAME visible);
alter table TB_MDM_DATA_ITEM modify (ALTER_NAME visible);
alter table TB_MDM_DATA_ITEM modify (SEQ visible);
alter table TB_MDM_DATA_ITEM modify (DESCRIPTION visible);
alter table TB_MDM_DATA_ITEM modify (VALID_TO visible);
alter table TB_MDM_DATA_ITEM modify (CHG_SEQ visible);
alter table TB_MDM_DATA_ITEM modify (LVL1 visible);
alter table TB_MDM_DATA_ITEM modify (LVL2 visible);
alter table TB_MDM_DATA_ITEM modify (LVL3 visible);
alter table TB_MDM_DATA_ITEM modify (LVL4 visible);
alter table TB_MDM_DATA_ITEM modify (LVL5 visible);
alter table TB_MDM_DATA_ITEM modify (ATTR01 visible);
alter table TB_MDM_DATA_ITEM modify (ATTR02 visible);
alter table TB_MDM_DATA_ITEM modify (ATTR03 visible);
alter table TB_MDM_DATA_ITEM modify (ATTR04 visible);
alter table TB_MDM_DATA_ITEM modify (ATTR05 visible);
alter table TB_MDM_DATA_ITEM modify (ATTR06 visible);
alter table TB_MDM_DATA_ITEM modify (ATTR07 visible);
alter table TB_MDM_DATA_ITEM modify (ATTR08 visible);
alter table TB_MDM_DATA_ITEM modify (ATTR09 visible);
alter table TB_MDM_DATA_ITEM modify (ATTR10 visible);
alter table TB_MDM_DATA_ITEM modify (VER visible);
alter table TB_MDM_DATA_ITEM modify (ROW_VERSION visible);
alter table TB_MDM_DATA_ITEM modify (C_USR_ID visible);
alter table TB_MDM_DATA_ITEM modify (C_AT visible);
alter table TB_MDM_DATA_ITEM modify (C_SVC_ID visible);
alter table TB_MDM_DATA_ITEM modify (C_PGM_ID visible);
alter table TB_MDM_DATA_ITEM modify (U_USR_ID visible);
alter table TB_MDM_DATA_ITEM modify (U_AT visible);
alter table TB_MDM_DATA_ITEM modify (U_SVC_ID visible);
alter table TB_MDM_DATA_ITEM modify (U_PGM_ID visible);

-- TB_MDM_DATA_RECV: 앞에 남김 RECV_ID
alter table TB_MDM_DATA_RECV modify (MARU_DATA_ID invisible, SOURCE_SYSTEM invisible, SOURCE_REF invisible, RECEIVED_AT invisible, BODY invisible, ROW_COUNT invisible, RESULT invisible, RESULT_DETAIL invisible, CHG_SEQ invisible, PROCESSED_AT invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_DATA_RECV modify (MARU_DATA_ID visible);
alter table TB_MDM_DATA_RECV modify (SOURCE_SYSTEM visible);
alter table TB_MDM_DATA_RECV modify (SOURCE_REF visible);
alter table TB_MDM_DATA_RECV modify (RECEIVED_AT visible);
alter table TB_MDM_DATA_RECV modify (BODY visible);
alter table TB_MDM_DATA_RECV modify (ROW_COUNT visible);
alter table TB_MDM_DATA_RECV modify (RESULT visible);
alter table TB_MDM_DATA_RECV modify (RESULT_DETAIL visible);
alter table TB_MDM_DATA_RECV modify (CHG_SEQ visible);
alter table TB_MDM_DATA_RECV modify (PROCESSED_AT visible);
alter table TB_MDM_DATA_RECV modify (VER visible);
alter table TB_MDM_DATA_RECV modify (C_USR_ID visible);
alter table TB_MDM_DATA_RECV modify (C_AT visible);
alter table TB_MDM_DATA_RECV modify (C_SVC_ID visible);
alter table TB_MDM_DATA_RECV modify (C_PGM_ID visible);
alter table TB_MDM_DATA_RECV modify (U_USR_ID visible);
alter table TB_MDM_DATA_RECV modify (U_AT visible);
alter table TB_MDM_DATA_RECV modify (U_SVC_ID visible);
alter table TB_MDM_DATA_RECV modify (U_PGM_ID visible);

-- TB_MDM_DATA_RECV_ITEM: 앞에 남김 RECV_ID,SEQ
alter table TB_MDM_DATA_RECV_ITEM modify (CODE invisible, ACTION invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_DATA_RECV_ITEM modify (CODE visible);
alter table TB_MDM_DATA_RECV_ITEM modify (ACTION visible);
alter table TB_MDM_DATA_RECV_ITEM modify (VER visible);
alter table TB_MDM_DATA_RECV_ITEM modify (C_USR_ID visible);
alter table TB_MDM_DATA_RECV_ITEM modify (C_AT visible);
alter table TB_MDM_DATA_RECV_ITEM modify (C_SVC_ID visible);
alter table TB_MDM_DATA_RECV_ITEM modify (C_PGM_ID visible);
alter table TB_MDM_DATA_RECV_ITEM modify (U_USR_ID visible);
alter table TB_MDM_DATA_RECV_ITEM modify (U_AT visible);
alter table TB_MDM_DATA_RECV_ITEM modify (U_SVC_ID visible);
alter table TB_MDM_DATA_RECV_ITEM modify (U_PGM_ID visible);

-- TB_MDM_DATA_SYSTEM: 앞에 남김 MARU_DATA_ID,SYSTEM_CODE
alter table TB_MDM_DATA_SYSTEM modify (DESCRIPTION invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_DATA_SYSTEM modify (DESCRIPTION visible);
alter table TB_MDM_DATA_SYSTEM modify (VER visible);
alter table TB_MDM_DATA_SYSTEM modify (C_USR_ID visible);
alter table TB_MDM_DATA_SYSTEM modify (C_AT visible);
alter table TB_MDM_DATA_SYSTEM modify (C_SVC_ID visible);
alter table TB_MDM_DATA_SYSTEM modify (C_PGM_ID visible);
alter table TB_MDM_DATA_SYSTEM modify (U_USR_ID visible);
alter table TB_MDM_DATA_SYSTEM modify (U_AT visible);
alter table TB_MDM_DATA_SYSTEM modify (U_SVC_ID visible);
alter table TB_MDM_DATA_SYSTEM modify (U_PGM_ID visible);

-- TB_MDM_DICT_SYSTEM: 앞에 남김 DICT_CODE,SYSTEM_CODE
alter table TB_MDM_DICT_SYSTEM modify (NOTE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_DICT_SYSTEM modify (NOTE visible);
alter table TB_MDM_DICT_SYSTEM modify (VER visible);
alter table TB_MDM_DICT_SYSTEM modify (C_USR_ID visible);
alter table TB_MDM_DICT_SYSTEM modify (C_AT visible);
alter table TB_MDM_DICT_SYSTEM modify (C_SVC_ID visible);
alter table TB_MDM_DICT_SYSTEM modify (C_PGM_ID visible);
alter table TB_MDM_DICT_SYSTEM modify (U_USR_ID visible);
alter table TB_MDM_DICT_SYSTEM modify (U_AT visible);
alter table TB_MDM_DICT_SYSTEM modify (U_SVC_ID visible);
alter table TB_MDM_DICT_SYSTEM modify (U_PGM_ID visible);

-- TB_MDM_DOMAIN: 앞에 남김 DOMAIN_ID
alter table TB_MDM_DOMAIN modify (DOMAIN_NAME invisible, STD_NAME invisible, PARENT_DOMAIN_ID invisible, DOMAIN_KIND invisible, DATA_TYPE invisible, LENGTH invisible, SCALE invisible, UNIT_CODE invisible, MARU_CODE_ID invisible, CATE_ID invisible, STD_RULE invisible, STD_AST invisible, BIZ_RULE invisible, BIZ_AST invisible, DESCRIPTION invisible, EXAMPLES invisible, TEST_CASES invisible, CHG_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_DOMAIN modify (DOMAIN_NAME visible);
alter table TB_MDM_DOMAIN modify (STD_NAME visible);
alter table TB_MDM_DOMAIN modify (PARENT_DOMAIN_ID visible);
alter table TB_MDM_DOMAIN modify (DOMAIN_KIND visible);
alter table TB_MDM_DOMAIN modify (DATA_TYPE visible);
alter table TB_MDM_DOMAIN modify (LENGTH visible);
alter table TB_MDM_DOMAIN modify (SCALE visible);
alter table TB_MDM_DOMAIN modify (UNIT_CODE visible);
alter table TB_MDM_DOMAIN modify (MARU_CODE_ID visible);
alter table TB_MDM_DOMAIN modify (CATE_ID visible);
alter table TB_MDM_DOMAIN modify (STD_RULE visible);
alter table TB_MDM_DOMAIN modify (STD_AST visible);
alter table TB_MDM_DOMAIN modify (BIZ_RULE visible);
alter table TB_MDM_DOMAIN modify (BIZ_AST visible);
alter table TB_MDM_DOMAIN modify (DESCRIPTION visible);
alter table TB_MDM_DOMAIN modify (EXAMPLES visible);
alter table TB_MDM_DOMAIN modify (TEST_CASES visible);
alter table TB_MDM_DOMAIN modify (CHG_SEQ visible);
alter table TB_MDM_DOMAIN modify (VER visible);
alter table TB_MDM_DOMAIN modify (C_USR_ID visible);
alter table TB_MDM_DOMAIN modify (C_AT visible);
alter table TB_MDM_DOMAIN modify (C_SVC_ID visible);
alter table TB_MDM_DOMAIN modify (C_PGM_ID visible);
alter table TB_MDM_DOMAIN modify (U_USR_ID visible);
alter table TB_MDM_DOMAIN modify (U_AT visible);
alter table TB_MDM_DOMAIN modify (U_SVC_ID visible);
alter table TB_MDM_DOMAIN modify (U_PGM_ID visible);

-- TB_MDM_EAI: 앞에 남김 EAI_CODE
alter table TB_MDM_EAI modify (EAI_NAME invisible, ENCODING invisible, PAD_RULE invisible, HEADER_LAYOUT_ID invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_EAI modify (EAI_NAME visible);
alter table TB_MDM_EAI modify (ENCODING visible);
alter table TB_MDM_EAI modify (PAD_RULE visible);
alter table TB_MDM_EAI modify (HEADER_LAYOUT_ID visible);
alter table TB_MDM_EAI modify (VER visible);
alter table TB_MDM_EAI modify (C_USR_ID visible);
alter table TB_MDM_EAI modify (C_AT visible);
alter table TB_MDM_EAI modify (C_SVC_ID visible);
alter table TB_MDM_EAI modify (C_PGM_ID visible);
alter table TB_MDM_EAI modify (U_USR_ID visible);
alter table TB_MDM_EAI modify (U_AT visible);
alter table TB_MDM_EAI modify (U_SVC_ID visible);
alter table TB_MDM_EAI modify (U_PGM_ID visible);

-- TB_MDM_LAYOUT: 앞에 남김 LAYOUT_ID
alter table TB_MDM_LAYOUT modify (LAYOUT_KIND invisible, LAYOUT_NAME invisible, SND_SYSTEM invisible, RCV_SYSTEM invisible, STATUS invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_LAYOUT modify (LAYOUT_KIND visible);
alter table TB_MDM_LAYOUT modify (LAYOUT_NAME visible);
alter table TB_MDM_LAYOUT modify (SND_SYSTEM visible);
alter table TB_MDM_LAYOUT modify (RCV_SYSTEM visible);
alter table TB_MDM_LAYOUT modify (STATUS visible);
alter table TB_MDM_LAYOUT modify (VER visible);
alter table TB_MDM_LAYOUT modify (C_USR_ID visible);
alter table TB_MDM_LAYOUT modify (C_AT visible);
alter table TB_MDM_LAYOUT modify (C_SVC_ID visible);
alter table TB_MDM_LAYOUT modify (C_PGM_ID visible);
alter table TB_MDM_LAYOUT modify (U_USR_ID visible);
alter table TB_MDM_LAYOUT modify (U_AT visible);
alter table TB_MDM_LAYOUT modify (U_SVC_ID visible);
alter table TB_MDM_LAYOUT modify (U_PGM_ID visible);

-- TB_MDM_LAYOUT_CONST: 앞에 남김 LAYOUT_ID,VER,HEADER_LAYOUT_ID,HEADER_COLUMN_PHYS
alter table TB_MDM_LAYOUT_CONST modify (CONST_VALUE invisible, AUD_VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_LAYOUT_CONST modify (CONST_VALUE visible);
alter table TB_MDM_LAYOUT_CONST modify (AUD_VER visible);
alter table TB_MDM_LAYOUT_CONST modify (C_USR_ID visible);
alter table TB_MDM_LAYOUT_CONST modify (C_AT visible);
alter table TB_MDM_LAYOUT_CONST modify (C_SVC_ID visible);
alter table TB_MDM_LAYOUT_CONST modify (C_PGM_ID visible);
alter table TB_MDM_LAYOUT_CONST modify (U_USR_ID visible);
alter table TB_MDM_LAYOUT_CONST modify (U_AT visible);
alter table TB_MDM_LAYOUT_CONST modify (U_SVC_ID visible);
alter table TB_MDM_LAYOUT_CONST modify (U_PGM_ID visible);

-- TB_MDM_LAYOUT_HEADER: 앞에 남김 LAYOUT_ID,VER,SEQ
alter table TB_MDM_LAYOUT_HEADER modify (HEADER_LAYOUT_ID invisible, AUD_VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_LAYOUT_HEADER modify (HEADER_LAYOUT_ID visible);
alter table TB_MDM_LAYOUT_HEADER modify (AUD_VER visible);
alter table TB_MDM_LAYOUT_HEADER modify (C_USR_ID visible);
alter table TB_MDM_LAYOUT_HEADER modify (C_AT visible);
alter table TB_MDM_LAYOUT_HEADER modify (C_SVC_ID visible);
alter table TB_MDM_LAYOUT_HEADER modify (C_PGM_ID visible);
alter table TB_MDM_LAYOUT_HEADER modify (U_USR_ID visible);
alter table TB_MDM_LAYOUT_HEADER modify (U_AT visible);
alter table TB_MDM_LAYOUT_HEADER modify (U_SVC_ID visible);
alter table TB_MDM_LAYOUT_HEADER modify (U_PGM_ID visible);

-- TB_MDM_LAYOUT_ITEM: 앞에 남김 LAYOUT_ID,VER,SEQ
alter table TB_MDM_LAYOUT_ITEM modify (FILL_KIND invisible, COLUMN_PHYS invisible, TRANS_UNIT invisible, UNIT_ITEM invisible, NUM_FORMAT invisible, DEFAULT_VALUE invisible, FILLER_LENGTH invisible, OFFSET invisible, LENGTH invisible, DATA_TYPE invisible, UNIT_CODE invisible, SCALE invisible, PINNED_YN invisible, AUD_VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_LAYOUT_ITEM modify (FILL_KIND visible);
alter table TB_MDM_LAYOUT_ITEM modify (COLUMN_PHYS visible);
alter table TB_MDM_LAYOUT_ITEM modify (TRANS_UNIT visible);
alter table TB_MDM_LAYOUT_ITEM modify (UNIT_ITEM visible);
alter table TB_MDM_LAYOUT_ITEM modify (NUM_FORMAT visible);
alter table TB_MDM_LAYOUT_ITEM modify (DEFAULT_VALUE visible);
alter table TB_MDM_LAYOUT_ITEM modify (FILLER_LENGTH visible);
alter table TB_MDM_LAYOUT_ITEM modify (OFFSET visible);
alter table TB_MDM_LAYOUT_ITEM modify (LENGTH visible);
alter table TB_MDM_LAYOUT_ITEM modify (DATA_TYPE visible);
alter table TB_MDM_LAYOUT_ITEM modify (UNIT_CODE visible);
alter table TB_MDM_LAYOUT_ITEM modify (SCALE visible);
alter table TB_MDM_LAYOUT_ITEM modify (PINNED_YN visible);
alter table TB_MDM_LAYOUT_ITEM modify (AUD_VER visible);
alter table TB_MDM_LAYOUT_ITEM modify (C_USR_ID visible);
alter table TB_MDM_LAYOUT_ITEM modify (C_AT visible);
alter table TB_MDM_LAYOUT_ITEM modify (C_SVC_ID visible);
alter table TB_MDM_LAYOUT_ITEM modify (C_PGM_ID visible);
alter table TB_MDM_LAYOUT_ITEM modify (U_USR_ID visible);
alter table TB_MDM_LAYOUT_ITEM modify (U_AT visible);
alter table TB_MDM_LAYOUT_ITEM modify (U_SVC_ID visible);
alter table TB_MDM_LAYOUT_ITEM modify (U_PGM_ID visible);

-- TB_MDM_LAYOUT_VER: 앞에 남김 LAYOUT_ID,VER
alter table TB_MDM_LAYOUT_VER modify (VER_KIND invisible, STATUS invisible, BASE_VER invisible, OWNER_ID invisible, APPLY_FROM invisible, APPLY_TO invisible, REQUESTED_BY invisible, REQUESTED_AT invisible, RELEASED_AT invisible, EAI_CODE invisible, OWN_LENGTH invisible, SWITCH_MODE invisible, CHANGE_KINDS invisible, CHANGE_SUMMARY invisible, SNAPSHOT_JSON invisible, LEGACY_SNAPSHOT_YN invisible, AUD_VER invisible, ROW_VERSION invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_LAYOUT_VER modify (VER_KIND visible);
alter table TB_MDM_LAYOUT_VER modify (STATUS visible);
alter table TB_MDM_LAYOUT_VER modify (BASE_VER visible);
alter table TB_MDM_LAYOUT_VER modify (OWNER_ID visible);
alter table TB_MDM_LAYOUT_VER modify (APPLY_FROM visible);
alter table TB_MDM_LAYOUT_VER modify (APPLY_TO visible);
alter table TB_MDM_LAYOUT_VER modify (REQUESTED_BY visible);
alter table TB_MDM_LAYOUT_VER modify (REQUESTED_AT visible);
alter table TB_MDM_LAYOUT_VER modify (RELEASED_AT visible);
alter table TB_MDM_LAYOUT_VER modify (EAI_CODE visible);
alter table TB_MDM_LAYOUT_VER modify (OWN_LENGTH visible);
alter table TB_MDM_LAYOUT_VER modify (SWITCH_MODE visible);
alter table TB_MDM_LAYOUT_VER modify (CHANGE_KINDS visible);
alter table TB_MDM_LAYOUT_VER modify (CHANGE_SUMMARY visible);
alter table TB_MDM_LAYOUT_VER modify (SNAPSHOT_JSON visible);
alter table TB_MDM_LAYOUT_VER modify (LEGACY_SNAPSHOT_YN visible);
alter table TB_MDM_LAYOUT_VER modify (AUD_VER visible);
alter table TB_MDM_LAYOUT_VER modify (ROW_VERSION visible);
alter table TB_MDM_LAYOUT_VER modify (C_USR_ID visible);
alter table TB_MDM_LAYOUT_VER modify (C_AT visible);
alter table TB_MDM_LAYOUT_VER modify (C_SVC_ID visible);
alter table TB_MDM_LAYOUT_VER modify (C_PGM_ID visible);
alter table TB_MDM_LAYOUT_VER modify (U_USR_ID visible);
alter table TB_MDM_LAYOUT_VER modify (U_AT visible);
alter table TB_MDM_LAYOUT_VER modify (U_SVC_ID visible);
alter table TB_MDM_LAYOUT_VER modify (U_PGM_ID visible);

-- TB_MDM_META_REV: 앞에 남김 REV_SEQ
alter table TB_MDM_META_REV modify (TARGET_TYPE invisible, TARGET_KEY invisible, CHANGE_KIND invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_META_REV modify (TARGET_TYPE visible);
alter table TB_MDM_META_REV modify (TARGET_KEY visible);
alter table TB_MDM_META_REV modify (CHANGE_KIND visible);
alter table TB_MDM_META_REV modify (VER visible);
alter table TB_MDM_META_REV modify (C_USR_ID visible);
alter table TB_MDM_META_REV modify (C_AT visible);
alter table TB_MDM_META_REV modify (C_SVC_ID visible);
alter table TB_MDM_META_REV modify (C_PGM_ID visible);
alter table TB_MDM_META_REV modify (U_USR_ID visible);
alter table TB_MDM_META_REV modify (U_AT visible);
alter table TB_MDM_META_REV modify (U_SVC_ID visible);
alter table TB_MDM_META_REV modify (U_PGM_ID visible);

-- TB_MDM_RULE: 앞에 남김 MARU_RULE_ID
alter table TB_MDM_RULE modify (MARU_RULE_NAME invisible, RULE_KIND invisible, STATUS invisible, SOURCE_KIND invisible, SOURCE_SYSTEM invisible, DESCRIPTION invisible, USAGE_NOTE invisible, LAST_VAR_ID invisible, LAST_ROW_ID invisible, LAST_CASE_ID invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_RULE modify (MARU_RULE_NAME visible);
alter table TB_MDM_RULE modify (RULE_KIND visible);
alter table TB_MDM_RULE modify (STATUS visible);
alter table TB_MDM_RULE modify (SOURCE_KIND visible);
alter table TB_MDM_RULE modify (SOURCE_SYSTEM visible);
alter table TB_MDM_RULE modify (DESCRIPTION visible);
alter table TB_MDM_RULE modify (USAGE_NOTE visible);
alter table TB_MDM_RULE modify (LAST_VAR_ID visible);
alter table TB_MDM_RULE modify (LAST_ROW_ID visible);
alter table TB_MDM_RULE modify (LAST_CASE_ID visible);
alter table TB_MDM_RULE modify (VER visible);
alter table TB_MDM_RULE modify (C_USR_ID visible);
alter table TB_MDM_RULE modify (C_AT visible);
alter table TB_MDM_RULE modify (C_SVC_ID visible);
alter table TB_MDM_RULE modify (C_PGM_ID visible);
alter table TB_MDM_RULE modify (U_USR_ID visible);
alter table TB_MDM_RULE modify (U_AT visible);
alter table TB_MDM_RULE modify (U_SVC_ID visible);
alter table TB_MDM_RULE modify (U_PGM_ID visible);

-- TB_MDM_RULE_RECV: 앞에 남김 RECV_ID
alter table TB_MDM_RULE_RECV modify (MARU_RULE_ID invisible, SOURCE_SYSTEM invisible, SOURCE_REF invisible, REQ_KIND invisible, RECEIVED_AT invisible, BODY invisible, RESULT invisible, RESULT_DETAIL invisible, PROCESSED_AT invisible, VER invisible, AUD_VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_RULE_RECV modify (MARU_RULE_ID visible);
alter table TB_MDM_RULE_RECV modify (SOURCE_SYSTEM visible);
alter table TB_MDM_RULE_RECV modify (SOURCE_REF visible);
alter table TB_MDM_RULE_RECV modify (REQ_KIND visible);
alter table TB_MDM_RULE_RECV modify (RECEIVED_AT visible);
alter table TB_MDM_RULE_RECV modify (BODY visible);
alter table TB_MDM_RULE_RECV modify (RESULT visible);
alter table TB_MDM_RULE_RECV modify (RESULT_DETAIL visible);
alter table TB_MDM_RULE_RECV modify (PROCESSED_AT visible);
alter table TB_MDM_RULE_RECV modify (VER visible);
alter table TB_MDM_RULE_RECV modify (AUD_VER visible);
alter table TB_MDM_RULE_RECV modify (C_USR_ID visible);
alter table TB_MDM_RULE_RECV modify (C_AT visible);
alter table TB_MDM_RULE_RECV modify (C_SVC_ID visible);
alter table TB_MDM_RULE_RECV modify (C_PGM_ID visible);
alter table TB_MDM_RULE_RECV modify (U_USR_ID visible);
alter table TB_MDM_RULE_RECV modify (U_AT visible);
alter table TB_MDM_RULE_RECV modify (U_SVC_ID visible);
alter table TB_MDM_RULE_RECV modify (U_PGM_ID visible);

-- TB_MDM_RULE_ROW: 앞에 남김 MARU_RULE_ID,VER,ROW_ID
alter table TB_MDM_RULE_ROW modify (SEQ invisible, ROW_KIND invisible, CELLS invisible, NOTE invisible, TAG invisible, AUD_VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_RULE_ROW modify (SEQ visible);
alter table TB_MDM_RULE_ROW modify (ROW_KIND visible);
alter table TB_MDM_RULE_ROW modify (CELLS visible);
alter table TB_MDM_RULE_ROW modify (NOTE visible);
alter table TB_MDM_RULE_ROW modify (TAG visible);
alter table TB_MDM_RULE_ROW modify (AUD_VER visible);
alter table TB_MDM_RULE_ROW modify (C_USR_ID visible);
alter table TB_MDM_RULE_ROW modify (C_AT visible);
alter table TB_MDM_RULE_ROW modify (C_SVC_ID visible);
alter table TB_MDM_RULE_ROW modify (C_PGM_ID visible);
alter table TB_MDM_RULE_ROW modify (U_USR_ID visible);
alter table TB_MDM_RULE_ROW modify (U_AT visible);
alter table TB_MDM_RULE_ROW modify (U_SVC_ID visible);
alter table TB_MDM_RULE_ROW modify (U_PGM_ID visible);

-- TB_MDM_RULE_SET: 앞에 남김 MARU_RULE_SET_ID
alter table TB_MDM_RULE_SET modify (MARU_RULE_SET_NAME invisible, DESCRIPTION invisible, STATUS invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_RULE_SET modify (MARU_RULE_SET_NAME visible);
alter table TB_MDM_RULE_SET modify (DESCRIPTION visible);
alter table TB_MDM_RULE_SET modify (STATUS visible);
alter table TB_MDM_RULE_SET modify (VER visible);
alter table TB_MDM_RULE_SET modify (C_USR_ID visible);
alter table TB_MDM_RULE_SET modify (C_AT visible);
alter table TB_MDM_RULE_SET modify (C_SVC_ID visible);
alter table TB_MDM_RULE_SET modify (C_PGM_ID visible);
alter table TB_MDM_RULE_SET modify (U_USR_ID visible);
alter table TB_MDM_RULE_SET modify (U_AT visible);
alter table TB_MDM_RULE_SET modify (U_SVC_ID visible);
alter table TB_MDM_RULE_SET modify (U_PGM_ID visible);

-- TB_MDM_RULE_SET_TEST_CASE: 앞에 남김 MARU_RULE_SET_ID,CASE_ID
alter table TB_MDM_RULE_SET_TEST_CASE modify (CASE_NAME invisible, INPUT_JSON invisible, EVAL_TS invisible, EXPECTED_JSON invisible, DESCRIPTION invisible, VER invisible, ROW_VERSION invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (CASE_NAME visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (INPUT_JSON visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (EVAL_TS visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (EXPECTED_JSON visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (DESCRIPTION visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (VER visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (ROW_VERSION visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (C_USR_ID visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (C_AT visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (C_SVC_ID visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (C_PGM_ID visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (U_USR_ID visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (U_AT visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (U_SVC_ID visible);
alter table TB_MDM_RULE_SET_TEST_CASE modify (U_PGM_ID visible);

-- TB_MDM_RULE_SET_VER: 앞에 남김 MARU_RULE_SET_ID,VER
alter table TB_MDM_RULE_SET_VER modify (VER_KIND invisible, STATUS invisible, BASE_VER invisible, OWNER_ID invisible, APPLY_FROM invisible, APPLY_TO invisible, RULE_IDS invisible, FLOW_JSON invisible, CALL_SET_IDS invisible, REQUESTED_BY invisible, RELEASED_AT invisible, REQUESTED_AT invisible, AUD_VER invisible, ROW_VERSION invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_RULE_SET_VER modify (VER_KIND visible);
alter table TB_MDM_RULE_SET_VER modify (STATUS visible);
alter table TB_MDM_RULE_SET_VER modify (BASE_VER visible);
alter table TB_MDM_RULE_SET_VER modify (OWNER_ID visible);
alter table TB_MDM_RULE_SET_VER modify (APPLY_FROM visible);
alter table TB_MDM_RULE_SET_VER modify (APPLY_TO visible);
alter table TB_MDM_RULE_SET_VER modify (RULE_IDS visible);
alter table TB_MDM_RULE_SET_VER modify (FLOW_JSON visible);
alter table TB_MDM_RULE_SET_VER modify (CALL_SET_IDS visible);
alter table TB_MDM_RULE_SET_VER modify (REQUESTED_BY visible);
alter table TB_MDM_RULE_SET_VER modify (RELEASED_AT visible);
alter table TB_MDM_RULE_SET_VER modify (REQUESTED_AT visible);
alter table TB_MDM_RULE_SET_VER modify (AUD_VER visible);
alter table TB_MDM_RULE_SET_VER modify (ROW_VERSION visible);
alter table TB_MDM_RULE_SET_VER modify (C_USR_ID visible);
alter table TB_MDM_RULE_SET_VER modify (C_AT visible);
alter table TB_MDM_RULE_SET_VER modify (C_SVC_ID visible);
alter table TB_MDM_RULE_SET_VER modify (C_PGM_ID visible);
alter table TB_MDM_RULE_SET_VER modify (U_USR_ID visible);
alter table TB_MDM_RULE_SET_VER modify (U_AT visible);
alter table TB_MDM_RULE_SET_VER modify (U_SVC_ID visible);
alter table TB_MDM_RULE_SET_VER modify (U_PGM_ID visible);

-- TB_MDM_RULE_SYSTEM: 앞에 남김 MARU_RULE_ID,SYSTEM_CODE
alter table TB_MDM_RULE_SYSTEM modify (DEPLOY_KIND invisible, DESCRIPTION invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_RULE_SYSTEM modify (DEPLOY_KIND visible);
alter table TB_MDM_RULE_SYSTEM modify (DESCRIPTION visible);
alter table TB_MDM_RULE_SYSTEM modify (VER visible);
alter table TB_MDM_RULE_SYSTEM modify (C_USR_ID visible);
alter table TB_MDM_RULE_SYSTEM modify (C_AT visible);
alter table TB_MDM_RULE_SYSTEM modify (C_SVC_ID visible);
alter table TB_MDM_RULE_SYSTEM modify (C_PGM_ID visible);
alter table TB_MDM_RULE_SYSTEM modify (U_USR_ID visible);
alter table TB_MDM_RULE_SYSTEM modify (U_AT visible);
alter table TB_MDM_RULE_SYSTEM modify (U_SVC_ID visible);
alter table TB_MDM_RULE_SYSTEM modify (U_PGM_ID visible);

-- TB_MDM_RULE_TEST_CASE: 앞에 남김 MARU_RULE_ID,CASE_ID
alter table TB_MDM_RULE_TEST_CASE modify (CASE_NAME invisible, INPUT_JSON invisible, EXPECTED_JSON invisible, DESCRIPTION invisible, VER invisible, ROW_VERSION invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_RULE_TEST_CASE modify (CASE_NAME visible);
alter table TB_MDM_RULE_TEST_CASE modify (INPUT_JSON visible);
alter table TB_MDM_RULE_TEST_CASE modify (EXPECTED_JSON visible);
alter table TB_MDM_RULE_TEST_CASE modify (DESCRIPTION visible);
alter table TB_MDM_RULE_TEST_CASE modify (VER visible);
alter table TB_MDM_RULE_TEST_CASE modify (ROW_VERSION visible);
alter table TB_MDM_RULE_TEST_CASE modify (C_USR_ID visible);
alter table TB_MDM_RULE_TEST_CASE modify (C_AT visible);
alter table TB_MDM_RULE_TEST_CASE modify (C_SVC_ID visible);
alter table TB_MDM_RULE_TEST_CASE modify (C_PGM_ID visible);
alter table TB_MDM_RULE_TEST_CASE modify (U_USR_ID visible);
alter table TB_MDM_RULE_TEST_CASE modify (U_AT visible);
alter table TB_MDM_RULE_TEST_CASE modify (U_SVC_ID visible);
alter table TB_MDM_RULE_TEST_CASE modify (U_PGM_ID visible);

-- TB_MDM_RULE_VAR: 앞에 남김 MARU_RULE_ID,VER,VAR_ID
alter table TB_MDM_RULE_VAR modify (VAR_KIND invisible, DISP_TYPE invisible, VAR_NAME invisible, VAR_AST invisible, DOMAIN_ID invisible, DATA_TYPE invisible, COLLECT_AGG invisible, PRIO_LIST invisible, RES_GRP invisible, GRP_COND invisible, GRP_COND_AST invisible, SEQ invisible, LABEL invisible, DESCRIPTION invisible, AUD_VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_RULE_VAR modify (VAR_KIND visible);
alter table TB_MDM_RULE_VAR modify (DISP_TYPE visible);
alter table TB_MDM_RULE_VAR modify (VAR_NAME visible);
alter table TB_MDM_RULE_VAR modify (VAR_AST visible);
alter table TB_MDM_RULE_VAR modify (DOMAIN_ID visible);
alter table TB_MDM_RULE_VAR modify (DATA_TYPE visible);
alter table TB_MDM_RULE_VAR modify (COLLECT_AGG visible);
alter table TB_MDM_RULE_VAR modify (PRIO_LIST visible);
alter table TB_MDM_RULE_VAR modify (RES_GRP visible);
alter table TB_MDM_RULE_VAR modify (GRP_COND visible);
alter table TB_MDM_RULE_VAR modify (GRP_COND_AST visible);
alter table TB_MDM_RULE_VAR modify (SEQ visible);
alter table TB_MDM_RULE_VAR modify (LABEL visible);
alter table TB_MDM_RULE_VAR modify (DESCRIPTION visible);
alter table TB_MDM_RULE_VAR modify (AUD_VER visible);
alter table TB_MDM_RULE_VAR modify (C_USR_ID visible);
alter table TB_MDM_RULE_VAR modify (C_AT visible);
alter table TB_MDM_RULE_VAR modify (C_SVC_ID visible);
alter table TB_MDM_RULE_VAR modify (C_PGM_ID visible);
alter table TB_MDM_RULE_VAR modify (U_USR_ID visible);
alter table TB_MDM_RULE_VAR modify (U_AT visible);
alter table TB_MDM_RULE_VAR modify (U_SVC_ID visible);
alter table TB_MDM_RULE_VAR modify (U_PGM_ID visible);

-- TB_MDM_RULE_VER: 앞에 남김 MARU_RULE_ID,VER
alter table TB_MDM_RULE_VER modify (VER_KIND invisible, STATUS invisible, BASE_VER invisible, OWNER_ID invisible, HIT_POLICY invisible, APPLY_FROM invisible, APPLY_TO invisible, DESCRIPTION invisible, REQUESTED_BY invisible, REQUESTED_AT invisible, EMERGENCY_YN invisible, EMERGENCY_REASON invisible, APPROVED_BY invisible, APPROVED_AT invisible, REJECT_REASON invisible, RELEASED_AT invisible, CANCELLED_AT invisible, CANCEL_REASON invisible, AUD_VER invisible, ROW_VERSION invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_RULE_VER modify (VER_KIND visible);
alter table TB_MDM_RULE_VER modify (STATUS visible);
alter table TB_MDM_RULE_VER modify (BASE_VER visible);
alter table TB_MDM_RULE_VER modify (OWNER_ID visible);
alter table TB_MDM_RULE_VER modify (HIT_POLICY visible);
alter table TB_MDM_RULE_VER modify (APPLY_FROM visible);
alter table TB_MDM_RULE_VER modify (APPLY_TO visible);
alter table TB_MDM_RULE_VER modify (DESCRIPTION visible);
alter table TB_MDM_RULE_VER modify (REQUESTED_BY visible);
alter table TB_MDM_RULE_VER modify (REQUESTED_AT visible);
alter table TB_MDM_RULE_VER modify (EMERGENCY_YN visible);
alter table TB_MDM_RULE_VER modify (EMERGENCY_REASON visible);
alter table TB_MDM_RULE_VER modify (APPROVED_BY visible);
alter table TB_MDM_RULE_VER modify (APPROVED_AT visible);
alter table TB_MDM_RULE_VER modify (REJECT_REASON visible);
alter table TB_MDM_RULE_VER modify (RELEASED_AT visible);
alter table TB_MDM_RULE_VER modify (CANCELLED_AT visible);
alter table TB_MDM_RULE_VER modify (CANCEL_REASON visible);
alter table TB_MDM_RULE_VER modify (AUD_VER visible);
alter table TB_MDM_RULE_VER modify (ROW_VERSION visible);
alter table TB_MDM_RULE_VER modify (C_USR_ID visible);
alter table TB_MDM_RULE_VER modify (C_AT visible);
alter table TB_MDM_RULE_VER modify (C_SVC_ID visible);
alter table TB_MDM_RULE_VER modify (C_PGM_ID visible);
alter table TB_MDM_RULE_VER modify (U_USR_ID visible);
alter table TB_MDM_RULE_VER modify (U_AT visible);
alter table TB_MDM_RULE_VER modify (U_SVC_ID visible);
alter table TB_MDM_RULE_VER modify (U_PGM_ID visible);

-- TB_MDM_SYSTEM: 앞에 남김 SYSTEM_CODE
alter table TB_MDM_SYSTEM modify (SYSTEM_NAME invisible, SELF_YN invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_SYSTEM modify (SYSTEM_NAME visible);
alter table TB_MDM_SYSTEM modify (SELF_YN visible);
alter table TB_MDM_SYSTEM modify (VER visible);
alter table TB_MDM_SYSTEM modify (C_USR_ID visible);
alter table TB_MDM_SYSTEM modify (C_AT visible);
alter table TB_MDM_SYSTEM modify (C_SVC_ID visible);
alter table TB_MDM_SYSTEM modify (C_PGM_ID visible);
alter table TB_MDM_SYSTEM modify (U_USR_ID visible);
alter table TB_MDM_SYSTEM modify (U_AT visible);
alter table TB_MDM_SYSTEM modify (U_SVC_ID visible);
alter table TB_MDM_SYSTEM modify (U_PGM_ID visible);

-- TB_MDM_TERM: 앞에 남김 TERM_ID
alter table TB_MDM_TERM modify (TERM_NAME invisible, SENSE_NO invisible, DEFINITION invisible, CONTEXT invisible, ENG_NAME invisible, ENG_ABBR invisible, SYNONYMS invisible, ALIASES invisible, SYSTEMS invisible, STD_BASIS invisible, OWNER_DEPT invisible, OWNER_ID invisible, SRC_ORIGIN invisible, EMBEDDING invisible, EMBEDDING_MODEL invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_TERM modify (TERM_NAME visible);
alter table TB_MDM_TERM modify (SENSE_NO visible);
alter table TB_MDM_TERM modify (DEFINITION visible);
alter table TB_MDM_TERM modify (CONTEXT visible);
alter table TB_MDM_TERM modify (ENG_NAME visible);
alter table TB_MDM_TERM modify (ENG_ABBR visible);
alter table TB_MDM_TERM modify (SYNONYMS visible);
alter table TB_MDM_TERM modify (ALIASES visible);
alter table TB_MDM_TERM modify (SYSTEMS visible);
alter table TB_MDM_TERM modify (STD_BASIS visible);
alter table TB_MDM_TERM modify (OWNER_DEPT visible);
alter table TB_MDM_TERM modify (OWNER_ID visible);
alter table TB_MDM_TERM modify (SRC_ORIGIN visible);
alter table TB_MDM_TERM modify (EMBEDDING visible);
alter table TB_MDM_TERM modify (EMBEDDING_MODEL visible);
alter table TB_MDM_TERM modify (VER visible);
alter table TB_MDM_TERM modify (C_USR_ID visible);
alter table TB_MDM_TERM modify (C_AT visible);
alter table TB_MDM_TERM modify (C_SVC_ID visible);
alter table TB_MDM_TERM modify (C_PGM_ID visible);
alter table TB_MDM_TERM modify (U_USR_ID visible);
alter table TB_MDM_TERM modify (U_AT visible);
alter table TB_MDM_TERM modify (U_SVC_ID visible);
alter table TB_MDM_TERM modify (U_PGM_ID visible);

-- TB_MDM_UNIT: 앞에 남김 UNIT_CODE
alter table TB_MDM_UNIT modify (DIMENSION invisible, BASE_UNIT invisible, FACTOR invisible, CHG_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_UNIT modify (DIMENSION visible);
alter table TB_MDM_UNIT modify (BASE_UNIT visible);
alter table TB_MDM_UNIT modify (FACTOR visible);
alter table TB_MDM_UNIT modify (CHG_SEQ visible);
alter table TB_MDM_UNIT modify (VER visible);
alter table TB_MDM_UNIT modify (C_USR_ID visible);
alter table TB_MDM_UNIT modify (C_AT visible);
alter table TB_MDM_UNIT modify (C_SVC_ID visible);
alter table TB_MDM_UNIT modify (C_PGM_ID visible);
alter table TB_MDM_UNIT modify (U_USR_ID visible);
alter table TB_MDM_UNIT modify (U_AT visible);
alter table TB_MDM_UNIT modify (U_SVC_ID visible);
alter table TB_MDM_UNIT modify (U_PGM_ID visible);

-- TB_MDM_ERD_MODEL: 앞에 남김 ERD_MODEL_ID
alter table TB_MDM_ERD_MODEL modify (MODULE_ID invisible, SCHEMA_NAME invisible, MODEL_NAME invisible, STATUS invisible, REV invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_ERD_MODEL modify (MODULE_ID visible);
alter table TB_MDM_ERD_MODEL modify (SCHEMA_NAME visible);
alter table TB_MDM_ERD_MODEL modify (MODEL_NAME visible);
alter table TB_MDM_ERD_MODEL modify (STATUS visible);
alter table TB_MDM_ERD_MODEL modify (REV visible);
alter table TB_MDM_ERD_MODEL modify (VER visible);
alter table TB_MDM_ERD_MODEL modify (C_USR_ID visible);
alter table TB_MDM_ERD_MODEL modify (C_AT visible);
alter table TB_MDM_ERD_MODEL modify (C_SVC_ID visible);
alter table TB_MDM_ERD_MODEL modify (C_PGM_ID visible);
alter table TB_MDM_ERD_MODEL modify (U_USR_ID visible);
alter table TB_MDM_ERD_MODEL modify (U_AT visible);
alter table TB_MDM_ERD_MODEL modify (U_SVC_ID visible);
alter table TB_MDM_ERD_MODEL modify (U_PGM_ID visible);

-- TB_MDM_ERD_MODEL_VER: 앞에 남김 ERD_MODEL_ID,VER
alter table TB_MDM_ERD_MODEL_VER modify (VER_KIND invisible, STATUS invisible, BASE_VER invisible, OWNER_ID invisible, APPLY_FROM invisible, APPLY_TO invisible, MODEL_JSON invisible, REQUESTED_BY invisible, REQUESTED_AT invisible, RELEASED_AT invisible, AUD_VER invisible, ROW_VERSION invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_ERD_MODEL_VER modify (VER_KIND visible);
alter table TB_MDM_ERD_MODEL_VER modify (STATUS visible);
alter table TB_MDM_ERD_MODEL_VER modify (BASE_VER visible);
alter table TB_MDM_ERD_MODEL_VER modify (OWNER_ID visible);
alter table TB_MDM_ERD_MODEL_VER modify (APPLY_FROM visible);
alter table TB_MDM_ERD_MODEL_VER modify (APPLY_TO visible);
alter table TB_MDM_ERD_MODEL_VER modify (MODEL_JSON visible);
alter table TB_MDM_ERD_MODEL_VER modify (REQUESTED_BY visible);
alter table TB_MDM_ERD_MODEL_VER modify (REQUESTED_AT visible);
alter table TB_MDM_ERD_MODEL_VER modify (RELEASED_AT visible);
alter table TB_MDM_ERD_MODEL_VER modify (AUD_VER visible);
alter table TB_MDM_ERD_MODEL_VER modify (ROW_VERSION visible);
alter table TB_MDM_ERD_MODEL_VER modify (C_USR_ID visible);
alter table TB_MDM_ERD_MODEL_VER modify (C_AT visible);
alter table TB_MDM_ERD_MODEL_VER modify (C_SVC_ID visible);
alter table TB_MDM_ERD_MODEL_VER modify (C_PGM_ID visible);
alter table TB_MDM_ERD_MODEL_VER modify (U_USR_ID visible);
alter table TB_MDM_ERD_MODEL_VER modify (U_AT visible);
alter table TB_MDM_ERD_MODEL_VER modify (U_SVC_ID visible);
alter table TB_MDM_ERD_MODEL_VER modify (U_PGM_ID visible);

-- TB_MDM_ERD_EDITOR: 앞에 남김 ERD_MODEL_ID,VER,USER_ID
alter table TB_MDM_ERD_EDITOR modify (AUD_VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_ERD_EDITOR modify (AUD_VER visible);
alter table TB_MDM_ERD_EDITOR modify (C_USR_ID visible);
alter table TB_MDM_ERD_EDITOR modify (C_AT visible);
alter table TB_MDM_ERD_EDITOR modify (C_SVC_ID visible);
alter table TB_MDM_ERD_EDITOR modify (C_PGM_ID visible);
alter table TB_MDM_ERD_EDITOR modify (U_USR_ID visible);
alter table TB_MDM_ERD_EDITOR modify (U_AT visible);
alter table TB_MDM_ERD_EDITOR modify (U_SVC_ID visible);
alter table TB_MDM_ERD_EDITOR modify (U_PGM_ID visible);

-- TB_MDM_ERD_CMD_LOG: 앞에 남김 ERD_MODEL_ID,REV
alter table TB_MDM_ERD_CMD_LOG modify (MODEL_VER invisible, USER_ID invisible, SESSION_NM invisible, SOURCE invisible, CMD_JSON invisible, INVERSE_JSON invisible, CHANGES_JSON invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_ERD_CMD_LOG modify (MODEL_VER visible);
alter table TB_MDM_ERD_CMD_LOG modify (USER_ID visible);
alter table TB_MDM_ERD_CMD_LOG modify (SESSION_NM visible);
alter table TB_MDM_ERD_CMD_LOG modify (SOURCE visible);
alter table TB_MDM_ERD_CMD_LOG modify (CMD_JSON visible);
alter table TB_MDM_ERD_CMD_LOG modify (INVERSE_JSON visible);
alter table TB_MDM_ERD_CMD_LOG modify (CHANGES_JSON visible);
alter table TB_MDM_ERD_CMD_LOG modify (VER visible);
alter table TB_MDM_ERD_CMD_LOG modify (C_USR_ID visible);
alter table TB_MDM_ERD_CMD_LOG modify (C_AT visible);
alter table TB_MDM_ERD_CMD_LOG modify (C_SVC_ID visible);
alter table TB_MDM_ERD_CMD_LOG modify (C_PGM_ID visible);
alter table TB_MDM_ERD_CMD_LOG modify (U_USR_ID visible);
alter table TB_MDM_ERD_CMD_LOG modify (U_AT visible);
alter table TB_MDM_ERD_CMD_LOG modify (U_SVC_ID visible);
alter table TB_MDM_ERD_CMD_LOG modify (U_PGM_ID visible);

-- TB_MDM_ERD_DIAGRAM: 앞에 남김 DIAGRAM_ID
alter table TB_MDM_ERD_DIAGRAM modify (ERD_MODEL_ID invisible, AREA_NAME invisible, DIAGRAM_NAME invisible, SORT_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_ERD_DIAGRAM modify (ERD_MODEL_ID visible);
alter table TB_MDM_ERD_DIAGRAM modify (AREA_NAME visible);
alter table TB_MDM_ERD_DIAGRAM modify (DIAGRAM_NAME visible);
alter table TB_MDM_ERD_DIAGRAM modify (SORT_SEQ visible);
alter table TB_MDM_ERD_DIAGRAM modify (VER visible);
alter table TB_MDM_ERD_DIAGRAM modify (C_USR_ID visible);
alter table TB_MDM_ERD_DIAGRAM modify (C_AT visible);
alter table TB_MDM_ERD_DIAGRAM modify (C_SVC_ID visible);
alter table TB_MDM_ERD_DIAGRAM modify (C_PGM_ID visible);
alter table TB_MDM_ERD_DIAGRAM modify (U_USR_ID visible);
alter table TB_MDM_ERD_DIAGRAM modify (U_AT visible);
alter table TB_MDM_ERD_DIAGRAM modify (U_SVC_ID visible);
alter table TB_MDM_ERD_DIAGRAM modify (U_PGM_ID visible);

-- TB_MDM_ERD_DIAGRAM_NODE: 앞에 남김 DIAGRAM_ID,TABLE_UUID
alter table TB_MDM_ERD_DIAGRAM_NODE modify (POS_X invisible, POS_Y invisible, FOLD_MODE invisible, SIZE_W invisible, SIZE_H invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (POS_X visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (POS_Y visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (FOLD_MODE visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (SIZE_W visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (SIZE_H visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (VER visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (C_USR_ID visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (C_AT visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (C_SVC_ID visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (C_PGM_ID visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (U_USR_ID visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (U_AT visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (U_SVC_ID visible);
alter table TB_MDM_ERD_DIAGRAM_NODE modify (U_PGM_ID visible);

-- TB_MDM_ERD_CLAIM: 앞에 남김 ERD_MODEL_ID,TABLE_UUID
alter table TB_MDM_ERD_CLAIM modify (SESSION_NM invisible, USER_ID invisible, EXPIRES_AT invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_ERD_CLAIM modify (SESSION_NM visible);
alter table TB_MDM_ERD_CLAIM modify (USER_ID visible);
alter table TB_MDM_ERD_CLAIM modify (EXPIRES_AT visible);
alter table TB_MDM_ERD_CLAIM modify (VER visible);
alter table TB_MDM_ERD_CLAIM modify (C_USR_ID visible);
alter table TB_MDM_ERD_CLAIM modify (C_AT visible);
alter table TB_MDM_ERD_CLAIM modify (C_SVC_ID visible);
alter table TB_MDM_ERD_CLAIM modify (C_PGM_ID visible);
alter table TB_MDM_ERD_CLAIM modify (U_USR_ID visible);
alter table TB_MDM_ERD_CLAIM modify (U_AT visible);
alter table TB_MDM_ERD_CLAIM modify (U_SVC_ID visible);
alter table TB_MDM_ERD_CLAIM modify (U_PGM_ID visible);

-- TB_MDM_ERD_DIAGRAM_ROUTE: 앞에 남김 DIAGRAM_ID,REL_UUID
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (POINTS_JSON invisible, CHILD_SIDE invisible, PARENT_SIDE invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (POINTS_JSON visible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (CHILD_SIDE visible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (PARENT_SIDE visible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (VER visible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (C_USR_ID visible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (C_AT visible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (C_SVC_ID visible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (C_PGM_ID visible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (U_USR_ID visible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (U_AT visible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (U_SVC_ID visible);
alter table TB_MDM_ERD_DIAGRAM_ROUTE modify (U_PGM_ID visible);
