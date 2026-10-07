package com.dongkuk.dmes.mdm.dme.ruleCalc;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcIoResult;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcMessage;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRequest;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRunResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * 조업 계산기 {@code ruleCalc}(docs/widget-2026-10/rule-calc-api.md) 서비스 시험. 시드는 {@link RuleCalcTestBase} 에 있다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
public class RuleCalcServiceTest extends RuleCalcTestBase {

    private static final ObjectMapper JSON = new ObjectMapper();

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
        assertFalse(thk.isRequired(), "빈 입력은 null 로 엔진에 넘기므로 필수가 아니다(F1)");
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

    /** IF 가 R_PRE 보다 앞에 있는 세트 — 조건식이 읽는 PRE_FCT 는 IF 뒤 룰이 만들므로 입력이다. */
    private static final String FLOW_IF_BEFORE = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
            + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_PRE\"},{\"id\":\"end\",\"kind\":\"END\"}],"
            + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},"
            + "{\"id\":\"e2\",\"from\":\"if1\",\"to\":\"end\",\"order\":1,\"cond\":\"SKIP_FLAG == TRUE && PRE_FCT > 0\"},"
            + "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r1\",\"otherwise\":true},{\"id\":\"e4\",\"from\":\"r1\",\"to\":\"end\"}]}";

    /** R_PRE → IF → (참이면 끝, 아니면 R_ALT) — 조건식이 읽는 PRE_FCT 는 IF 앞의 R_PRE 가 만든다. */
    private static final String FLOW_IF_AFTER = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},"
            + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_PRE\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
            + "{\"id\":\"r2\",\"kind\":\"RULE\",\"ruleId\":\"R_ALT\"},{\"id\":\"end\",\"kind\":\"END\"}],"
            + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"if1\"},"
            + "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"end\",\"order\":1,\"cond\":\"SKIP_FLAG == TRUE && PRE_FCT > 0\"},"
            + "{\"id\":\"e4\",\"from\":\"if1\",\"to\":\"r2\",\"otherwise\":true},{\"id\":\"e5\",\"from\":\"r2\",\"to\":\"end\"}]}";

    /** R_ALT — COIL_THK 를 읽어 ALT_OUT(STRING) "alt". */
    private void ruleAlt() {
        DmeTestSupport.rule(jdbc, "R_ALT", "대안 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_ALT", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_ALT", 1, 1, "COND", "1", "COIL_THK", 1, null);
        DmeTestSupport.var(jdbc, "R_ALT", 1, 2, "RESULT", "Value", "ALT_OUT", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_ALT", 1, 1, 0, "DEFAULT", "{\"2\":{\"val\":\"alt\"}}");
    }

    @Test
    void io_세트의_IF_조건식_변수는_그_IF_앞에서_만들어진_이름만_입력에서_뺀다() {
        DmeTestSupport.ruleSet(jdbc, "S_IF", "분기 세트", "[\"R_PRE\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_IF", FLOW_IF_BEFORE);

        RuleCalcIoResult r = service.io(req("SET", "S_IF", false));

        assertTrue(r.isOk());
        // PRE_FCT 는 R_PRE 가 만들지만 IF 뒤라서 IF 가 읽으면 입력이다. SKIP_FLAG 는 어느 룰도 만들지 않아 입력이다. EVAL_TS·_ 접두는 뺀다.
        assertEquals(Set.of("COIL_THK", "PRE_FCT", "SKIP_FLAG"), Set.copyOf(names(r.getInputs())), names(r.getInputs()).toString());
        assertEquals("COIL_THK", r.getInputs().get(0).getName(), "룰 입력이 먼저, IF 조건 변수는 그 뒤");
        assertEquals("STRING", r.getInputs().stream().filter(i -> i.getName().equals("SKIP_FLAG")).findFirst().orElseThrow().getDataType());

        // IF 앞에 R_PRE 가 있으면 PRE_FCT 는 입력이 아니다.
        ruleAlt();
        DmeTestSupport.ruleSet(jdbc, "S_IF2", "분기 세트 2", "[\"R_PRE\",\"R_ALT\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_IF2", FLOW_IF_AFTER);
        assertEquals(List.of("COIL_THK", "SKIP_FLAG"), names(service.io(req("SET", "S_IF2", false)).getInputs()));
    }

    @Test
    void run_IF_앞_룰이_만든_PRE_FCT_는_입력_칸_없이_SKIP_FLAG_와_COIL_THK_만으로_성공한다() {
        ruleAlt();
        DmeTestSupport.ruleSet(jdbc, "S_IF2", "분기 세트 2", "[\"R_PRE\",\"R_ALT\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_IF2", FLOW_IF_AFTER);
        RuleCalcRequest q = req("SET", "S_IF2", false);
        q.setValues(Map.of("SKIP_FLAG", true, "COIL_THK", "2.0"));

        RuleCalcRunResult r = service.run(q);

        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals(List.of(), r.getMessages());
        assertEquals(List.of("R_PRE"), r.getSteps().stream().map(RuleCalcRunResult.Step::getRuleId).toList(), "SKIP_FLAG 가 참이라 R_ALT 는 안 돈다");
        assertEquals(Map.of("PRE_FCT", "1.05"), r.getResult());
    }

    @Test
    void run_타입을_풀지_못한_불린_입력은_받은_타입_그대로_넘어가_갈래가_맞게_탄다() {
        ruleAlt();
        DmeTestSupport.ruleSet(jdbc, "S_IF2", "분기 세트 2", "[\"R_PRE\",\"R_ALT\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_IF2", FLOW_IF_AFTER);

        for (Object flag : List.of(true, "TRUE")) {
            RuleCalcRequest q = req("SET", "S_IF2", false);
            q.setValues(Map.of("SKIP_FLAG", flag, "COIL_THK", "2.0"));
            RuleCalcRunResult r = service.run(q);
            assertTrue(r.isOk(), flag + " → " + r.getMessages());
            assertEquals(Map.of("PRE_FCT", "1.05"), r.getResult(), "SKIP_FLAG=" + flag + " 면 참 갈래(끝)");
        }
        for (Object flag : List.of(false, "FALSE")) {
            RuleCalcRequest q = req("SET", "S_IF2", false);
            q.setValues(Map.of("SKIP_FLAG", flag, "COIL_THK", "2.0"));
            RuleCalcRunResult r = service.run(q);
            assertTrue(r.isOk(), flag + " → " + r.getMessages());
            assertEquals(Map.of("PRE_FCT", "1.05", "ALT_OUT", "alt"), r.getResult(), "SKIP_FLAG=" + flag + " 면 otherwise 갈래(R_ALT)");
        }
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
    void run_세트는_앞_룰_결과를_다음_룰에_넘기고_result_는_최종_결과만_담는다() {
        // JSON 숫자(Double·Integer)와 글자를 섞어 받는다.
        RuleCalcRunResult r = service.run(run("SET", "S_CALC", 2.0d, 1200));

        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals(Map.of("FINAL_WT", "12.34"), r.getResult(), "중간값 PRE_FCT 는 steps[].outputs 에만 있다");
        assertEquals(Map.of("PRE_FCT", "1.05"), r.getSteps().get(0).getOutputs());
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
    void 빈_입력은_INPUT_MISSING_으로_막지_않고_null_로_엔진에_넘긴다() {
        RuleCalcRunResult none = service.run(run("SET", "S_CALC", "2.0", null));          // COIL_WID 키 없음
        assertFalse(codes(none.getMessages()).contains("INPUT_MISSING"), none.getMessages().toString());
        assertFalse(none.getSteps().isEmpty(), "엔진을 불렀다(막지 않았다)");

        RuleCalcRequest blank = run("RULE", "R_PRE", "   ", null);                       // 빈 글자
        assertFalse(codes(service.run(blank).getMessages()).contains("INPUT_MISSING"));

        RuleCalcRequest nulled = req("RULE", "R_PRE", false);                             // null 값
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("COIL_THK", null);
        nulled.setValues(values);
        assertFalse(codes(service.run(nulled).getMessages()).contains("INPUT_MISSING"));

        RuleCalcRequest noValues = req("RULE", "R_PRE", false);                           // values 자체가 없음
        assertFalse(codes(service.run(noValues).getMessages()).contains("INPUT_MISSING"));
    }

    @Test
    void 숫자_칸에_글자가_오면_INPUT_INVALID_다() {
        RuleCalcRunResult r = service.run(run("RULE", "R_PRE", "두껍다", null));

        assertFalse(r.isOk());
        assertEquals(List.of("INPUT_INVALID"), codes(r.getMessages()));
        assertTrue(r.getMessages().get(0).getText().contains("COIL_THK"));
    }

    @Test
    void 숫자_자릿수가_너무_큰_입력은_메모리를_쓰지_않고_INPUT_INVALID_다() {
        for (String huge : List.of("1e999999999", "1e-999999999", "9".repeat(1001), "0." + "0".repeat(1500) + "1")) {
            RuleCalcRequest q = req("RULE", "R_PRE", false);
            q.setValuesJson("{\"COIL_THK\":\"" + huge + "\"}");

            RuleCalcRunResult r = service.run(q);

            assertFalse(r.isOk(), huge);
            assertEquals(List.of("INPUT_INVALID"), codes(r.getMessages()), huge);
            assertTrue(r.getMessages().get(0).getText().contains("COIL_THK"), r.getMessages().get(0).getText());
            assertTrue(r.getMessages().get(0).getText().length() < 400, "받은 값을 통째로 되돌리지 않는다");
        }
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

    @Test
    void io_는_preview_false_면_룰의_DRAFT_모양을_읽지_않고_true_면_읽는다() {
        // R_PRE v2(kim DRAFT)는 PRE_NOTE 결과가 더 있어 v1 과 모양이 다르다.
        assertEquals(List.of("PRE_FCT"), names(service.io(req("RULE", "R_PRE", false)).getOutputs()));
        assertEquals(List.of("PRE_FCT", "PRE_NOTE"), names(service.io(req("RULE", "R_PRE", true)).getOutputs()));

        RuleCalcIoResult released = service.io(req("SET", "S_CALC", false));
        assertEquals(List.of("PRE_FCT"), names(released.getSteps().get(0).getOutputs()), "preview=false 면 io 도 DRAFT 를 안 읽는다");
        assertEquals(Set.of("FINAL_WT"), Set.copyOf(names(released.getOutputs())));

        RuleCalcIoResult draft = service.io(req("SET", "S_CALC", true));
        assertEquals(List.of("PRE_FCT", "PRE_NOTE"), names(draft.getSteps().get(0).getOutputs()));
        assertEquals(Set.of("FINAL_WT", "PRE_NOTE"), Set.copyOf(names(draft.getOutputs())), "DRAFT 룰의 PRE_NOTE 는 뒤 룰이 안 읽으니 최종 결과다");
    }

    @Test
    void preview_여도_남의_DRAFT_세트_버전은_무시한다() {
        DmeTestSupport.ruleSetDraft(jdbc, "S_CALC", "2.000", "lee", "[\"R_POST\"]", 0);       // lee 의 DRAFT — kim 에게는 보이지 않는다

        RuleCalcIoResult kim = service.io(req("SET", "S_CALC", true));
        assertEquals("1.000", kim.getTarget().getVer());
        assertEquals("RELEASED", kim.getTarget().getVerStatus());
        assertEquals(List.of("COIL_THK", "COIL_WID"), names(kim.getInputs()));
        RuleCalcRequest q = run("SET", "S_CALC", "2.0", "1200");
        q.setPreview(true);
        RuleCalcRunResult run = service.run(q);
        assertEquals("12.34", run.getResult().get("FINAL_WT"));
        assertEquals(List.of("R_PRE", "R_POST"), run.getSteps().stream().map(RuleCalcRunResult.Step::getRuleId).toList(), "kim 의 run 도 RELEASED 세트(R_PRE→R_POST)로 돈다");

        currentUser.set("lee", STEWARD);
        RuleCalcIoResult lee = service.io(req("SET", "S_CALC", true));
        assertEquals("2.000", lee.getTarget().getVer());
        assertEquals("DRAFT", lee.getTarget().getVerStatus());
        assertEquals(List.of("PRE_FCT", "COIL_WID"), names(lee.getInputs()));
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
