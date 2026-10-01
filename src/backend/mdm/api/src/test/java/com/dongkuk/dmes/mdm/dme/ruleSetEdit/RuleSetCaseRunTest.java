package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.RuleSetRunner;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * 세트 테스트 케이스 일괄 실행({@code execute runCases}, 흐름도 3단계 P7) — 판정 왕복(Review Focus 1)·값 비교 규칙(P-D3·P-D4)·오류 케이스·
 * 판정 시각·실행 상한(P-D5). 흐름은 골든 {@code IF_FIRST_TRUE}(GT_THK 12 → GT_G "A" → GT_F 1).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetCaseRunTest extends AbstractMdmSharedDbTest {

    static final String SET = "S_RUN";
    static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;
    @MockitoSpyBean
    RuleSetRunner runner;

    String flow;

    @BeforeEach
    void seed() {
        RuleSetSimulateTest.seedGolden(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        DmeTestSupport.ruleSet(jdbc, SET, "실행 세트", "[]", "INUSE", 0);
        flow = RuleSetSimulateTest.golden("IF_FIRST_TRUE").flowJson();
        Mockito.reset(runner);
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    /** 케이스를 JDBC 로 바로 넣는다(저장 상한 50 은 서비스 규칙이라 JDBC 는 넘을 수 있다). */
    private void putCase(int id, String input, String evalTs, String expected) {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EVAL_TS, EXPECTED_JSON) "
                + "VALUES (?, ?, ?, ?, ?, ?)", SET, id, "케이스" + id, input, evalTs, expected);
    }

    private RuleSetSimulateResult run(String flowJson, String setId, String caseIds) {
        RuleSetSimulateRequest r = new RuleSetSimulateRequest();
        r.setFlowJson(flowJson);
        r.setSetId(setId);
        r.setRunCases(true);
        r.setCaseIds(caseIds);
        return service.simulate(r);
    }

    private Map<String, Object> only(RuleSetSimulateResult r, int caseId) {
        return r.getCases().stream().filter(c -> caseId == (Integer) c.get("caseId")).findFirst().orElseThrow();
    }

    /** 화면 expectedFromFinal 과 같은 규칙 — NUMBER 는 value 문자열, STRING 문자열, BOOLEAN 불린, NULL null. */
    @SuppressWarnings("unchecked")
    private static String expectedFromFinal(Map<String, Object> finalValues) throws Exception {
        Map<String, Object> out = new LinkedHashMap<>();
        finalValues.forEach((k, v) -> {
            Map<String, Object> typed = (Map<String, Object>) v;
            String type = (String) typed.get("type");
            out.put(k, "NULL".equals(type) ? null : typed.get("value"));
        });
        return JSON.writeValueAsString(out);
    }

    @Test
    @SuppressWarnings("unchecked")
    void 실행_결과로_채운_기대값을_케이스로_저장해_돌리면_통과한다_왕복() throws Exception {
        String input = RuleSetSimulateTest.golden("IF_FIRST_TRUE").recordJson();
        RuleSetSimulateRequest sim = new RuleSetSimulateRequest();
        sim.setFlowJson(flow);
        sim.setRecordJson(input);
        Map<String, Object> finals = (Map<String, Object>) service.simulate(sim).getTrace().get("finalValues");
        String expected = expectedFromFinal(finals);

        RuleSetSaveRequest save = new RuleSetSaveRequest();
        save.setPart("CASE");
        save.setSetId(SET);
        save.setCaseName("왕복");
        save.setInputJson(input);
        save.setExpectedJson(expected);
        service.save(save);

        RuleSetSimulateResult out = run(flow, SET, "");
        assertNull(out.getTrace());
        assertEquals(List.of(), out.getWarnings());
        assertEquals(1, out.getCases().size());
        assertEquals(Boolean.TRUE, out.getCases().get(0).get("pass"), out.getCases().get(0).toString());
        assertEquals("OK", out.getCases().get(0).get("outcome"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void 값은_숫자_비교_키는_대소문자_무시_입력_이름_기대는_결과에_없음_실패() {
        String in = "{\"GT_THK\":\"12\"}";
        putCase(1, in, null, "{\"GT_F\":\"1.0\",\"gt_g\":\"A\"}");
        putCase(2, in, null, "{\"GT_THK\":\"12\"}");
        putCase(3, in, null, "{\"GT_G\":\"B\"}");
        putCase(4, in, null, null);
        RuleSetSimulateResult out = run(flow, SET, "");

        assertEquals(Boolean.TRUE, only(out, 1).get("pass"), only(out, 1).toString());
        assertEquals(Boolean.FALSE, only(out, 2).get("pass"));
        Map<String, Object> m2 = ((List<Map<String, Object>>) only(out, 2).get("mismatches")).get(0);
        assertEquals("GT_THK", m2.get("key"));
        assertEquals("12", m2.get("expected"));
        assertNull(m2.get("actual"));
        assertEquals(Boolean.FALSE, only(out, 3).get("pass"));
        Map<String, Object> m3 = ((List<Map<String, Object>>) only(out, 3).get("mismatches")).get(0);
        assertEquals("GT_G", m3.get("key"));
        assertEquals("A", m3.get("actual"));
        assertNull(only(out, 4).get("pass"));
        assertEquals("OK", only(out, 4).get("outcome"));
        assertEquals(Map.of("GT_G", "A", "GT_F", "1"), only(out, 4).get("finalValues"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void 실행_오류는_기대값이_없어도_실패이고_깨진_저장_입력은_INVALID_INPUT_JSON() {
        putCase(1, "{}", null, null);
        putCase(2, "{\"GT_THK\":\"12\"}", null, null);
        jdbc.update("UPDATE TB_MDM_RULE_SET_TEST_CASE SET INPUT_JSON = '[1]' WHERE CASE_ID = 2");
        RuleSetSimulateResult out = run(flow, SET, "");

        Map<String, Object> missing = only(out, 1);
        assertEquals("ERROR", missing.get("outcome"));
        assertEquals(Boolean.FALSE, missing.get("pass"));
        assertEquals("MISSING_KEY", ((List<Map<String, Object>>) missing.get("errors")).get(0).get("code"));

        Map<String, Object> broken = only(out, 2);
        assertEquals("ERROR", broken.get("outcome"));
        assertEquals(Boolean.FALSE, broken.get("pass"));
        assertEquals("INVALID_INPUT_JSON", ((List<Map<String, Object>>) broken.get("errors")).get(0).get("code"));
    }

    @Test
    void caseIds_로_거르고_숫자가_아니면_대상_없음_흐름은_요청_것으로_돈다() {
        String in = "{\"GT_THK\":\"12\"}";
        putCase(1, in, null, "{\"GT_G\":\"A\",\"GT_F\":\"1\"}");
        putCase(2, in, null, "{\"GT_G\":\"A\"}");
        RuleSetSimulateResult two = run(flow, SET, "2");
        assertEquals(1, two.getCases().size());
        assertEquals(2, two.getCases().get(0).get("caseId"));
        assertEquals(0, run(flow, SET, "x").getCases().size());

        // 요청 흐름의 IF 조건을 바꾸면 같은 케이스의 결과가 달라진다 — 저장된 흐름이 아니라 요청 흐름으로 돈다.
        String changed = flow.replace("GT_G = \\\"A\\\"", "GT_G = \\\"Z\\\"");
        assertFalse(changed.equals(flow), "조건식 치환이 일어나지 않았다: " + flow);
        RuleSetSimulateResult other = run(changed, SET, "1");
        assertEquals(Boolean.FALSE, other.getCases().get(0).get("pass"), other.getCases().get(0).toString());
    }

    @Test
    @SuppressWarnings("unchecked")
    void 케이스_판정_시각이_있으면_그_시각으로_돈다() {
        putCase(1, "{\"GT_THK\":\"12\"}", "2025-01-01 00:00:00", "{\"GT_G\":\"A\"}");
        Map<String, Object> c = run(flow, SET, "").getCases().get(0);
        assertEquals("ERROR", c.get("outcome"), c.toString());
        assertEquals(Boolean.FALSE, c.get("pass"));
        assertFalse(((List<Map<String, Object>>) c.get("errors")).isEmpty());
    }

    @Test
    void 세트_ID_가_없으면_거부한다() {
        BusinessException e = assertThrows(BusinessException.class, () -> run(flow, " ", ""));
        assertEquals("룰 세트 ID 는 필수입니다.", e.getMessage());
    }

    @Test
    void 한_번에_50건까지_51건이면_아무것도_돌리지_않고_MDM021_caseIds_로_거르면_돈다() {
        for (int i = 1; i <= 51; i++) {
            putCase(i, "{\"GT_THK\":\"12\"}", null, "{\"GT_G\":\"A\"}");
        }
        BusinessException e = assertThrows(BusinessException.class, () -> run(flow, SET, ""));
        assertTrue(e.getMessage().contains("한 번에 51건을 돌리려 한다. 50건까지 돌린다"), e.getMessage());
        verify(runner, never()).session();

        String fifty = String.join(",", java.util.stream.IntStream.rangeClosed(1, 50).mapToObj(String::valueOf).toList());
        assertEquals(50, run(flow, SET, fifty).getCases().size());
    }

    @Test
    void runCases_는_editsJson_을_읽지_않는다_잘못된_JSON_이어도_돈다() {
        putCase(1, "{\"GT_THK\":\"12\"}", RuleSetSimulateTest.EVAL_TS, "{\"GT_G\":\"A\"}");
        RuleSetSimulateRequest r = new RuleSetSimulateRequest();
        r.setFlowJson(flow);
        r.setSetId(SET);
        r.setRunCases(true);
        r.setCaseIds("1");
        r.setEditsJson("이건 JSON 이 아니다");

        RuleSetSimulateResult out = service.simulate(r);

        assertNull(out.getTrace());
        assertEquals(Boolean.TRUE, only(out, 1).get("pass"), only(out, 1).toString());
    }
}
