package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.condVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.decision;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.defaultRow;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.exprCondVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.exprVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.Expression;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.data.EvaluationValue;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestFunctions;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 생성기 거부 규칙(design §6.10.3)과 의미 — 생성 텍스트를 테스트 설정으로 실제로 평가해 NULL 정책·경계·패턴·방향을 본다
 * (I1-I14, 06:143-181·242-261).
 */
class CellTextGeneratorTest {

    private static final TestFunctions FUNCTIONS = new TestFunctions().code("PROC_CD", "PLATING", "P1", "P2");
    private static final ExpressionConfiguration CONFIG = TestExpressionConfig.create(FUNCTIONS);

    private static RuleCell cell(String op, String left, String right, List<String> list) {
        return new RuleCell(op, left, right, list, null, null, null, null);
    }

    private static String cond(RuleCell c, String subject, DataType type) {
        return CellTextGenerator.conditionText(c, subject, type, "PROC_CD");
    }

    private static boolean eval(String text, String name, Object value) {
        Map<String, Object> values = new HashMap<>();
        values.put(name, value);
        values.put(ReservedNames.EVAL_TS, Instant.parse("2026-09-30T15:00:00Z"));
        try {
            EvaluationValue v = new Expression(text, CONFIG).withValues(values).evaluate();
            assertTrue(v.isBooleanValue(), text + " → " + v);
            return v.getBooleanValue();
        } catch (Exception e) {
            throw new AssertionError(text + " 평가 실패: " + e, e);
        }
    }

    private static boolean evalCell(RuleCell c, DataType type, Object value) {
        return eval(cond(c, "V", type), "V", value);
    }

    // ------------------------------------------------------------------ 거부(6.10.3)

    static Stream<Arguments> rejected() {
        return Stream.of(
                Arguments.of("제어문자 STRING EQ", cell("EQ", "A\tB", null, null), DataType.STRING),
                Arguments.of("제어문자 NE", cell("NE", "A\u0001", null, null), DataType.STRING),
                Arguments.of("DEL 문자", cell("NE", "A\u007F", null, null), DataType.STRING),
                Arguments.of("홀로 선 백슬래시", cell("EQ", "A\\B", null, null), DataType.STRING),
                Arguments.of("끝의 백슬래시", cell("EQ", "A\\", null, null), DataType.STRING),
                Arguments.of("% 단독", cell("EQ", "%", null, null), DataType.STRING),
                Arguments.of("%% 단독", cell("EQ", "%%", null, null), DataType.STRING),
                Arguments.of("% 넷", cell("EQ", "%A%B%C%", null, null), DataType.STRING),
                Arguments.of("빈 CONTAINS", cell("CONTAINS", "", null, null), DataType.STRING),
                Arguments.of("null CONTAINS", cell("CONTAINS", null, null, null), DataType.STRING),
                Arguments.of("빈 INSTR", cell("INSTR", "", null, null), DataType.STRING),
                Arguments.of("숫자 1e3", cell("EQ", "1e3", null, null), DataType.NUMBER),
                Arguments.of("숫자 0x1F", cell("EQ", "0x1F", null, null), DataType.NUMBER),
                Arguments.of("숫자 .5", cell("EQ", ".5", null, null), DataType.NUMBER),
                Arguments.of("숫자 5.", cell("EQ", "5.", null, null), DataType.NUMBER),
                Arguments.of("숫자 1 0", cell("EQ", "1 0", null, null), DataType.NUMBER),
                Arguments.of("숫자 null", cell("EQ", null, null, null), DataType.NUMBER),
                Arguments.of("NUMBER EQ 1%", cell("EQ", "1%", null, null), DataType.NUMBER),
                Arguments.of("BOOLEAN Y", cell("EQ", "Y", null, null), DataType.BOOLEAN),
                Arguments.of("IN null", cell("IN", null, null, null), DataType.STRING),
                Arguments.of("IN 빈 목록", cell("IN", null, null, List.of()), DataType.STRING),
                Arguments.of("NOT_IN 빈 목록", cell("NOT_IN", null, null, List.of()), DataType.STRING),
                Arguments.of("IN 원소 제어문자", cell("IN", null, null, List.of("A", "B\n")), DataType.STRING),
                Arguments.of("구간 right 없음", cell("<= 변수 <", "1", null, null), DataType.NUMBER),
                Arguments.of("구간 left 없음", cell("< 변수 <", null, "1", null), DataType.NUMBER),
                Arguments.of("모르는 op LIKE", cell("LIKE", "A", null, null), DataType.STRING),
                Arguments.of("모르는 op BETWEEN", cell("BETWEEN", "1", "2", null), DataType.NUMBER),
                Arguments.of("op·expr 모두 없음", cell(null, "A", null, null), DataType.STRING),
                Arguments.of("EQ 데이터 타입 없음", cell("EQ", "A", null, null), null));
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("rejected")
    void 거부_사례는_IllegalArgumentException(String name, RuleCell c, DataType type) {
        assertThrows(IllegalArgumentException.class, () -> CellTextGenerator.conditionText(c, "V", type, "PROC_CD"));
    }

    @Test
    void CODE_IN_에_마루_코드가_없으면_거부한다() {
        RuleCell c = cell("CODE_IN", "PLATING", null, null);
        assertThrows(IllegalArgumentException.class,
                () -> CellTextGenerator.conditionText(c, "PROC_CD", DataType.STRING, null));
        assertThrows(IllegalArgumentException.class,
                () -> CellTextGenerator.conditionText(c, "PROC_CD", DataType.STRING, ""));
    }

    @Test
    void 주어가_없거나_식별자가_아니면_거부한다() {
        RuleCell c = cell("EQ", "A", null, null);
        assertThrows(IllegalArgumentException.class, () -> CellTextGenerator.conditionText(c, null, DataType.STRING, null));
        assertThrows(IllegalArgumentException.class, () -> CellTextGenerator.conditionText(c, "1ABC", DataType.STRING, null));
        assertThrows(IllegalArgumentException.class, () -> CellTextGenerator.conditionText(c, "A-B", DataType.STRING, null));
        assertThrows(IllegalArgumentException.class, () -> CellTextGenerator.conditionText(op("IS_NULL"), null, DataType.STRING, null));
        // Expression 셀·NA 는 주어가 필요 없다.
        assertEquals("X > 1", CellTextGenerator.conditionText(RuleFixtures.expr("X > 1"), null, null, null));
        assertEquals("", CellTextGenerator.conditionText(RuleFixtures.na(), null, null, null));
    }

    private static RuleCell op(String op) {
        return cell(op, null, null, null);
    }

    @Test
    void 결과_셀에_val_과_expr_가_모두_없으면_거부한다() {
        assertThrows(IllegalArgumentException.class,
                () -> CellTextGenerator.resultText(new RuleCell(null, null, null, null, null, null, null, null), DataType.STRING));
        assertThrows(IllegalArgumentException.class,
                () -> CellTextGenerator.resultText(RuleFixtures.val("1e3"), DataType.NUMBER));
        assertThrows(IllegalArgumentException.class,
                () -> CellTextGenerator.resultText(RuleFixtures.val("A\tB"), DataType.STRING));
    }

    @Test
    void subject_는_이름_변수면_var_name_식_변수면_V_varId() {
        assertEquals("COIL_THK", CellTextGenerator.subject(condVar(1, DispType.TWO, "COIL_THK", DataType.NUMBER, 1)));
        assertEquals("_V7", CellTextGenerator.subject(
                exprVar(7, DispType.EQUAL, "STR_LEFT(SPEC_NM, 1)", List.of("SPEC_NM"), DataType.STRING, 1)));
        assertThrows(IllegalArgumentException.class, () -> CellTextGenerator.subject(exprCondVar(3, 1)));
        assertThrows(IllegalArgumentException.class,
                () -> CellTextGenerator.subject(condVar(1, DispType.ONE, "1ABC", DataType.STRING, 1)));
    }

    // ------------------------------------------------------------------ NULL 정책(I1·I2)

    static Stream<Arguments> everyOp() {
        return Stream.of(
                Arguments.of(cell("EQ", "A", null, null), DataType.STRING),
                Arguments.of(cell("EQ", "SGC%", null, null), DataType.STRING),
                Arguments.of(cell("EQ", "%CC", null, null), DataType.STRING),
                Arguments.of(cell("EQ", "%G%", null, null), DataType.STRING),
                Arguments.of(cell("EQ", "A_C", null, null), DataType.STRING),
                Arguments.of(cell("EQ", "1", null, null), DataType.NUMBER),
                Arguments.of(cell("EQ", "TRUE", null, null), DataType.BOOLEAN),
                Arguments.of(cell("NE", "C", null, null), DataType.STRING),
                Arguments.of(cell("NE", "1", null, null), DataType.NUMBER),
                Arguments.of(cell("LT", "1", null, null), DataType.NUMBER),
                Arguments.of(cell("LE", "1", null, null), DataType.NUMBER),
                Arguments.of(cell("GT", "1", null, null), DataType.NUMBER),
                Arguments.of(cell("GE", "1", null, null), DataType.NUMBER),
                Arguments.of(cell("IN", null, null, List.of("A", "B")), DataType.STRING),
                Arguments.of(cell("NOT_IN", null, null, List.of("A", "B")), DataType.STRING),
                Arguments.of(cell("CODE_IN", "PLATING", null, null), DataType.STRING),
                Arguments.of(cell("CONTAINS", "CC", null, null), DataType.STRING),
                Arguments.of(cell("INSTR", "SGCC,SGHC", null, null), DataType.STRING),
                Arguments.of(cell("NOT_NULL", null, null, null), DataType.STRING),
                Arguments.of(cell("<= 변수 <=", "1", "2", null), DataType.NUMBER),
                Arguments.of(cell("<= 변수 <", "1", "2", null), DataType.NUMBER),
                Arguments.of(cell("< 변수 <=", "1", "2", null), DataType.NUMBER),
                Arguments.of(cell("< 변수 <", "1", "2", null), DataType.NUMBER));
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("everyOp")
    void NULL_입력이면_IS_NULL_외의_op_는_모두_거짓이다(RuleCell c, DataType type) {
        String text = cond(c, "V", type);
        if (!c.op().equals("NOT_NULL")) {
            assertTrue(text.startsWith("V != NULL && "), text);
        }
        assertFalse(eval(text, "V", null), text);
    }

    @Test
    void IS_NULL_은_NULL_에만_참이고_NA_는_텍스트가_없다() {
        assertTrue(evalCell(op("IS_NULL"), DataType.STRING, null));
        assertFalse(evalCell(op("IS_NULL"), DataType.STRING, "A"));
        assertTrue(evalCell(op("NOT_NULL"), DataType.STRING, "A"));
        assertEquals("", cond(RuleFixtures.na(), "V", DataType.STRING));
        assertEquals(CellTextGenerator.NA_TEXT, cond(RuleFixtures.na(), "V", DataType.NUMBER));
    }

    @Test
    void NE_는_NULL_에_적중하지_않는다() {
        assertFalse(evalCell(cell("NE", "C", null, null), DataType.STRING, null));
        assertTrue(evalCell(cell("NE", "C", null, null), DataType.STRING, "A"));
        assertFalse(evalCell(cell("NE", "C", null, null), DataType.STRING, "C"));
    }

    // ------------------------------------------------------------------ 구간(I3)

    static Stream<Arguments> ranges() {
        // op, V = 1.6, V = 2.5, V = 2.0, V = 1.0
        return Stream.of(
                Arguments.of("<= 변수 <=", true, true, true, false),
                Arguments.of("<= 변수 <", true, false, true, false),
                Arguments.of("< 변수 <=", false, true, true, false),
                Arguments.of("< 변수 <", false, false, true, false));
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("ranges")
    void 구간_op_는_양_끝_경계를_부등호대로_다룬다(String op, boolean atLeft, boolean atRight, boolean inside, boolean outside) {
        RuleCell c = cell(op, "1.6", "2.5", null);
        assertEquals(atLeft, evalCell(c, DataType.NUMBER, new BigDecimal("1.6")), op + " L");
        assertEquals(atRight, evalCell(c, DataType.NUMBER, new BigDecimal("2.5")), op + " R");
        assertEquals(inside, evalCell(c, DataType.NUMBER, new BigDecimal("2.0")), op + " 안");
        assertEquals(outside, evalCell(c, DataType.NUMBER, new BigDecimal("1.0")), op + " 밖");
        assertFalse(evalCell(c, DataType.NUMBER, new BigDecimal("3")), op + " 위");
    }

    @Test
    void 숫자_리터럴은_값으로_비교한다() {
        assertTrue(evalCell(cell("EQ", "1.10", null, null), DataType.NUMBER, new BigDecimal("1.1")));
        assertTrue(evalCell(cell("EQ", "1.1", null, null), DataType.NUMBER, new BigDecimal("1.10")));
        assertTrue(evalCell(cell("EQ", "-1.50", null, null), DataType.NUMBER, new BigDecimal("-1.5")));
        assertTrue(evalCell(cell("GE", "-1.5", null, null), DataType.NUMBER, new BigDecimal("-1")));
        assertFalse(evalCell(cell("GE", "-1.5", null, null), DataType.NUMBER, new BigDecimal("-2")));
    }

    @Test
    void 불린_EQ_는_V_TRUE_꼴을_유지한다() {
        assertEquals("V != NULL && V == TRUE", cond(cell("EQ", "true", null, null), "V", DataType.BOOLEAN));
        assertEquals("V != NULL && V == FALSE", cond(cell("EQ", "False", null, null), "V", DataType.BOOLEAN));
        assertTrue(evalCell(cell("EQ", "TRUE", null, null), DataType.BOOLEAN, Boolean.TRUE));
        assertFalse(evalCell(cell("EQ", "TRUE", null, null), DataType.BOOLEAN, Boolean.FALSE));
    }

    // ------------------------------------------------------------------ 패턴(I8-I10)

    static Stream<Arguments> patterns() {
        return Stream.of(
                Arguments.of("SGC%", "SGCC", true),
                Arguments.of("SGC%", "SGC", true),
                Arguments.of("SGC%", "XSGC", false),
                Arguments.of("%CC", "SGCC", true),
                Arguments.of("%CC", "CCX", false),
                Arguments.of("%G3302%", "JIS G3302 X", true),
                Arguments.of("%G3302%", "G330", false),
                Arguments.of("A%B", "AxxB", true),
                Arguments.of("A%B", "AxxBx", false),
                Arguments.of("A.B%", "A.BC", true),
                Arguments.of("A.B%", "AxBC", false),
                Arguments.of("A.B_", "A.B1", true),
                Arguments.of("A.B_", "AxB1", false),
                Arguments.of("A.B_", "A.B12", false),
                Arguments.of("_", "A", true),
                Arguments.of("_", "AB", false),
                Arguments.of("A_C", "ABC", true),
                Arguments.of("A_%", "AB", true),
                Arguments.of("A_%", "A", false),
                Arguments.of("A\\%", "A%", true),
                Arguments.of("A\\%", "AB", false),
                Arguments.of("A\\_B%", "A_BC", true),
                Arguments.of("A\\_B%", "AxBC", false),
                Arguments.of("A\\\\B%", "A\\BC", true),
                Arguments.of("A\\\\_", "A\\x", true),
                Arguments.of("A\\\\_", "Ax", false),
                Arguments.of("(a)[b]{c}^$|?*+._", "(a)[b]{c}^$|?*+.Z", true),
                Arguments.of("(a)[b]{c}^$|?*+._", "(a)[b]{c}^$|?*+xZ", false),
                Arguments.of("A\"B_", "A\"BC", true),
                Arguments.of("가나*", "가나*", true),
                Arguments.of("가나*", "가나다", false));
    }

    @ParameterizedTest(name = "{displayName} [{0} ~ {1} = {2}]")
    @MethodSource("patterns")
    void EQ_패턴은_글자_와일드카드_이스케이프를_구분한다(String pattern, String value, boolean expected) {
        assertEquals(expected, evalCell(cell("EQ", pattern, null, null), DataType.STRING, value));
    }

    @Test
    void NE_IN_의_문자열은_글자_그대로다() {
        assertTrue(evalCell(cell("NE", "A%", null, null), DataType.STRING, "AB"));
        assertFalse(evalCell(cell("NE", "A%", null, null), DataType.STRING, "A%"));
        assertTrue(evalCell(cell("IN", null, null, List.of("A%", "B")), DataType.STRING, "A%"));
        assertFalse(evalCell(cell("IN", null, null, List.of("A%", "B")), DataType.STRING, "AB"));
    }

    @Test
    void patternRegex_는_정규식형만_돌려준다() {
        assertEquals(Optional.of("A\\.B."), CellTextGenerator.patternRegex("A.B_"));
        assertEquals(Optional.of("A.*B"), CellTextGenerator.patternRegex("A%%B"));
        assertEquals(Optional.empty(), CellTextGenerator.patternRegex("SGC%"));
        assertEquals(Optional.empty(), CellTextGenerator.patternRegex("A"));
        assertEquals(Optional.empty(), CellTextGenerator.patternRegex("A\\%"));
        assertThrows(IllegalArgumentException.class, () -> CellTextGenerator.patternRegex("%"));
        assertThrows(IllegalArgumentException.class, () -> CellTextGenerator.patternRegex("A\\B"));
        assertThrows(IllegalArgumentException.class, () -> CellTextGenerator.patternRegex("%A%B%C%"));
        assertEquals(14, CellTextGenerator.REGEX_META.size());
        assertEquals(3, CellTextGenerator.MAX_PATTERN_WILDCARDS);
    }

    @Test
    void 접은_뒤_퍼센트_셋까지는_받는다() {
        assertEquals("V != NULL && STR_MATCHES(V, \".*A.*B.*\")", cond(cell("EQ", "%%A%%B%%", null, null), "V", DataType.STRING));
    }

    // ------------------------------------------------------------------ CONTAINS·INSTR·CODE_IN(I11·I12)

    @Test
    void CONTAINS_와_INSTR_는_방향이_반대다() {
        // 06:168-175 — CONTAINS 는 V 가 값을 품는가, INSTR 는 값이 V 를 품는가.
        assertTrue(evalCell(cell("CONTAINS", "SGCC", null, null), DataType.STRING, "JIS SGCC"));
        assertFalse(evalCell(cell("CONTAINS", "SGCC", null, null), DataType.STRING, "SG"));
        assertTrue(evalCell(cell("INSTR", "SGCC,SGHC,SGCH", null, null), DataType.STRING, "SGHC"));
        assertTrue(evalCell(cell("INSTR", "SGCC,SGHC,SGCH", null, null), DataType.STRING, "SG"));
        assertFalse(evalCell(cell("INSTR", "SGCC,SGHC,SGCH", null, null), DataType.STRING, "JIS SGCC"));
    }

    @Test
    void CONTAINS_값은_메타문자를_글자로_보고_대소문자를_가린다() {
        assertTrue(evalCell(cell("CONTAINS", "G3302%.*\\", null, null), DataType.STRING, "xG3302%.*\\y"));
        assertFalse(evalCell(cell("CONTAINS", "G3302%.*\\", null, null), DataType.STRING, "G3302AB"));
        assertFalse(evalCell(cell("CONTAINS", "sgcc", null, null), DataType.STRING, "SGCC"));
        assertTrue(evalCell(cell("CONTAINS", "\"", null, null), DataType.STRING, "a\"b"));
    }

    @Test
    void CODE_IN_은_카테고리_소속을_본다() {
        assertTrue(evalCell(cell("CODE_IN", "PLATING", null, null), DataType.STRING, "P1"));
        assertFalse(evalCell(cell("CODE_IN", "PLATING", null, null), DataType.STRING, "X"));
        assertFalse(evalCell(cell("CODE_IN", "PLATING", null, null), DataType.STRING, null));
        assertFalse(evalCell(cell("CODE_IN", "OTHER", null, null), DataType.STRING, "P1"));
    }

    @Test
    void 일자_문자열_구간과_원소_하나_IN() {
        RuleCell range = cell("<= 변수 <", "20260101", "20270101", null);
        assertTrue(evalCell(range, DataType.STRING, "20260615"));
        assertTrue(evalCell(range, DataType.STRING, "20260101"));
        assertFalse(evalCell(range, DataType.STRING, "20270101"));
        assertTrue(evalCell(cell("IN", null, null, List.of("A")), DataType.STRING, "A"));
        assertFalse(evalCell(cell("IN", null, null, List.of("A")), DataType.STRING, "B"));
        assertTrue(evalCell(cell("NOT_IN", null, null, List.of("C", "D")), DataType.STRING, "A"));
        assertFalse(evalCell(cell("NOT_IN", null, null, List.of("C", "D")), DataType.STRING, "D"));
        assertTrue(evalCell(cell("IN", null, null, List.of("1.0", "2")), DataType.NUMBER, BigDecimal.ONE));
    }

    // ------------------------------------------------------------------ withTexts

    @Test
    void withTexts_는_모든_셀에_텍스트를_채우고_NA_는_빈_문자열() {
        RuleDefinition def = decision("R", 1, HitPolicy.FIRST, LocalDateTime.of(2026, 1, 1, 0, 0),
                List.of(condVar(1, DispType.ONE, "SURF_GRD", DataType.STRING, 1),
                        condVar(2, DispType.ONE, "PROC_CD", DataType.STRING, "PROC_DOM", 2),
                        exprCondVar(3, 3),
                        exprVar(4, DispType.TWO, "COIL_THK * 2", List.of("COIL_THK"), DataType.NUMBER, 4),
                        resultVar(5, DispType.VALUE, "GRD", DataType.STRING, 1),
                        resultVar(6, DispType.EXPRESSION, "FCT", DataType.NUMBER, 2)),
                contract(List.of()),
                row(1, 1, 1, RuleFixtures.op("EQ", "A"), 2, RuleFixtures.op("CODE_IN", "PLATING"),
                        3, RuleFixtures.expr("COIL_WID > 1"), 4, RuleFixtures.range("<= 변수 <", "1", "2"),
                        5, RuleFixtures.val("A"), 6, RuleFixtures.expr("1.05")),
                row(2, 2, 1, RuleFixtures.na(), 2, RuleFixtures.na(), 3, RuleFixtures.na(), 4, RuleFixtures.na(),
                        5, RuleFixtures.val("B"), 6, RuleFixtures.expr("1")),
                defaultRow(3, 5, RuleFixtures.val("C")));
        List<String> asked = new java.util.ArrayList<>();
        RuleDefinition filled = CellTextGenerator.withTexts(def, d -> {
            asked.add(d);
            return "PROC_CD";
        });
        assertEquals(List.of("PROC_DOM"), asked, "해석 함수는 CODE_IN 셀에서만 부른다");
        Map<Integer, RuleCell> r1 = filled.rows().get(0).cells();
        assertEquals("SURF_GRD != NULL && SURF_GRD == \"A\"", r1.get(1).text());
        assertEquals("PROC_CD != NULL && MASTER(\"PROC_CD\", \"PLATING\", PROC_CD)", r1.get(2).text());
        assertEquals("COIL_WID > 1", r1.get(3).text());
        assertEquals("_V4 != NULL && _V4 >= 1 && _V4 < 2", r1.get(4).text());
        assertEquals("\"A\"", r1.get(5).text());
        assertEquals("1.05", r1.get(6).text());
        for (RuleCell c : filled.rows().get(1).cells().values()) {
            assertNotNull(c.text());
            if ("NA".equals(c.op())) {
                assertEquals("", c.text());
            }
        }
        assertEquals("\"C\"", filled.rows().get(2).cells().get(5).text());
        // 셀 구조와 순서는 그대로다.
        assertEquals(List.of(1, 2, 3, 4, 5, 6), List.copyOf(r1.keySet()));
        assertEquals(RuleFixtures.op("EQ", "A").left(), r1.get(1).left());
        assertEquals(def.vars(), filled.vars());
        assertEquals(def.contract(), filled.contract());
    }

    @Test
    void withTexts_오류_메시지에_룰_행_변수를_붙인다() {
        RuleDefinition def = decision("R9", 1, HitPolicy.FIRST, LocalDateTime.of(2026, 1, 1, 0, 0),
                List.of(condVar(1, DispType.ONE, "SURF_GRD", DataType.STRING, 1)),
                contract(List.of()),
                row(7, 1, 1, RuleFixtures.op("EQ", "%")));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> CellTextGenerator.withTexts(def, d -> null));
        assertTrue(e.getMessage().startsWith("rule R9 row 7 var 1: "), e.getMessage());
    }

    @Test
    void withTexts_는_CODE_IN_마루_코드를_못_찾으면_거부한다() {
        RuleDefinition def = decision("R", 1, HitPolicy.FIRST, LocalDateTime.of(2026, 1, 1, 0, 0),
                List.of(condVar(2, DispType.ONE, "PROC_CD", DataType.STRING, "PROC_DOM", 1)),
                contract(List.of()),
                row(1, 1, 2, RuleFixtures.op("CODE_IN", "PLATING")));
        assertThrows(IllegalArgumentException.class, () -> CellTextGenerator.withTexts(def, d -> null));
    }

    @Test
    void withTexts_의_행_순서는_그대로다() {
        RuleDefinition def = decision("R", 1, HitPolicy.FIRST, LocalDateTime.of(2026, 1, 1, 0, 0),
                List.of(condVar(1, DispType.ONE, "A", DataType.STRING, 1)),
                contract(List.of()),
                row(3, 2, 1, RuleFixtures.na()), row(1, 1, 1, RuleFixtures.na()));
        List<Integer> ids = CellTextGenerator.withTexts(def, d -> null).rows().stream().map(RuleRow::rowId).toList();
        assertEquals(List.of(3, 1), ids);
    }

    @Test
    void 식_변수_주어는_V_varId_다() {
        RuleVar v = exprVar(8, DispType.TWO, "A * 2", List.of("A"), DataType.NUMBER, 1);
        String text = CellTextGenerator.conditionText(RuleFixtures.range("<= 변수 <", "1", "2"),
                CellTextGenerator.subject(v), DataType.NUMBER, null);
        assertEquals("_V8 != NULL && _V8 >= 1 && _V8 < 2", text);
    }
}
