package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainFixtures;
import com.dongkuk.dmes.mdm.common.engine.MdmEngineConfig;
import com.dongkuk.dmes.mdm.common.rule.definition.SingleRuleDefinitionLookup;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.CollectAgg;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import org.junit.jupiter.api.Test;

/**
 * 판정 오류 문장 변환({@link RuleErrorText}) — 실제 엔진으로 오류를 내 {@link RuleCaseJudge#evaluate} 응답의 {@code message}(사용자 문장)·
 * {@code detail}(엔진 원문)·{@code stage}·{@code code} 를 본다. 엔진 문구가 바뀌면 여기서 먼저 깨진다.
 */
class RuleErrorTextTest {

    private static final MdmEvaluator EV = new MdmEvaluator(MdmEngineConfig.lookups(null, null, DomainFixtures.THK_OK));
    private static final Instant TS = Instant.parse("2026-09-01T00:00:00Z");
    private static final InputContract NONE = new InputContract(List.of(), List.of());

    // ------------------------------------------------------------------ 식 계산 실패

    @Test
    void 열_조건의_입력이_NULL_이면_그룹_이름과_입력_이름으로_알린다() {
        RuleDefinition d = def(HitPolicy.FIRST,
                List.of(res(2, "BASE_SPD_1", DataType.NUMBER, "BASE_SPD", "STR_STARTS_WITH(TOP_RESIN_CD, \"2\")"),
                        res(3, "BASE_SPD_2", DataType.NUMBER, "BASE_SPD", null)),
                new InputContract(List.of(new VarType("TOP_RESIN_CD", DataType.STRING, null, null)), List.of()),
                List.of(row(1, Map.of(2, cell("10"), 3, cell("20")))));
        Map<String, Object> e = only(d, m("TOP_RESIN_CD", null));

        assertEquals("ROW_SELECT", e.get("stage"));
        assertEquals("EVALUATION_ERROR", e.get("code"));
        assertEquals("결과 열 그룹 BASE_SPD 의 열 조건 `STR_STARTS_WITH(TOP_RESIN_CD, \"2\")` 을 계산하지 못했습니다. "
                + "입력 TOP_RESIN_CD 가 비어 있습니다(NULL). 값을 넣거나, 열 조건에 NULL 검사를 더하세요.", e.get("message"));
        assertTrue(String.valueOf(e.get("detail")).contains("NullPointerException"), String.valueOf(e.get("detail")));
    }

    @Test
    void 그룹_이름이_없는_옛_엔진_문구도_옮긴다() {
        String raw = "rule BASE_SPD_LKP: 열 조건 var 2 식 'STR_STARTS_WITH(TOP_RESIN_CD, \"2\")' 평가 오류: NullPointerException: "
                + "Cannot invoke \"String.startsWith(String)\" because \"string\" is null";
        assertEquals("결과 열 그룹의 열 조건 `STR_STARTS_WITH(TOP_RESIN_CD, \"2\")` 을 계산하지 못했습니다. "
                + "입력 TOP_RESIN_CD 가 비어 있습니다(NULL). 값을 넣거나, 열 조건에 NULL 검사를 더하세요.",
                RuleErrorText.describe("ROW_SELECT", "EVALUATION_ERROR", null, null, raw));
    }

    @Test
    void 조건_칸의_NULL_은_행과_후보_입력을_알린다() {
        Map<String, Object> one = only(condRule("STR_STARTS_WITH(A, \"2\")"), m("A", null));
        assertEquals("row_id 1 행의 조건 칸 `STR_STARTS_WITH(A, \"2\")` 을 계산하지 못했습니다. "
                + "입력 A 가 비어 있습니다(NULL). 값을 넣거나, 조건 칸 식에 NULL 검사를 더하세요.", one.get("message"));
        assertEquals(1, one.get("rowId"));

        Map<String, Object> two = only(condRule("STR_STARTS_WITH(A, B)"), m("A", null, "B", "x"));
        assertTrue(String.valueOf(two.get("message")).contains("입력 A, B 가운데 비어 있는(NULL) 값이 있습니다."), two.toString());
    }

    @Test
    void 없는_입력_없는_함수_문법_오류_불린_아님_0_나누기() {
        assertEquals("row_id 1 행의 조건 칸 `B > 1` 을 계산하지 못했습니다. 입력에 B 값이 없습니다. B 값을 넣거나, 식에 쓴 이름이 맞는지 확인하세요.",
                only(condRule("B > 1"), m("A", 1)).get("message"));
        assertEquals("row_id 1 행의 조건 칸 `FOO_BAR(A) > 1` 을 계산하지 못했습니다. 쓸 수 없는 함수입니다: FOO_BAR. 함수 이름을 확인하세요.",
                only(condRule("FOO_BAR(A) > 1"), m("A", 1)).get("message"));
        assertEquals("row_id 1 행의 조건 칸 `A > (1` 을 계산하지 못했습니다. 식 문법이 올바르지 않습니다. 괄호·따옴표·연산자를 확인하세요.",
                only(condRule("A > (1"), m("A", 1)).get("message"));
        assertEquals("row_id 1 행의 조건 칸 `A + 1` 의 결과가 참/거짓이 아니라 숫자입니다. 조건은 참이나 거짓을 내는 식이어야 합니다(예: 비교 >, ==).",
                only(condRule("A + 1"), m("A", 1)).get("message"));
        Map<String, Object> div = only(def(HitPolicy.FIRST, List.of(res(2, "OUT", DataType.NUMBER, null, null)), NONE,
                List.of(row(1, Map.of(2, cell("A / 0"))))), m("A", 1));
        assertEquals("RESULT_EVAL", div.get("stage"));
        assertEquals("row_id 1 행의 결과 칸 `A / 0` 을 계산하지 못했습니다. 0 으로 나누었습니다. 나누는 값이 0 이 되지 않게 식이나 입력을 고치세요.",
                div.get("message"));
    }

    /** 비즈니스 함수·타임아웃 문구 — {@code BusinessFunctionAdapter}·{@code MdmEvaluator} 문구를 그대로 옮긴 고정 문자열. */
    @Test
    void 비즈니스_함수_인자_NULL_인자_타입_시간_초과() {
        assertEquals("row_id 2 행의 결과 칸 `THK_FCT(COIL_THK)` 을 계산하지 못했습니다. 입력 COIL_THK 가 비어 있습니다(NULL). "
                + "값을 넣거나, 결과 칸 식에 NULL 검사를 더하세요.",
                RuleErrorText.describe("RESULT_EVAL", "EVALUATION_ERROR", 2, null,
                        "rule R: row 2 var 5 식 'THK_FCT(COIL_THK)' 평가 오류: EvaluationException: THK_FCT 의 인자 thk 가 NULL 이다"));
        assertEquals("row_id 2 행의 결과 칸 `THK_FCT(SURF_GRD)` 을 계산하지 못했습니다. 함수 THK_FCT 에 맞지 않는 종류의 값(숫자·문자 등)이 들어갔습니다. "
                + "입력 값의 종류를 확인하세요.",
                RuleErrorText.describe("RESULT_EVAL", "EVALUATION_ERROR", 2, null,
                        "rule R: row 2 var 5 식 'THK_FCT(SURF_GRD)' 평가 오류: EvaluationException: THK_FCT 는 STRING 인자를 받지 않는다"));
        assertEquals("row_id 1 행의 조건 칸 `SLOW(A)` 을 계산하지 못했습니다. 계산이 너무 오래 걸려 멈췄습니다. 식을 더 단순하게 고치세요.",
                RuleErrorText.describe("ROW_SELECT", "EVALUATION_ERROR", 1, null,
                        "rule R: row 1 var 1 식 'SLOW(A)' 평가 오류: ExpressionFailure: 식 평가가 500 ms 안에 끝나지 않았다: SLOW(A)"));
    }

    @Test
    void 조건_열_변수_식_실패() {
        RuleVar ev = new RuleVar(1, VarKind.COND, DispType.EQUAL, null, "A / 0", null, List.of("A"), DataType.NUMBER, null, null, null,
                null, null, null, null, 1);
        Map<String, Object> e = only(def(HitPolicy.FIRST, List.of(ev, res(2, "OUT", DataType.NUMBER, null, null)), NONE,
                List.of(row(1, Map.of(1, cell("_V1 == 1"), 2, cell("1"))))), m("A", 5));
        assertEquals("조건 열의 변수 식 `A / 0` 을 계산하지 못했습니다. 0 으로 나누었습니다. 나누는 값이 0 이 되지 않게 식이나 입력을 고치세요.",
                e.get("message"));
    }

    // ------------------------------------------------------------------ 입력·결과 검사

    @Test
    void 필수_입력_누락과_타입_변환() {
        RuleDefinition d = def(HitPolicy.FIRST,
                List.of(cond(1, DispType.EQUAL, "A", DataType.NUMBER), res(2, "OUT", DataType.NUMBER, null, null)),
                new InputContract(List.of(new VarType("A", DataType.NUMBER, null, null)), List.of()),
                List.of(row(1, Map.of(1, cell("A == 1"), 2, cell("1")))));
        Map<String, Object> missing = only(d, m());
        assertEquals("INPUT_CHECK", missing.get("stage"));
        assertEquals("MISSING_KEY", missing.get("code"));
        assertEquals("입력에 A 값이 없습니다. 이 룰을 판정하려면 A 값을 넣어야 합니다.", missing.get("message"));
        assertEquals("rule R1: 조건 변수 키가 레코드에 없다: A", missing.get("detail"));

        assertEquals("입력 A 에는 숫자 값이 와야 합니다(지금 값: 'abc'). 숫자 값으로 고치세요.", only(d, m("A", "abc")).get("message"));
    }

    @Test
    void 결과_계산에_필요한_입력() {
        RuleDefinition d = def(HitPolicy.FIRST, List.of(res(2, "OUT", DataType.NUMBER, null, null)),
                new InputContract(List.of(), List.of(new RowContract(1, null, List.of(new VarType("B", DataType.NUMBER, null, null)), List.of()))),
                List.of(row(1, Map.of(2, cell("B * 2")))));
        assertEquals("row_id 1 행의 결과를 계산하려면 입력 B 값이 필요한데 비어 있습니다(NULL). B 값을 넣으세요.",
                only(d, m("B", null)).get("message"));
        assertEquals("row_id 1 행의 결과를 계산하려면 입력 B 값이 필요한데 없습니다. B 값을 넣으세요.", only(d, m()).get("message"));
        assertEquals("입력 B 에는 숫자 값이 와야 합니다(지금 값: 'x'). 숫자 값으로 고치세요.", only(d, m("B", "x")).get("message"));
    }

    @Test
    void 결과_값_타입_변환() {
        Map<String, Object> e = only(def(HitPolicy.FIRST, List.of(res(2, "OUT", DataType.NUMBER, null, null)), NONE,
                List.of(row(1, Map.of(2, cell("\"abc\""))))), m());
        assertEquals("row_id 1 행의 결과 OUT 에는 숫자 값이 와야 합니다(지금 값: 'abc'). 결과 칸의 값이나 식을 고치세요.", e.get("message"));
    }

    // ------------------------------------------------------------------ 적중 방식

    @Test
    void UNIQUE_다중_적중과_ANY_충돌과_COLLECT_집계() {
        List<RuleRow> rows = List.of(row(1, Map.of(2, cell("1"))), row(3, Map.of(2, cell("2"))));
        assertEquals("적중 방식이 UNIQUE(한 행만 맞아야 함)인데 여러 행(row_id 1, 3)이 함께 맞았습니다. "
                + "행 조건이 서로 겹치지 않게 고치거나, 적중 방식을 FIRST·PRIORITY 등으로 바꾸세요.",
                only(def(HitPolicy.UNIQUE, List.of(res(2, "OUT", DataType.NUMBER, null, null)), NONE, rows), m()).get("message"));
        assertEquals("적중 방식이 ANY(맞은 행의 결과가 모두 같아야 함)인데 결과 OUT 의 값이 행마다 다릅니다. "
                + "맞는 행들이 같은 값을 내게 고치거나, 적중 방식을 바꾸세요.",
                only(def(HitPolicy.ANY, List.of(res(2, "OUT", DataType.NUMBER, null, null)), NONE, rows), m()).get("message"));

        RuleVar sum = new RuleVar(2, VarKind.RESULT, DispType.VALUE, "OUT", null, null, null, DataType.STRING, null, null, CollectAgg.SUM,
                null, null, null, null, 2);
        assertEquals("결과 OUT 의 값을 모으지(COLLECT SUM) 못했습니다. 합계·최소·최대는 숫자 결과에만 쓸 수 있습니다. 결과 값이나 집계 방식을 확인하세요.",
                only(def(HitPolicy.COLLECT, List.of(sum), NONE,
                        List.of(row(1, Map.of(2, cell("\"a\""))), row(3, Map.of(2, cell("\"b\""))))), m()).get("message"));
    }

    // ------------------------------------------------------------------ 룰·예약 키·케이스 입력

    @Test
    void 룰_없음과_예약_키() {
        RuleDefinition d = def(HitPolicy.FIRST, List.of(res(2, "OUT", DataType.NUMBER, null, null)), NONE, List.of(row(1, Map.of(2, cell("1")))));
        MdmRuleEngine engine = new MdmRuleEngine(EV, new SingleRuleDefinitionLookup(d));
        Map<String, Object> nf = RuleCaseJudge.evaluate(engine, "OTHER", m(), TS).errors().get(0);
        assertEquals("판정 시각에 적용되는 룰 OTHER 을 찾지 못했습니다. 룰의 적용 기간(시작·종료)과 판정 시각을 확인하세요.", nf.get("message"));

        assertTrue(String.valueOf(only(d, m("_X", 1)).get("message")).startsWith("입력 이름 _X 은(는) '_' 로 시작해"));
        assertTrue(String.valueOf(only(d, m("EVAL_TS", 1)).get("message")).contains("판정 시각용으로 예약"));
        assertTrue(String.valueOf(only(d, m("PI", 1)).get("message")).contains("상수 이름"));
        assertEquals("대소문자만 다른 입력 이름이 둘 이상 있습니다(A,a). 하나만 남기세요.", only(d, m("A", 1, "a", 2)).get("message"));
    }

    @Test
    void 케이스_입력이_JSON_객체가_아니면() {
        assertEquals("케이스 입력이 올바른 JSON 객체가 아닙니다. {\"이름\": 값} 모양으로 적으세요.",
                RuleErrorText.describe("INPUT_CHECK", "INVALID_INPUT_JSON", null, null, "케이스 입력이 JSON 객체가 아니다"));
    }

    @Test
    void 모르는_모양은_rule_머리만_떼고_원문을_돌려준다() {
        assertEquals("알 수 없는 문구", RuleErrorText.describe("ROW_SELECT", "EVALUATION_ERROR", null, null, "rule R1: 알 수 없는 문구"));
        assertEquals("새 오류", RuleErrorText.describe("X", "NEW_CODE", null, null, "새 오류"));
    }

    @Test
    void 식의_입력_이름은_함수_문자열_상수_예약_이름을_뺀다() {
        assertEquals(List.of("TOP_RESIN_CD"), RuleErrorText.inputs("STR_STARTS_WITH(TOP_RESIN_CD, \"A_B\")"));
        assertEquals(List.of("A", "B"), RuleErrorText.inputs("IF(A > 1E3 && B == NULL, _V3, EVAL_TS) + A"));
        assertFalse(RuleErrorText.inputs("COALESCE ( X , 'Y' )").contains("COALESCE"));
    }

    // ------------------------------------------------------------------ 도우미

    private static Map<String, Object> only(RuleDefinition d, Map<String, Object> input) {
        MdmRuleEngine engine = new MdmRuleEngine(EV, new SingleRuleDefinitionLookup(d));
        RuleCaseJudge.Evaluated e = RuleCaseJudge.evaluate(engine, d.ruleId(), input, TS);
        assertFalse(e.ok(), "판정 오류가 나야 한다");
        assertEquals(1, e.errors().size(), e.errors().toString());
        return e.errors().get(0);
    }

    private static RuleDefinition condRule(String condText) {
        return def(HitPolicy.FIRST,
                List.of(cond(1, DispType.EXPRESSION, null, DataType.BOOLEAN), res(2, "OUT", DataType.NUMBER, null, null)),
                NONE, List.of(row(1, Map.of(1, cell(condText), 2, cell("1")))));
    }

    private static RuleVar cond(int id, DispType d, String name, DataType t) {
        return new RuleVar(id, VarKind.COND, d, name, null, null, null, t, null, null, null, null, null, null, null, id);
    }

    private static RuleVar res(int id, String name, DataType t, String grp, String grpCond) {
        return new RuleVar(id, VarKind.RESULT, DispType.VALUE, name, null, null, null, t, null, null, null, null, grp, grpCond, null, id);
    }

    private static RuleCell cell(String text) {
        return new RuleCell(null, null, null, null, text, null, null, text);
    }

    private static RuleRow row(int id, Map<Integer, RuleCell> cells) {
        return new RuleRow(id, id, RowKind.NORMAL, cells);
    }

    private static RuleDefinition def(HitPolicy p, List<RuleVar> vars, InputContract c, List<RuleRow> rows) {
        return new RuleDefinition("R1", new BigDecimal("1.000"), RuleKind.DECISION, p, null, null, "1", vars, c, rows);
    }

    private static Map<String, Object> m(Object... kv) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            out.put((String) kv[i], kv[i + 1]);
        }
        return out;
    }

    @Test
    void SET_NOT_FOUND_는_세트_ID_와_KST_판정_시각을_담는다() {
        // 엔진 원문 모양은 MdmRuleEngine.set — "세트가 없다: {setId} @ {Instant}"(엔진 RuleSetEvaluationTest 가 고정)
        assertEquals("판정 시각 2026-03-01 09:00:00 에 적용되는 룰 세트 RS_A 의 버전이 없습니다. 세트 버전의 확정 여부와 적용 기간(시작·종료), "
                        + "판정 시각을 확인하세요.",
                RuleErrorText.describe("SET_CHECK", "SET_NOT_FOUND", null, null, "세트가 없다: RS_A @ 2026-03-01T00:00:00Z"));
        assertEquals("RS_A", RuleErrorText.missingSetId("세트가 없다: RS_A @ 2026-03-01T00:00:00Z"));
        assertEquals("룰 세트 RS_A 가 없습니다. 세트 ID 를 확인하세요.", RuleErrorText.setAbsent("RS_A"));
    }

    @Test
    void 세트_호출_순환_깊이는_원문을_문장_안에_남긴다() {
        // 엔진 원문 모양은 eng:4 가 정한다 — 모양을 읽지 않으므로 무엇이 와도 원문이 남는다.
        assertEquals("하위 세트 호출이 순환해 판정을 멈췄습니다(A › B › A). 세트가 서로를 부르지 않게 흐름을 고치세요.",
                RuleErrorText.describe("SET_CHECK", "SET_CALL_CYCLE", null, "B", "A › B › A"));
        assertEquals("하위 세트 호출 단계가 5 를 넘어 판정을 멈췄습니다(깊이 6). 부르는 단계를 줄이세요.",
                RuleErrorText.describe("SET_CHECK", "SET_CALL_DEPTH", null, "F", "깊이 6"));
    }

    @Test
    void withSetPath_는_경로가_있을_때만_앞에_붙인다() {
        assertEquals("세트 A › 단가 결정(s1) › [R] 문구", RuleErrorText.withSetPath("세트 A › 단가 결정(s1) › ", "[R] 문구"));
        assertEquals("[R] 문구", RuleErrorText.withSetPath("", "[R] 문구"));
        assertEquals("[R] 문구", RuleErrorText.withSetPath(null, "[R] 문구"));
    }
}
