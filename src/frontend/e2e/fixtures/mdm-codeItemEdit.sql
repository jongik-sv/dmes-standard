-- TSK-06-03 E2E 전용 mdm.db 사전 픽스처(design.md §4.10). 워크트리 격리 mdm.db 에만 적용한다. 운영·공유 DB 금지.
-- 운영 Flyway 시드가 아니다. mdm 기동(Flyway V9 적용) 뒤에만 넣는다. INSERT 만(DELETE 없음).
-- RELEASED 버전은 CK_TB_MDM_CODE_VER_APPLY 때문에 APPLY_FROM·APPLY_TO 를 둘 다 채운다. 원천 MDM 이라 SOURCE_SYSTEM 은 NULL.
-- REGEX 카테고리는 CK_TB_MDM_CODE_CATE_DEF 때문에 DEF_TARGET 이 있어야 한다. 업무 일시는 19자 TEXT.
-- DRAFT 소유자는 e2e_mdm_steward, ROW_VERSION 0. mdm-codeItemEdit.spec.ts 가 행을 만들므로 같은 mdm.db 로 다시 돌릴 수 없다.

INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, STATUS, SOURCE_KIND, LVL_CNT, ATTR01_NAME, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_PROC',  '공정 코드(E2E)', 'INUSE', 'MDM', 0, '공장',     'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', '강종 규격(E2E)', 'INUSE', 'MDM', 3, '인장강도', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_EMPTY', '빈 코드(E2E)',   'INUSE', 'MDM', 0, NULL,       'e2e-fixture', 'mdm-codeItemEdit.sql', 0);

INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2E_PROC',  1.000, 'MAJOR', 'RELEASED', 'e2e_mdm_steward', '2024-01-01 00:00:00', '9999-12-31 00:00:00', 0, 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_PROC',  2.000, 'MAJOR', 'DRAFT',    'e2e_mdm_steward', NULL, NULL, 0, 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', 1.000, 'MAJOR', 'RELEASED', 'e2e_mdm_steward', '2026-01-01 00:00:00', '9999-12-31 00:00:00', 0, 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', 1.001, 'MINOR', 'DRAFT',    'e2e_mdm_steward', NULL, NULL, 0, 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_EMPTY', 1.000, 'MAJOR', 'DRAFT',    'e2e_mdm_steward', NULL, NULL, 0, 'e2e-fixture', 'mdm-codeItemEdit.sql', 0);

-- E2E_PROC: DRAFT 2.000 이 82 의 약칭을 고쳤다(82@2.000 — T5 의 경미 수정 거부 대상).
INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER, TO_VER, NAME, ALTER_NAME, SEQ, LVL1, LVL2, LVL3, ATTR01, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_PROC', '1P', 1.000, 9999, 'PLTCM', 'PLTCM', 11, NULL, NULL, NULL, '냉연', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_PROC', '82', 1.000, 2.000, '2CGL', 'CGL', 21, NULL, NULL, NULL, '도금', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_PROC', '82', 2.000, 9999, '2CGL', 'CGL2', 21, NULL, NULL, NULL, '도금', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_PROC', '83', 1.000, 9999, '3CGL', 'CGL', 22, NULL, NULL, NULL, '도금', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', 'KS-9', 1.000, 9999, '규격 외 KS', NULL, 9, 'KS', NULL, NULL, NULL, 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', 'KS-3-CGCC', 1.000, 9999, 'CGCC', NULL, 1, 'KS', 'KS-3', NULL, '270', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', 'KS-3-CGCD', 1.000, 9999, 'CGCD', NULL, 2, 'KS', 'KS-3', NULL, '270', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', 'KS-3-CGCH', 1.000, 9999, 'CGCH(기본)', NULL, 3, 'KS', 'KS-3', NULL, '270', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', 'KS-3-CGCH-Z12', 1.000, 9999, 'CGCH Z12', NULL, 1, 'KS', 'KS-3', 'KS-3-CGCH', '270', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', 'KS-3-CGCH-Z27', 1.000, 9999, 'CGCH Z27', NULL, 2, 'KS', 'KS-3', 'KS-3-CGCH', '270', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', 'JIS-3-CGCC', 1.000, 9999, 'CGCC(JIS)', NULL, 1, 'JIS', 'JIS-3', NULL, '270', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', 'JIS-4-SPCC', 1.000, 9999, 'SPCC', NULL, 1, 'JIS', 'JIS-4', NULL, '270', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0);

INSERT INTO TB_MDM_CODE_CATE (MARU_CODE_ID, CATE_ID, FROM_VER, TO_VER, CATE_NAME, DEF_KIND, DEF_EXPR, DEF_TARGET, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_PROC',  'BASE',    1.000, 9999, '전체',      'REGEX', '.*',     'CODE', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_PROC',  'COATING', 1.000, 9999, '도금 공정', 'REGEX', '8[0-9]', 'CODE', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_PROC',  'MAJOR',   1.000, 9999, '주요 공정', 'TABLE', NULL,     NULL,   'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_STEEL', 'BASE',    1.000, 9999, '전체',      'REGEX', '.*',     'CODE', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_EMPTY', 'BASE',    1.000, 9999, '전체',      'REGEX', '.*',     'CODE', 'e2e-fixture', 'mdm-codeItemEdit.sql', 0);

INSERT INTO TB_MDM_CODE_CATE_ITEM (MARU_CODE_ID, CATE_ID, CODE, FROM_VER, TO_VER, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_PROC', 'MAJOR', '1P', 1.000, 9999, 'e2e-fixture', 'mdm-codeItemEdit.sql', 0),
    ('E2E_PROC', 'MAJOR', '82', 1.000, 9999, 'e2e-fixture', 'mdm-codeItemEdit.sql', 0);
