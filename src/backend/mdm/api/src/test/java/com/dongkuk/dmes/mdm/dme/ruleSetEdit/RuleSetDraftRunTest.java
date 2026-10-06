package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.RuleSetRunner;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 룰 세트 디버거·케이스 일괄 실행의 내 DRAFT 룰 시험(spec 2026-10-06 Task 2) — 요청 {@code ruleVersions}(RELEASED|MY_DRAFT)를 받아
 * 응답 {@code ruleVersions}·{@code draftVersions} 에 실제로 쓴 모드와 DRAFT 사용 룰·세트를 싣는다.
 *
 * <p>시드: R_A v1 RELEASED("old")·v2 kim DRAFT("new"), R_B v1 RELEASED("b1")·v2 lee DRAFT("b2"). 로그인 사용자는 kim.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
public class RuleSetDraftRunTest extends AbstractMdmSharedDbTest {

    static final String TS = "2026-03-01 09:00:00";
    static final String TS_EARLY = "2025-06-01 09:00:00";

    @Autowired RuleSetEditService service;
    @Autowired RuleSetRunner runner;
    @Autowired MutableCurrentUser currentUser;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        valueRule("R_A", 1, "RELEASED", null, "old");   // R_A v1 RELEASED → OUT_A "old"
        valueRule("R_A", 2, "DRAFT", "kim", "new");     // R_A v2 kim DRAFT → "new"
        valueRule("R_B", 1, "RELEASED", null, "b1");
        valueRule("R_B", 2, "DRAFT", "lee", "b2");      // 남의 DRAFT
        currentUser.set("kim", STEWARD);
    }

    /** 결과 열 하나(var 1, OUT_{ID 끝 글자}), 기본 행 하나. RELEASED 면 2026-01-01 부터. */
    private void valueRule(String id, int ver, String status, String owner, String value) {
        if (ver == 1) {
            DmeTestSupport.rule(jdbc, id, id + " 룰", "DECISION", "INUSE");
            jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 1, LAST_ROW_ID = 1 WHERE MARU_RULE_ID = ?", id);
        }
        if ("RELEASED".equals(status)) {
            DmeTestSupport.released(jdbc, id, ver, "FIRST", "2026-01-01 00:00:00", null);
        } else {
            DmeTestSupport.pending(jdbc, id, ver, status, owner, "FIRST", 1);
        }
        String out = "OUT_" + id.substring(id.length() - 1);
        DmeTestSupport.var(jdbc, id, ver, 1, "RESULT", "Value", out, 1, "STRING");
        DmeTestSupport.row(jdbc, id, ver, 1, 0, "DEFAULT", "{\"1\":{\"val\":\"" + value + "\"}}");
    }

    private static RuleSetSimulateRequest req(String flowJson, String evalTs, String mode) {
        RuleSetSimulateRequest r = new RuleSetSimulateRequest();
        r.setFlowJson(flowJson);
        r.setRecordJson("{}");
        r.setEvalTs(evalTs);
        r.setRuleVersions(mode);
        return r;
    }

    private static final String FLOW_AB = DmeTestSupport.line(DmeTestSupport.ruleNode("n1", "R_A"), DmeTestSupport.ruleNode("n2", "R_B"));

    /** 기록의 최종값 칸({@code finalValues}) 중 {@code name} 의 글자 값. */
    private static String finalText(RuleSetSimulateResult result, String name) {
        Map<?, ?> finals = (Map<?, ?>) result.getTrace().get("finalValues");
        return String.valueOf(((Map<?, ?>) finals.get(name)).get("value"));
    }

    @Test
    void MY_DRAFT_는_내_DRAFT_룰로_실행하고_draftVersions_에_싣는다() {
        RuleSetSimulateResult r = service.simulate(req(FLOW_AB, TS, "MY_DRAFT"));
        assertEquals("new", finalText(r, "OUT_A"));
        assertEquals("b1", finalText(r, "OUT_B"));                 // 남의 DRAFT 는 RELEASED
        assertEquals("MY_DRAFT", r.getRuleVersions());
        assertEquals(Map.of("R_A", "2.000"), ((Map<?, ?>) r.getDraftVersions().get("rules")));
        assertEquals(Map.of(), r.getDraftVersions().get("sets"));
    }

    @Test
    void 빈_모드와_RELEASED_는_지금과_같다() {
        RuleSetSimulateResult r = service.simulate(req(FLOW_AB, TS, null));
        assertEquals("old", finalText(r, "OUT_A"));
        assertEquals("RELEASED", r.getRuleVersions());
        assertEquals(Map.of("rules", Map.of(), "sets", Map.of()), r.getDraftVersions());
    }

    @Test
    void 판정_시각이_일러도_DRAFT_는_고른다() {
        // R_B 는 RELEASED 가 2026-01-01 부터라 이른 시각엔 적용 버전이 없다. R_A 한 노드만 돌려 DRAFT 선택만 본다.
        String flow = DmeTestSupport.line(DmeTestSupport.ruleNode("n1", "R_A"));
        RuleSetSimulateResult r = service.simulate(req(flow, TS_EARLY, "MY_DRAFT"));
        assertEquals("new", finalText(r, "OUT_A"));
    }

    @Test
    void 잘못된_모드_값은_거부한다() {
        BusinessException e = assertThrows(BusinessException.class, () -> service.simulate(req(FLOW_AB, TS, "DRAFT")));
        assertEquals("룰 버전은 RELEASED 또는 MY_DRAFT 여야 합니다: DRAFT", e.getMessage());
    }

    @Test
    void 사용자를_모르면_RELEASED_로_돌리고_경고한다() {
        currentUser.set(null, STEWARD);
        RuleSetSimulateResult r = service.simulate(req(FLOW_AB, TS, "MY_DRAFT"));
        assertEquals("old", finalText(r, "OUT_A"));
        assertEquals("RELEASED", r.getRuleVersions());
        assertEquals("DRAFT_USER_UNKNOWN", r.getWarnings().get(0).get("code"));
    }

    @Test
    void 하위_DRAFT_세트로_실행하고_calledFlows_는_DRAFT_흐름이다() {
        DmeTestSupport.ruleSet(jdbc, "S_SUB", "하위", "[\"R_B\"]", "INUSE", 0);
        DmeTestSupport.ruleSetDraft(jdbc, "S_SUB", "2.000", "kim", "[\"R_A\"]", 0);
        String flow = DmeTestSupport.line(DmeTestSupport.setNode("s1", "S_SUB"));
        RuleSetSimulateResult r = service.simulate(req(flow, TS, "MY_DRAFT"));
        assertEquals("new", finalText(r, "OUT_A"));
        assertEquals(Map.of("S_SUB", "2.000"), r.getDraftVersions().get("sets"));
        assertEquals(List.of("R_A"), ((Map<?, ?>) r.getCalledFlows().get("S_SUB")).get("ruleIds"));
    }

    @Test
    void 케이스_일괄_실행도_모드를_따르고_draftVersions_는_한_묶음() {
        DmeTestSupport.ruleSet(jdbc, "S_T", "시험 세트", "[\"R_A\"]", "INUSE", 0);
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EVAL_TS, EXPECTED_JSON) "
                + "VALUES ('S_T', 1, 'c1', '{}', ?, '{\"OUT_A\":\"new\"}')", TS);
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EVAL_TS, EXPECTED_JSON) "
                + "VALUES ('S_T', 2, 'c2', '{}', ?, '{\"OUT_A\":\"new\"}')", TS_EARLY);
        RuleSetSimulateRequest q = req(DmeTestSupport.line(DmeTestSupport.ruleNode("n1", "R_A")), null, "MY_DRAFT");
        q.setSetId("S_T");
        q.setRunCases(true);
        RuleSetSimulateResult r = service.simulate(q);
        assertEquals(List.of(true, true), r.getCases().stream().map(c -> c.get("pass")).toList());
        assertEquals(Map.of("R_A", "2.000"), r.getDraftVersions().get("rules"));
    }

    @Test
    void RELEASED_와_execute_는_DRAFT_를_읽지_않는다() {
        DmeTestSupport.ruleSet(jdbc, "S_RUN", "운영 세트", "[\"R_A\"]", "INUSE", 0);
        RuleSetRunRequest run = new RuleSetRunRequest();
        run.setSetId("S_RUN");
        run.setEvalTs(TS);
        assertEquals("old", String.valueOf(runner.execute(run).getFinalValues().get("OUT_A")));
        assertEquals("old", finalText(service.simulate(req(FLOW_AB, TS, "RELEASED")), "OUT_A"));
    }
}
