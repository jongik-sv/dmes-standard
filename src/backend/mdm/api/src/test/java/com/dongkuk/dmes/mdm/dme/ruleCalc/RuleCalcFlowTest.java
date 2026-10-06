package com.dongkuk.dmes.mdm.dme.ruleCalc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcIoResult;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRequest;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRunResult;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * {@code ruleCalc} — 끝내는 갈래·병렬·받는 노드가 든 흐름에서 view 입력 집합이 엔진 입력 키 검사와 어긋나지 않는지, 타입 선언이 룰마다 갈린 입력,
 * 숫자 크기 방어 우회, 단계 입력 값의 출처를 확인한다. 시드는 {@link RuleCalcTestBase}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
public class RuleCalcFlowTest extends RuleCalcTestBase {

    // ── 픽스처 ──────────────────────────────────────────────────────────────

    /** {@code cond}(타입 {@code condType}, null 이면 선언 없음)를 읽고 기본 행으로 {@code result}(STRING, 값은 소문자 이름)를 만드는 RELEASED 룰. */
    private void rule(String id, String cond, String condType, String result) {
        rule(id, cond, condType, result, true);
    }

    private void rule(String id, String cond, String condType, String result, boolean withDefault) {
        DmeTestSupport.rule(jdbc, id, id, "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, id, 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, id, 1, 1, "COND", "1", cond, 1, condType);
        DmeTestSupport.var(jdbc, id, 1, 2, "RESULT", "Value", result, 1, "STRING");
        if (withDefault) {
            DmeTestSupport.row(jdbc, id, 1, 1, 0, "DEFAULT", "{\"2\":{\"val\":\"" + result.toLowerCase() + "\"}}");
        }
    }

    /** {@code rule} 에 일반 행 하나를 더한다 — 조건 {@code op left} 가 맞으면 값 {@code val}. */
    private void normalRow(String id, String op, String left, String val) {
        DmeTestSupport.row(jdbc, id, 1, 3, 1, "NORMAL", "{\"1\":{\"op\":\"" + op + "\",\"left\":\"" + left + "\"},\"2\":{\"val\":\"" + val + "\"}}");
    }

    private static String node(String id, String kind) {
        return "{\"id\":\"" + id + "\",\"kind\":\"" + kind + "\"}";
    }

    private static String edge(String id, String from, String to) {
        return "{\"id\":\"" + id + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\"}";
    }

    private static String branch(String id, String from, String to, int order, String cond) {
        return "{\"id\":\"" + id + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\",\"order\":" + order + ",\"cond\":\"" + cond + "\"}";
    }

    private static String otherwise(String id, String from, String to) {
        return "{\"id\":\"" + id + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\",\"otherwise\":true}";
    }

    private static String flow(List<String> nodes, List<String> edges) {
        return "{\"version\":1,\"nodes\":[" + String.join(",", nodes) + "],\"edges\":[" + String.join(",", edges) + "]}";
    }

    private void set(String id, String ruleIdsJson, String flowJson) {
        DmeTestSupport.ruleSet(jdbc, id, id, ruleIdsJson, "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, id, flowJson);
    }

    private static RuleCalcRequest values(String id, Map<String, Object> values) {
        RuleCalcRequest q = req("SET", id, false);
        q.setValues(values);
        return q;
    }

    private static Set<String> inputNames(RuleCalcIoResult io) {
        return Set.copyOf(names(io.getInputs()));
    }

    // ── 1. 끝내는 갈래가 만든 이름은 뒤 IF 앞에서 만들어진 이름이 아니다 ────────────

    /**
     * start → if1 [SKIP_FLAG == TRUE → k(R_PRE) → end(끝내는 갈래)] [그 외 → n(R_A1)] → if2 [PRE_FCT &gt; 1 → r2(R_B1)] [그 외] → j → end.
     * PRE_FCT 는 끝내는 갈래에서만 만들어지므로 if2 가 읽는 PRE_FCT 는 입력이다(엔진 FlowKeys 는 끝내는 갈래의 결과를 블록 뒤로 잇지 않는다).
     */
    private void endingIfSet() {
        rule("R_A1", "COIL_WID", null, "A1_OUT");
        rule("R_B1", "COIL_WID", null, "B1_OUT");
        set("S_END_IF", "[\"R_PRE\",\"R_A1\",\"R_B1\"]", flow(
                List.of(node("start", "START"), node("if1", "IF"), DmeTestSupport.ruleNode("k", "R_PRE"), DmeTestSupport.ruleNode("n", "R_A1"),
                        node("if2", "IF"), DmeTestSupport.ruleNode("r2", "R_B1"), node("j", "TASK"), node("end", "END")),
                List.of(edge("e1", "start", "if1"), branch("b1", "if1", "k", 1, "SKIP_FLAG == TRUE"), edge("ek", "k", "end"),
                        otherwise("bo", "if1", "n"), edge("en", "n", "if2"), branch("b2", "if2", "r2", 1, "PRE_FCT > 1"),
                        otherwise("bo2", "if2", "j"), edge("er2", "r2", "j"), edge("ej", "j", "end"))));
    }

    @Test
    void 끝내는_IF_갈래가_만든_이름을_뒤_IF_가_읽으면_view_입력에_올라오고_execute_가_엔진과_맞는다() {
        endingIfSet();

        RuleCalcIoResult io = service.io(req("SET", "S_END_IF", false));
        assertTrue(io.isOk(), io.getMessages().toString());
        assertEquals(Set.of("SKIP_FLAG", "COIL_THK", "COIL_WID", "PRE_FCT"), inputNames(io), "PRE_FCT 는 끝내는 갈래에서만 만들어져 입력이다");

        // 끝내는 갈래를 타지 않는 실행 — PRE_FCT 는 입력으로 받는다. SKIP_FLAG 는 IF 조건에만 쓰여 글자 "false" 도 불린으로 읽는다.
        RuleCalcRunResult normal = service.run(values("S_END_IF", Map.of("SKIP_FLAG", "false", "COIL_THK", "2.0", "COIL_WID", "1200", "PRE_FCT", "5")));
        assertTrue(normal.isOk(), normal.getMessages().toString());
        assertEquals("b1_out", normal.getResult().get("B1_OUT"));
        assertEquals(List.of("R_A1", "R_B1"), normal.getSteps().stream().map(RuleCalcRunResult.Step::getRuleId).toList());

        RuleCalcRunResult small = service.run(values("S_END_IF", Map.of("SKIP_FLAG", "false", "COIL_THK", "2.0", "COIL_WID", "1200", "PRE_FCT", "0.5")));
        assertTrue(small.isOk(), small.getMessages().toString());
        assertFalse(small.getResult().containsKey("B1_OUT"));

        // 끝내는 갈래를 타면 R_PRE 가 PRE_FCT 를 만들고 세트가 끝난다(글자 "TRUE" 도 불린).
        RuleCalcRunResult ended = service.run(values("S_END_IF", Map.of("SKIP_FLAG", "TRUE", "COIL_THK", "2.0", "COIL_WID", "1200", "PRE_FCT", "5")));
        assertTrue(ended.isOk(), ended.getMessages().toString());
        assertEquals("1.05", ended.getResult().get("PRE_FCT"));
        assertEquals(List.of("R_PRE"), ended.getSteps().stream().map(RuleCalcRunResult.Step::getRuleId).toList());

        // 입력 PRE_FCT 를 빼도 막지 않고 null 로 엔진에 넘긴다(F1). 엔진이 그 null 로 뒤 IF 를 판정하지 못하면 EVAL_ERROR 로 안내한다.
        RuleCalcRunResult missing = service.run(values("S_END_IF", Map.of("SKIP_FLAG", "false", "COIL_THK", "2.0", "COIL_WID", "1200")));
        assertFalse(missing.isOk());
        assertEquals(List.of("EVAL_ERROR"), codes(missing.getMessages()), missing.getMessages().toString());
    }

    /**
     * start → r1(R_NR) [받는 노드 c1: NO_RESULT → h(R_PRE) → end(끝내는 처리 갈래)] → if2 [PRE_FCT &gt; 1 → r2(R_B1)] [그 외] → j → end.
     * 끝내는 처리 갈래가 만든 PRE_FCT 는 블록 뒤로 이어지지 않으므로 if2 가 읽는 PRE_FCT 는 입력이다(엔진 FlowKeys.guardAll 과 같다).
     */
    @Test
    void 끝내는_처리_갈래가_만든_이름을_뒤_IF_가_읽으면_view_입력에_올라온다() {
        rule("R_NR", "COIL_WID", null, "NR_OUT", false);
        normalRow("R_NR", "GT", "100000", "hit");
        rule("R_B1", "COIL_WID", null, "B1_OUT");
        set("S_END_H", "[\"R_NR\",\"R_PRE\",\"R_B1\"]", flow(
                List.of(node("start", "START"), DmeTestSupport.ruleNode("r1", "R_NR"),
                        "{\"id\":\"c1\",\"kind\":\"CATCH\",\"attachTo\":\"r1\",\"catches\":[\"NO_RESULT\"]}", DmeTestSupport.ruleNode("h", "R_PRE"),
                        node("if2", "IF"), DmeTestSupport.ruleNode("r2", "R_B1"), node("j", "TASK"), node("end", "END")),
                List.of(edge("e1", "start", "r1"), edge("e2", "r1", "if2"), edge("e3", "c1", "h"), edge("e4", "h", "end"),
                        branch("b2", "if2", "r2", 1, "PRE_FCT > 1"), otherwise("bo2", "if2", "j"), edge("er2", "r2", "j"), edge("ej", "j", "end"))));

        RuleCalcIoResult io = service.io(req("SET", "S_END_H", false));
        assertTrue(io.isOk(), io.getMessages().toString());
        assertEquals(Set.of("COIL_WID", "COIL_THK", "PRE_FCT"), inputNames(io));

        RuleCalcRunResult normal = service.run(values("S_END_H", Map.of("COIL_THK", "2.0", "COIL_WID", "200000", "PRE_FCT", "5")));
        assertTrue(normal.isOk(), normal.getMessages().toString());
        assertEquals("b1_out", normal.getResult().get("B1_OUT"));

        RuleCalcRunResult ended = service.run(values("S_END_H", Map.of("COIL_THK", "2.0", "COIL_WID", "1200", "PRE_FCT", "5")));
        assertTrue(ended.isOk(), ended.getMessages().toString());
        assertEquals(List.of("R_PRE"), ended.getSteps().stream().map(RuleCalcRunResult.Step::getRuleId).toList(), "R_NR 은 받는 노드로 넘어가 단계에 없다");
    }

    // ── 2. 타입 선언이 룰마다 갈린 입력 ────────────────────────────────────────

    /** R_T1 은 FOO 를 타입 없이, R_T2 는 STRING 으로 읽는다. 두 번째 룰의 선언이 있으므로 FOO 는 타입 없는 입력이 아니다. */
    private void typedElsewhereSet() {
        rule("R_T1", "FOO", null, "T1_OUT");
        rule("R_T2", "FOO", "STRING", "T2_OUT");
        normalRow("R_T2", "EQ", "true", "yes");
        DmeTestSupport.ruleSet(jdbc, "S_T", "타입 갈림", "[\"R_T1\",\"R_T2\"]", "INUSE", 0);
    }

    @Test
    void 한_룰이_타입_없이_읽어도_다른_룰이_STRING_으로_읽으면_true_글자는_글자_그대로_간다() {
        typedElsewhereSet();

        RuleCalcRunResult r = service.run(values("S_T", Map.of("FOO", "true")));

        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals("yes", r.getResult().get("T2_OUT"), "FOO 는 글자 \"true\" 로 R_T2(STRING)에 간다 — 불린으로 바뀌지 않는다");
    }

    @Test
    void 타입_없는_입력의_TRUE_글자_변환은_IF_조건에만_쓰이는_변수에만_적용된다() {
        rule("R_U1", "FOO", null, "U1_OUT");                  // FOO 는 룰이 읽는 입력(어디에도 타입 선언이 없다)
        DmeTestSupport.ruleSet(jdbc, "S_U", "타입 없음", "[\"R_U1\"]", "INUSE", 0);

        RuleCalcRunResult r = service.run(values("S_U", Map.of("FOO", "true")));

        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals("true", r.getSteps().get(0).getInputs().get("FOO"), "룰이 읽는 입력이므로 글자 그대로(불린이 아니다)");
    }

    // ── 3. 숫자 크기 방어 우회 ────────────────────────────────────────────────

    @Test
    void STRING_으로_먼저_읽히는_입력에_큰_숫자_모양_글자를_보내도_INPUT_INVALID_다() {
        typedElsewhereSet();
        rule("R_T3", "BAR", null, "T3_OUT");

        for (String huge : List.of("1e999999999", "9".repeat(1001), "0." + "0".repeat(1500) + "1", "9".repeat(5000))) {
            RuleCalcRunResult declared = service.run(values("S_T", Map.of("FOO", huge)));
            assertFalse(declared.isOk(), huge.length() + "자");
            assertEquals(List.of("INPUT_INVALID"), codes(declared.getMessages()), huge.length() + "자");
            assertTrue(declared.getMessages().get(0).getText().contains("FOO"));
            assertTrue(declared.getMessages().get(0).getText().length() < 400);

            // 입력을 안 보내도(값 없음) 막지 않는다 — null 로 엔진에 넘긴다(F1).
            RuleCalcRunResult untyped = service.run(run("RULE", "R_T3", null, null));
            assertFalse(codes(untyped.getMessages()).contains("INPUT_MISSING"), untyped.getMessages().toString());
            RuleCalcRequest q = req("RULE", "R_T3", false);
            q.setValues(Map.of("BAR", huge));
            RuleCalcRunResult bar = service.run(q);
            assertEquals(List.of("INPUT_INVALID"), codes(bar.getMessages()), "타입 없는 입력도 같다: " + huge.length() + "자");
        }
    }

    // ── 4. valuesJson 의 따옴표 없는 JSON 숫자 ──────────────────────────────────

    @Test
    void valuesJson_의_따옴표_없는_큰_숫자는_INPUT_INVALID_메시지로_돌려준다() {
        RuleCalcRequest exp = req("RULE", "R_PRE", false);
        exp.setValuesJson("{\"COIL_THK\":1e999999999}");
        RuleCalcRunResult a = service.run(exp);
        assertFalse(a.isOk());
        assertEquals(List.of("INPUT_INVALID"), codes(a.getMessages()));

        RuleCalcRequest longNumber = req("RULE", "R_PRE", false);
        longNumber.setValuesJson("{\"COIL_THK\":" + "1".repeat(1500) + "}");        // Jackson 숫자 길이 제한(1000자) 초과
        RuleCalcRunResult b = service.run(longNumber);
        assertFalse(b.isOk());
        assertEquals(List.of("INPUT_INVALID"), codes(b.getMessages()));
        assertTrue(b.getMessages().get(0).getText().contains("valuesJson 숫자가 너무 큼"), b.getMessages().get(0).getText());

        RuleCalcRequest notObject = req("RULE", "R_PRE", false);
        notObject.setValuesJson("[1]");
        assertThrows(BusinessException.class, () -> service.run(notObject), "JSON 객체가 아니면 지금처럼 INVALID_VALUE 오류");
        RuleCalcRequest broken = req("RULE", "R_PRE", false);
        broken.setValuesJson("{\"COIL_THK\":");
        assertThrows(BusinessException.class, () -> service.run(broken));
    }

    // ── 5. steps[].inputs 는 엔진이 기록한 그 시점 값을 먼저 쓴다 ────────────────

    /**
     * start → p1 [R_PRE → PRE_FCT] [R_A1 → A1_OUT] → pm → R_POST(PRE_FCT·COIL_WID 를 읽는다) → end. 병렬 형제끼리는 결과를 읽지 않고(세트 검사가 막는다)
     * 합류 뒤 룰은 형제 결과를 읽는다.
     */
    @Test
    void 병렬_세트의_view_입력은_엔진_입력_키_검사와_맞고_합류_뒤_단계_입력은_형제_결과를_담는다() {
        rule("R_A1", "COIL_WID", null, "A1_OUT");
        set("S_PAR", "[\"R_PRE\",\"R_A1\",\"R_POST\"]", flow(
                List.of(node("start", "START"), node("p1", "PARALLEL"), DmeTestSupport.ruleNode("a", "R_PRE"), DmeTestSupport.ruleNode("b", "R_A1"),
                        "{\"id\":\"pm\",\"kind\":\"MERGE\",\"splitId\":\"p1\"}", DmeTestSupport.ruleNode("c", "R_POST"), node("end", "END")),
                List.of(edge("e0", "start", "p1"), "{\"id\":\"p1a\",\"from\":\"p1\",\"to\":\"a\",\"order\":1}",
                        "{\"id\":\"p1b\",\"from\":\"p1\",\"to\":\"b\",\"order\":2}", edge("ea", "a", "pm"), edge("eb", "b", "pm"),
                        edge("ep", "pm", "c"), edge("ec", "c", "end"))));

        RuleCalcIoResult io = service.io(req("SET", "S_PAR", false));
        assertTrue(io.isOk(), io.getMessages().toString());
        assertEquals(Set.of("COIL_THK", "COIL_WID"), inputNames(io), "PRE_FCT 는 합류 앞 R_PRE 가 만든다");

        RuleCalcRunResult r = service.run(values("S_PAR", Map.of("COIL_THK", "2.0", "COIL_WID", "1200")));
        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals("12.34", r.getResult().get("FINAL_WT"));
        RuleCalcRunResult.Step post = r.getSteps().stream().filter(s -> s.getRuleId().equals("R_POST")).findFirst().orElseThrow();
        assertEquals(Map.of("PRE_FCT", "1.05", "COIL_WID", "1200"), post.getInputs());
        RuleCalcRunResult.Step sibling = r.getSteps().stream().filter(s -> s.getRuleId().equals("R_A1")).findFirst().orElseThrow();
        assertEquals(Map.of("COIL_WID", "1200"), sibling.getInputs(), "형제 R_PRE 의 결과가 섞이지 않는다");
    }

    /**
     * start → r1(R_NR, 결과 없음) [받는 노드 c1: NO_RESULT → h(R_CODE: CATCH_CODE 를 읽는다)] → mr → end. 입력은 COIL_WID 뿐이고(CATCH_* 는 입력이 아니다)
     * 처리 갈래 룰의 단계 입력에는 엔진이 기록한 CATCH_CODE 가 있다.
     */
    @Test
    void 받는_노드의_처리_갈래_룰은_CATCH_값을_단계_입력으로_보인다() {
        rule("R_NR", "COIL_WID", null, "NR_OUT", false);
        normalRow("R_NR", "GT", "100000", "hit");
        rule("R_CODE", "CATCH_CODE", "STRING", "CODE_OUT");
        normalRow("R_CODE", "EQ", "NO_RESULT", "caught");
        set("S_CATCH", "[\"R_NR\",\"R_CODE\"]", flow(
                List.of(node("start", "START"), DmeTestSupport.ruleNode("r1", "R_NR"),
                        "{\"id\":\"c1\",\"kind\":\"CATCH\",\"attachTo\":\"r1\",\"catches\":[\"NO_RESULT\"]}", DmeTestSupport.ruleNode("h", "R_CODE"),
                        "{\"id\":\"mr\",\"kind\":\"MERGE\",\"splitId\":\"r1\"}", node("end", "END")),
                List.of(edge("e1", "start", "r1"), edge("e2", "r1", "mr"), edge("e3", "c1", "h"), edge("e4", "h", "mr"), edge("e5", "mr", "end"))));

        RuleCalcIoResult io = service.io(req("SET", "S_CATCH", false));
        assertTrue(io.isOk(), io.getMessages().toString());
        assertEquals(Set.of("COIL_WID"), inputNames(io), "CATCH_* 는 입력이 아니다");

        RuleCalcRunResult r = service.run(values("S_CATCH", Map.of("COIL_WID", "1200")));
        assertTrue(r.isOk(), r.getMessages().toString());
        assertEquals("caught", r.getResult().get("CODE_OUT"));
        assertEquals(List.of("R_CODE"), r.getSteps().stream().map(RuleCalcRunResult.Step::getRuleId).toList());
        assertEquals("NO_RESULT", r.getSteps().get(0).getInputs().get("CATCH_CODE"), "누적 값 맵에 없는 CATCH_* 도 엔진 기록으로 채운다");
    }
}
