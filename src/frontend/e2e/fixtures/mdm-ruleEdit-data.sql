-- TSK-08-02 E2E 전용 mdm.db 사전 픽스처(design.md §3.4.3, D10). seed-only — 워크트리 격리 mdm.db 에만 적용한다. 운영·공유 DB 금지.
-- 운영 Flyway 시드가 아니다. 열 편집(TSK-08-03)이 없어 변수가 있는 룰을 화면으로 만들 수 없으므로 06 샘플(06:85-90)을 직접 넣는다.
-- mdm 기동(Flyway V11 까지 적용) 뒤 한 번만 넣는다. INSERT 만(DELETE 없음).
-- 이 픽스처를 쓰는 mdm-ruleMng·mdm-ruleEdit 스펙은 룰을 만들고 고치므로 같은 mdm.db 로 다시 돌릴 수 없다(새 mdm.db 로 시작).
--   도메인 3 · 컬럼 3(COIL_THK NUMBER scale 2, COIL_WID NUMBER scale 0, SURF_GRD STRING)
--   QLTY_GRD_JDG — INUSE, VER 1 RELEASED(FIRST), 조건 3 · 결과 2(Value), 행 3 + 기본 행
--   E2E_LOCK_JDG — CREATED, VER 1 DRAFT 소유자 e2e_mdm_steward2(비소유자 잠금 시나리오)
--   LS_E2E       — QLTY_GRD_JDG 를 담은 룰 세트(활용처 카드) (D-144 2단계: 부모 + 1.000 RELEASED)

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

-- D-144 2단계: 세트는 부모(TB_MDM_RULE_SET) + 1.000 MAJOR RELEASED 버전 행(TB_MDM_RULE_SET_VER). 아래 값 행은 그대로 두고 임시 표를 거쳐 나눠 넣는다.
CREATE TEMP TABLE TMP_RULE_SET (MARU_RULE_SET_ID TEXT, MARU_RULE_SET_NAME TEXT, RULE_IDS TEXT, FLOW_JSON TEXT, DESCRIPTION TEXT,
    STATUS TEXT, ROW_VERSION INTEGER, C_USR_ID TEXT, C_AT TEXT, C_PGM_ID TEXT, U_USR_ID TEXT, U_AT TEXT, U_PGM_ID TEXT, VER INTEGER);
INSERT INTO TMP_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, STATUS, C_USR_ID, C_PGM_ID, VER) VALUES
    ('LS_E2E', 'E2E 룰 세트', '["QLTY_GRD_JDG"]', 'INUSE', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);
INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, DESCRIPTION, STATUS, C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, VER)
    SELECT MARU_RULE_SET_ID, MARU_RULE_SET_NAME, DESCRIPTION, COALESCE(STATUS, 'INUSE'), C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, VER FROM TMP_RULE_SET;
INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON, REQUESTED_BY,
    RELEASED_AT, ROW_VERSION, C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, AUD_VER)
    SELECT MARU_RULE_SET_ID, 1, 'MAJOR', 'RELEASED', '2000-01-01 00:00:00', '9999-12-31 00:00:00', RULE_IDS, FLOW_JSON, U_USR_ID,
           COALESCE(U_AT, C_AT, '2000-01-01 00:00:00'), COALESCE(ROW_VERSION, 0), C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, 0
    FROM TMP_RULE_SET;
DROP TABLE TMP_RULE_SET;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- TSK-08-03 추가분(design.md §2.3·§3.3): 06 샘플(mdm-local-sample.sql) 룰을 E2E 용으로 옮긴다.
--   BASE_SPD_LKP v1 RELEASED + v2 DRAFT(결과 열 그룹 8열) · COIL_WGT_CALC v1 RELEASED(DERIVE) · PROD_WGT_CALC v1 RELEASED + v2 DRAFT
--   E2E_PVT_LKP v1 DRAFT(피벗 편집 모양: 행 축 COIL_THK 구간 7 × 열 축 TOP_RESIN_CD 2값 × 결과 BASE_SPD 1개, 14행)
--   DRAFT 소유자는 e2e_mdm_steward. 위 기존 룰 행은 바꾸지 않는다. 사전 도메인·컬럼은 룰 변수·식이 읽는 것만(단위·코드 FK 는 비운다).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, DESCRIPTION, C_USR_ID, C_PGM_ID, VER) VALUES
    ('중량 산출 기준 코드', 'CALC_BASIS_CD', 'CODE', 'STRING', 3, NULL, '중량 산출 기준. LEN(길이)·DIA(외경·내경)', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('이름 20자', 'NAME20', 'TEXT', 'STRING', 20, NULL, '20자 이하 이름', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('길이(mm)', 'LEN_MM', 'QTY', 'NUMBER', 6, 0, '길이·지름. 밀리미터', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('길이(m)', 'LEN_M', 'QTY', 'NUMBER', 6, 1, '긴 길이. 미터', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('비율(%)', 'PCT', 'QTY', 'NUMBER', 5, 2, '백분율. 0-100', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('코일 중량', 'COIL_WGT', 'QTY', 'NUMBER', NULL, NULL, '코일 한 개의 중량. 30 ton 이하.', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('제품 형태 코드', 'PROD_TYPE_CD', 'CODE', 'STRING', 5, NULL, '제품 형태. COIL·SHEET', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('중량(kg)', 'WGT_KG', 'QTY', 'NUMBER', 9, 1, '무게. 킬로그램', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('수량', 'QTY', 'QTY', 'NUMBER', 6, 0, '개수·매수', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('비중(g/cm³)', 'SG', 'QTY', 'NUMBER', 5, 3, '물질의 비중. g/cm³', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('속도(m/min)', 'SPEED_MPM', 'QTY', 'NUMBER', 4, 1, '속도. 분당 미터', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '중량 산출 기준', '중량 산출 기준', '산출 기준', 'CALC_BASIS', '코일 중량을 길이로 구할지(LEN) 외경·내경으로 구할지(DIA)', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'CALC_BASIS_CD' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '도장 면', '도장 면', '도장 면', 'COAT_SIDE', '도장 면. 1 단면, 2 양면(AS-IS 도막구분)', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'NAME20' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 내경', '코일 내경', '코일 내경', 'COIL_IN_DIA', '코일 안쪽 지름(mm). 보통 508·610·762', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'LEN_MM' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 길이', '코일 길이', '코일 길이', 'COIL_LEN', '코일의 길이(m)', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'LEN_M' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 외경', '코일 외경', '코일 외경', 'COIL_OUT_DIA', '코일 바깥 지름(mm)', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'LEN_MM' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 공극률', '코일 공극률', '코일 공극률', 'COIL_VOID_RT', '감긴 코일 부피 가운데 판 사이 빈틈의 비율(%)', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'PCT' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '코일 중량', '코일 중량', '코일 중량', 'COIL_WGT', '코일 한 개의 중량(ton). M305 에서 단위 항목과 함께 보낸다', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'COIL_WGT' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '제품 형태', '제품 형태', '제품 형태', 'PROD_TYPE', '코일 또는 시트(잘라 겹쳐 쌓은 판)', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'PROD_TYPE_CD' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '제품 중량', '제품 중량', '제품 중량', 'PROD_WGT', '제품의 이론 중량(kg)', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'WGT_KG' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '시트 매수', '시트 매수', '시트 매수', 'SHEET_CNT', '한 묶음의 시트 장수', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'QTY' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '시트 길이', '시트 길이', '시트 길이', 'SHEET_LEN', '시트 한 장의 길이(mm)', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'LEN_MM' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '강종 비중', '강종 비중', '강종 비중', 'SPEC_GRAV', '강종의 비중(g/cm³). 강은 7.85 안팎', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'SG' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '상도 수지 코드', '상도 수지 코드', '상도 수지', 'TOP_RESIN_CD', '상도 수지 코드', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'NAME20' AND d.C_PGM_ID = 'mdm-ruleEdit-data.sql';

INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, DESCRIPTION, USAGE_NOTE,
                         LAST_VAR_ID, LAST_ROW_ID, LAST_CASE_ID, C_USR_ID, C_PGM_ID, VER) VALUES
    ('BASE_SPD_LKP', '기본 L/S 조회', 'DECISION', 'INUSE', 'MDM', '두께 구간과 칼라 BOM 수지 코드·도장 면으로 기본 라인스피드(mpm)', 'LS_A3 1단계. 결과 열 그룹 BASE_SPD', 9, 7, 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('COIL_WGT_CALC', '코일 중량 산출', 'DERIVE', 'INUSE', 'MDM', '두께 × 폭 × 길이 × 비중으로 코일 이론 중량(kg)', '계산수식 시뮬레이션. 배포 대상 없음. MES·ERP가 각자 구현하고 값 테스트 결과와 맞춰 본다', 1, 1, 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', '제품 중량 산출', 'DECISION', 'INUSE', 'MDM', '코일은 두께 × 폭 × 길이(m) × 비중 또는 π/4 × (외경² − 내경²) × 폭 × (1 − 공극률) × 비중, 시트는 두께 × 폭 × 길이(mm) × 매수 × 비중', '계산수식 시뮬레이션. 배포 대상 없음', 3, 3, 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 'E2E 피벗 L/S 조회', 'DECISION', 'CREATED', 'MDM', '두께 구간 × 상도 수지 코드로 기본 라인스피드(mpm) — 피벗 편집 데모', '피벗 편집 확인용. BASE_SPD_LKP 원본 표의 축소판', 3, 14, 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, OWNER_ID, HIT_POLICY, APPLY_FROM, APPLY_TO, RELEASED_AT,
                             ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('BASE_SPD_LKP', 1, 'RELEASED', NULL, NULL, 'UNIQUE', '2026-09-01 00:00:00', '9999-12-31 00:00:00', '2026-09-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 'DRAFT', 1, 'e2e_mdm_steward', 'UNIQUE', NULL, NULL, NULL, 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('COIL_WGT_CALC', 1, 'RELEASED', NULL, NULL, NULL, '2026-09-15 00:00:00', '9999-12-31 00:00:00', '2026-09-15 00:00:00', 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 1, 'RELEASED', NULL, NULL, 'UNIQUE', '2026-09-20 00:00:00', '9999-12-31 00:00:00', '2026-09-20 00:00:00', 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 2, 'DRAFT', 1, 'e2e_mdm_steward', 'UNIQUE', NULL, NULL, NULL, 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 'DRAFT', NULL, 'e2e_mdm_steward', 'UNIQUE', NULL, NULL, NULL, 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, AXIS, VAR_NAME, VAR_AST, DOMAIN_ID, DATA_TYPE, COLLECT_AGG, PRIO_LIST,
                             RES_GRP, GRP_COND, GRP_COND_AST, SEQ, LABEL, DESCRIPTION, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('BASE_SPD_LKP', 1, 1, 'COND', '2', 'NONE', 'COIL_THK', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, '두께', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 2, 'RESULT', 'Value', NULL, 'TEXTURE', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "2")', '{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"2"}]}', 1, '질감', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 3, 'RESULT', 'Value', NULL, 'AKZO', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "6")', '{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"6"}]}', 2, 'AKZO 도료', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 4, 'RESULT', 'Value', NULL, 'FLUORO', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'TOP_RESIN_CD == "F"', '{"type":"INFIX_OPERATOR","value":"==","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"F"}]}', 3, '불소', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 5, 'RESULT', 'Value', NULL, 'WXL1', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "1"', '{"type":"INFIX_OPERATOR","value":"&&","params":[{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"W"}]},{"type":"INFIX_OPERATOR","value":"==","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COAT_SIDE"},{"type":"STRING_LITERAL","value":"1"}]}]}', 4, 'WEATHER XL 단면', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 6, 'RESULT', 'Value', NULL, 'WXL2', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "2"', '{"type":"INFIX_OPERATOR","value":"&&","params":[{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"W"}]},{"type":"INFIX_OPERATOR","value":"==","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COAT_SIDE"},{"type":"STRING_LITERAL","value":"2"}]}]}', 5, 'WEATHER XL 양면', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 7, 'RESULT', 'Value', NULL, 'BACK1', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "1"', '{"type":"INFIX_OPERATOR","value":"&&","params":[{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"B"}]},{"type":"INFIX_OPERATOR","value":"==","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COAT_SIDE"},{"type":"STRING_LITERAL","value":"1"}]}]}', 6, 'Back 도료 단면', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 8, 'RESULT', 'Value', NULL, 'BACK2', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "2"', '{"type":"INFIX_OPERATOR","value":"&&","params":[{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"B"}]},{"type":"INFIX_OPERATOR","value":"==","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COAT_SIDE"},{"type":"STRING_LITERAL","value":"2"}]}]}', 7, 'Back 도료 양면', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 9, 'RESULT', 'Value', NULL, 'GENERAL', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', NULL, NULL, 8, '일반', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 1, 'COND', '2', 'NONE', 'COIL_THK', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, '두께', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 2, 'RESULT', 'Value', NULL, 'TEXTURE', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "2")', '{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"2"}]}', 1, '질감', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 3, 'RESULT', 'Value', NULL, 'AKZO', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "6")', '{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"6"}]}', 2, 'AKZO 도료', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 4, 'RESULT', 'Value', NULL, 'FLUORO', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'TOP_RESIN_CD == "F"', '{"type":"INFIX_OPERATOR","value":"==","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"F"}]}', 3, '불소', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 5, 'RESULT', 'Value', NULL, 'WXL1', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "1"', '{"type":"INFIX_OPERATOR","value":"&&","params":[{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"W"}]},{"type":"INFIX_OPERATOR","value":"==","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COAT_SIDE"},{"type":"STRING_LITERAL","value":"1"}]}]}', 4, 'WEATHER XL 단면', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 6, 'RESULT', 'Value', NULL, 'WXL2', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "2"', '{"type":"INFIX_OPERATOR","value":"&&","params":[{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"W"}]},{"type":"INFIX_OPERATOR","value":"==","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COAT_SIDE"},{"type":"STRING_LITERAL","value":"2"}]}]}', 5, 'WEATHER XL 양면', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 7, 'RESULT', 'Value', NULL, 'BACK1', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "1"', '{"type":"INFIX_OPERATOR","value":"&&","params":[{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"B"}]},{"type":"INFIX_OPERATOR","value":"==","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COAT_SIDE"},{"type":"STRING_LITERAL","value":"1"}]}]}', 6, 'Back 도료 단면', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 8, 'RESULT', 'Value', NULL, 'BACK2', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', 'STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "2"', '{"type":"INFIX_OPERATOR","value":"&&","params":[{"type":"FUNCTION","value":"STR_STARTS_WITH","params":[{"type":"VARIABLE_OR_CONSTANT","value":"TOP_RESIN_CD"},{"type":"STRING_LITERAL","value":"B"}]},{"type":"INFIX_OPERATOR","value":"==","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COAT_SIDE"},{"type":"STRING_LITERAL","value":"2"}]}]}', 7, 'Back 도료 양면', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 9, 'RESULT', 'Value', NULL, 'GENERAL', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, 'BASE_SPD', NULL, NULL, 8, '일반', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('COIL_WGT_CALC', 1, 1, 'RESULT', 'Expression', NULL, 'COIL_WGT', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'WGT_KG' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, NULL, NULL, NULL, 1, '코일 중량', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 1, 1, 'COND', 'Equal', 'NONE', 'PROD_TYPE', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, '제품 형태', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 1, 2, 'RESULT', 'Expression', NULL, 'PROD_WGT', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'WGT_KG' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, NULL, NULL, NULL, 1, '제품 중량', '이론 중량이다. 실측 중량과 다를 수 있다', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 1, 3, 'COND', 'Equal', 'NONE', 'CALC_BASIS', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2, '산출 기준', '코일만 본다. 시트는 무관', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 2, 1, 'COND', 'Equal', 'NONE', 'PROD_TYPE', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, '제품 형태', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 2, 2, 'RESULT', 'Expression', NULL, 'PROD_WGT', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'WGT_KG' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, NULL, NULL, NULL, 1, '제품 중량', '이론 중량이다. 실측 중량과 다를 수 있다', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 2, 3, 'COND', 'Equal', 'NONE', 'CALC_BASIS', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2, '산출 기준', '코일만 본다. 시트는 무관', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 1, 'COND', '2', 'ROW', 'COIL_THK', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1, '두께', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 2, 'COND', 'Equal', 'COL', 'TOP_RESIN_CD', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 2, '상도 수지', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 3, 'RESULT', 'Value', NULL, 'BASE_SPD', NULL, (SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM' AND C_PGM_ID = 'mdm-ruleEdit-data.sql'), NULL, NULL, NULL, NULL, NULL, NULL, 1, '기본 L/S', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, TAG, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('BASE_SPD_LKP', 1, 1, 1, 'NORMAL', '{"1":{"op":"< 변수 <=","left":"0","right":"0.5"},"2":{"val":"100"},"3":{"val":"100"},"4":{"val":"90"},"5":{"val":"110"},"6":{"val":"110"},"7":{"val":"110"},"8":{"val":"110"},"9":{"val":"120"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 2, 2, 'NORMAL', '{"1":{"op":"< 변수 <","left":"0.5","right":"0.6"},"2":{"val":"100"},"3":{"val":"100"},"4":{"val":"90"},"5":{"val":"110"},"6":{"val":"110"},"7":{"val":"110"},"8":{"val":"110"},"9":{"val":"110"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 3, 3, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.6","right":"0.7"},"2":{"val":"90"},"3":{"val":"90"},"4":{"val":"80"},"5":{"val":"100"},"6":{"val":"100"},"7":{"val":"100"},"8":{"val":"100"},"9":{"val":"100"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 4, 4, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.7","right":"0.8"},"2":{"val":"80"},"3":{"val":"80"},"4":{"val":"70"},"5":{"val":"90"},"6":{"val":"90"},"7":{"val":"90"},"8":{"val":"90"},"9":{"val":"90"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 5, 5, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.8","right":"0.9"},"2":{"val":"70"},"3":{"val":"70"},"4":{"val":"60"},"5":{"val":"80"},"6":{"val":"80"},"7":{"val":"80"},"8":{"val":"80"},"9":{"val":"80"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 6, 6, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.9","right":"1"},"2":{"val":"60"},"3":{"val":"60"},"4":{"val":"50"},"5":{"val":"70"},"6":{"val":"70"},"7":{"val":"70"},"8":{"val":"70"},"9":{"val":"70"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 1, 7, 7, 'NORMAL', '{"1":{"op":"<= 변수 <=","left":"1","right":"1.2"},"2":{"val":"50"},"3":{"val":"50"},"4":{"val":"50"},"5":{"val":"70"},"6":{"val":"70"},"7":{"val":"60"},"8":{"val":"60"},"9":{"val":"60"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 1, 1, 'NORMAL', '{"1":{"op":"< 변수 <=","left":"0","right":"0.5"},"2":{"val":"100"},"3":{"val":"100"},"4":{"val":"90"},"5":{"val":"110"},"6":{"val":"110"},"7":{"val":"110"},"8":{"val":"110"},"9":{"val":"120"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 2, 2, 'NORMAL', '{"1":{"op":"< 변수 <","left":"0.5","right":"0.6"},"2":{"val":"100"},"3":{"val":"100"},"4":{"val":"90"},"5":{"val":"110"},"6":{"val":"110"},"7":{"val":"110"},"8":{"val":"110"},"9":{"val":"110"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 3, 3, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.6","right":"0.7"},"2":{"val":"90"},"3":{"val":"90"},"4":{"val":"80"},"5":{"val":"100"},"6":{"val":"100"},"7":{"val":"100"},"8":{"val":"100"},"9":{"val":"100"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 4, 4, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.7","right":"0.8"},"2":{"val":"80"},"3":{"val":"80"},"4":{"val":"70"},"5":{"val":"90"},"6":{"val":"90"},"7":{"val":"90"},"8":{"val":"90"},"9":{"val":"90"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 5, 5, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.8","right":"0.9"},"2":{"val":"70"},"3":{"val":"70"},"4":{"val":"60"},"5":{"val":"80"},"6":{"val":"80"},"7":{"val":"80"},"8":{"val":"80"},"9":{"val":"80"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 6, 6, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.9","right":"1"},"2":{"val":"60"},"3":{"val":"60"},"4":{"val":"50"},"5":{"val":"70"},"6":{"val":"70"},"7":{"val":"70"},"8":{"val":"70"},"9":{"val":"70"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('BASE_SPD_LKP', 2, 7, 7, 'NORMAL', '{"1":{"op":"<= 변수 <=","left":"1","right":"1.2"},"2":{"val":"50"},"3":{"val":"50"},"4":{"val":"50"},"5":{"val":"70"},"6":{"val":"70"},"7":{"val":"60"},"8":{"val":"60"},"9":{"val":"60"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('COIL_WGT_CALC', 1, 1, 1, 'NORMAL', '{"1":{"expr":"ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_THK"},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_WID"}]},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_LEN"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SPEC_GRAV"}]},{"type":"NUMBER_LITERAL","value":"1000"}]},{"type":"NUMBER_LITERAL","value":"1"}]}}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 1, 1, 1, 'NORMAL', '{"1":{"op":"EQ","left":"COIL"},"3":{"op":"EQ","left":"LEN"},"2":{"expr":"ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_THK"},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_WID"}]},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_LEN"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SPEC_GRAV"}]},{"type":"NUMBER_LITERAL","value":"1000"}]},{"type":"NUMBER_LITERAL","value":"1"}]}}}', '코일을 길이로 구한다. 두께 × 폭 × 길이 × 비중', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 1, 2, 3, 'NORMAL', '{"1":{"op":"EQ","left":"SHEET"},"3":{"op":"NA"},"2":{"expr":"ROUND(COIL_THK * COIL_WID * SHEET_LEN * SHEET_CNT * SPEC_GRAV / 1000000, 1)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_THK"},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_WID"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SHEET_LEN"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SHEET_CNT"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SPEC_GRAV"}]},{"type":"NUMBER_LITERAL","value":"1000000"}]},{"type":"NUMBER_LITERAL","value":"1"}]}}}', '시트는 한 장 부피에 매수를 곱한다', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 1, 3, 2, 'NORMAL', '{"1":{"op":"EQ","left":"COIL"},"3":{"op":"EQ","left":"DIA"},"2":{"expr":"ROUND(PI / 4 * (COIL_OUT_DIA ^ 2 - COIL_IN_DIA ^ 2) * COIL_WID * (1 - COIL_VOID_RT / 100) * SPEC_GRAV / 1000000, 1)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"VARIABLE_OR_CONSTANT","value":"PI"},{"type":"NUMBER_LITERAL","value":"4"}]},{"type":"INFIX_OPERATOR","value":"-","params":[{"type":"INFIX_OPERATOR","value":"^","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_OUT_DIA"},{"type":"NUMBER_LITERAL","value":"2"}]},{"type":"INFIX_OPERATOR","value":"^","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_IN_DIA"},{"type":"NUMBER_LITERAL","value":"2"}]}]}]},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_WID"}]},{"type":"INFIX_OPERATOR","value":"-","params":[{"type":"NUMBER_LITERAL","value":"1"},{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_VOID_RT"},{"type":"NUMBER_LITERAL","value":"100"}]}]}]},{"type":"VARIABLE_OR_CONSTANT","value":"SPEC_GRAV"}]},{"type":"NUMBER_LITERAL","value":"1000000"}]},{"type":"NUMBER_LITERAL","value":"1"}]}}}', '코일을 외경·내경으로 구한다. 공극률만큼 뺀다', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 2, 1, 1, 'NORMAL', '{"1":{"op":"EQ","left":"COIL"},"3":{"op":"EQ","left":"LEN"},"2":{"expr":"ROUND(COIL_THK * COIL_WID * COIL_LEN * COALESCE(SPEC_GRAV, 7.85) / 1000, 1)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_THK"},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_WID"}]},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_LEN"}]},{"type":"FUNCTION","value":"COALESCE","params":[{"type":"VARIABLE_OR_CONSTANT","value":"SPEC_GRAV"},{"type":"NUMBER_LITERAL","value":"7.85"}]}]},{"type":"NUMBER_LITERAL","value":"1000"}]},{"type":"NUMBER_LITERAL","value":"1"}]}}}', '코일을 길이로 구한다. 두께 × 폭 × 길이 × 비중', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 2, 2, 3, 'NORMAL', '{"1":{"op":"EQ","left":"SHEET"},"3":{"op":"NA"},"2":{"expr":"ROUND(COIL_THK * COIL_WID * SHEET_LEN * SHEET_CNT * COALESCE(SPEC_GRAV, 7.85) / 1000000, 1)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_THK"},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_WID"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SHEET_LEN"}]},{"type":"VARIABLE_OR_CONSTANT","value":"SHEET_CNT"}]},{"type":"FUNCTION","value":"COALESCE","params":[{"type":"VARIABLE_OR_CONSTANT","value":"SPEC_GRAV"},{"type":"NUMBER_LITERAL","value":"7.85"}]}]},{"type":"NUMBER_LITERAL","value":"1000000"}]},{"type":"NUMBER_LITERAL","value":"1"}]}}}', '시트는 한 장 부피에 매수를 곱한다', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('PROD_WGT_CALC', 2, 3, 2, 'NORMAL', '{"1":{"op":"EQ","left":"COIL"},"3":{"op":"EQ","left":"DIA"},"2":{"expr":"ROUND(PI / 4 * (COIL_OUT_DIA ^ 2 - COIL_IN_DIA ^ 2) * COIL_WID * (1 - COIL_VOID_RT / 100) * COALESCE(SPEC_GRAV, 7.85) / 1000000, 1)","ast":{"type":"FUNCTION","value":"ROUND","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"*","params":[{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"VARIABLE_OR_CONSTANT","value":"PI"},{"type":"NUMBER_LITERAL","value":"4"}]},{"type":"INFIX_OPERATOR","value":"-","params":[{"type":"INFIX_OPERATOR","value":"^","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_OUT_DIA"},{"type":"NUMBER_LITERAL","value":"2"}]},{"type":"INFIX_OPERATOR","value":"^","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_IN_DIA"},{"type":"NUMBER_LITERAL","value":"2"}]}]}]},{"type":"VARIABLE_OR_CONSTANT","value":"COIL_WID"}]},{"type":"INFIX_OPERATOR","value":"-","params":[{"type":"NUMBER_LITERAL","value":"1"},{"type":"INFIX_OPERATOR","value":"/","params":[{"type":"VARIABLE_OR_CONSTANT","value":"COIL_VOID_RT"},{"type":"NUMBER_LITERAL","value":"100"}]}]}]},{"type":"FUNCTION","value":"COALESCE","params":[{"type":"VARIABLE_OR_CONSTANT","value":"SPEC_GRAV"},{"type":"NUMBER_LITERAL","value":"7.85"}]}]},{"type":"NUMBER_LITERAL","value":"1000000"}]},{"type":"NUMBER_LITERAL","value":"1"}]}}}', '코일을 외경·내경으로 구한다. 공극률만큼 뺀다', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 1, 1, 'NORMAL', '{"1":{"op":"< 변수 <=","left":"0","right":"0.5"},"2":{"op":"EQ","left":"2A"},"3":{"val":"100"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 2, 2, 'NORMAL', '{"1":{"op":"< 변수 <=","left":"0","right":"0.5"},"2":{"op":"EQ","left":"6A"},"3":{"val":"100"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 3, 3, 'NORMAL', '{"1":{"op":"< 변수 <","left":"0.5","right":"0.6"},"2":{"op":"EQ","left":"2A"},"3":{"val":"100"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 4, 4, 'NORMAL', '{"1":{"op":"< 변수 <","left":"0.5","right":"0.6"},"2":{"op":"EQ","left":"6A"},"3":{"val":"100"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 5, 5, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.6","right":"0.7"},"2":{"op":"EQ","left":"2A"},"3":{"val":"90"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 6, 6, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.6","right":"0.7"},"2":{"op":"EQ","left":"6A"},"3":{"val":"90"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 7, 7, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.7","right":"0.8"},"2":{"op":"EQ","left":"2A"},"3":{"val":"80"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 8, 8, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.7","right":"0.8"},"2":{"op":"EQ","left":"6A"},"3":{"val":"80"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 9, 9, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.8","right":"0.9"},"2":{"op":"EQ","left":"2A"},"3":{"val":"70"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 10, 10, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.8","right":"0.9"},"2":{"op":"EQ","left":"6A"},"3":{"val":"70"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 11, 11, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.9","right":"1"},"2":{"op":"EQ","left":"2A"},"3":{"val":"60"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 12, 12, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"0.9","right":"1"},"2":{"op":"EQ","left":"6A"},"3":{"val":"60"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 13, 13, 'NORMAL', '{"1":{"op":"<= 변수 <=","left":"1","right":"1.2"},"2":{"op":"EQ","left":"2A"},"3":{"val":"50"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_PVT_LKP', 1, 14, 14, 'NORMAL', '{"1":{"op":"<= 변수 <=","left":"1","right":"1.2"},"2":{"op":"EQ","left":"6A"},"3":{"val":"50"}}', NULL, NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- TSK-08-04 추가분(design.md §3.4): 값 테스트·테스트 케이스 E2E 용 룰. QLTY_GRD_JDG 는 S4~S6 이 바꾸므로 값 테스트는 이 룰로만 한다.
--   E2E_VT_JDG — INUSE, UNIQUE, v1 RELEASED + v2 DRAFT(소유 e2e_mdm_steward, v1 과 같은 행), 조건 COIL_THK(2)·SURF_GRD(1), 결과 QLTY_GRD Value,
--                행 3 + 기본 행. 테스트 케이스 2건(1: 기대값 맞음, 2: 기대값 틀림 — 실패 시연), LAST_CASE_ID = 2(0 이면 화면 케이스 저장이 PK 충돌).
--   COIL_THK·SURF_GRD 컬럼은 위 TSK-08-02 분을 쓴다. 세트에 담지 않는다(세트 순서 검사와 무관하게).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, DESCRIPTION, USAGE_NOTE,
                         LAST_VAR_ID, LAST_ROW_ID, LAST_CASE_ID, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_VT_JDG', 'E2E 값 테스트 판정', 'DECISION', 'INUSE', 'MDM', '두께·표면등급으로 품질 등급을 정한다 — 값 테스트 E2E', '값 테스트·테스트 케이스 확인용',
     3, 4, 2, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, OWNER_ID, HIT_POLICY, APPLY_FROM, APPLY_TO, RELEASED_AT,
                             ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2E_VT_JDG', 1, 'RELEASED', NULL, NULL, 'UNIQUE', '2026-09-01 00:00:00', '9999-12-31 00:00:00', '2026-09-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 2, 'DRAFT', 1, 'e2e_mdm_steward', 'UNIQUE', NULL, NULL, NULL, 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2E_VT_JDG', 1, 1, 'COND', '2', 'COIL_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 1, 2, 'COND', '1', 'SURF_GRD', NULL, 2, '표면등급', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 1, 3, 'RESULT', 'Value', 'QLTY_GRD', 'STRING', 1, '판정등급', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 2, 1, 'COND', '2', 'COIL_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 2, 2, 'COND', '1', 'SURF_GRD', NULL, 2, '표면등급', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 2, 3, 'RESULT', 'Value', 'QLTY_GRD', 'STRING', 1, '판정등급', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2E_VT_JDG', 1, 1, 1, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"IN","list":["A"]},"3":{"val":"A"}}', '중간 두께 A', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 1, 2, 2, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"IN","list":["B"]},"3":{"val":"B"}}', '중간 두께 B', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 1, 3, 3, 'NORMAL', '{"1":{"op":"GE","left":"2.5"},"2":{"op":"NA"},"3":{"val":"B"}}', '후물', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 1, 4, 0, 'DEFAULT', '{"3":{"val":"C"}}', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 2, 1, 1, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"IN","list":["A"]},"3":{"val":"A"}}', '중간 두께 A', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 2, 2, 2, 'NORMAL', '{"1":{"op":"<= 변수 <","left":"1.6","right":"2.5"},"2":{"op":"IN","list":["B"]},"3":{"val":"B"}}', '중간 두께 B', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 2, 3, 3, 'NORMAL', '{"1":{"op":"GE","left":"2.5"},"2":{"op":"NA"},"3":{"val":"B"}}', '후물', 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 2, 4, 0, 'DEFAULT', '{"3":{"val":"C"}}', NULL, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);

INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, DESCRIPTION, ROW_VERSION, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2E_VT_JDG', 1, '중간 두께 A', '{"COIL_THK":2.0,"SURF_GRD":"A"}', '{"QLTY_GRD":"A","hit":1}', '기대값 맞음', 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0),
    ('E2E_VT_JDG', 2, '후물 C', '{"COIL_THK":3.0,"SURF_GRD":"C"}', '{"QLTY_GRD":"A"}', '기대값 틀림(실제 B) — 실패 시연', 0, 'e2e-fixture', 'mdm-ruleEdit-data.sql', 0);
