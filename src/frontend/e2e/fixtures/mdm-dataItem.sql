-- TSK-07-03 E2E 전용 mdm.db 픽스처(design.md §3.1). 워크트리 격리 mdm.db 에만 적용한다. 운영·공유 DB 금지.
-- 운영 Flyway 시드가 아니다. 마루 데이터 생성·라벨 지정은 TSK-07-02 몫이라 e2e 가 쓸 행을 여기서 만든다.
-- mdm 기동(Flyway V10 적용) 뒤에만 넣는다. INSERT OR IGNORE 만 쓴다(재실행 안전). ID 는 E2E_DI_ 로 시작한다.
-- e2e 는 이 행들을 고치지 않고 읽기 확인에만 쓴다. 쓰기는 실행마다 새 키로 한다.
-- 일시는 '2026-08-20 09:00:00', 열린 끝은 '9999-12-31 00:00:00'. EXTERNAL 원천 ERP 는 V2 가 시드한다.

INSERT OR IGNORE INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, SOURCE_SYSTEM, CODE_PATTERN,
    ATTR01_NAME, ATTR03_NAME, LVL_CNT, LAST_CHG_SEQ, CHG_SEQ, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_DI_PORT', '항구', 'INUSE', 'MDM', NULL, '^[0-9A-Z]{1,20}$', '국가', '비고', 1, 0, 0, 'e2e-fixture', 'mdm-dataItem.sql', 0);
INSERT OR IGNORE INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, SOURCE_SYSTEM, CODE_PATTERN,
    ATTR01_NAME, LVL_CNT, LAST_CHG_SEQ, CHG_SEQ, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_DI_CUST', '거래처', 'INUSE', 'EXTERNAL', 'ERP', '^[0-9A-Z]{1,20}$', '사업자번호', 0, 0, 0, 'e2e-fixture', 'mdm-dataItem.sql', 0);

-- CK_TB_MDM_DATA_CATE_DEF: REGEX 는 DEF_EXPR·DEF_TARGET 둘 다 값, TABLE 은 둘 다 NULL.
INSERT OR IGNORE INTO TB_MDM_DATA_CATE (MARU_DATA_ID, CATE_ID, VALID_FROM, VALID_TO, CATE_NAME, DEF_KIND, DEF_EXPR, DEF_TARGET,
    CHG_SEQ, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_DI_PORT', 'BASE', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '전체', 'REGEX', '.*', 'KEY', 0, 'e2e-fixture', 'mdm-dataItem.sql', 0),
    ('E2E_DI_PORT', 'KR', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '한국 항구', 'REGEX', '^KR$', 'ATTR01', 0, 'e2e-fixture', 'mdm-dataItem.sql', 0),
    ('E2E_DI_PORT', 'MAJOR', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '주요 항구', 'TABLE', NULL, NULL, 0, 'e2e-fixture', 'mdm-dataItem.sql', 0),
    ('E2E_DI_CUST', 'BASE', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '전체', 'REGEX', '.*', 'KEY', 0, 'e2e-fixture', 'mdm-dataItem.sql', 0);

INSERT OR IGNORE INTO TB_MDM_DATA_ITEM (MARU_DATA_ID, CODE, VALID_FROM, VALID_TO, NAME, SEQ, ROW_VERSION, CHG_SEQ, LVL1, ATTR01,
    C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_DI_PORT', 'KRPUS', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '부산', 1, 0, 0, 'KR', 'KR', 'e2e-fixture', 'mdm-dataItem.sql', 0),
    ('E2E_DI_PORT', 'KRINC', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '인천', 2, 0, 0, 'KR', 'KR', 'e2e-fixture', 'mdm-dataItem.sql', 0),
    ('E2E_DI_PORT', 'CNSHA', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '상하이', 3, 0, 0, 'CN', 'CN', 'e2e-fixture', 'mdm-dataItem.sql', 0),
    ('E2E_DI_CUST', 'C0001', '2026-08-20 09:00:00', '9999-12-31 00:00:00', '동국철강', NULL, 0, 0, NULL, '1234567890', 'e2e-fixture', 'mdm-dataItem.sql', 0);

INSERT OR IGNORE INTO TB_MDM_DATA_CATE_ITEM (MARU_DATA_ID, CATE_ID, CODE, VALID_FROM, VALID_TO, CHG_SEQ, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_DI_PORT', 'MAJOR', 'KRPUS', '2026-08-20 09:00:00', '9999-12-31 00:00:00', 0, 'e2e-fixture', 'mdm-dataItem.sql', 0);
