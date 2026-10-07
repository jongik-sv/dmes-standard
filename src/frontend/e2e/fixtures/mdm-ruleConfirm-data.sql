-- Oracle(MDMAPUSER) 대상, 문장마다 ';' (BEGIN·COMMIT 없음 — 트랜잭션은 runSqlFile 도우미가 잡는다). 문자열 리터럴 안에 ';' 없음.
-- TSK-08-05 E2E 전용 MDMAPUSER 픽스처(design.md §3.4). seed-only — 워크트리 격리 시험 PDB 에만 적용한다. 운영·공유 DB 금지.
-- mdm 기동(Flyway) 뒤 넣는다. 자체 완결이다 — 사전 도메인·컬럼도 스스로 넣되, 다른 픽스처(mdm-ruleEdit-data.sql 등)가
-- 같은 이름을 이미 넣었으면 건너뛴다(NOT EXISTS). 룰은 E2E_RC_* 만 쓰고, 맨 앞에서 E2E_RC_* 를 지운 뒤 다시 넣으므로
-- 서버를 다시 띄우지 않고 이 파일을 다시 넣어 처음 상태로 돌릴 수 있다(e2e.md 「서버 프로세스」 재투입).
--   E2E_RC_OK       — CREATED, v1 DRAFT(FIRST, 최초 버전), 조건 2 · 결과 1, NORMAL 행 2, 기대값이 맞는 케이스 1 → 빈틈 경고만
--   E2E_RC_CASEFAIL — CREATED, v1 DRAFT, 같은 정의, 기대값이 틀린 케이스 1 → TEST_CASES 거부
--   E2E_RC_CONTRACT — INUSE, v1 RELEASED(2026-01-01~) + v2 DRAFT(필수 조건 변수 COIL_WID 추가) → 입력 계약 변경 경고
--   E2E_RC_RACE     — CREATED, v1 DRAFT, 케이스 없음 → 경합(스모크 4)
-- DRAFT 소유자는 모두 e2e_mdm_steward, ROW_VERSION 0.

DELETE FROM TB_MDM_RULE_TEST_CASE WHERE MARU_RULE_ID LIKE 'E2E\_RC\_%' ESCAPE '\';
DELETE FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID LIKE 'E2E\_RC\_%' ESCAPE '\';
DELETE FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID LIKE 'E2E\_RC\_%' ESCAPE '\';
DELETE FROM TB_MDM_RULE_SYSTEM WHERE MARU_RULE_ID LIKE 'E2E\_RC\_%' ESCAPE '\';
DELETE FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID LIKE 'E2E\_RC\_%' ESCAPE '\';
DELETE FROM TB_MDM_RULE_RECV WHERE MARU_RULE_ID LIKE 'E2E\_RC\_%' ESCAPE '\';
DELETE FROM TB_MDM_RULE WHERE MARU_RULE_ID LIKE 'E2E\_RC\_%' ESCAPE '\';

INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, DESCRIPTION, C_USR_ID, C_PGM_ID, VER)
SELECT 'E2E 코일 두께', 'COIL_THK', 'QTY', 'NUMBER', 5, 2, '코일 두께(mm)', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'COIL_THK')
   AND NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = 'COIL_THK' AND C_PGM_ID = 'mdm-ruleConfirm-data.sql');
INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, DESCRIPTION, C_USR_ID, C_PGM_ID, VER)
SELECT 'E2E 코일 폭', 'COIL_WID', 'QTY', 'NUMBER', 5, 0, '코일 폭(mm)', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'COIL_WID')
   AND NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = 'COIL_WID' AND C_PGM_ID = 'mdm-ruleConfirm-data.sql');
INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, DESCRIPTION, C_USR_ID, C_PGM_ID, VER)
SELECT 'E2E 표면 등급', 'SURF_GRD', 'TEXT', 'STRING', 2, NULL, '표면 등급 문자', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0
  FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'SURF_GRD')
   AND NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SURF_GRD' AND C_PGM_ID = 'mdm-ruleConfirm-data.sql');

INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 두께', '코일 두께', '두께', 'COIL_THK', '코일 한 개의 두께', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'COIL_THK' AND d.C_PGM_ID = 'mdm-ruleConfirm-data.sql'
   AND NOT EXISTS (SELECT 1 FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'COIL_THK');
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 폭', '코일 폭', '폭', 'COIL_WID', '코일 한 개의 폭', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'COIL_WID' AND d.C_PGM_ID = 'mdm-ruleConfirm-data.sql'
   AND NOT EXISTS (SELECT 1 FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'COIL_WID');
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '표면 등급', '표면 등급', '표면등급', 'SURF_GRD', '표면 품질 등급', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'SURF_GRD' AND d.C_PGM_ID = 'mdm-ruleConfirm-data.sql'
   AND NOT EXISTS (SELECT 1 FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'SURF_GRD');

INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, DESCRIPTION, USAGE_NOTE,
                         LAST_VAR_ID, LAST_ROW_ID, LAST_CASE_ID, C_USR_ID, C_PGM_ID, VER)
VALUES ('E2E_RC_OK', 'E2E 확정 정상', 'DECISION', 'CREATED', 'MDM', '두께·표면등급으로 품질 등급 — 확정 성공', NULL,
     3, 2, 1, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, DESCRIPTION, USAGE_NOTE,
                         LAST_VAR_ID, LAST_ROW_ID, LAST_CASE_ID, C_USR_ID, C_PGM_ID, VER)
VALUES ('E2E_RC_CASEFAIL', 'E2E 확정 케이스 실패', 'DECISION', 'CREATED', 'MDM', '기대값이 틀린 케이스 — 값 테스트 거부', NULL,
     3, 2, 1, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, DESCRIPTION, USAGE_NOTE,
                         LAST_VAR_ID, LAST_ROW_ID, LAST_CASE_ID, C_USR_ID, C_PGM_ID, VER)
VALUES ('E2E_RC_CONTRACT', 'E2E 확정 계약 변경', 'DECISION', 'INUSE', 'MDM', 'v2 가 필수 조건 변수 COIL_WID 를 더함 — 계약 변경 경고', NULL,
     4, 2, 0, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, DESCRIPTION, USAGE_NOTE,
                         LAST_VAR_ID, LAST_ROW_ID, LAST_CASE_ID, C_USR_ID, C_PGM_ID, VER)
VALUES ('E2E_RC_RACE', 'E2E 확정 경합', 'DECISION', 'CREATED', 'MDM', '다른 세션이 먼저 확정 — 스모크 4', NULL,
     3, 2, 0, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);

INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, OWNER_ID, HIT_POLICY, APPLY_FROM, APPLY_TO, RELEASED_AT,
                             ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_OK', 1, 'DRAFT', NULL, 'e2e_mdm_steward', 'FIRST', NULL, NULL, NULL, 0, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, OWNER_ID, HIT_POLICY, APPLY_FROM, APPLY_TO, RELEASED_AT,
                             ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CASEFAIL', 1, 'DRAFT', NULL, 'e2e_mdm_steward', 'FIRST', NULL, NULL, NULL, 0, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, OWNER_ID, HIT_POLICY, APPLY_FROM, APPLY_TO, RELEASED_AT,
                             ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 1, 'RELEASED', NULL, NULL, 'FIRST', TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '9999-12-31 00:00:00', TIMESTAMP '2026-01-01 00:00:00',
     0, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, OWNER_ID, HIT_POLICY, APPLY_FROM, APPLY_TO, RELEASED_AT,
                             ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 2, 'DRAFT', 1, 'e2e_mdm_steward', 'FIRST', NULL, NULL, NULL, 0, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, OWNER_ID, HIT_POLICY, APPLY_FROM, APPLY_TO, RELEASED_AT,
                             ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_RACE', 1, 'DRAFT', NULL, 'e2e_mdm_steward', 'FIRST', NULL, NULL, NULL, 0, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);

INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_OK', 1, 1, 'COND', '2', 'COIL_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_OK', 1, 2, 'COND', '1', 'SURF_GRD', NULL, 2, '표면등급', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_OK', 1, 3, 'RESULT', 'Value', 'QLTY_GRD', 'STRING', 1, '판정등급', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CASEFAIL', 1, 1, 'COND', '2', 'COIL_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CASEFAIL', 1, 2, 'COND', '1', 'SURF_GRD', NULL, 2, '표면등급', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CASEFAIL', 1, 3, 'RESULT', 'Value', 'QLTY_GRD', 'STRING', 1, '판정등급', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 1, 1, 'COND', '2', 'COIL_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 1, 2, 'COND', '1', 'SURF_GRD', NULL, 2, '표면등급', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 1, 3, 'RESULT', 'Value', 'QLTY_GRD', 'STRING', 1, '판정등급', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 2, 1, 'COND', '2', 'COIL_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 2, 2, 'COND', '1', 'SURF_GRD', NULL, 2, '표면등급', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 2, 4, 'COND', '1', 'COIL_WID', NULL, 3, '폭', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 2, 3, 'RESULT', 'Value', 'QLTY_GRD', 'STRING', 1, '판정등급', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_RACE', 1, 1, 'COND', '2', 'COIL_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_RACE', 1, 2, 'COND', '1', 'SURF_GRD', NULL, 2, '표면등급', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_RACE', 1, 3, 'RESULT', 'Value', 'QLTY_GRD', 'STRING', 1, '판정등급', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);

INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_OK', 1, 1, 1, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"IN","list":["A"]},"3":{"val":"A"}}', '중간 두께 A', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_OK', 1, 2, 2, 'NORMAL', '{"1":{"op":"GE","left":"2.5"},"2":{"op":"NA"},"3":{"val":"B"}}', '후물', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CASEFAIL', 1, 1, 1, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"IN","list":["A"]},"3":{"val":"A"}}', '중간 두께 A', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CASEFAIL', 1, 2, 2, 'NORMAL', '{"1":{"op":"GE","left":"2.5"},"2":{"op":"NA"},"3":{"val":"B"}}', '후물', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 1, 1, 1, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"IN","list":["A"]},"3":{"val":"A"}}', '중간 두께 A', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 1, 2, 2, 'NORMAL', '{"1":{"op":"GE","left":"2.5"},"2":{"op":"NA"},"3":{"val":"B"}}', '후물', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 2, 1, 1, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"IN","list":["A"]},"4":{"op":"GT","left":"1000"},"3":{"val":"A"}}', '중간 두께 A 광폭', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_CONTRACT', 2, 2, 2, 'NORMAL', '{"1":{"op":"GE","left":"2.5"},"2":{"op":"NA"},"4":{"op":"GT","left":"900"},"3":{"val":"B"}}', '후물 광폭', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_RACE', 1, 1, 1, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"IN","list":["A"]},"3":{"val":"A"}}', '중간 두께 A', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER)
VALUES ('E2E_RC_RACE', 1, 2, 2, 'NORMAL', '{"1":{"op":"GE","left":"2.5"},"2":{"op":"NA"},"3":{"val":"B"}}', '후물', 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);

INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, DESCRIPTION, ROW_VERSION, C_USR_ID, C_PGM_ID, VER)
VALUES ('E2E_RC_OK', 1, '중간 두께 A', '{"COIL_THK":2.0,"SURF_GRD":"A"}', '{"QLTY_GRD":"A","hit":1}', '기대값 맞음', 0, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, DESCRIPTION, ROW_VERSION, C_USR_ID, C_PGM_ID, VER)
VALUES ('E2E_RC_CASEFAIL', 1, '중간 두께 A', '{"COIL_THK":2.0,"SURF_GRD":"A"}', '{"QLTY_GRD":"B"}', '기대값 틀림(실제 A) — 확정 거부', 0, 'e2e-fixture', 'mdm-ruleConfirm-data.sql', 0);
