-- TSK-08-06 E2E 전용 mdm.db 사전 픽스처(design.md §3.4.3). seed-only — 워크트리 격리 mdm.db 에만 적용한다. 운영·공유 DB 금지.
-- 운영 Flyway 시드가 아니다. 룰 세트 두 화면(dme/ruleSetMng·dme/ruleSetEdit) 스펙이 쓰는 도메인·컬럼·룰·세트를 스스로 넣는다(자체 완결).
-- mdm-ruleEdit-data.sql 에 기대지 않고, 같은 mdm.db 에 둘 다 넣어도 ID·물리명이 겹치지 않는다(E2S_·SET_·S_ 접두).
-- mdm 기동(Flyway 적용) 뒤 한 번만 넣는다. INSERT 만(DELETE 없음). 스펙이 세트를 만들고 고치므로 같은 mdm.db 로 다시 돌릴 수 없다(새 mdm.db 로 시작).
--   도메인 3 · 컬럼 3(SET_THK NUMBER scale 2, SET_WID NUMBER scale 0, SET_SURF STRING)
--   룰 9 — 모두 VER 1 RELEASED(FIRST), 조건 열 DISP '1'(이름 변수) · 결과 열 DISP 'Value', NORMAL 행 1 + DEFAULT 행 1
--     E2S_GRD(SET_THK, SET_SURF → S_GRD) · E2S_FCT(S_GRD, SET_WID → S_FCT) · E2S_SPD(S_FCT → S_SPD) · E2S_DUP(SET_WID → S_GRD)
--     E2S_CYA(S_CYB → S_CYA) · E2S_CYB(S_CYA → S_CYB) 순환 짝 · E2S_OLD(SET_THK → S_OLD, 룰 STATUS DEPRECATED)
--     · E2S_NODEF(SET_THK → S_NOD, 기본 행 없음 — 받는 노드 결과 없음 e2e E16)
--     · E2S_TAG(SET_THK → S_TAG — 하위 세트 e2e E19, 파일 끝 문장)
--   세트 10 — E2S_CHAIN · E2S_CONFIRM(확정 스펙 전용, E2S_CHAIN 과 같은 사슬) · E2S_BADORD · E2S_HASOLD · E2S_OLDSET(DEPRECATED) · E2S_CYCSET · E2S_GUIDESET(빈 목록) · E2S_FLOW(분기 흐름, FLOW_JSON) · E2S_CATCHSET(E2S_NODEF 한 줄) · E2S_IFEND(새 형식 IF — 합류 없음, e2e E18) (D-144 2단계: 부모 + 1.000 RELEASED)
--     FLOW_JSON 은 NULL(한 줄 흐름 = RULE_IDS 순서)이 기본이고 E2S_FLOW 만 P2 정규 JSON 을 갖는다(캔버스·디버거 e2e E11).
--   하위 세트 세트 3(e2e E19, 파일 끝 문장 — 위 세트 10 의 임시 표·DRAFT 문장과 따로 넣는다) — E2S_SUBA(부모가 될 한 줄 세트 [E2S_GRD], 담당자 DRAFT 2.000)
--     · E2S_SUBB(하위 세트 [E2S_GRD], 담당자 DRAFT 2.000) · E2S_SUBP(E2S_SUBB 를 부르는 확정된 부모 — SET 노드 흐름, CALL_SET_IDS ["E2S_SUBB"], RELEASED 1.000 만)

INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, DESCRIPTION, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2S 세트 두께', 'SET_THK', 'QTY', 'NUMBER', 5, 2, '세트 스펙용 두께(mm)', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S 세트 폭', 'SET_WID', 'QTY', 'NUMBER', 5, 0, '세트 스펙용 폭(mm)', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S 세트 표면', 'SET_SURF', 'TEXT', 'STRING', 2, NULL, '세트 스펙용 표면 등급 문자', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);

INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '세트 두께', '세트 두께', '두께', 'SET_THK', '세트 스펙용 두께', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'SET_THK' AND d.C_PGM_ID = 'mdm-ruleSet-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '세트 폭', '세트 폭', '폭', 'SET_WID', '세트 스펙용 폭', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'SET_WID' AND d.C_PGM_ID = 'mdm-ruleSet-data.sql';
INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, LABEL_LONG, LABEL_MID, PHYS_NAME, DESCRIPTION, DOMAIN_ID, C_USR_ID, C_PGM_ID, VER)
SELECT '세트 표면', '세트 표면', '표면', 'SET_SURF', '세트 스펙용 표면 등급', d.DOMAIN_ID, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0
  FROM TB_MDM_DOMAIN d WHERE d.STD_NAME = 'SET_SURF' AND d.C_PGM_ID = 'mdm-ruleSet-data.sql';

INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, DESCRIPTION, USAGE_NOTE,
                         LAST_VAR_ID, LAST_ROW_ID, LAST_CASE_ID, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2S_GRD', 'E2S 등급', 'DECISION', 'INUSE', 'MDM', '두께·표면으로 등급을 정한다', NULL, 3, 2, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_FCT', 'E2S 계수', 'DECISION', 'INUSE', 'MDM', '등급·폭으로 계수를 정한다', NULL, 3, 2, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SPD', 'E2S 속도', 'DECISION', 'INUSE', 'MDM', '계수로 속도를 정한다', NULL, 2, 2, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_DUP', 'E2S 등급 중복', 'DECISION', 'INUSE', 'MDM', '폭으로 같은 등급 변수를 정한다', NULL, 2, 2, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYA', 'E2S 순환 A', 'DECISION', 'INUSE', 'MDM', 'S_CYB 를 읽어 S_CYA 를 만든다', NULL, 2, 2, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYB', 'E2S 순환 B', 'DECISION', 'INUSE', 'MDM', 'S_CYA 를 읽어 S_CYB 를 만든다', NULL, 2, 2, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_OLD', 'E2S 폐기 룰', 'DECISION', 'DEPRECATED', 'MDM', '폐기된 룰', NULL, 2, 2, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_NODEF', 'E2S 기본 행 없음', 'DECISION', 'INUSE', 'MDM', '두께가 9 보다 크면 HI, 아니면 결과 없음', NULL, 2, 1, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);

INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, OWNER_ID, HIT_POLICY, APPLY_FROM, APPLY_TO, RELEASED_AT,
                             ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2S_GRD', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_FCT', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SPD', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_DUP', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYA', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYB', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_OLD', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_NODEF', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);

-- 조건 열의 DATA_TYPE 은 NULL(선언 없음) — 컬럼 사전에 없는 S_GRD·S_FCT·S_CYA·S_CYB 는 출처 NONE("어디에도 없음")이다.
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2S_GRD', 1, 1, 'COND', '1', 'SET_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_GRD', 1, 2, 'COND', '1', 'SET_SURF', NULL, 2, '표면', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_GRD', 1, 3, 'RESULT', 'Value', 'S_GRD', 'STRING', 1, '등급', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_FCT', 1, 1, 'COND', '1', 'S_GRD', NULL, 1, '등급', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_FCT', 1, 2, 'COND', '1', 'SET_WID', NULL, 2, '폭', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_FCT', 1, 3, 'RESULT', 'Value', 'S_FCT', 'NUMBER', 1, '계수', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SPD', 1, 1, 'COND', '1', 'S_FCT', NULL, 1, '계수', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SPD', 1, 2, 'RESULT', 'Value', 'S_SPD', 'NUMBER', 1, '속도', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_DUP', 1, 1, 'COND', '1', 'SET_WID', NULL, 1, '폭', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_DUP', 1, 2, 'RESULT', 'Value', 'S_GRD', 'STRING', 1, '등급', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYA', 1, 1, 'COND', '1', 'S_CYB', NULL, 1, '순환 B', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYA', 1, 2, 'RESULT', 'Value', 'S_CYA', 'NUMBER', 1, '순환 A', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYB', 1, 1, 'COND', '1', 'S_CYA', NULL, 1, '순환 A', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYB', 1, 2, 'RESULT', 'Value', 'S_CYB', 'NUMBER', 1, '순환 B', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_OLD', 1, 1, 'COND', '1', 'SET_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_OLD', 1, 2, 'RESULT', 'Value', 'S_OLD', 'NUMBER', 1, '폐기 값', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_NODEF', 1, 1, 'COND', '1', 'SET_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_NODEF', 1, 2, 'RESULT', 'Value', 'S_NOD', 'STRING', 1, '두께 등급', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);

INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2S_GRD', 1, 1, 1, 'NORMAL', '{"1":{"op":"NA"},"2":{"op":"NA"},"3":{"val":"A"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_GRD', 1, 2, 0, 'DEFAULT', '{"3":{"val":"C"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_FCT', 1, 1, 1, 'NORMAL', '{"1":{"op":"NA"},"2":{"op":"NA"},"3":{"val":"1.05"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_FCT', 1, 2, 0, 'DEFAULT', '{"3":{"val":"1.00"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SPD', 1, 1, 1, 'NORMAL', '{"1":{"op":"NA"},"2":{"val":"120"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SPD', 1, 2, 0, 'DEFAULT', '{"2":{"val":"100"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_DUP', 1, 1, 1, 'NORMAL', '{"1":{"op":"NA"},"2":{"val":"B"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_DUP', 1, 2, 0, 'DEFAULT', '{"2":{"val":"C"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYA', 1, 1, 1, 'NORMAL', '{"1":{"op":"NA"},"2":{"val":"1"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYA', 1, 2, 0, 'DEFAULT', '{"2":{"val":"0"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYB', 1, 1, 1, 'NORMAL', '{"1":{"op":"NA"},"2":{"val":"1"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYB', 1, 2, 0, 'DEFAULT', '{"2":{"val":"0"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_OLD', 1, 1, 1, 'NORMAL', '{"1":{"op":"NA"},"2":{"val":"1"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_OLD', 1, 2, 0, 'DEFAULT', '{"2":{"val":"0"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_NODEF', 1, 1, 1, 'NORMAL', '{"1":{"op":"GT","left":"9"},"2":{"val":"HI"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);

-- D-144 2단계: 세트는 부모(TB_MDM_RULE_SET) + 1.000 MAJOR RELEASED 버전 행(TB_MDM_RULE_SET_VER). 아래 값 행은 그대로 두고 임시 표를 거쳐 나눠 넣는다.
CREATE TEMP TABLE TMP_RULE_SET (MARU_RULE_SET_ID TEXT, MARU_RULE_SET_NAME TEXT, RULE_IDS TEXT, FLOW_JSON TEXT, DESCRIPTION TEXT,
    STATUS TEXT, ROW_VERSION INTEGER, C_USR_ID TEXT, C_AT TEXT, C_PGM_ID TEXT, U_USR_ID TEXT, U_AT TEXT, U_PGM_ID TEXT, VER INTEGER);
INSERT INTO TMP_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, FLOW_JSON, DESCRIPTION, STATUS, ROW_VERSION, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2S_CHAIN', 'E2E 사슬 세트', '["E2S_GRD","E2S_FCT","E2S_SPD"]', NULL, '등급 → 계수 → 속도', 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    -- 확정 스펙(mdm-ruleSetConfirm) 전용 — E2S_CHAIN 과 같은 사슬. 그 스펙이 2.000 을 확정하므로 편집·목록 스펙이 쓰는 E2S_CHAIN 과 나눈다.
    ('E2S_CONFIRM', 'E2E 확정 세트', '["E2S_GRD","E2S_FCT","E2S_SPD"]', NULL, '등급 → 계수 → 속도(확정 시나리오)', 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_BADORD', 'E2E 순서 뒤집힘 세트', '["E2S_FCT","E2S_GRD"]', NULL, NULL, 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_HASOLD', 'E2E 폐기 룰 세트', '["E2S_OLD"]', NULL, NULL, 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_OLDSET', 'E2E 폐기 세트', '["E2S_GRD"]', NULL, NULL, 'DEPRECATED', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CYCSET', 'E2E 순환 세트', '["E2S_GRD"]', NULL, NULL, 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_GUIDESET', 'E2E 지침 세트', '[]', NULL, NULL, 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    -- 분기 세트: start → r1(E2S_GRD) → if1 { e3 order1 cond 'S_GRD = "A"' → r2(E2S_FCT) ; e4 그 외 → m1 } → m1 → r3(E2S_SPD) → end.
    -- FLOW_JSON 은 서버 정규 JSON(RuleSetFlowJson.canonical, P2)과 글자가 같다(키 순서·null 쓰기·view 기본값). RULE_IDS 는 깊이 우선으로 펼친 중복 없는 룰 목록.
    ('E2S_FLOW', 'E2E 분기 흐름 세트', '["E2S_GRD","E2S_FCT","E2S_SPD"]',
     '{"version":1,"nodes":[{"id":"start","kind":"START","ruleId":null,"splitId":null,"label":null},{"id":"r1","kind":"RULE","ruleId":"E2S_GRD","splitId":null,"label":null},{"id":"if1","kind":"IF","ruleId":null,"splitId":null,"label":null},{"id":"r2","kind":"RULE","ruleId":"E2S_FCT","splitId":null,"label":null},{"id":"m1","kind":"MERGE","ruleId":null,"splitId":"if1","label":null},{"id":"r3","kind":"RULE","ruleId":"E2S_SPD","splitId":null,"label":null},{"id":"end","kind":"END","ruleId":null,"splitId":null,"label":null}],"edges":[{"id":"e1","from":"start","to":"r1","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e2","from":"r1","to":"if1","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e3","from":"if1","to":"r2","order":1,"cond":"S_GRD = \"A\"","otherwise":false,"label":"등급 A"},{"id":"e4","from":"if1","to":"m1","order":null,"cond":null,"otherwise":true,"label":"그 외"},{"id":"e5","from":"r2","to":"m1","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e6","from":"m1","to":"r3","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e7","from":"r3","to":"end","order":null,"cond":null,"otherwise":false,"label":null}],"view":{"positions":{},"notes":[],"groups":[]}}',
     '등급이 A 면 계수를 구하고 아니면 건너뛴 뒤 속도를 정한다', 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_CATCHSET', 'E2E 받는 노드 세트', '["E2S_NODEF"]', NULL, '결과 없음을 받는 노드로 처리한다', 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    -- 새 형식 분기 세트(D-136): start → r1(E2S_GRD) → if1(등급 확인) { e3 order1 'S_GRD = "A"' 「등급 A」 → r2(E2S_FCT) ; e4 그 외 → r3 } , r2 → r3(E2S_NODEF) → end. 합류 노드가 없다.
    ('E2S_IFEND', 'E2E 끝내는 갈래 세트', '["E2S_GRD","E2S_FCT","E2S_NODEF"]',
     '{"version":1,"nodes":[{"id":"start","kind":"START","ruleId":null,"splitId":null,"label":null},{"id":"r1","kind":"RULE","ruleId":"E2S_GRD","splitId":null,"label":null},{"id":"if1","kind":"IF","ruleId":null,"splitId":null,"label":"등급 확인"},{"id":"r2","kind":"RULE","ruleId":"E2S_FCT","splitId":null,"label":null},{"id":"r3","kind":"RULE","ruleId":"E2S_NODEF","splitId":null,"label":null},{"id":"end","kind":"END","ruleId":null,"splitId":null,"label":null}],"edges":[{"id":"e1","from":"start","to":"r1","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e2","from":"r1","to":"if1","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e3","from":"if1","to":"r2","order":1,"cond":"S_GRD = \"A\"","otherwise":false,"label":"등급 A"},{"id":"e4","from":"if1","to":"r3","order":null,"cond":null,"otherwise":true,"label":"그 외"},{"id":"e5","from":"r2","to":"r3","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e6","from":"r3","to":"end","order":null,"cond":null,"otherwise":false,"label":null}],"view":{"positions":{},"notes":[],"groups":[]}}',
     '등급이 A 면 계수를 구하고, 아니면 두께 등급을 정한다(새 형식 IF)', 'INUSE', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);
INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, DESCRIPTION, STATUS, C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, VER)
    SELECT MARU_RULE_SET_ID, MARU_RULE_SET_NAME, DESCRIPTION, COALESCE(STATUS, 'INUSE'), C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, VER FROM TMP_RULE_SET;
INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON, REQUESTED_BY,
    RELEASED_AT, ROW_VERSION, C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, AUD_VER)
    SELECT MARU_RULE_SET_ID, 1, 'MAJOR', 'RELEASED', '2000-01-01 00:00:00', '9999-12-31 00:00:00', RULE_IDS, FLOW_JSON, U_USR_ID,
           COALESCE(U_AT, C_AT, '2000-01-01 00:00:00'), COALESCE(ROW_VERSION, 0), C_USR_ID, C_AT, C_PGM_ID, U_USR_ID, U_AT, U_PGM_ID, 0
    FROM TMP_RULE_SET;
DROP TABLE TMP_RULE_SET;
-- 편집·확정 시나리오가 쓰는 세트(E2S_CHAIN·E2S_CONFIRM·E2S_FLOW·E2S_CATCHSET·E2S_IFEND·E2S_CYCSET·E2S_GUIDESET)에 담당자(e2e_mdm_steward) 소유 DRAFT 2.000 을 더한다.
-- 폐기 시나리오가 쓰는 세트(E2S_OLDSET 외)에는 넣지 않는다 — DRAFT 가 있으면 폐기가 막힌다(MDM006).
INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, RULE_IDS, FLOW_JSON, ROW_VERSION,
    C_USR_ID, C_PGM_ID, U_USR_ID, U_PGM_ID, AUD_VER)
    SELECT MARU_RULE_SET_ID, 2, 'MAJOR', 'DRAFT', 1, 'e2e_mdm_steward', RULE_IDS, FLOW_JSON, 0,
           'e2e-fixture', 'mdm-ruleSet-data.sql', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0
    FROM TB_MDM_RULE_SET_VER
    WHERE MARU_RULE_SET_ID IN ('E2S_CHAIN', 'E2S_CONFIRM', 'E2S_FLOW', 'E2S_CATCHSET', 'E2S_IFEND', 'E2S_CYCSET', 'E2S_GUIDESET') AND VER = 1;

-- ───────────────────────── 하위 세트 e2e E19(하위 세트 spec §12, 계획 Task 8) ─────────────────────────
-- 겉모양(SetCallIo)은 기준 시각의 RELEASED 로 계산하고, 부르는 세트(CALLERS·연쇄 재검사)는 부모 RELEASED 행의 CALL_SET_IDS 만 센다(Ruling 24·25).
-- 그래서 E2S_SUBB 를 부르는 확정된 부모 E2S_SUBP 를 고정 데이터로 둔다 — E2S_SUBB 의 DRAFT 를 E2S_TAG 를 더해 저장하면 겉모양 출력에 S_TAG 가 생기고,
-- E2S_SUBP 흐름(SET 노드 뒤 E2S_TAG)에 S_TAG 중복 대입 경고가 새로 생겨 저장 응답에 CALLER_WARN "부르는 세트에 경고가 생겼다: E2S_SUBP" 가 온다.
-- 기존 행은 고치지 않고 새 문장으로만 넣는다(룰 1 · 세트 3 · RELEASED 3 · DRAFT 2).
INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, DESCRIPTION, USAGE_NOTE,
                         LAST_VAR_ID, LAST_ROW_ID, LAST_CASE_ID, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2S_TAG', 'E2S 꼬리표', 'DECISION', 'INUSE', 'MDM', '두께로 꼬리표를 정한다(하위 세트 e2e E19)', NULL, 2, 2, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);
INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, OWNER_ID, HIT_POLICY, APPLY_FROM, APPLY_TO, RELEASED_AT,
                             ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2S_TAG', 1, 'RELEASED', NULL, NULL, 'FIRST', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '2026-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DATA_TYPE, SEQ, LABEL, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2S_TAG', 1, 1, 'COND', '1', 'SET_THK', NULL, 1, '두께', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_TAG', 1, 2, 'RESULT', 'Value', 'S_TAG', 'STRING', 1, '꼬리표', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS, NOTE, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2S_TAG', 1, 1, 1, 'NORMAL', '{"1":{"op":"NA"},"2":{"val":"T"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_TAG', 1, 2, 0, 'DEFAULT', '{"2":{"val":"-"}}', NULL, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);

INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, DESCRIPTION, STATUS, C_USR_ID, C_PGM_ID, VER) VALUES
    ('E2S_SUBA', 'E2E 하위 세트 부모', '하위 세트 e2e E19 — 시나리오가 E2S_SUBB 를 SET 노드로 넣는다', 'INUSE', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SUBB', 'E2E 하위 세트', '하위 세트 e2e E19 — 부르는 세트가 있는 하위 세트', 'INUSE', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SUBP', 'E2E 하위 세트 확정 부모', '하위 세트 e2e E19 — E2S_SUBB 를 부르는 확정된 세트', 'INUSE', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);
-- E2S_SUBP 흐름: start → s1(SET E2S_SUBB) → r1(E2S_TAG) → end. FLOW_JSON 은 서버 정규 JSON(RuleSetFlowJson.canonical — setId 는 SET 노드에만, label 뒤)과 글자가 같다.
INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON, CALL_SET_IDS,
    RELEASED_AT, ROW_VERSION, C_USR_ID, C_PGM_ID, AUD_VER) VALUES
    ('E2S_SUBA', 1, 'MAJOR', 'RELEASED', '2000-01-01 00:00:00', '9999-12-31 00:00:00', '["E2S_GRD"]', NULL, '[]',
     '2000-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SUBB', 1, 'MAJOR', 'RELEASED', '2000-01-01 00:00:00', '9999-12-31 00:00:00', '["E2S_GRD"]', NULL, '[]',
     '2000-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SUBP', 1, 'MAJOR', 'RELEASED', '2000-01-01 00:00:00', '9999-12-31 00:00:00', '["E2S_TAG"]',
     '{"version":1,"nodes":[{"id":"start","kind":"START","ruleId":null,"splitId":null,"label":null},{"id":"s1","kind":"SET","ruleId":null,"splitId":null,"label":null,"setId":"E2S_SUBB"},{"id":"r1","kind":"RULE","ruleId":"E2S_TAG","splitId":null,"label":null},{"id":"end","kind":"END","ruleId":null,"splitId":null,"label":null}],"edges":[{"id":"e1","from":"start","to":"s1","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e2","from":"s1","to":"r1","order":null,"cond":null,"otherwise":false,"label":null},{"id":"e3","from":"r1","to":"end","order":null,"cond":null,"otherwise":false,"label":null}],"view":{"positions":{},"notes":[],"groups":[]}}',
     '["E2S_SUBB"]', '2000-01-01 00:00:00', 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);
-- 편집 시나리오가 고치는 두 세트에 담당자 소유 DRAFT 2.000(RELEASED 1.000 의 흐름 그대로).
INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, BASE_VER, OWNER_ID, RULE_IDS, FLOW_JSON, ROW_VERSION,
    C_USR_ID, C_PGM_ID, U_USR_ID, U_PGM_ID, AUD_VER) VALUES
    ('E2S_SUBA', 2, 'MAJOR', 'DRAFT', 1, 'e2e_mdm_steward', '["E2S_GRD"]', NULL, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0),
    ('E2S_SUBB', 2, 'MAJOR', 'DRAFT', 1, 'e2e_mdm_steward', '["E2S_GRD"]', NULL, 0, 'e2e-fixture', 'mdm-ruleSet-data.sql', 'e2e-fixture', 'mdm-ruleSet-data.sql', 0);
