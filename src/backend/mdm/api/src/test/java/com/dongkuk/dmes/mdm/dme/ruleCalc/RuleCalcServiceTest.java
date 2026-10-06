package com.dongkuk.dmes.mdm.dme.ruleCalc;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcIoResult;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcMessage;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRequest;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRunResult;
import com.dongkuk.dmes.mdm.dme.ruleCalc.service.RuleCalcService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 조업 계산기 {@code ruleCalc}(docs/widget-2026-10/rule-calc-api.md) 서비스 시험. 시드(SQLite):
 *
 * <ul>
 *   <li>{@code R_PRE} — COIL_THK(사전, MM) 구간 → PRE_FCT(NUMBER). v1 RELEASED(1.05, 기본 0.90), v2 kim DRAFT(2.00)</li>
 *   <li>{@code R_POST} — PRE_FCT(앞 룰 결과)·COIL_WID(사전, MM) → FINAL_WT(사전, KG). RELEASED</li>
 *   <li>{@code S_CALC} — [R_PRE, R_POST] 세트(한 줄 흐름). RELEASED</li>
 *   <li>{@code R_ONLY_DRAFT} — kim 의 DRAFT 만. {@code R_DEP} — DEPRECATED. {@code R_UNQ} — UNIQUE 인데 두 행이 같이 맞는다</li>
 * </ul>
 * 로그인 사용자는 kim, 현재 시각은 2026-06-15 09:00(KST).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
public class RuleCalcServiceTest extends AbstractMdmSharedDbTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired RuleCalcService service;
    @Autowired MutableCurrentUser currentUser;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        jdbc.update("DELETE FROM TB_MDM_UNIT WHERE UNIT_CODE IN ('MM', 'KG')");
        jdbc.update("INSERT INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES ('MM', 'LENGTH', 'MM', 1, 0)");
        jdbc.update("INSERT INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES ('KG', 'WEIGHT', 'KG', 1, 0)");
        column("COIL_THK", "COIL_THK_D", 3, "MM", "두께");
        column("COIL_WID", "COIL_WID_D", 0, "MM", "폭");
        column("FINAL_WT", "FINAL_WT_D", 2, "KG", "최종 중량");

        // R_PRE — COIL_THK 구간 → PRE_FCT(NUMBER). 선언만 있는 결과(사전에 없음 → 단위 "").
        DmeTestSupport.rule(jdbc, "R_PRE", "사전 계수", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_PRE", 1, "FIRST", "2026-01-01 00:00:00", null);
        preFactor(1, "1.05");
        DmeTestSupport.pending(jdbc, "R_PRE", 2, "DRAFT", "kim", "FIRST", 1);
        preFactor(2, "2.00");

        // R_POST — PRE_FCT(R_PRE 가 만든다) 와 COIL_WID 를 읽어 FINAL_WT.
        DmeTestSupport.rule(jdbc, "R_POST", "최종 중량", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_POST", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_POST", 1, 1, "COND", "1", "PRE_FCT", 1, null);
        DmeTestSupport.var(jdbc, "R_POST", 1, 2, "COND", "1", "COIL_WID", 2, null);
        DmeTestSupport.var(jdbc, "R_POST", 1, 3, "RESULT", "Value", "FINAL_WT", 1, null);          // 타입은 컬럼 사전에서(라벨·소수 자리·단위)
        DmeTestSupport.row(jdbc, "R_POST", 1, 1, 1, "NORMAL",
                "{\"1\":{\"op\":\"GE\",\"left\":\"1\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},\"3\":{\"val\":\"12.34\"}}");
        DmeTestSupport.row(jdbc, "R_POST", 1, 2, 0, "DEFAULT", "{\"3\":{\"val\":\"0.50\"}}");

        DmeTestSupport.ruleSet(jdbc, "S_CALC", "계산 세트", "[\"R_PRE\",\"R_POST\"]", "INUSE", 0);

        DmeTestSupport.rule(jdbc, "R_ONLY_DRAFT", "초안만", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "R_ONLY_DRAFT", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "R_ONLY_DRAFT", 1, 1, "COND", "1", "COIL_WID", 1, null);
        DmeTestSupport.var(jdbc, "R_ONLY_DRAFT", 1, 2, "RESULT", "Value", "OD_OUT", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_ONLY_DRAFT", 1, 1, 0, "DEFAULT", "{\"2\":{\"val\":\"draft\"}}");

        DmeTestSupport.rule(jdbc, "R_DEP", "폐기 룰", "DECISION", "DEPRECATED");
        DmeTestSupport.released(jdbc, "R_DEP", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_DEP", 1, 1, "COND", "1", "COIL_WID", 1, null);
        DmeTestSupport.var(jdbc, "R_DEP", 1, 2, "RESULT", "Value", "DEP_OUT", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_DEP", 1, 1, 0, "DEFAULT", "{\"2\":{\"val\":\"old\"}}");

        DmeTestSupport.rule(jdbc, "R_UNQ", "겹치는 행", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_UNQ", 1, "UNIQUE", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_UNQ", 1, 1, "COND", "1", "COIL_WID", 1, null);
        DmeTestSupport.var(jdbc, "R_UNQ", 1, 2, "RESULT", "Value", "U_OUT", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_UNQ", 1, 1, 1, "NORMAL", "{\"1\":{\"op\":\"GT\",\"left\":\"1\"},\"2\":{\"val\":\"A\"}}");
        DmeTestSupport.row(jdbc, "R_UNQ", 1, 2, 2, "NORMAL", "{\"1\":{\"op\":\"GT\",\"left\":\"1\"},\"2\":{\"val\":\"B\"}}");

        currentUser.set("kim", STEWARD);
    }

    private void column(String phys, String domain, int scale, String unit, String label) {
        long id = DmeTestSupport.domain(jdbc, domain, "QTY", "NUMBER", scale);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET UNIT_CODE = ? WHERE DOMAIN_ID = ?", unit, id);
        DmeTestSupport.column(jdbc, phys, id);
        jdbc.update("UPDATE TB_MDM_COLUMN SET LABEL_MID = ? WHERE PHYS_NAME = ?", label, phys);
    }

    /** 버전 {@code ver} 의 R_PRE 정의 — COIL_THK 구간(1.6 이상 2.5 미만)이면 {@code factor}, 아니면 기본 0.90. */
    private void preFactor(int ver, String factor) {
        DmeTestSupport.var(jdbc, "R_PRE", ver, 1, "COND", "2", "COIL_THK", 1, null);
        DmeTestSupport.var(jdbc, "R_PRE", ver, 2, "RESULT", "Value", "PRE_FCT", 1, "NUMBER");
        DmeTestSupport.row(jdbc, "R_PRE", ver, 1, 1, "NORMAL",
                "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.6\",\"right\":\"2.5\"},\"2\":{\"val\":\"" + factor + "\"}}");
        DmeTestSupport.row(jdbc, "R_PRE", ver, 2, 0, "DEFAULT", "{\"2\":{\"val\":\"0.90\"}}");
    }

    private static RuleCalcRequest req(String tp, String id, boolean preview) {
        RuleCalcRequest r = new RuleCalcRequest();
        r.setTargetTp(tp);
        r.setTargetId(id);
        r.setPreview(preview);
        return r;
    }

    private static RuleCalcRequest run(String tp, String id, Object thk, Object wid) {
        RuleCalcRequest r = req(tp, id, false);
        Map<String, Object> values = new LinkedHashMap<>();
        if (thk != null) {
            values.put("COIL_THK", thk);
        }
        if (wid != null) {
            values.put("COIL_WID", wid);
        }
        r.setValues(values);
        return r;
    }

    private static List<String> names(List<RuleCalcIoResult.Item> items) {
        return items.stream().map(RuleCalcIoResult.Item::getName).toList();
    }

    private static List<String> codes(List<RuleCalcMessage> messages) {
        return messages.stream().map(RuleCalcMessage::getCode).toList();
    }

    // ── (1) io ──────────────────────────────────────────────────────────────

    @Test
    void io_룰은_입력_결과를_타입_단위_표시명과_함께_돌려준다() {
        RuleCalcIoResult r = service.io(req("RULE", "R_PRE", false));

        assertTrue(r.isOk());
        assertEquals("RULE", r.getTarget().getTp());
        assertEquals("R_PRE", r.getTarget().getId());
        assertEquals("사전 계수", r.getTarget().getName());
        assertEquals("1.000", r.getTarget().getVer());
        assertEquals("RELEASED", r.getTarget().getVerStatus());
        assertEquals("INUSE", r.getTarget().getStatus());
        assertEquals(List.of("COIL_THK"), names(r.getInputs()));
        RuleCalcIoResult.Item thk = r.getInputs().get(0);
        assertEquals("두께", thk.getLabel());
        assertEquals("NUMBER", thk.getDataType());
        assertEquals(Integer.valueOf(3), thk.getScale());
        assertEquals("MM", thk.getUnit());
        assertTrue(thk.isRequired());
        assertEquals(List.of("PRE_FCT"), names(r.getOutputs()));
        RuleCalcIoResult.Item out = r.getOutputs().get(0);
        assertEquals("NUMBER", out.getDataType());
        assertEquals("", out.getUnit(), "사전에도 선언에도 도메인이 없으면 단위는 빈 문자열");
        assertEquals(List.of(), r.getSteps());
        assertEquals(List.of(), r.getMessages());
    }

    @Test
    void io_세트는_앞_룰_결과를_입력에서_빼고_최종_결과와_단계를_돌려준다() {
        RuleCalcIoResult r = service.io(req("SET", "S_CALC", false));

        assertTrue(r.isOk());
        assertEquals("계산 세트", r.getTarget().getName());
        assertEquals("1.000", r.getTarget().getVer());
        assertEquals("RELEASED", r.getTarget().getVerStatus());
        assertEquals(List.of("COIL_THK", "COIL_WID"), names(r.getInputs()), "PRE_FCT 는 R_PRE 가 만들므로 입력이 아니다");
        assertEquals("MM", r.getInputs().get(1).getUnit());
        assertEquals(List.of("FINAL_WT"), names(r.getOutputs()), "최종 결과만 — PRE_FCT 는 뒤 룰이 읽는다");
        assertEquals("최종 중량", r.getOutputs().get(0).getLabel());
        assertEquals("KG", r.getOutputs().get(0).getUnit());
        assertEquals(Integer.valueOf(2), r.getOutputs().get(0).getScale());
        assertEquals(List.of("R_PRE", "R_POST"), r.getSteps().stream().map(RuleCalcIoResult.Step::getRuleId).toList());
        assertEquals("사전 계수", r.getSteps().get(0).getName());
        assertEquals(List.of("PRE_FCT"), names(r.getSteps().get(0).getOutputs()));
        assertEquals(List.of("FINAL_WT"), names(r.getSteps().get(1).getOutputs()));
    }

    @Test
    void io_세트의_IF_갈래_조건식_변수는_앞_결과가_만든_이름이_아니면_입력에_더한다() {
        String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
                + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_PRE\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},"
                + "{\"id\":\"e2\",\"from\":\"if1\",\"to\":\"end\",\"order\":1,\"cond\":\"SKIP_FLAG == TRUE && PRE_FCT > 0\"},"
                + "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r1\",\"otherwise\":true},{\"id\":\"e4\",\"from\":\"r1\",\"to\":\"end\"}]}";
        DmeTestSupport.ruleSet(jdbc, "S_IF", "분기 세트", "[\"R_PRE\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_IF", flow);

        RuleCalcIoResult r = service.io(req("SET", "S_IF", false));

        assertTrue(r.isOk());
        // SKIP_FLAG 는 어느 룰도 만들지 않아 입력에 더해지고, PRE_FCT 는 R_PRE 가 만드는 이름이라 더하지 않는다. EVAL_TS·_ 접두는 뺀다.
        assertEquals(List.of("COIL_THK", "SKIP_FLAG"), names(r.getInputs()));
        assertEquals("STRING", r.getInputs().get(1).getDataType());
    }

    // ── (2) run 정상 ────────────────────────────────────────────────────────

    @Test
    void run_룰은_결과를_소수_자리_문자열로_돌려준다() {
        RuleCalcRunResult r = service.run(run("RULE", "R_PRE", "2.0", null));

        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals(List.of(), r.getMessages());
        assertEquals(Map.of("PRE_FCT", "1.05"), r.getResult());
        assertEquals(1, r.getSteps().size());
        RuleCalcRunResult.Step step = r.getSteps().get(0);
        assertEquals("R_PRE", step.getRuleId());
        assertEquals(Map.of("COIL_THK", "2.0"), step.getInputs());
        assertEquals(Map.of("PRE_FCT", "1.05"), step.getOutputs());
        assertTrue(step.isHit());
        assertFalse(step.isDefaultApplied());
    }

    @Test
    void run_세트는_앞_룰_결과를_다음_룰에_넘기고_결과는_입력_키를_뺀_전부다() {
        // JSON 숫자(Double·Integer)와 글자를 섞어 받는다.
        RuleCalcRunResult r = service.run(run("SET", "S_CALC", 2.0d, 1200));

        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals(Map.of("PRE_FCT", "1.05", "FINAL_WT", "12.34"), r.getResult());
        assertEquals(List.of("R_PRE", "R_POST"), r.getSteps().stream().map(RuleCalcRunResult.Step::getRuleId).toList());
        assertEquals(Map.of("PRE_FCT", "1.05", "COIL_WID", "1200"), r.getSteps().get(1).getInputs());
        assertEquals(Map.of("FINAL_WT", "12.34"), r.getSteps().get(1).getOutputs());
    }

    @Test
    void run_적중이_없으면_기본_행을_썼다고_알린다() {
        RuleCalcRunResult r = service.run(run("RULE", "R_PRE", "9.9", null));

        assertTrue(r.isOk());
        assertEquals("0.9", r.getResult().get("PRE_FCT"), "반올림·자릿수 보정 없이 엔진 값 그대로(엔진이 0.90 을 0.9 로 읽는다)");
        assertFalse(r.getSteps().get(0).isHit());
        assertTrue(r.getSteps().get(0).isDefaultApplied());
    }

    @Test
    void run_숫자는_double_을_거치지_않고_BigDecimal_로_읽는다() {
        // 0.1 + 0.2 류 오차가 없다 — 16자리 넘는 글자 숫자도 그대로 입력 단계에 남는다.
        RuleCalcRunResult r = service.run(run("RULE", "R_PRE", "2.00000000000000000001", null));
        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals("2.00000000000000000001", r.getSteps().get(0).getInputs().get("COIL_THK"));
        assertEquals("1.05", r.getResult().get("PRE_FCT"));
    }

    @Test
    void run_은_valuesJson_도_받고_소수를_BigDecimal_로_정확히_읽는다() {
        RuleCalcRequest q = req("RULE", "R_PRE", false);
        q.setValuesJson("{\"COIL_THK\": 2.00000000000000000001, \"IGNORED\": [1, 2]}");

        RuleCalcRunResult r = service.run(q);

        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals("2.00000000000000000001", r.getSteps().get(0).getInputs().get("COIL_THK"));

        q.setValues(Map.of("COIL_THK", "9.9"));                       // 둘 다 오면 values 가 이긴다
        assertEquals("9.9", service.run(q).getSteps().get(0).getInputs().get("COIL_THK"));

        q.setValues(null);
        q.setValuesJson("[1, 2]");                                     // 객체가 아니면 요청 오류
        assertThrows(BusinessException.class, () -> service.run(q));
    }

    @Test
    void run_폐기_룰은_경고만_하고_계산한다() {
        RuleCalcRequest q = req("RULE", "R_DEP", false);
        q.setValues(Map.of("COIL_WID", "5"));

        RuleCalcRunResult r = service.run(q);

        assertTrue(r.isOk());
        assertEquals(Map.of("DEP_OUT", "old"), r.getResult());
        assertEquals(List.of("RULE_DEPRECATED"), codes(r.getMessages()));
        assertEquals("DEPRECATED", service.io(req("RULE", "R_DEP", false)).getTarget().getStatus());
        assertEquals(List.of("RULE_DEPRECATED"), codes(service.io(req("RULE", "R_DEP", false)).getMessages()));
    }

    // ── (3) RELEASED 없음 ───────────────────────────────────────────────────

    @Test
    void RELEASED_가_없는_룰은_예외가_아니라_NO_RELEASED_메시지다() {
        RuleCalcIoResult io = service.io(req("RULE", "R_ONLY_DRAFT", false));
        assertFalse(io.isOk());
        assertEquals(List.of("NO_RELEASED"), codes(io.getMessages()));
        assertTrue(io.getMessages().get(0).getText().startsWith("확정 버전 없음"), io.getMessages().get(0).getText());
        assertEquals("초안만", io.getTarget().getName());
        assertEquals(List.of(), io.getInputs());

        RuleCalcRunResult run = service.run(run("RULE", "R_ONLY_DRAFT", null, 5));
        assertFalse(run.isOk());
        assertEquals(List.of("NO_RELEASED"), codes(run.getMessages()));
        assertEquals(Map.of(), run.getResult());
    }

    @Test
    void 판정_시각에_적용되는_RELEASED_가_없으면_NO_RELEASED_다() {
        RuleCalcRequest q = run("RULE", "R_PRE", "2.0", null);
        q.setEvalTs("2025-06-01 09:00:00");                 // R_PRE v1 은 2026-01-01 부터

        RuleCalcRunResult r = service.run(q);

        assertFalse(r.isOk());
        assertEquals(List.of("NO_RELEASED"), codes(r.getMessages()));
    }

    @Test
    void 세트에_든_룰에_RELEASED_가_없으면_NO_RELEASED_다() {
        DmeTestSupport.ruleSet(jdbc, "S_BROKEN", "미확정 룰 포함", "[\"R_PRE\",\"R_ONLY_DRAFT\"]", "INUSE", 0);

        RuleCalcIoResult io = service.io(req("SET", "S_BROKEN", false));

        assertFalse(io.isOk());
        assertEquals(List.of("NO_RELEASED"), codes(io.getMessages()));
        assertTrue(io.getMessages().get(0).getText().contains("R_ONLY_DRAFT"));
    }

    // ── (4) 없는 대상 ───────────────────────────────────────────────────────

    @Test
    void 없는_룰과_세트는_NOT_FOUND_메시지다() {
        for (String tp : List.of("RULE", "SET")) {
            RuleCalcIoResult io = service.io(req(tp, "NO_SUCH", false));
            assertFalse(io.isOk(), tp);
            assertEquals(List.of("NOT_FOUND"), codes(io.getMessages()), tp);
            assertEquals(tp, io.getTarget().getTp());
            assertEquals("NO_SUCH", io.getTarget().getId());

            RuleCalcRunResult run = service.run(run(tp, "NO_SUCH", "1", "1"));
            assertFalse(run.isOk(), tp);
            assertEquals(List.of("NOT_FOUND"), codes(run.getMessages()), tp);
        }
    }

    @Test
    void 대상_종류와_ID_가_잘못되면_요청_오류다() {
        assertThrows(BusinessException.class, () -> service.io(req("FLOW", "R_PRE", false)));
        assertThrows(BusinessException.class, () -> service.io(req("RULE", " ", false)));
        RuleCalcRequest q = run("RULE", "R_PRE", "2.0", null);
        q.setEvalTs("2026/06/15");
        assertThrows(BusinessException.class, () -> service.run(q));
    }

    // ── (5) 입력 누락·오류 ──────────────────────────────────────────────────

    @Test
    void 필수_입력이_비면_엔진을_부르지_않고_INPUT_MISSING_이다() {
        RuleCalcRunResult none = service.run(run("SET", "S_CALC", "2.0", null));          // COIL_WID 키 없음
        assertFalse(none.isOk());
        assertEquals(List.of("INPUT_MISSING"), codes(none.getMessages()));
        assertTrue(none.getMessages().get(0).getText().contains("COIL_WID"));
        assertEquals(Map.of(), none.getResult());
        assertEquals(List.of(), none.getSteps(), "엔진을 부르지 않았다");

        RuleCalcRequest blank = run("RULE", "R_PRE", "   ", null);                       // 빈 글자
        assertEquals(List.of("INPUT_MISSING"), codes(service.run(blank).getMessages()));

        RuleCalcRequest nulled = req("RULE", "R_PRE", false);                             // null 값
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("COIL_THK", null);
        nulled.setValues(values);
        assertEquals(List.of("INPUT_MISSING"), codes(service.run(nulled).getMessages()));

        RuleCalcRequest noValues = req("RULE", "R_PRE", false);                           // values 자체가 없음
        assertEquals(List.of("INPUT_MISSING"), codes(service.run(noValues).getMessages()));
    }

    @Test
    void 숫자_칸에_글자가_오면_INPUT_INVALID_다() {
        RuleCalcRunResult r = service.run(run("RULE", "R_PRE", "두껍다", null));

        assertFalse(r.isOk());
        assertEquals(List.of("INPUT_INVALID"), codes(r.getMessages()));
        assertTrue(r.getMessages().get(0).getText().contains("COIL_THK"));
    }

    @Test
    void 판정_중_오류는_EVAL_ERROR_메시지다() {
        RuleCalcRequest q = req("RULE", "R_UNQ", false);
        q.setValues(Map.of("COIL_WID", "5"));

        RuleCalcRunResult r = service.run(q);

        assertFalse(r.isOk());
        assertEquals(List.of("EVAL_ERROR"), codes(r.getMessages()));
        assertTrue(r.getMessages().get(0).getText().contains("UNIQUE"), r.getMessages().get(0).getText());
        assertEquals(Map.of(), r.getResult());
    }

    @Test
    void 요구하지_않는_입력_키는_무시한다() {
        RuleCalcRequest q = run("RULE", "R_PRE", "2.0", null);
        q.getValues().put("_RESERVED", "x");
        q.getValues().put("EVAL_TS", "x");
        q.getValues().put("NOT_USED", "x");

        RuleCalcRunResult r = service.run(q);

        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals("1.05", r.getResult().get("PRE_FCT"));
    }

    // ── (6) preview ────────────────────────────────────────────────────────

    @Test
    void preview_true_이면_내_DRAFT_를_쓰고_false_면_DRAFT_를_무시한다() {
        RuleCalcRequest on = run("RULE", "R_PRE", "2.0", null);
        on.setPreview(true);
        RuleCalcRunResult draft = service.run(on);
        assertTrue(draft.isOk(), draft.getMessages().toString());
        assertEquals(0, new BigDecimal("2.00").compareTo(new BigDecimal((String) draft.getResult().get("PRE_FCT"))), draft.getResult().toString());

        RuleCalcRunResult released = service.run(run("RULE", "R_PRE", "2.0", null));
        assertEquals("1.05", released.getResult().get("PRE_FCT"));

        RuleCalcIoResult ioDraft = service.io(req("RULE", "R_PRE", true));
        assertEquals("2.000", ioDraft.getTarget().getVer());
        assertEquals("DRAFT", ioDraft.getTarget().getVerStatus());
        RuleCalcIoResult ioReleased = service.io(req("RULE", "R_PRE", false));
        assertEquals("1.000", ioReleased.getTarget().getVer());
        assertEquals("RELEASED", ioReleased.getTarget().getVerStatus());
    }

    @Test
    void 남의_DRAFT_는_preview_여도_쓰지_않는다() {
        currentUser.set("lee", STEWARD);
        RuleCalcRequest on = run("RULE", "R_PRE", "2.0", null);
        on.setPreview(true);

        RuleCalcRunResult r = service.run(on);

        assertEquals("1.05", r.getResult().get("PRE_FCT"));
        assertEquals("RELEASED", service.io(req("RULE", "R_PRE", true)).getTarget().getVerStatus());
    }

    @Test
    void DRAFT_만_있는_룰은_preview_true_일_때만_계산한다() {
        RuleCalcRequest q = req("RULE", "R_ONLY_DRAFT", true);
        q.setValues(Map.of("COIL_WID", "5"));

        RuleCalcRunResult r = service.run(q);

        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals(Map.of("OD_OUT", "draft"), r.getResult());
        assertEquals("DRAFT", service.io(req("RULE", "R_ONLY_DRAFT", true)).getTarget().getVerStatus());
    }

    @Test
    void 세트도_preview_true_이면_내_DRAFT_세트_버전을_쓴다() {
        // S_CALC v2 kim DRAFT — R_POST 만 담는다(입력 PRE_FCT·COIL_WID, 앞 룰 없음).
        DmeTestSupport.ruleSetDraft(jdbc, "S_CALC", "2.000", "kim", "[\"R_POST\"]", 0);

        RuleCalcIoResult draft = service.io(req("SET", "S_CALC", true));
        assertEquals("2.000", draft.getTarget().getVer());
        assertEquals("DRAFT", draft.getTarget().getVerStatus());
        assertEquals(List.of("PRE_FCT", "COIL_WID"), names(draft.getInputs()));

        RuleCalcIoResult released = service.io(req("SET", "S_CALC", false));
        assertEquals("1.000", released.getTarget().getVer());
        assertEquals(List.of("COIL_THK", "COIL_WID"), names(released.getInputs()));
    }

    // ── (7) 계약 키 모양 ────────────────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void 응답은_문서의_키를_그대로_가진다() throws Exception {
        Map<String, Object> io = JSON.convertValue(service.io(req("SET", "S_CALC", false)), Map.class);
        assertEquals(Set.of("ok", "target", "inputs", "outputs", "steps", "messages"), io.keySet());
        assertEquals(Set.of("tp", "id", "name", "ver", "verStatus", "status"), ((Map<String, Object>) io.get("target")).keySet());
        Map<String, Object> input = ((List<Map<String, Object>>) io.get("inputs")).get(0);
        assertEquals(Set.of("name", "label", "dataType", "scale", "unit", "required"), input.keySet());
        Map<String, Object> step = ((List<Map<String, Object>>) io.get("steps")).get(0);
        assertEquals(Set.of("ruleId", "name", "outputs"), step.keySet());
        assertEquals(Set.of("name", "label", "dataType", "scale", "unit", "required"),
                ((List<Map<String, Object>>) step.get("outputs")).get(0).keySet());

        Map<String, Object> run = JSON.convertValue(service.run(run("SET", "S_CALC", "2.0", "1200")), Map.class);
        assertEquals(Set.of("ok", "result", "steps", "messages"), run.keySet());
        Map<String, Object> runStep = ((List<Map<String, Object>>) run.get("steps")).get(0);
        assertEquals(Set.of("ruleId", "inputs", "outputs", "hit", "defaultApplied"), runStep.keySet());
        assertTrue((Boolean) runStep.get("hit"));

        Map<String, Object> failed = JSON.convertValue(service.run(run("RULE", "R_ONLY_DRAFT", null, 5)), Map.class);
        Map<String, Object> message = ((List<Map<String, Object>>) failed.get("messages")).get(0);
        assertEquals(Set.of("code", "text"), message.keySet());
        assertNotNull(message.get("text"));
    }
}
