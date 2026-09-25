-- TSK-06-05 E2E 전용 mdm.db 사전 픽스처(design.md §3.4). 워크트리 격리 mdm.db 에만 적용한다. 운영·공유 DB 금지.
-- 운영 Flyway 시드가 아니다. mdm 기동(Flyway 적용) 뒤에만 넣는다. INSERT 만(DELETE 없음).
-- 모두 MDM 원천, LVL_CNT 0, DRAFT 소유자 e2e_mdm_steward, ROW_VERSION 0.
--   E2E_CF_OK    — CREATED, 1.000 DRAFT(최초 버전). EMPTYC(REGEX Z.*) 가 적중 0건이라 2-2 경고 1건.
--   E2E_CF_NOCHG — INUSE, 1.000 RELEASED + 1.001 DRAFT(변경 없음) → 4항 거부.
--   E2E_CF_RACE  — CREATED, 1.000 DRAFT(최초 버전) → 스모크 4(다른 세션이 먼저 확정).
-- 확정이 원장을 바꾸므로 같은 mdm.db 로 다시 돌릴 수 없다(새 mdm.db + 픽스처로 다시 시작).
-- RELEASED 버전은 CK_TB_MDM_CODE_VER_APPLY 때문에 APPLY_FROM·APPLY_TO 를 둘 다 채운다.

INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, STATUS, SOURCE_KIND, LVL_CNT, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_CF_OK',    '확정 성공(E2E)',   'CREATED', 'MDM', 0, 'e2e-fixture', 'mdm-codeConfirm.sql', 0),
    ('E2E_CF_NOCHG', '변경 없음(E2E)',   'INUSE',   'MDM', 0, 'e2e-fixture', 'mdm-codeConfirm.sql', 0),
    ('E2E_CF_RACE',  '동시 확정(E2E)',   'CREATED', 'MDM', 0, 'e2e-fixture', 'mdm-codeConfirm.sql', 0);

INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2E_CF_OK',    1.000, 'MAJOR', 'DRAFT',    'e2e_mdm_steward', NULL, NULL, 0, 'e2e-fixture', 'mdm-codeConfirm.sql', 0),
    ('E2E_CF_NOCHG', 1.000, 'MAJOR', 'RELEASED', 'e2e_mdm_steward', '2026-01-01 00:00:00', '9999-12-31 00:00:00', 0, 'e2e-fixture', 'mdm-codeConfirm.sql', 0),
    ('E2E_CF_NOCHG', 1.001, 'MINOR', 'DRAFT',    'e2e_mdm_steward', NULL, NULL, 0, 'e2e-fixture', 'mdm-codeConfirm.sql', 0),
    ('E2E_CF_RACE',  1.000, 'MAJOR', 'DRAFT',    'e2e_mdm_steward', NULL, NULL, 0, 'e2e-fixture', 'mdm-codeConfirm.sql', 0);

INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER, TO_VER, NAME, SEQ, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_CF_OK',    'A1', 1.000, 9999, '에이1', 1, 'e2e-fixture', 'mdm-codeConfirm.sql', 0),
    ('E2E_CF_OK',    'A2', 1.000, 9999, '에이2', 2, 'e2e-fixture', 'mdm-codeConfirm.sql', 0),
    ('E2E_CF_NOCHG', 'B1', 1.000, 9999, '비1',   1, 'e2e-fixture', 'mdm-codeConfirm.sql', 0),
    ('E2E_CF_RACE',  'C1', 1.000, 9999, '씨1',   1, 'e2e-fixture', 'mdm-codeConfirm.sql', 0);

INSERT INTO TB_MDM_CODE_CATE (MARU_CODE_ID, CATE_ID, FROM_VER, TO_VER, CATE_NAME, DEF_KIND, DEF_EXPR, DEF_TARGET, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_CF_OK',    'BASE',   1.000, 9999, '전체',   'REGEX', '.*',  'CODE', 'e2e-fixture', 'mdm-codeConfirm.sql', 0),
    ('E2E_CF_OK',    'EMPTYC', 1.000, 9999, '빈 분류', 'REGEX', 'Z.*', 'CODE', 'e2e-fixture', 'mdm-codeConfirm.sql', 0),
    ('E2E_CF_NOCHG', 'BASE',   1.000, 9999, '전체',   'REGEX', '.*',  'CODE', 'e2e-fixture', 'mdm-codeConfirm.sql', 0),
    ('E2E_CF_RACE',  'BASE',   1.000, 9999, '전체',   'REGEX', '.*',  'CODE', 'e2e-fixture', 'mdm-codeConfirm.sql', 0);
