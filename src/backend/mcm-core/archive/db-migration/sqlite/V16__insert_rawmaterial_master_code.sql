-- ============================================================
-- V16: 품목 규격 항목 마스터 코드 시드 (ITEM_SPEC)
-- ============================================================
--
-- 회의록 §6 "원소재 규격 관리" 의 '품목 정보' 규격 항목(외경/내경/두께/재질)을
-- MCM 마스터코드(cactus LoV: TB_SEC_CODE_*)로 등록한다.
--   - ITEM_SPEC : 품목 규격 항목 (OD=외경/ID=내경/THK=두께/MAT=재질). EXTRA_VAL1 = 단위.
-- 이 규격의 실제 값(외경/내경/두께 수치, 재질)은 tb_mpn_item_details 에 보관하며
-- ID/OD 용접 시간·CAPA 산출 입력값이 된다.
--
-- ※ m-mcm "마스터코드 관리" 화면 정본은 MCM_SOURCE.TB_MCM_CODE_* (운영/MSSQL) 이며,
--   본 SQLite 시드는 cactus LoV(드롭다운)용 TB_SEC_CODE_* 만 대상으로 한다(오프라인 개발/데모).

INSERT OR IGNORE INTO TB_SEC_CODE_GROUP (GROUP_CD, GROUP_NM, GROUP_DESC, USE_YN, C_AT, U_AT, VER) VALUES
    ('ITEM_SPEC', '품목 규격 항목', '품목 규격 항목 (외경/내경/두께/재질)', 'Y', datetime('now'), datetime('now'), 1);

INSERT OR IGNORE INTO TB_SEC_CODE_ITEM (GROUP_CD, ITEM_CD, ITEM_NM, ITEM_DESC, SORT_ORD, EXTRA_VAL1, USE_YN, C_AT, U_AT, VER) VALUES
    ('ITEM_SPEC', 'OD',  '외경', '외경(OD)', 10, 'mm', 'Y', datetime('now'), datetime('now'), 1),
    ('ITEM_SPEC', 'ID',  '내경', '내경(ID)', 20, 'mm', 'Y', datetime('now'), datetime('now'), 1),
    ('ITEM_SPEC', 'THK', '두께', '두께',     30, 'mm', 'Y', datetime('now'), datetime('now'), 1),
    ('ITEM_SPEC', 'MAT', '재질', '재질',     40, '',   'Y', datetime('now'), datetime('now'), 1);
