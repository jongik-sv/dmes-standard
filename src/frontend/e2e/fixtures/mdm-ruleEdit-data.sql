-- TSK-08-02 E2E 전용 mdm.db 사전 픽스처(design.md §3.4.3, D10). seed-only — 워크트리 격리 mdm.db 에만 적용한다. 운영·공유 DB 금지.
-- 운영 Flyway 시드가 아니다. 열 편집(TSK-08-03)이 없어 변수가 있는 룰을 화면으로 만들 수 없으므로 06 샘플(06:85-90)을 직접 넣는다.
-- mdm 기동(Flyway V11 까지 적용) 뒤 한 번만 넣는다. INSERT 만(DELETE 없음).
-- 이 픽스처를 쓰는 mdm-ruleMng·mdm-ruleEdit 스펙은 룰을 만들고 고치므로 같은 mdm.db 로 다시 돌릴 수 없다(새 mdm.db 로 시작).
--   도메인 3 · 컬럼 3(COIL_THK NUMBER scale 2, COIL_WID NUMBER scale 0, SURF_GRD STRING)
--   QLTY_GRD_JDG — INUSE, VER 1 RELEASED(FIRST), 조건 3 · 결과 2(Value), 행 3 + 기본 행
--   E2E_LOCK_JDG — CREATED, VER 1 DRAFT 소유자 e2e_mdm_steward2(비소유자 잠금 시나리오)
--   LS_E2E       — QLTY_GRD_JDG 를 담은 룰 세트(활용처 카드)

INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, DESCRIPTION, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E 코일 두께', 'COIL_THK', 'QTY', 'NUMBER', 5, 2, '코일 두께(mm)', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E 코일 폭', 'COIL_WID', 'QTY', 'NUMBER', 5, 0, '코일 폭(mm)', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E 표면 등급', 'SURF_GRD', 'TEXT', 'STRING', 2, NULL, '표면 등급 문자', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 두께', '코일 두께', '두께', 'COIL_THK', '코일 한 개의 두께', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'COIL_THK' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 폭', '코일 폭', '폭', 'COIL_WID', '코일 한 개의 폭', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'COIL_WID' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '표면 등급', '표면 등급', '표면등급', 'SURF_GRD', '표면 품질 등급', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'SURF_GRD' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';

INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, DESCRIPTION, USAGE_NOTE,
                         LAST_VAR_ID, LAST_ROW_ID, LAST_CASE_ID, C_USR_ID, C_PGM_ID, VER) VALUES
    ('QLTY_GRD_JDG', '품질 등급 판정', 'DECISION', 'INUSE', 'MDM', '두께·폭·표면등급으로 품질 등급을 정한다', '3CCL 출측 판정',
     5, 4, 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_LOCK_JDG', 'E2E 잠금 판정', 'DECISION', 'CREATED', 'MDM', NULL, NULL,
     1, 1, 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, OWNER_ID, HIT_POLICY, APPLY_FROM, APPLY_TO, RELEASED_AT,
                             ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('QLTY_GRD_JDG', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00',
     0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_LOCK_JDG', 1, 'DRAFT', NULL, 'e2e_mdm_steward2', 'FIRST', NULL, NULL, NULL,
     0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('QLTY_GRD_JDG', 1, 1, 'COND', '2', 'COIL_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('QLTY_GRD_JDG', 1, 2, 'COND', '1', 'COIL_WID', NULL, 2, '폭', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('QLTY_GRD_JDG', 1, 3, 'COND', '1', 'SURF_GRD', NULL, 3, '표면등급', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('QLTY_GRD_JDG', 1, 4, 'RESULT', 'Value', 'QLTY_GRD', 'STRING', 1, '판정등급', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('QLTY_GRD_JDG', 1, 5, 'RESULT', 'Value', 'PRC_FCT', 'NUMBER', 2, '단가계수', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_LOCK_JDG', 1, 1, 'COND', '1', 'COIL_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('QLTY_GRD_JDG', 1, 1, 1, 'NORMAL',
     '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"GT","left":"1000"},"3":{"op":"IN","list":["A"]},"4":{"val":"A"},"5":{"val":"1.05"}}',
     '광폭 A급', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('QLTY_GRD_JDG', 1, 2, 2, 'NORMAL',
     '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"GT","left":"1000"},"3":{"op":"IN","list":["B"]},"4":{"val":"B"},"5":{"val":"1.00"}}',
     '광폭 B급', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('QLTY_GRD_JDG', 1, 3, 3, 'NORMAL',
     '{"1":{"op":"GE","left":"2.5"},"2":{"op":"NA"},"3":{"op":"NOT_IN","list":["C"]},"4":{"val":"B"},"5":{"val":"0.98"}}',
     '후물', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('QLTY_GRD_JDG', 1, 4, 0, 'DEFAULT', '{"4":{"val":"C"},"5":{"val":"0.90"}}', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_LOCK_JDG', 1, 1, 1, 'NORMAL', '{"1":{"op":"GE","left":"1"}}', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, STATUS, C_USR_ID, C_PGM_ID, VER) VALUES
    ('LS_E2E', 'E2E 룰 세트', '["QLTY_GRD_JDG"]', 'INUSE', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);
