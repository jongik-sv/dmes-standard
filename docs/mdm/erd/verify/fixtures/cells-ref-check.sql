-- design.md 체크 h 용 샘플. RULE_ROW.cells → RULE_VAR.var_id, RULE_SET.rule_ids → TB_MDM_RULE 참조 검사(§6.5 쿼리)를
-- json_each 로 실행했을 때 댕글링 1건·정상 1건이 각각 잡히는지 확인한다. 00-system.sql 을 먼저 적용해야 한다(SOURCE_SYSTEM 없이 MDM 소스로 둠).

INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND) VALUES ('RH1', 'rule h1', 'DECISION', 'MDM');
INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND) VALUES ('RH2', 'rule h2', 'DECISION', 'MDM');
INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER) VALUES ('RH1', 1);
INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, SEQ, VAR_NAME) VALUES ('RH1', 1, 1, 'COND', 1, 'v1');

-- 정상 참조 1건: cells 의 key "1" 이 RULE_VAR.var_id=1 과 실재한다.
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES ('RH1', 1, 1, 1, 'NORMAL', '{"1":{"op":"EQ","value":"A"}}');
-- 댕글링 1건: cells 의 key "99" 는 어떤 RULE_VAR.var_id 에도 없다.
INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES ('RH1', 1, 2, 2, 'NORMAL', '{"99":{"op":"EQ","value":"B"}}');

-- RULE_SET.rule_ids 참조 검사: RH1 은 실재, NOPE 는 존재하지 않는 룰(댕글링).
INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS) VALUES ('RSH1', 'rule set h1', '["RH1","NOPE"]');
