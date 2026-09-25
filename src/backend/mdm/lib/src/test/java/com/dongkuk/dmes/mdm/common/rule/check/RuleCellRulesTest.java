package com.dongkuk.dmes.mdm.common.rule.check;

import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.cell;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.code;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.codes;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.cond;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.date;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.exprColumn;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.list;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.na;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.op;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.range;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.result;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.val;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCellRules.Result;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

/** TSK-08-04 design §3.1 「RuleCellRulesTest」 — I5·I6·I7·I8·I9·I10·I11(셀 자리). §6.3 표의 행마다 거부 1건 + 통과 1건. */
class RuleCellRulesTest {

    private static final ResolvedVar NUM2 = cond(1, "2", "COIL_THK", "NUMBER");
    private static final ResolvedVar NUM1 = cond(2, "1", "COIL_WID", "NUMBER");
    private static final ResolvedVar STR1 = cond(3, "1", "SURF_GRD", "STRING");
    private static final ResolvedVar BOOL1 = cond(4, "1", "OK_YN", "BOOLEAN");
    private static final ResolvedVar DATE2 = date(5, "2", "ORD_DT");
    private static final ResolvedVar CODE1 = code(6, "1", "STL_GRD", "STL_GRD_CD");

    // ── I5 경계 ──

    @ParameterizedTest
    @CsvSource({
        "'<= 변수 <=', 2.5, '', GE, 2.5",
        "'<= 변수 <',  2.5, '', GE, 2.5",
        "'< 변수 <=',  2.5, '', GT, 2.5",
        "'< 변수 <',   2.5, '', GT, 2.5",
        "'<= 변수 <=', '', 1.6, LE, 1.6",
        "'< 변수 <=',  '', 1.6, LE, 1.6",
        "'<= 변수 <',  '', 1.6, LT, 1.6",
        "'< 변수 <',   '', 1.6, LT, 1.6"})
    void 한쪽_빈_구간은_1_타입_op_로_바꾼다(String op, String left, String right, String expectedOp, String expectedValue) {
        Result r = RuleCellRules.condition(NUM2, range(op, left, right));
        assertEquals(List.of(), r.problems());
        assertEquals(Map.of("op", expectedOp, "left", expectedValue), r.cell());
    }

    @Test
    void 빈_쪽_키가_아예_없어도_1_타입_op_로_바꾼다() {
        Result r = RuleCellRules.condition(NUM2, cell("op", "< 변수 <", "right", "3"));
        assertEquals(Map.of("op", "LT", "left", "3"), r.cell());
    }

    @Test
    void 양쪽_빈_구간은_거부한다() {
        assertEquals(List.of("BOUND_EMPTY"), codes(RuleCellRules.condition(NUM2, range("<= 변수 <", "", "")).problems()));
        assertEquals(List.of("BOUND_EMPTY"), codes(RuleCellRules.condition(NUM2, cell("op", "<= 변수 <")).problems()));
    }

    @Test
    void 하한과_상한이_값으로_같으면_거부한다() {
        assertEquals(List.of("BOUND_EQUAL"), codes(RuleCellRules.condition(NUM2, range("<= 변수 <=", "1.10", "1.1")).problems()));
        assertEquals(List.of("BOUND_EQUAL"), codes(RuleCellRules.condition(DATE2, range("<= 변수 <", "20260101", "20260101")).problems()));
    }

    @Test
    void 하한이_상한보다_크면_거부한다() {
        assertEquals(List.of("BOUND_ORDER"), codes(RuleCellRules.condition(NUM2, range("<= 변수 <", "2.5", "1.6")).problems()));
        // 숫자는 값으로 견준다 — 문자열로는 "10" < "9".
        assertEquals(List.of(), RuleCellRules.condition(NUM2, range("<= 변수 <", "9", "10")).problems());
        // 일자 String 은 문자열로 견준다.
        assertEquals(List.of("BOUND_ORDER"), codes(RuleCellRules.condition(DATE2, range("<= 변수 <", "20261231", "20260101")).problems()));
    }

    @Test
    void 바른_구간은_그대로_둔다() {
        Map<String, Object> in = range("<= 변수 <", "1.60", "2.5");
        Result r = RuleCellRules.condition(NUM2, in);
        assertEquals(List.of(), r.problems());
        assertEquals(in, r.cell());
    }

    // ── I6 목록 ──

    @Test
    void 목록은_중복을_지우고_사전순으로_정렬한다() {
        Result r = RuleCellRules.condition(STR1, list("IN", "B", "A", "B"));
        assertEquals(List.of(), r.problems());
        assertEquals(List.of("A", "B"), r.cell().get("list"));
    }

    @Test
    void 숫자_목록은_값으로_중복을_지우고_앞_원소를_남겨_값_순서로_정렬한다() {
        Result r = RuleCellRules.condition(NUM1, list("NOT_IN", "10", "9", "9.0"));
        assertEquals(List.of(), r.problems());
        assertEquals(List.of("9", "10"), r.cell().get("list"));
        assertEquals(List.of("9.0", "10"), RuleCellRules.condition(NUM1, list("IN", "10", "9.0", "9")).cell().get("list"));
    }

    @Test
    void 문자열_목록은_UTF16_사전순이다() {
        assertEquals(List.of("B", "a", "가"), RuleCellRules.condition(STR1, list("IN", "가", "a", "B")).cell().get("list"));
    }

    @Test
    void 빈_목록은_거부한다() {
        assertEquals(List.of("LIST_EMPTY"), codes(RuleCellRules.condition(STR1, list("IN")).problems()));
        assertEquals(List.of("LIST_EMPTY"), codes(RuleCellRules.condition(STR1, cell("op", "NOT_IN")).problems()));
    }

    @Test
    void 목록_원소_수_상한과_같으면_통과하고_넘으면_거부한다() {
        String[] atLimit = IntStream.range(0, RuleLimits.MAX_LIST_ELEMENTS).mapToObj(i -> "V" + i).toArray(String[]::new);
        assertEquals(List.of(), RuleCellRules.condition(STR1, list("IN", atLimit)).problems());
        String[] over = IntStream.range(0, RuleLimits.MAX_LIST_ELEMENTS + 1).mapToObj(i -> "V" + i).toArray(String[]::new);
        assertEquals(List.of("LIST_TOO_LONG"), codes(RuleCellRules.condition(STR1, list("IN", over)).problems()));
        // 중복을 지운 뒤 센다.
        String[] dup = Stream.concat(Stream.of(atLimit), Stream.of("V0")).toArray(String[]::new);
        assertEquals(List.of(), RuleCellRules.condition(STR1, list("IN", dup)).problems());
    }

    @Test
    void 숫자_목록의_숫자가_아닌_원소는_거부한다() {
        assertEquals(List.of("TYPE_LITERAL"), codes(RuleCellRules.condition(NUM1, list("IN", "1", "1e3")).problems()));
    }

    // ── I7 = 패턴 ──

    @Test
    void 연속한_퍼센트는_하나로_접어_저장한다() {
        Result r = RuleCellRules.condition(STR1, op("EQ", "SGC%%"));
        assertEquals(List.of(), r.problems());
        assertEquals("SGC%", r.cell().get("left"));
        assertEquals("%A%B", RuleCellRules.condition(STR1, op("EQ", "%%%A%%B")).cell().get("left"));
    }

    @Test
    void 퍼센트_단독은_거부한다() {
        assertEquals(List.of("PATTERN_ONLY_PERCENT"), codes(RuleCellRules.condition(STR1, op("EQ", "%")).problems()));
        assertEquals(List.of("PATTERN_ONLY_PERCENT"), codes(RuleCellRules.condition(STR1, op("EQ", "%%%")).problems()));
    }

    @Test
    void 막지_않은_퍼센트가_3개를_넘으면_거부한다() {
        assertEquals(List.of("PATTERN_TOO_MANY_PERCENT"), codes(RuleCellRules.condition(STR1, op("EQ", "%A%B%C%")).problems()));
        assertEquals(List.of(), RuleCellRules.condition(STR1, op("EQ", "%A%B%C")).problems());
    }

    @Test
    void 막은_퍼센트는_세지도_접지도_않는다() {
        Result r = RuleCellRules.condition(STR1, op("EQ", "\\%\\%\\%\\%A%"));
        assertEquals(List.of(), r.problems());
        assertEquals("\\%\\%\\%\\%A%", r.cell().get("left"));
    }

    @Test
    void 일자_도메인은_와일드카드를_거부한다() {
        ResolvedVar date1 = date(7, "1", "ORD_DT");
        assertEquals(List.of("PATTERN_DATE_WILDCARD"), codes(RuleCellRules.condition(date1, op("EQ", "2026%")).problems()));
        assertEquals(List.of("PATTERN_DATE_WILDCARD"), codes(RuleCellRules.condition(date1, op("EQ", "2026010_")).problems()));
        assertEquals(List.of(), RuleCellRules.condition(date1, op("EQ", "20260101")).problems());
    }

    @Test
    void 코드_도메인은_패턴으로_보지_않는다() {
        Result r = RuleCellRules.condition(CODE1, op("EQ", "A%%"));
        assertEquals(List.of(), r.problems());
        assertEquals("A%%", r.cell().get("left"));
    }

    @Test
    void 패턴_길이_상한과_같으면_통과하고_넘으면_거부한다() {
        String atLimit = "A".repeat(RuleLimits.MAX_PATTERN_CHARS - 1) + "%";
        assertEquals(List.of(), RuleCellRules.condition(STR1, op("EQ", atLimit)).problems());
        assertEquals(List.of("PATTERN_TOO_LONG"), codes(RuleCellRules.condition(STR1, op("EQ", "A" + atLimit)).problems()));
    }

    @Test
    void 숫자_변수의_패턴은_거부한다() {
        assertEquals(List.of("PATTERN_NOT_STRING"), codes(RuleCellRules.condition(NUM1, op("EQ", "1%")).problems()));
    }

    @Test
    void 패턴이_아닌_등호_값과_목록_값은_글자_그대로다() {
        assertEquals("A%%", RuleCellRules.condition(STR1, op("NE", "A%%")).cell().get("left"));
        assertEquals(List.of("A%%"), RuleCellRules.condition(STR1, list("IN", "A%%")).cell().get("list"));
    }

    // ── I8 CONTAINS·INSTR ──

    @ParameterizedTest
    @CsvSource({"CONTAINS", "INSTR"})
    void CONTAINS_INSTR_은_빈_값을_거부하고_값은_글자_그대로다(String opCode) {
        assertEquals(List.of("TEXT_EMPTY"), codes(RuleCellRules.condition(STR1, op(opCode, "")).problems()));
        assertEquals(List.of("TEXT_EMPTY"), codes(RuleCellRules.condition(STR1, cell("op", opCode)).problems()));
        Result r = RuleCellRules.condition(STR1, op(opCode, " G3302%% "));
        assertEquals(List.of(), r.problems());
        assertEquals(" G3302%% ", r.cell().get("left"));
        assertEquals(List.of(), RuleCellRules.condition(CODE1, op(opCode, "SGCC,SGHC")).problems());
    }

    @ParameterizedTest
    @CsvSource({"CONTAINS", "INSTR"})
    void CONTAINS_INSTR_값_길이_상한과_같으면_통과하고_넘으면_거부한다(String opCode) {
        assertEquals(List.of(), RuleCellRules.condition(STR1, op(opCode, "A".repeat(RuleLimits.MAX_TEXT_CHARS))).problems());
        assertEquals(List.of("TEXT_TOO_LONG"),
                codes(RuleCellRules.condition(STR1, op(opCode, "A".repeat(RuleLimits.MAX_TEXT_CHARS + 1))).problems()));
    }

    @ParameterizedTest
    @CsvSource({"CONTAINS", "INSTR"})
    void CONTAINS_INSTR_은_일자_도메인을_거부한다(String opCode) {
        assertEquals(List.of("TEXT_DATE_DOMAIN"), codes(RuleCellRules.condition(date(7, "1", "ORD_DT"), op(opCode, "2026")).problems()));
    }

    @Test
    void IN_카테고리는_빈_값을_거부한다() {
        assertEquals(List.of("TEXT_EMPTY"), codes(RuleCellRules.condition(CODE1, op("CODE_IN", "")).problems()));
        assertEquals(List.of(), RuleCellRules.condition(CODE1, op("CODE_IN", "PLATING")).problems());
    }

    // ── I9 타입 ──

    @ParameterizedTest
    @CsvSource({"1e3", "0x1F", "1.", ".5", "abc", "'1,000'", "' 1'"})
    void 숫자_리터럴이_아니면_거부한다(String value) {
        assertEquals(List.of("TYPE_LITERAL"), codes(RuleCellRules.condition(NUM1, op("GT", value)).problems()));
    }

    @Test
    void 숫자_텍스트는_다시_쓰지_않는다() {
        Result r = RuleCellRules.condition(NUM1, op("GE", "01.50"));
        assertEquals(List.of(), r.problems());
        assertEquals("01.50", r.cell().get("left"));
        assertEquals("+2", RuleCellRules.condition(NUM1, op("EQ", "+2")).cell().get("left"));
        assertEquals("-0.5", RuleCellRules.condition(NUM1, op("LT", "-0.5")).cell().get("left"));
    }

    @Test
    void 불린은_TRUE_FALSE_만_받고_대문자로_정규화한다() {
        assertEquals(List.of("TYPE_LITERAL"), codes(RuleCellRules.condition(BOOL1, op("EQ", "yes")).problems()));
        assertEquals("TRUE", RuleCellRules.condition(BOOL1, op("EQ", "true")).cell().get("left"));
        assertEquals("FALSE", RuleCellRules.condition(BOOL1, op("EQ", "False")).cell().get("left"));
    }

    @Test
    void 결과_Value_도_결과_변수_타입으로_검사한다() {
        assertEquals(List.of("TYPE_LITERAL"), codes(RuleCellRules.result(result(8, 1, "Value", "PRC_FCT", "NUMBER"), val("1e3")).problems()));
        assertEquals("01.50", RuleCellRules.result(result(8, 1, "Value", "PRC_FCT", "NUMBER"), val("01.50")).cell().get("val"));
        assertEquals(List.of("TYPE_LITERAL"), codes(RuleCellRules.result(result(9, 2, "Value", "OK_YN", "BOOLEAN"), val("Y")).problems()));
        assertEquals("FALSE", RuleCellRules.result(result(9, 2, "Value", "OK_YN", "BOOLEAN"), val("false")).cell().get("val"));
        assertEquals(List.of(), RuleCellRules.result(result(10, 3, "Value", "QLTY_GRD", "STRING"), val("A%")).problems());
    }

    @Test
    void 결과_셀에_op_나_Value_열의_식은_거부한다() {
        assertEquals(List.of("OP_NOT_ALLOWED"), codes(RuleCellRules.result(result(8, 1, "Value", "PRC_FCT", "NUMBER"), na()).problems()));
        assertEquals(List.of("OP_NOT_ALLOWED"),
                codes(RuleCellRules.result(result(8, 1, "Value", "PRC_FCT", "NUMBER"), cell("expr", "1 + 1")).problems()));
        assertEquals(List.of("INCOMPLETE_RESULT"), codes(RuleCellRules.result(result(8, 1, "Value", "PRC_FCT", "NUMBER"), cell()).problems()));
        assertEquals(List.of(), RuleCellRules.result(result(8, 1, "Expression", "PRC_FCT", "NUMBER"), cell("expr", "1 + 1")).problems());
    }

    // ── I10·I11 op 허용 행렬·범위 자리 ──

    private static final Set<String> OP_STAGE = Set.of("OP_NOT_ALLOWED", "RANGE_OP_PLACE", "TEXT_DATE_DOMAIN");
    private static final List<String> RANGE_OPS = List.of("<= 변수 <=", "<= 변수 <", "< 변수 <=", "< 변수 <");
    private static final List<String> ALL_OPS = List.of("NA", "EQ", "NE", "LT", "LE", "GT", "GE", "IN", "NOT_IN", "CODE_IN", "CONTAINS",
            "INSTR", "IS_NULL", "NOT_NULL", "<= 변수 <=", "<= 변수 <", "< 변수 <=", "< 변수 <");

    /** 06:130-176 op-code 표 — op → 받는 데이터 타입 종류. */
    private static final Map<String, Set<String>> TYPES = Map.ofEntries(
            Map.entry("NA", Set.of("NUM", "STR", "DATE", "CODE", "BOOL")),
            Map.entry("EQ", Set.of("NUM", "STR", "DATE", "CODE", "BOOL")),
            Map.entry("NE", Set.of("NUM", "STR", "DATE", "CODE")),
            Map.entry("LT", Set.of("NUM", "DATE")), Map.entry("LE", Set.of("NUM", "DATE")),
            Map.entry("GT", Set.of("NUM", "DATE")), Map.entry("GE", Set.of("NUM", "DATE")),
            Map.entry("IN", Set.of("NUM", "STR", "DATE", "CODE")), Map.entry("NOT_IN", Set.of("NUM", "STR", "DATE", "CODE")),
            Map.entry("CODE_IN", Set.of("CODE")),
            Map.entry("CONTAINS", Set.of("STR", "CODE")), Map.entry("INSTR", Set.of("STR", "CODE")),
            Map.entry("IS_NULL", Set.of("NUM", "STR", "DATE", "CODE", "BOOL")), Map.entry("NOT_NULL", Set.of("NUM", "STR", "DATE", "CODE", "BOOL")),
            Map.entry("<= 변수 <=", Set.of("NUM", "DATE")), Map.entry("<= 변수 <", Set.of("NUM", "DATE")),
            Map.entry("< 변수 <=", Set.of("NUM", "DATE")), Map.entry("< 변수 <", Set.of("NUM", "DATE")));

    static Stream<Arguments> 행렬() {
        List<Arguments> out = new ArrayList<>();
        for (String disp : List.of("Equal", "1", "2")) {
            for (String kind : List.of("NUM", "STR", "DATE", "CODE", "BOOL")) {
                for (String opCode : ALL_OPS) {
                    boolean dispOk = switch (disp) {
                        case "Equal" -> opCode.equals("EQ") || opCode.equals("NA");
                        case "1" -> !RANGE_OPS.contains(opCode);
                        default -> true;
                    };
                    out.add(Arguments.of(disp, kind, opCode, dispOk && TYPES.get(opCode).contains(kind)));
                }
            }
        }
        return out.stream();
    }

    @ParameterizedTest(name = "{0} 열 {1} {2} → 허용 {3}")
    @MethodSource("행렬")
    void op_허용_행렬(String disp, String kind, String opCode, boolean allowed) {
        ResolvedVar var = switch (kind) {
            case "NUM" -> cond(1, disp, "V", "NUMBER");
            case "STR" -> cond(1, disp, "V", "STRING");
            case "DATE" -> date(1, disp, "V");
            case "CODE" -> code(1, disp, "V", "MC");
            default -> cond(1, disp, "V", "BOOLEAN");
        };
        String one = switch (kind) {
            case "NUM" -> "1";
            case "DATE" -> "20260101";
            case "BOOL" -> "TRUE";
            default -> "A";
        };
        String two = kind.equals("DATE") ? "20261231" : "2";
        Map<String, Object> c = switch (opCode) {
            case "NA", "IS_NULL", "NOT_NULL" -> cell("op", opCode);
            case "IN", "NOT_IN" -> list(opCode, one);
            default -> RANGE_OPS.contains(opCode) ? range(opCode, one, two) : op(opCode, one);
        };
        Result r = RuleCellRules.condition(var, c);
        if (allowed) {
            assertEquals(List.of(), r.problems());
        } else {
            assertFalse(r.problems().isEmpty(), "거부해야 한다");
            assertTrue(OP_STAGE.contains(r.problems().get(0).code().name()), r.problems().toString());
        }
    }

    @Test
    void 구간_op_는_2_타입_열에서만_받는다() {
        assertEquals(List.of("RANGE_OP_PLACE"), codes(RuleCellRules.condition(NUM1, range("<= 변수 <", "1", "2")).problems()));
        assertEquals(List.of("RANGE_OP_PLACE"), codes(RuleCellRules.condition(cond(1, "Equal", "V", "NUMBER"), range("< 변수 <", "1", "2")).problems()));
    }

    @Test
    void 모르는_op_와_op_없는_셀은_거부한다() {
        assertEquals(List.of("OP_NOT_ALLOWED"), codes(RuleCellRules.condition(NUM1, op("LIKE", "1")).problems()));
        assertEquals(List.of("OP_NOT_ALLOWED"), codes(RuleCellRules.condition(NUM1, cell("expr", "COIL_WID > 1")).problems()));
        assertEquals(List.of("OP_NOT_ALLOWED"), codes(RuleCellRules.condition(NUM1, cell()).problems()));
    }

    @Test
    void Expression_열은_NA_와_식만_받는다() {
        ResolvedVar ex = exprColumn(9, "두께 조건");
        assertEquals(List.of(), RuleCellRules.condition(ex, na()).problems());
        assertEquals(List.of(), RuleCellRules.condition(ex, cell("expr", "COIL_THK > 1")).problems());
        assertEquals(List.of("OP_NOT_ALLOWED"), codes(RuleCellRules.condition(ex, op("GT", "1")).problems()));
        assertEquals(List.of("OP_NOT_ALLOWED"), codes(RuleCellRules.condition(ex, cell()).problems()));
    }

    @Test
    void 입력_셀을_바꾸지_않는다() {
        Map<String, Object> in = range("<= 변수 <", "2.5", "");
        Map<String, Object> copy = Map.copyOf(in);
        RuleCellRules.condition(NUM2, in);
        assertEquals(copy, in);
        Map<String, Object> in2 = list("IN", "B", "A");
        RuleCellRules.condition(STR1, in2);
        assertEquals(List.of("B", "A"), in2.get("list"));
    }
}
