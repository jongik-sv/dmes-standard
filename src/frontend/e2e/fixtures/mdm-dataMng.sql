-- TSK-07-02 E2E 전용 mdm.db 픽스처(design.md §2 「생성 — dataMng(B1)」). 세 화면(dataMng·dataEdit·dataCateEdit)
-- e2e 가 공유한다. 워크트리 격리 mdm.db 에만 적용한다. 운영 Flyway 시드가 아니다. mdm 기동(Flyway V10 적용) 뒤에만
-- 넣는다. INSERT OR IGNORE 만 쓴다(재실행 안전). ID 는 E2E_DM_ 로 시작한다(mdm-dataItem.sql 의 E2E_DI_ 와 겹치지 않는다).
-- B2·B3 는 이 행을 고치지 않는다 — 모자라면 build-log.md 에 적고 새 INSERT OR IGNORE 행만 덧붙인다.

INSERT OR IGNORE INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, SOURCE_SYSTEM, CODE_PATTERN,
    ATTR01_NAME, LVL_CNT, LAST_CHG_SEQ, CHG_SEQ, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_DM_PORT', '항구', 'INUSE', 'MDM', NULL, '^[0-9A-Z]{1,20}$', '국가', 2, 0, 0, 'e2e-fixture', 'mdm-dataMng.sql', 0);
INSERT OR IGNORE INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, SOURCE_SYSTEM, CODE_PATTERN,
    LVL_CNT, LAST_CHG_SEQ, CHG_SEQ, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_DM_CUST', '거래처', 'INUSE', 'MDM', NULL, '^[0-9A-Z]{1,20}$', 0, 0, 0, 'e2e-fixture', 'mdm-dataMng.sql', 0);

-- CK_TB_MDM_DATA_CATE_DEF: REGEX 는 DEF_EXPR·DEF_TARGET 둘 다 값, TABLE 은 둘 다 NULL.
INSERT OR IGNORE INTO TB_MDM_DATA_CATE (MARU_DATA_ID, CATE_ID, VALID_FROM, VALID_TO, CATE_NAME, DEF_KIND, DEF_EXPR, DEF_TARGET,
    CHG_SEQ, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_DM_PORT', 'BASE', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '전체', 'REGEX', '.*', 'KEY', 0, 'e2e-fixture', 'mdm-dataMng.sql', 0),
    ('E2E_DM_PORT', 'KR', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '한국 항구', 'REGEX', '^KR$', 'LVL1', 0, 'e2e-fixture', 'mdm-dataMng.sql', 0),
    ('E2E_DM_PORT', 'MAJOR', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '주요 항구', 'TABLE', NULL, NULL, 0, 'e2e-fixture', 'mdm-dataMng.sql', 0),
    ('E2E_DM_CUST', 'BASE', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '전체', 'REGEX', '.*', 'KEY', 0, 'e2e-fixture', 'mdm-dataMng.sql', 0);

INSERT OR IGNORE INTO TB_MDM_DATA_ITEM (MARU_DATA_ID, CODE, VALID_FROM, VALID_TO, NAME, SEQ, ROW_VERSION, CHG_SEQ, LVL1, LVL2,
    ATTR01, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_DM_PORT', 'KRPUS', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '부산', 1, 0, 0, 'KR', NULL, '국가', 'e2e-fixture', 'mdm-dataMng.sql', 0),
    ('E2E_DM_PORT', 'KRINC', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '인천', 2, 0, 0, 'KR', NULL, '국가', 'e2e-fixture', 'mdm-dataMng.sql', 0),
    ('E2E_DM_PORT', 'CNSHA', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '상하이', 3, 0, 0, 'CN', NULL, '국가', 'e2e-fixture', 'mdm-dataMng.sql', 0);

INSERT OR IGNORE INTO TB_MDM_DATA_CATE_ITEM (MARU_DATA_ID, CATE_ID, CODE, VALID_FROM, VALID_TO, CHG_SEQ, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_DM_PORT', 'MAJOR', 'KRPUS', '2026-08-20 09:00:00', '9999-12-31 00:00:00', 0, 'e2e-fixture', 'mdm-dataMng.sql', 0);
