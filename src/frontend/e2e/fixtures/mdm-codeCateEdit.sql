-- Oracle(MDMAPUSER) 대상. 문장 끝은 세미콜론으로 구분한다. 트랜잭션은 실행 도우미가 잡는다.
-- TSK-06-04 E2E 전용 mdm 사전 픽스처(design.md §2). 워크트리 격리 DB 에만 적용한다. 운영·공유 DB 금지.
-- 운영 Flyway 시드가 아니다. mdm 기동(Flyway 적용) 뒤에만 넣는다. INSERT 만(DELETE 없음).
-- DRAFT 소유자는 e2e_mdm_steward, ROW_VERSION 0. BASE 는 createBaseCategory 서비스 경로를 타지 않고 여기서 직접
-- INSERT 한다 — 빠뜨리면 BASE 숨김 검증(수용 기준 2)이 무의미해진다. E2E_CATE 는 REGEX·TABLE 카테고리를 편집하며 행을
-- 만들므로 같은 DB 로 다시 돌릴 수 없다(새 DB + 픽스처로 다시 시작). 이미 넣었는지는 LOADED_PROBE 가 막는다.

INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, STATUS, SOURCE_KIND, LVL_CNT, C_USR_ID, C_PGM_ID, VER)
SELECT 'E2E_CATE',       '카테고리 편집(E2E)', 'INUSE', 'MDM', 1, 'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL
UNION ALL
SELECT 'E2E_CATE_EMPTY', 'BASE 뿐(E2E)',       'INUSE', 'MDM', 0, 'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL;

INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER)
SELECT 'E2E_CATE',       1.000, 'MAJOR', 'DRAFT', 'e2e_mdm_steward', CAST(NULL AS TIMESTAMP), CAST(NULL AS TIMESTAMP), 0, 'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL
UNION ALL
SELECT 'E2E_CATE_EMPTY', 1.000, 'MAJOR', 'DRAFT', 'e2e_mdm_steward', CAST(NULL AS TIMESTAMP), CAST(NULL AS TIMESTAMP), 0, 'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL;

INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER, TO_VER, NAME, SEQ, LVL1, C_USR_ID, C_PGM_ID, VER)
SELECT 'E2E_CATE', 'A', 1.000, 9999, '에이', 1, 'G', 'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL
UNION ALL
SELECT 'E2E_CATE', 'B', 1.000, 9999, '비',  2, 'G', 'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL
UNION ALL
SELECT 'E2E_CATE', 'C', 1.000, 9999, '씨',  3, 'H', 'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL;

-- 성능 시나리오용 1,000건(CONNECT BY LEVEL) — 나머지 스모크는 위 소수 코드로 충분하다(BE 성능 측정은
-- CodeCateEditPerformanceSqliteTest, FE 성능 측정은 transfer.test.ts 가 JDBC/vitest 로 이미 따로 한다).
INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER, TO_VER, NAME, SEQ, LVL1, C_USR_ID, C_PGM_ID, VER)
SELECT 'E2E_CATE', 'P' || n, 1.000, 9999, '성능코드' || n, 100 + n, 'G', 'e2e-fixture', 'mdm-codeCateEdit.sql', 0
  FROM (SELECT LEVEL AS n FROM DUAL CONNECT BY LEVEL <= 1000);

INSERT INTO TB_MDM_CODE_CATE (MARU_CODE_ID, CATE_ID, FROM_VER, TO_VER, CATE_NAME, DEF_KIND, DEF_EXPR, DEF_TARGET, C_USR_ID, C_PGM_ID, VER)
SELECT 'E2E_CATE',       'BASE', 1.000, 9999, '전체',    'REGEX', '.*',   'CODE', 'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL
UNION ALL
SELECT 'E2E_CATE',       'RGX1', 1.000, 9999, '정규식1', 'REGEX', '[AB]', 'CODE', 'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL
UNION ALL
SELECT 'E2E_CATE',       'TBL1', 1.000, 9999, '표1',     'TABLE', NULL,   NULL,   'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL
UNION ALL
SELECT 'E2E_CATE_EMPTY', 'BASE', 1.000, 9999, '전체',    'REGEX', '.*',   'CODE', 'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL;

INSERT INTO TB_MDM_CODE_CATE_ITEM (MARU_CODE_ID, CATE_ID, CODE, FROM_VER, TO_VER, C_USR_ID, C_PGM_ID, VER)
SELECT 'E2E_CATE', 'TBL1', 'A', 1.000, 9999, 'e2e-fixture', 'mdm-codeCateEdit.sql', 0 FROM DUAL;
