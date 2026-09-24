package kr.dongkuk.maru.mdm.engine.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssue.Severity;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-02 design §3.1 「RuleAnalyzerTest」 — m-mdm {@code tests/evalex-rule-analysis.test.ts} 21건을 같은 입력·같은 기대로
 * 옮기고(이슈 목록 전체를 message 를 뺀 여섯 칸으로, 순서까지 비교), 이식에서 조용히 갈리는 자리(I14)를 더한다.
 */
class RuleAnalyzerTest {

    record Issue(RuleIssueCode code, Severity severity, List<Integer> rowIds, Integer varId, String lower, String upper) {}

    static List<Issue> analyze(AnalysisRule rule) {
        return RuleAnalyzer.analyze(rule).stream()
                .map(i -> new Issue(i.code(), i.severity(), i.rowIds(), i.varId(), i.lower(), i.upper()))
                .toList();
    }

    static Issue I(RuleIssueCode code, Severity severity, List<Integer> rowIds) {
        return new Issue(code, severity, rowIds, null, null, null);
    }

    static Issue I(RuleIssueCode code, Severity severity, List<Integer> rowIds, int varId) {
        return new Issue(code, severity, rowIds, varId, null, null);
    }

    static Issue gap(List<Integer> rowIds, int varId, String lower, String upper) {
        return new Issue(RuleIssueCode.VALUE_GAP, Severity.WARNING, rowIds, varId, lower, upper);
    }

    static Issue nullGap(int varId) {
        return new Issue(RuleIssueCode.NULL_GAP, Severity.WARNING, List.of(), varId, null, null);
    }

    static final Severity E = Severity.ERROR;
    static final Severity W = Severity.WARNING;

    // ------------------------------------------------------------------ 입력 도우미(TS col·rule·R·S·L 대응)

    static AnalysisVar col(int varId, DataType dataType) {
        return col(varId, dataType, DispType.ONE, null, false);
    }

    static AnalysisVar col(int varId, DataType dataType, DispType dispType, Integer scale, boolean dateString) {
        String name = dispType == DispType.EXPRESSION ? null : "V" + varId;
        return new AnalysisVar(varId, VarKind.COND, dispType, varId, name, false, dataType, scale, dateString, null);
    }

    static AnalysisVar num(int varId, DispType dispType, Integer scale) {
        return col(varId, DataType.NUMBER, dispType, scale, false);
    }

    static final AnalysisVar THK2 = num(1, DispType.TWO, 2);

    static RuleCell R(String op, String left, String right) {
        return new RuleCell(op, left, right, null, null, null, null, null);
    }

    static RuleCell S(String op, String left) {
        return new RuleCell(op, left, null, null, null, null, null, null);
    }

    static RuleCell L(String op, String... list) {
        return new RuleCell(op, null, null, List.of(list), null, null, null, null);
    }

    static RuleCell O(String op) {
        return new RuleCell(op, null, null, null, null, null, null, null);
    }

    static RuleCell Ex(String expr) {
        return new RuleCell(null, null, null, null, expr, Map.of("type", "OPERATOR"), null, null);
    }

    static RuleCell V(String val) {
        return new RuleCell(null, null, null, null, null, null, val, null);
    }

    static RuleRow row(int rowId, int seq, Map<Integer, RuleCell> cells) {
        return new RuleRow(rowId, seq, RowKind.NORMAL, cells);
    }

    static AnalysisRule rule(HitPolicy hit, List<AnalysisVar> vars, List<List<RuleCell>> rows) {
        List<RuleRow> out = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Map<Integer, RuleCell> cells = new LinkedHashMap<>();
            for (int j = 0; j < rows.get(i).size(); j++) {
                cells.put(vars.get(j).varId(), rows.get(i).get(j));
            }
            out.add(row(i + 1, i + 1, cells));
        }
        return new AnalysisRule("T", RuleKind.DECISION, hit, vars, out);
    }

    @SafeVarargs
    static List<List<RuleCell>> rows(List<RuleCell>... rows) {
        return Arrays.asList(rows);
    }

    static List<RuleCell> r(RuleCell... cells) {
        return Arrays.asList(cells);
    }

    // ------------------------------------------------------------------ TS 골든 21건

    @Nested
    class TS_골든 {

        @Test
        void _01_06_저장_시_검사_예_2_50_이_빈틈이고_NULL_빈틈은_따로_보인다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(THK2), rows(r(R("<= 변수 <", "1.6", "2.5")), r(R("< 변수 <=", "2.5", "3.0"))));
            assertEquals(List.of(gap(List.of(1, 2), 1, "2.50", "2.50"), nullGap(1)), analyze(x));
        }

        @Test
        void _02_이어진_구간이면_값_빈틈이_없다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(THK2), rows(r(R("<= 변수 <", "1.6", "2.5")), r(R("<= 변수 <=", "2.5", "3.0"))));
            assertEquals(List.of(nullGap(1)), analyze(x));
        }

        @Test
        void _03_빈틈은_소수_자리수_격자로_판정한다() {
            List<List<RuleCell>> rs = rows(r(R("<= 변수 <=", "1.6", "2.5")), r(R("<= 변수 <=", "2.6", "3.0")));
            assertEquals(List.of(nullGap(1)), analyze(rule(HitPolicy.UNIQUE, List.of(num(1, DispType.TWO, 1)), rs)));
            assertEquals(List.of(gap(List.of(1, 2), 1, "2.51", "2.59"), nullGap(1)),
                    analyze(rule(HitPolicy.UNIQUE, List.of(num(1, DispType.TWO, 2)), rs)));
        }

        @Test
        void _04_바깥_반직선은_빈틈으로_보고하지_않는다() {
            assertEquals(List.of(nullGap(1)), analyze(rule(HitPolicy.UNIQUE, List.of(THK2), rows(r(S("GE", "1.6"))))));
        }

        @Test
        void _05_IS_NULL_행이_있으면_NULL_빈틈이_없다() {
            assertEquals(List.of(), analyze(rule(HitPolicy.UNIQUE, List.of(THK2), rows(r(S("GE", "0")), r(O("IS_NULL"))))));
        }

        @Test
        void _06_scale_이_없으면_그_열_리터럴의_최대_소수_자리수를_쓴다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(num(1, DispType.TWO, null)),
                    rows(r(R("<= 변수 <", "1.6", "2.5")), r(R("< 변수 <=", "2.5", "3.05"))));
            assertEquals(List.of(gap(List.of(1, 2), 1, "2.50", "2.50"), nullGap(1)), analyze(x));
        }

        @Test
        void _07_다축은_나머지_조건_셀이_같은_행끼리_묶어_빈틈을_본다() {
            AnalysisRule x = rule(HitPolicy.FIRST, List.of(THK2, num(2, DispType.ONE, 0)), rows(
                    r(R("<= 변수 <", "1.6", "2.5"), S("LT", "1000")),
                    r(R("<= 변수 <=", "2.5", "3.0"), S("LT", "1000")),
                    r(R("<= 변수 <", "1.6", "2.5"), S("GE", "1000")),
                    r(R("< 변수 <=", "2.5", "3.0"), S("GE", "1000"))));
            assertEquals(List.of(gap(List.of(3, 4), 1, "2.50", "2.50"), nullGap(1), nullGap(2)), analyze(x));
        }

        @Test
        void _08_UNIQUE_표의_겹침은_OVERLAP_ERROR_다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(col(1, DataType.STRING)), rows(r(L("IN", "A")), r(L("IN", "A", "B"))));
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, E, List.of(1, 2)), nullGap(1)), analyze(x));
        }

        @Test
        void _09_FIRST_표의_겹침은_OVERLAP_WARNING_이고_뒤_행이_덮이면_UNREACHABLE_도_낸다() {
            AnalysisRule x = rule(HitPolicy.FIRST, List.of(col(1, DataType.STRING)), rows(r(L("IN", "A")), r(L("IN", "A", "B"))));
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, W, List.of(1, 2)), nullGap(1)), analyze(x));
        }

        @Test
        void _10_EQ_A_와_IN_A_는_같은_집합이라_겹친다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(col(1, DataType.STRING)), rows(r(S("EQ", "A")), r(L("IN", "A"))));
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, E, List.of(1, 2)), nullGap(1)), analyze(x));
        }

        @Test
        void _11_NE_A_와_IS_NULL_은_겹치지_않는다() {
            assertEquals(List.of(), analyze(rule(HitPolicy.UNIQUE, List.of(col(1, DataType.STRING)), rows(r(S("NE", "A")), r(O("IS_NULL"))))));
            assertEquals(List.of(), analyze(rule(HitPolicy.UNIQUE, List.of(col(1, DataType.STRING)), rows(r(O("NOT_NULL")), r(O("IS_NULL"))))));
        }

        @Test
        void _12_한_열이라도_서로소면_두_행은_겹치지_않는다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(col(1, DataType.STRING), col(2, DataType.STRING)),
                    rows(r(L("IN", "X"), L("IN", "A")), r(L("IN", "X"), L("IN", "B"))));
            assertEquals(List.of(nullGap(1), nullGap(2)), analyze(x));
        }

        @Test
        void _13_접두_패턴은_반개구간이다() {
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, E, List.of(1, 2)), nullGap(1)),
                    analyze(rule(HitPolicy.UNIQUE, List.of(col(1, DataType.STRING)), rows(r(S("EQ", "SGC%")), r(S("EQ", "SGCC"))))));
            assertEquals(List.of(nullGap(1)),
                    analyze(rule(HitPolicy.UNIQUE, List.of(col(1, DataType.STRING)), rows(r(S("EQ", "SGC%")), r(S("EQ", "SGD"))))));
        }

        @Test
        void _14_정적으로_못_푸는_셀은_UNRESOLVED_CELL_이고_그_짝은_OVERLAP_UNRESOLVED_다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(col(1, DataType.STRING)),
                    rows(r(S("EQ", "A%B")), r(S("CONTAINS", "X")), r(L("IN", "C"))));
            assertEquals(List.of(
                    I(RuleIssueCode.UNRESOLVED_CELL, W, List.of(1), 1),
                    I(RuleIssueCode.UNRESOLVED_CELL, W, List.of(2), 1),
                    I(RuleIssueCode.OVERLAP_UNRESOLVED, W, List.of(1, 2)),
                    I(RuleIssueCode.OVERLAP_UNRESOLVED, W, List.of(1, 3)),
                    I(RuleIssueCode.OVERLAP_UNRESOLVED, W, List.of(2, 3)),
                    nullGap(1)), analyze(x));
        }

        @Test
        void _15_Expression_셀이_낀_짝은_OVERLAP_UNRESOLVED_이고_Expression_열은_NULL_빈틈_대상이_아니다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE,
                    List.of(col(1, DataType.NUMBER), col(2, DataType.BOOLEAN, DispType.EXPRESSION, null, false)),
                    rows(r(S("GE", "1"), Ex("A > 1")), r(S("GE", "2"), Ex("A > 2"))));
            assertEquals(List.of(
                    I(RuleIssueCode.UNRESOLVED_CELL, W, List.of(1), 2),
                    I(RuleIssueCode.UNRESOLVED_CELL, W, List.of(2), 2),
                    I(RuleIssueCode.OVERLAP_UNRESOLVED, W, List.of(1, 2)),
                    nullGap(1)), analyze(x));
        }

        @Test
        void _16_조건_셀이_전부_NA_인_NORMAL_행은_ALL_NA_ROW_ERROR_다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(THK2, col(2, DataType.STRING)),
                    rows(r(S("GE", "1.6"), L("IN", "A")), r(O("NA"), O("NA"))));
            assertEquals(List.of(I(RuleIssueCode.ALL_NA_ROW, E, List.of(2)), nullGap(1), nullGap(2)), analyze(x));
        }

        @Test
        void _17_FIRST_앞_행_하나가_뒤_행을_덮으면_UNREACHABLE_이다() {
            AnalysisRule x = rule(HitPolicy.FIRST, List.of(THK2), rows(r(S("GE", "1.6")), r(R("<= 변수 <", "1.6", "2.5"))));
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, W, List.of(1, 2)), I(RuleIssueCode.UNREACHABLE, W, List.of(2, 1)), nullGap(1)),
                    analyze(x));
        }

        @Test
        void _18_FIRST_앞_행_여럿의_합집합이_덮어도_UNREACHABLE_이고_한_칸이라도_비면_아니다() {
            List<AnalysisVar> vars = List.of(num(1, DispType.TWO, 1), col(2, DataType.STRING));
            AnalysisRule covered = rule(HitPolicy.FIRST, vars, rows(
                    r(S("LT", "2"), L("IN", "A")),
                    r(S("GE", "2"), L("IN", "A")),
                    r(R("<= 변수 <=", "1", "3"), S("EQ", "A"))));
            assertEquals(List.of(
                    I(RuleIssueCode.OVERLAP, W, List.of(1, 3)),
                    I(RuleIssueCode.OVERLAP, W, List.of(2, 3)),
                    I(RuleIssueCode.UNREACHABLE, W, List.of(3, 1, 2)),
                    nullGap(1),
                    nullGap(2)), analyze(covered));
            AnalysisRule hole = rule(HitPolicy.FIRST, vars, rows(
                    r(S("LT", "2"), L("IN", "A")),
                    r(S("GT", "2"), L("IN", "A")),
                    r(R("<= 변수 <=", "1", "3"), S("EQ", "A"))));
            assertEquals(List.of(
                    I(RuleIssueCode.OVERLAP, W, List.of(1, 3)),
                    I(RuleIssueCode.OVERLAP, W, List.of(2, 3)),
                    nullGap(1),
                    nullGap(2)), analyze(hole));
        }

        @Test
        void _19_UNIQUE_표에는_UNREACHABLE_을_내지_않는다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(THK2), rows(r(S("GE", "1.6")), r(R("<= 변수 <", "1.6", "2.5"))));
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, E, List.of(1, 2)), nullGap(1)), analyze(x));
        }

        @Test
        void _20_06_샘플_두_표() {
            assertEquals(List.of(nullGap(1), nullGap(3)), analyze(qltyGrdJdg()));
            assertEquals(List.of(nullGap(1)), analyze(baseSpdLkp()));
        }

        @Test
        void _21_Boolean_과_일자_String_은_이산_값으로_본다() {
            assertEquals(List.of(nullGap(1)),
                    analyze(rule(HitPolicy.UNIQUE, List.of(col(1, DataType.BOOLEAN)), rows(r(S("EQ", "TRUE")), r(S("EQ", "FALSE"))))));
            AnalysisVar dt = col(1, DataType.STRING, DispType.ONE, null, true);
            assertEquals(List.of(nullGap(1)),
                    analyze(rule(HitPolicy.UNIQUE, List.of(dt), rows(r(S("LT", "20260902")), r(S("GT", "20260901"))))));
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, E, List.of(1, 2)), nullGap(1)),
                    analyze(rule(HitPolicy.UNIQUE, List.of(col(1, DataType.STRING)), rows(r(S("LT", "20260902")), r(S("GT", "20260901"))))));
        }
    }

    // ------------------------------------------------------------------ 이식 고유(design §3.1·I14)

    @Nested
    class 이식_경계 {

        @Test
        void 끝_0_만_다른_1_10_과_1_1_은_같은_경계다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(THK2), rows(r(R("<= 변수 <", "0", "1.10")), r(R("<= 변수 <=", "1.1", "3.0"))));
            assertEquals(List.of(nullGap(1)), analyze(x));
        }

        @Test
        void 다축_묶음_키는_끝_0_을_지운_값으로_견준다() {
            AnalysisRule x = rule(HitPolicy.FIRST, List.of(THK2, num(2, DispType.ONE, 0)), rows(
                    r(R("<= 변수 <", "1.6", "2.5"), S("LT", "1000.0")),
                    r(R("< 변수 <=", "2.5", "3.0"), S("LT", "1000"))));
            assertEquals(List.of(gap(List.of(1, 2), 1, "2.50", "2.50"), nullGap(1), nullGap(2)), analyze(x));
        }

        @Test
        void 빈틈_끝은_지수_표기_없이_격자_자리수로_쓴다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(num(1, DispType.TWO, null)),
                    rows(r(R("<= 변수 <", "0", "0.00000010")), r(R("< 변수 <=", "0.00000010", "1000.0"))));
            assertEquals(List.of(gap(List.of(1, 2), 1, "0.00000010", "0.00000010"), nullGap(1)), analyze(x));
        }

        @Test
        void 격자_아래_끝은_올리고_위_끝은_내린다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(num(1, DispType.TWO, 2)),
                    rows(r(R("<= 변수 <=", "0", "1.234")), r(R("<= 변수 <=", "1.3", "2"))));
            assertEquals(List.of(gap(List.of(1, 2), 1, "1.24", "1.29"), nullGap(1)), analyze(x));
            AnalysisRule longUpper = rule(HitPolicy.UNIQUE, List.of(num(1, DispType.TWO, 2)),
                    rows(r(R("<= 변수 <=", "0", "1.2")), r(R("< 변수 <=", "1.357", "2"))));
            assertEquals(List.of(gap(List.of(1, 2), 1, "1.21", "1.35"), nullGap(1)), analyze(longUpper));
        }

        @Test
        void 접두_패턴의_위_끝은_마지막_코드_유닛_더하기_1_이고_그_값은_빠진다() {
            AnalysisVar s = col(1, DataType.STRING);
            assertEquals(List.of(nullGap(1)), analyze(rule(HitPolicy.UNIQUE, List.of(s), rows(r(S("EQ", "AB%")), r(L("IN", "AC"))))));
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, E, List.of(1, 2)), nullGap(1)),
                    analyze(rule(HitPolicy.UNIQUE, List.of(s), rows(r(S("EQ", "AB%")), r(L("IN", "ABZZ"))))));
        }

        @Test
        void 마지막_코드_유닛이_FFFF_인_접두는_못_푸는_셀이다() {
            AnalysisRule x = rule(HitPolicy.UNIQUE, List.of(col(1, DataType.STRING)), rows(r(S("EQ", "A￿%")), r(L("IN", "B"))));
            assertEquals(List.of(
                    I(RuleIssueCode.UNRESOLVED_CELL, W, List.of(1), 1),
                    I(RuleIssueCode.OVERLAP_UNRESOLVED, W, List.of(1, 2)),
                    nullGap(1)), analyze(x));
        }

        @Test
        void UNREACHABLE_은_DECISION_의_FIRST_에서만_낸다() {
            List<List<RuleCell>> rs = rows(r(S("GE", "1.6")), r(R("<= 변수 <", "1.6", "2.5")));
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, W, List.of(1, 2)), nullGap(1)),
                    analyze(rule(HitPolicy.PRIORITY, List.of(THK2), rs)));
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, W, List.of(1, 2)), I(RuleIssueCode.UNREACHABLE, W, List.of(2, 1)), nullGap(1)),
                    analyze(rule(null, List.of(THK2), rs)));
            AnalysisRule derive = new AnalysisRule("T", RuleKind.DERIVE, null, List.of(THK2), rule(null, List.of(THK2), rs).rows());
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, W, List.of(1, 2)), nullGap(1)), analyze(derive));
        }

        @Test
        void 행은_seq_다음_rowId_순으로_보고_DEFAULT_행은_빼고_열은_seq_순으로_본다() {
            AnalysisVar b = new AnalysisVar(9, VarKind.COND, DispType.ONE, 2, "B", false, DataType.STRING, null, false, null);
            AnalysisVar a = new AnalysisVar(4, VarKind.COND, DispType.TWO, 1, "A", false, DataType.NUMBER, 2, false, null);
            AnalysisVar res = new AnalysisVar(5, VarKind.RESULT, DispType.VALUE, 1, "OUT", false, DataType.STRING, null, false, null);
            List<RuleRow> rs = List.of(
                    new RuleRow(8, 0, RowKind.DEFAULT, Map.of(5, V("Z"))),
                    row(5, 2, Map.of(4, R("<= 변수 <", "1.6", "2.5"), 9, L("IN", "X"), 5, V("P"))),
                    row(7, 1, Map.of(4, S("GE", "1.6"), 9, L("IN", "X"), 5, V("Q"))));
            AnalysisRule x = new AnalysisRule("T", RuleKind.DECISION, HitPolicy.FIRST, List.of(b, res, a), rs);
            assertEquals(List.of(I(RuleIssueCode.OVERLAP, W, List.of(7, 5)), I(RuleIssueCode.UNREACHABLE, W, List.of(5, 7)),
                    nullGap(4), nullGap(9)), analyze(x));
        }

        @Test
        void 조건_열이_없으면_이슈가_없다() {
            AnalysisVar res = new AnalysisVar(1, VarKind.RESULT, DispType.VALUE, 1, "OUT", false, DataType.STRING, null, false, null);
            assertEquals(List.of(), analyze(new AnalysisRule("T", RuleKind.DECISION, HitPolicy.FIRST, List.of(res),
                    List.of(row(1, 1, Map.of(1, V("A")))))));
        }

        @Test
        void 결과는_불변_리스트이고_message_를_싣는다() {
            List<RuleIssue> out = RuleAnalyzer.analyze(rule(HitPolicy.UNIQUE, List.of(THK2), rows(r(O("NA")))));
            assertEquals("1행의 조건 셀이 모두 - 다", out.get(0).message());
            assertThrows(UnsupportedOperationException.class, () -> out.add(out.get(0)));
        }
    }

    // ------------------------------------------------------------------ 06 샘플(m-mdm tests/fixtures/evalex-rules.ts)

    static AnalysisVar dictCond(int varId, DispType disp, String name, int seq) {
        return switch (name) {
            case "COIL_THK" -> new AnalysisVar(varId, VarKind.COND, disp, seq, name, false, DataType.NUMBER, 2, false, null);
            case "COIL_WID" -> new AnalysisVar(varId, VarKind.COND, disp, seq, name, false, DataType.NUMBER, 0, false, null);
            default -> new AnalysisVar(varId, VarKind.COND, disp, seq, name, false, DataType.STRING, null, false, null);
        };
    }

    static AnalysisVar result(int varId, DispType disp, String name, int seq, DataType dataType) {
        return new AnalysisVar(varId, VarKind.RESULT, disp, seq, name, false, dataType, null, false, null);
    }

    static AnalysisRule qltyGrdJdg() {
        return new AnalysisRule("QLTY_GRD_JDG", RuleKind.DECISION, HitPolicy.FIRST,
                List.of(dictCond(1, DispType.TWO, "COIL_THK", 1), dictCond(2, DispType.ONE, "COIL_WID", 2),
                        dictCond(3, DispType.ONE, "SURF_GRD", 3), result(4, DispType.VALUE, "QLTY_GRD", 1, DataType.STRING),
                        result(5, DispType.EXPRESSION, "PRC_FCT", 2, DataType.NUMBER)),
                List.of(
                        row(1, 1, Map.of(1, R("<= 변수 <", "1.6", "2.5"), 2, S("GT", "1000"), 3, L("IN", "A"), 4, V("A"), 5, Ex("1.05"))),
                        row(2, 2, Map.of(1, R("<= 변수 <", "1.6", "2.5"), 2, S("GT", "1000"), 3, L("IN", "B"), 4, V("B"), 5, Ex("1.00"))),
                        row(3, 3, Map.of(1, S("GE", "2.5"), 2, O("NA"), 3, L("NOT_IN", "C"), 4, V("B"),
                                5, Ex("ROUND(BASE_FCT * 0.98, 2)"))),
                        new RuleRow(4, 0, RowKind.DEFAULT, Map.of(4, V("C"), 5, Ex("0.90")))));
    }

    static AnalysisRule baseSpdLkp() {
        String[][] bands = {
            {"< 변수 <=", "0", "0.5"}, {"< 변수 <", "0.5", "0.6"}, {"<= 변수 <", "0.6", "0.7"}, {"<= 변수 <", "0.7", "0.8"},
            {"<= 변수 <", "0.8", "0.9"}, {"<= 변수 <", "0.9", "1"}, {"<= 변수 <=", "1", "1.2"},
        };
        int[][] vals = {
            {100, 100, 90, 110, 110, 110, 110, 120}, {100, 100, 90, 110, 110, 110, 110, 110},
            {90, 90, 80, 100, 100, 100, 100, 100}, {80, 80, 70, 90, 90, 90, 90, 90}, {70, 70, 60, 80, 80, 80, 80, 80},
            {60, 60, 50, 70, 70, 70, 70, 70}, {50, 50, 50, 70, 70, 60, 60, 60},
        };
        String[] grp = {"TEXTURE", "AKZO", "FLUORO", "WXL1", "WXL2", "BACK1", "BACK2", "GENERAL"};
        List<AnalysisVar> vars = new ArrayList<>();
        vars.add(dictCond(1, DispType.TWO, "COIL_THK", 1));
        for (int j = 0; j < grp.length; j++) {
            vars.add(result(j + 2, DispType.VALUE, grp[j], j + 1, DataType.NUMBER));
        }
        List<RuleRow> rs = new ArrayList<>();
        for (int i = 0; i < bands.length; i++) {
            Map<Integer, RuleCell> cells = new LinkedHashMap<>();
            cells.put(1, R(bands[i][0], bands[i][1], bands[i][2]));
            for (int j = 0; j < grp.length; j++) {
                cells.put(j + 2, V(String.valueOf(vals[i][j])));
            }
            rs.add(row(i + 1, i + 1, cells));
        }
        return new AnalysisRule("BASE_SPD_LKP", RuleKind.DECISION, HitPolicy.UNIQUE, vars, rs);
    }
}
