package com.dongkuk.dmes.mdm.dme.ruleCalc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcIoResult;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRequest;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRunResult;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * {@code ruleCalc} — 하위 세트(SET 노드)가 든 세트, 그리고 엔진 위반이 메시지 코드로 어떻게 매핑되는지(INPUT_INVALID·EVAL_ERROR) 확인한다.
 * 시드는 {@link RuleCalcTestBase}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
public class RuleCalcSubsetTest extends RuleCalcTestBase {

    /** R_TOP — 하위 세트 S_CALC 의 최종 결과 FINAL_WT(사전, NUMBER)가 10 보다 크면 "heavy", 아니면 "light" → TOP_OUT. S_PARENT = [S_CALC 호출 → R_TOP]. */
    private void parentSet() {
        DmeTestSupport.rule(jdbc, "R_TOP", "상위 판정", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_TOP", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_TOP", 1, 1, "COND", "1", "FINAL_WT", 1, null);
        DmeTestSupport.var(jdbc, "R_TOP", 1, 2, "RESULT", "Value", "TOP_OUT", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_TOP", 1, 1, 1, "NORMAL", "{\"1\":{\"op\":\"GT\",\"left\":\"10\"},\"2\":{\"val\":\"heavy\"}}");
        DmeTestSupport.row(jdbc, "R_TOP", 1, 2, 0, "DEFAULT", "{\"2\":{\"val\":\"light\"}}");
        DmeTestSupport.ruleSet(jdbc, "S_PARENT", "상위 세트", "[\"R_TOP\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_PARENT", DmeTestSupport.line(DmeTestSupport.setNode("n1", "S_CALC"), DmeTestSupport.ruleNode("n2", "R_TOP")));
        DmeTestSupport.ruleSetCalls(jdbc, "S_PARENT", "[\"S_CALC\"]");
    }

    // ── (a) SET 노드(하위 세트)가 든 세트 ───────────────────────────────────

    @Test
    void io_하위_세트의_최종_결과가_상위_룰_입력이_되면_입력에서_빠진다() {
        parentSet();

        RuleCalcIoResult r = service.io(req("SET", "S_PARENT", false));

        assertTrue(r.isOk(), r.getMessages().toString());
        // 하위 세트 S_CALC 의 입력(COIL_THK·COIL_WID)이 상위 입력이 되고, 하위의 최종 결과 FINAL_WT 는 R_TOP 이 읽으므로 입력이 아니다.
        assertEquals(List.of("COIL_THK", "COIL_WID"), names(r.getInputs()));
        assertEquals(List.of("TOP_OUT"), names(r.getOutputs()), "FINAL_WT 는 R_TOP 이 읽으니 최종 결과가 아니다");
        // 한계 — io 의 steps 는 최상위 룰만 담는다(SET 노드는 펼치지 않는다). run 의 steps 는 하위 세트를 펼친다.
        assertEquals(List.of("R_TOP"), r.getSteps().stream().map(RuleCalcIoResult.Step::getRuleId).toList());
    }

    @Test
    void run_하위_세트를_펼친_steps_와_최종_결과만_담은_result() {
        parentSet();
        RuleCalcRequest q = run("SET", "S_PARENT", "2.0", "1200");

        RuleCalcRunResult r = service.run(q);

        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals(List.of("R_PRE", "R_POST", "R_TOP"), r.getSteps().stream().map(RuleCalcRunResult.Step::getRuleId).toList(), "하위 세트의 룰을 펼친다");
        assertEquals(Map.of("TOP_OUT", "heavy"), r.getResult(), "result 는 io outputs(TOP_OUT)만 — 하위의 FINAL_WT·PRE_FCT 는 중간값");
        assertEquals(Map.of("PRE_FCT", "1.05", "COIL_WID", "1200"), r.getSteps().get(1).getInputs(), "하위 세트 안 룰의 입력은 하위 값 맵에서");
        assertEquals(Map.of("FINAL_WT", "12.34"), r.getSteps().get(2).getInputs(), "하위 세트가 넘겨 준 결과가 상위 룰의 입력 값이다");
        assertEquals(Map.of("TOP_OUT", "heavy"), r.getSteps().get(2).getOutputs());
    }

    @Test
    void run_하위_세트가_든_세트도_입력이_빠져도_막지_않고_엔진에_넘긴다() {
        parentSet();

        RuleCalcRunResult r = service.run(run("SET", "S_PARENT", "2.0", null));

        assertFalse(codes(r.getMessages()).contains("INPUT_MISSING"), r.getMessages().toString());
        assertFalse(r.getSteps().isEmpty(), "엔진을 불렀다(막지 않았다)");
    }

    // ── (b) 엔진 위반 → 메시지 코드 ─────────────────────────────────────────

    /**
     * R_X1 은 FOO 를 타입 없이 읽고(출처 NONE → io 입력 FOO 는 풀리지 않은 입력) R_X2 는 FOO 를 NUMBER 로 선언해 읽는다. 서비스는 FOO 를 글자로
     * 바꾸지 않고 받은 그대로 넘기고, 엔진이 R_X2 의 선언 타입으로 바꾸다 실패(TYPE_CONVERSION)하면 FOO 는 io 입력 이름이라 INPUT_INVALID 다.
     */
    @Test
    void 엔진_타입_변환_실패가_입력_이름이면_INPUT_INVALID_다() {
        DmeTestSupport.rule(jdbc, "R_X1", "타입 없는 읽기", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_X1", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_X1", 1, 1, "COND", "1", "FOO", 1, null);
        DmeTestSupport.var(jdbc, "R_X1", 1, 2, "RESULT", "Value", "X1_OUT", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_X1", 1, 1, 0, "DEFAULT", "{\"2\":{\"val\":\"x1\"}}");
        DmeTestSupport.rule(jdbc, "R_X2", "NUMBER 로 읽기", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_X2", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_X2", 1, 1, "COND", "1", "FOO", 1, "NUMBER");
        DmeTestSupport.var(jdbc, "R_X2", 1, 2, "RESULT", "Value", "X2_OUT", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_X2", 1, 1, 1, "NORMAL", "{\"1\":{\"op\":\"GT\",\"left\":\"0\"},\"2\":{\"val\":\"pos\"}}");
        DmeTestSupport.row(jdbc, "R_X2", 1, 2, 0, "DEFAULT", "{\"2\":{\"val\":\"neg\"}}");
        DmeTestSupport.ruleSet(jdbc, "S_X", "타입 불일치 세트", "[\"R_X1\",\"R_X2\"]", "INUSE", 0);

        RuleCalcIoResult io = service.io(req("SET", "S_X", false));
        assertEquals(List.of("FOO"), names(io.getInputs()));
        assertEquals("STRING", io.getInputs().get(0).getDataType(), "io 는 풀지 못한 입력을 STRING 으로 알린다");

        RuleCalcRequest ok = req("SET", "S_X", false);
        ok.setValues(Map.of("FOO", "5"));
        RuleCalcRunResult good = service.run(ok);
        assertTrue(good.isOk(), good.getMessages().toString());
        assertEquals(Map.of("X1_OUT", "x1", "X2_OUT", "pos"), good.getResult());

        RuleCalcRequest bad = req("SET", "S_X", false);
        bad.setValues(Map.of("FOO", "abc"));
        RuleCalcRunResult r = service.run(bad);
        assertFalse(r.isOk());
        assertEquals(List.of("INPUT_INVALID"), codes(r.getMessages()), r.getMessages().toString());
        assertTrue(r.getMessages().get(0).getText().contains("FOO"), r.getMessages().get(0).getText());
    }

    /**
     * IF 한 갈래에서만 R_PRE 가 PRE_FCT 를 만들고 뒤의 R_POST 가 읽는다. 다른 갈래(SKIP_FLAG=false)를 타면 PRE_FCT 가 없어 엔진 위반(MISSING_KEY)이
     * 나지만, PRE_FCT 는 io 입력 이름이 아니라(앞 룰 결과) 앞 룰 결과가 빈 것이므로 INPUT_MISSING 이 아니라 EVAL_ERROR 다.
     */
    @Test
    void 엔진_키_없음이_입력이_아닌_앞_룰_결과면_EVAL_ERROR_다() {
        String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
                + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_PRE\"},{\"id\":\"r3\",\"kind\":\"RULE\",\"ruleId\":\"R_POST\"},"
                + "{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},"
                + "{\"id\":\"e2\",\"from\":\"if1\",\"to\":\"r1\",\"order\":1,\"cond\":\"SKIP_FLAG == TRUE\"},"
                + "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r3\",\"otherwise\":true},{\"id\":\"e4\",\"from\":\"r1\",\"to\":\"r3\"},"
                + "{\"id\":\"e5\",\"from\":\"r3\",\"to\":\"end\"}]}";
        DmeTestSupport.ruleSet(jdbc, "S_PART", "일부 갈래 결과 세트", "[\"R_PRE\",\"R_POST\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_PART", flow);

        RuleCalcIoResult io = service.io(req("SET", "S_PART", false));
        assertEquals(java.util.Set.of("COIL_THK", "COIL_WID", "SKIP_FLAG"), java.util.Set.copyOf(names(io.getInputs())), names(io.getInputs()).toString());

        RuleCalcRequest taken = req("SET", "S_PART", false);
        taken.setValues(Map.of("SKIP_FLAG", true, "COIL_THK", "2.0", "COIL_WID", "1200"));
        RuleCalcRunResult good = service.run(taken);
        assertTrue(good.isOk(), good.getMessages().toString());
        assertEquals(Map.of("FINAL_WT", "12.34"), good.getResult(), "R_PRE 를 타면 PRE_FCT 가 있어 계산된다");

        RuleCalcRequest skipped = req("SET", "S_PART", false);
        skipped.setValues(Map.of("SKIP_FLAG", false, "COIL_THK", "2.0", "COIL_WID", "1200"));
        RuleCalcRunResult r = service.run(skipped);
        assertFalse(r.isOk());
        assertEquals(List.of("EVAL_ERROR"), codes(r.getMessages()), r.getMessages().toString());
        assertTrue(r.getMessages().get(0).getText().contains("PRE_FCT"), r.getMessages().get(0).getText());
    }
}
