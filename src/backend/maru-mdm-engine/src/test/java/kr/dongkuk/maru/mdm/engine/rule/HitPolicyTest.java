package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.BOOM;
import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.FROM;
import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.TS;
import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.hitRows;
import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.trace;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.condVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.decision;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.defaultRow;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.expr;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.exprCondVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.na;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.op;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.val;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.violations;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vts;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.withCollect;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.withPrio;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.NUMBER;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.STRING;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.CollectAgg;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import org.junit.jupiter.api.Test;

/**
 * 적중 정책 FIRST·UNIQUE·PRIORITY·COLLECT·ANY 와 기본 행(design §6.3, D6-D8, I20-I25).
 */
class HitPolicyTest {

    private final InMemoryDefinitionLookup lookup = new InMemoryDefinitionLookup();
    private final MdmRuleEngine engine = new MdmRuleEngine(TestExpressionConfig.create(), lookup);

    private RuleResult run(RuleDefinition d, Map<String, Object> record) {
        lookup.add(CellTextGenerator.withTexts(d, x -> null));
        return engine.evaluate(d.ruleId(), record, TS);
    }

    private EngineEvaluationException fail(RuleDefinition d, Map<String, Object> record) {
        lookup.add(CellTextGenerator.withTexts(d, x -> null));
        return assertThrows(EngineEvaluationException.class, () -> engine.evaluate(d.ruleId(), record, TS));
    }

    private static final RuleVar A = condVar(1, DispType.ONE, "A", NUMBER, 1);

    /** 조건 A 하나 + 결과 열들. 행마다 조건 셀 op·값과 결과 셀. */
    private static RuleDefinition rule(String id, HitPolicy p, List<RuleVar> results, RuleRow... rows) {
        List<RuleVar> vars = new java.util.ArrayList<>();
        vars.add(A);
        vars.addAll(results);
        return decision(id, 1, p, FROM, vars, contract(vts("A", NUMBER)), rows);
    }

    // ------------------------------------------------------------------ FIRST(I20)

    @Test
    void FIRST_는_첫_적중에서_멈추고_뒤_행은_평가하지_않는다() {
        RuleDefinition d = rule("F", HitPolicy.FIRST, List.of(resultVar(2, DispType.VALUE, "R", STRING, 1)),
                row(1, 1, 1, op("GT", "10"), 2, val("a")),
                row(2, 2, 1, op("GT", "1"), 2, val("b")),
                row(3, 3, 1, op("GT", "0"), 2, val("c")));
        RuleResult r = run(d, rec("A", 5));
        assertEquals("b", r.results().get("R"));
        assertEquals(List.of(2), hitRows(r));
        assertEquals(List.of("1:T/F/1", "2:T/T/-", "3:F/F/-"), trace(r));
        assertEquals(new RuleResult.RowTrace(3, 3, false, false, null), r.trace().get(2));
    }

    @Test
    void 행은_seq_순으로_평가한다() {
        RuleDefinition d = rule("FS", HitPolicy.FIRST, List.of(resultVar(2, DispType.VALUE, "R", STRING, 1)),
                row(1, 2, 1, op("GT", "0"), 2, val("rowid1-seq2")),
                row(2, 1, 1, op("GT", "0"), 2, val("rowid2-seq1")));
        RuleResult r = run(d, rec("A", 5));
        assertEquals("rowid2-seq1", r.results().get("R"));
        assertEquals(List.of("2:T/T/-", "1:F/F/-"), trace(r));
    }

    @Test
    void 조건_열은_var_id_가_아니라_열_seq_순으로_본다() {
        // var 9 가 seq 1, var 2 가 seq 2. 변수 목록·셀 맵 순서는 일부러 var 2 를 앞에 둔다.
        RuleDefinition d = decision("SEQ", 1, HitPolicy.FIRST, FROM,
                List.of(condVar(2, DispType.ONE, "Q", NUMBER, 2), condVar(9, DispType.ONE, "P", NUMBER, 1),
                        resultVar(3, DispType.VALUE, "R", STRING, 1)),
                contract(vts("P", NUMBER, "Q", NUMBER)),
                row(1, 1, 2, op("GT", "10"), 9, op("GT", "10"), 3, val("a")));
        RuleResult r = run(d, rec("P", 5, "Q", 5));
        assertEquals(Integer.valueOf(9), r.trace().get(0).firstFalseVarId());
        assertFalse(r.defaultApplied());
        assertNull(r.results().get("R"));
    }

    @Test
    void 행_평가는_첫_거짓_셀에서_멈춘다() {
        RuleDefinition d = decision("STOP", 1, HitPolicy.FIRST, FROM,
                List.of(exprCondVar(2, 2), condVar(9, DispType.ONE, "P", NUMBER, 1),
                        resultVar(3, DispType.VALUE, "R", STRING, 1)),
                contract(vts("P", NUMBER)),
                row(1, 1, 2, expr(BOOM), 9, op("GT", "10"), 3, val("a")),
                row(2, 2, 2, expr("TRUE"), 9, na(), 3, val("b")));
        RuleResult r = run(d, rec("P", 5));
        assertEquals("b", r.results().get("R"));
        assertEquals(List.of("1:T/F/9", "2:T/T/-"), trace(r));
    }

    // ------------------------------------------------------------------ UNIQUE(I21)

    @Test
    void UNIQUE_적중이_둘_이상이면_UNIQUE_MULTIPLE_HITS() {
        RuleDefinition d = rule("U", HitPolicy.UNIQUE, List.of(resultVar(2, DispType.VALUE, "R", STRING, 1)),
                row(1, 1, 1, op("GT", "1"), 2, val("a")),
                row(2, 2, 1, op("GT", "10"), 2, val("b")),
                row(3, 3, 1, op("GT", "0"), 2, val("c")));
        EngineEvaluationException e = fail(d, rec("A", 5));
        assertEquals(List.of("ROW_SELECT/UNIQUE_MULTIPLE_HITS/U/null/null"), violations(e));
        assertTrue(e.violations().get(0).message().contains("1") && e.violations().get(0).message().contains("3"),
                e.violations().get(0).message());
    }

    @Test
    void UNIQUE_적중_하나는_모든_행을_본다() {
        RuleDefinition d = rule("U1", HitPolicy.UNIQUE, List.of(resultVar(2, DispType.VALUE, "R", STRING, 1)),
                row(1, 1, 1, op("GT", "1"), 2, val("a")),
                row(2, 2, 1, op("GT", "10"), 2, val("b")));
        RuleResult r = run(d, rec("A", 5));
        assertEquals("a", r.results().get("R"));
        assertEquals(List.of("1:T/T/-", "2:T/F/1"), trace(r));
    }

    // ------------------------------------------------------------------ PRIORITY(I22, D6)

    private static List<RuleVar> prioCols() {
        return List.of(withPrio(resultVar(2, DispType.VALUE, "GRD", STRING, 1), "A", "B", "C"),
                withPrio(resultVar(3, DispType.VALUE, "FCT", NUMBER, 2), "1.0", "2"),
                resultVar(4, DispType.VALUE, "TAG", STRING, 3));
    }

    @Test
    void PRIORITY_는_순위_1위_행을_고르고_hits_는_순위_순이다() {
        RuleDefinition d = rule("P", HitPolicy.PRIORITY, prioCols(),
                row(1, 1, 1, op("GT", "0"), 2, val("C"), 3, val("1"), 4, val("r1")),
                row(2, 2, 1, op("GT", "0"), 2, val("A"), 3, val("2"), 4, val("r2")),
                row(3, 3, 1, op("GT", "0"), 2, val("B"), 3, val("1"), 4, val("r3")),
                row(4, 4, 1, op("GT", "100"), 2, val("A"), 3, val("1"), 4, val("r4")));
        RuleResult r = run(d, rec("A", 5));
        assertEquals(List.of(2, 3, 1), hitRows(r));
        assertEquals("A", r.results().get("GRD"));
        assertNum("2", r.results().get("FCT"));
        assertEquals("r2", r.results().get("TAG"));
    }

    @Test
    void PRIORITY_첫_열_동률은_다음_순위_열로_가리고_숫자는_compareTo_로_맞춘다() {
        RuleDefinition d = rule("P2", HitPolicy.PRIORITY, prioCols(),
                row(1, 1, 1, op("GT", "0"), 2, val("A"), 3, val("2"), 4, val("r1")),
                row(2, 2, 1, op("GT", "0"), 2, val("A"), 3, val("1"), 4, val("r2")));
        RuleResult r = run(d, rec("A", 5));
        assertEquals(List.of(2, 1), hitRows(r));
        assertEquals("r2", r.results().get("TAG"));
    }

    @Test
    void PRIORITY_완전_동률이면_행_seq_가_작은_쪽() {
        RuleDefinition d = rule("P3", HitPolicy.PRIORITY, prioCols(),
                row(5, 1, 1, op("GT", "0"), 2, val("A"), 3, val("1"), 4, val("row5-seq1")),
                row(4, 2, 1, op("GT", "0"), 2, val("A"), 3, val("1"), 4, val("row4-seq2")),
                row(3, 3, 1, op("GT", "0"), 2, val("B"), 3, val("1"), 4, val("row3-seq3")));
        RuleResult r = run(d, rec("A", 5));
        assertEquals("row5-seq1", r.results().get("TAG"));
        assertEquals(List.of(5, 4, 3), hitRows(r));
    }

    @Test
    void PRIORITY_목록_밖_값과_NULL_은_가장_낮다() {
        RuleDefinition d = rule("P4", HitPolicy.PRIORITY, prioCols(),
                row(1, 1, 1, op("GT", "0"), 2, val("Z"), 3, val("1"), 4, val("out")),
                row(2, 2, 1, op("GT", "0"), 2, expr("NULL"), 3, val("1"), 4, val("null")),
                row(3, 3, 1, op("GT", "0"), 2, val("C"), 3, val("9"), 4, val("c")));
        RuleResult r = run(d, rec("A", 5));
        assertEquals("c", r.results().get("TAG"));
        assertEquals(List.of(3, 1, 2), hitRows(r));
    }

    @Test
    void PRIORITY_순위_열이_없으면_seq_가_가장_작은_행() {
        RuleDefinition d = rule("P5", HitPolicy.PRIORITY, List.of(resultVar(2, DispType.VALUE, "R", STRING, 1)),
                row(1, 2, 1, op("GT", "0"), 2, val("seq2")),
                row(2, 1, 1, op("GT", "0"), 2, val("seq1")));
        RuleResult r = run(d, rec("A", 5));
        assertEquals("seq1", r.results().get("R"));
        assertEquals(List.of(2, 1), hitRows(r));
    }

    @Test
    void PRIORITY_순위_일치_규칙() {
        assertEquals(0, ResultAggregator.rank(new BigDecimal("1"), List.of("1.0", "2")));
        assertEquals(1, ResultAggregator.rank(new BigDecimal("2.00"), List.of("1.0", "2")));
        assertEquals(2, ResultAggregator.rank(new BigDecimal("3"), List.of("1.0", "2")));
        assertEquals(2, ResultAggregator.rank(null, List.of("1.0", "2")));
        assertEquals(2, ResultAggregator.rank(new BigDecimal("1"), List.of("x", "y")));
        assertEquals(1, ResultAggregator.rank("B", List.of("A", "B")));
        assertEquals(2, ResultAggregator.rank("b", List.of("A", "B")));
        assertEquals(0, ResultAggregator.rank(Boolean.TRUE, List.of("true", "FALSE")));
        assertEquals(1, ResultAggregator.rank(Boolean.FALSE, List.of("true", "FALSE")));
        assertEquals(1, ResultAggregator.rank(List.of("A"), List.of("A")));
    }

    // ------------------------------------------------------------------ COLLECT(I23, D7)

    private static List<RuleVar> collectCols() {
        return List.of(withCollect(resultVar(2, DispType.EXPRESSION, "L", NUMBER, 1), CollectAgg.LIST),
                withCollect(resultVar(3, DispType.EXPRESSION, "S", NUMBER, 2), CollectAgg.SUM),
                withCollect(resultVar(4, DispType.EXPRESSION, "MN", NUMBER, 3), CollectAgg.MIN),
                withCollect(resultVar(5, DispType.EXPRESSION, "MX", NUMBER, 4), CollectAgg.MAX),
                withCollect(resultVar(6, DispType.EXPRESSION, "C", NUMBER, 5), CollectAgg.COUNT),
                resultVar(7, DispType.EXPRESSION, "D", NUMBER, 6));
    }

    private static RuleRow collectRow(int id, String cond, String v) {
        return row(id, id, 1, op("GT", cond), 2, expr(v), 3, expr(v), 4, expr(v), 5, expr(v), 6, expr(v), 7, expr(v));
    }

    @Test
    void COLLECT_는_적중_행_seq_순으로_모으고_NULL_을_버린다() {
        RuleDefinition d = rule("C", HitPolicy.COLLECT, collectCols(),
                collectRow(1, "0", "5"), collectRow(2, "0", "NULL"), collectRow(3, "100", "1"), collectRow(4, "0", "3"));
        RuleResult r = run(d, rec("A", 5));
        assertEquals(List.of(1, 2, 4), hitRows(r));
        List<?> list = (List<?>) r.results().get("L");
        assertEquals(2, list.size());
        assertNum("5", list.get(0));
        assertNum("3", list.get(1));
        assertNum("8", r.results().get("S"));
        assertNum("3", r.results().get("MN"));
        assertNum("5", r.results().get("MX"));
        assertNum("2", r.results().get("C"));
        List<?> d7 = (List<?>) r.results().get("D");
        assertEquals(2, d7.size(), "collect_agg 가 없으면 LIST");
        assertThrows(UnsupportedOperationException.class, () -> list.clear());
    }

    @Test
    void COLLECT_모은_값이_없으면_LIST_빈_목록_COUNT_0_나머지_NULL() {
        RuleDefinition d = rule("C0", HitPolicy.COLLECT, collectCols(),
                collectRow(1, "0", "NULL"), collectRow(2, "0", "NULL"));
        RuleResult r = run(d, rec("A", 5));
        assertEquals(List.of(), r.results().get("L"));
        assertNull(r.results().get("S"));
        assertNull(r.results().get("MN"));
        assertNull(r.results().get("MX"));
        assertNum("0", r.results().get("C"));
    }

    @Test
    void COLLECT_무적중은_기본_행_값_하나로_집계한다() {
        RuleDefinition d = rule("CD", HitPolicy.COLLECT, collectCols(),
                collectRow(1, "100", "5"),
                defaultRow(9, 2, expr("9"), 3, expr("9"), 4, expr("9"), 5, expr("9"), 6, expr("9"), 7, expr("9")));
        RuleResult r = run(d, rec("A", 5));
        assertTrue(r.defaultApplied());
        assertEquals(List.of(), r.hits());
        assertEquals(1, ((List<?>) r.results().get("L")).size());
        assertNum("9", ((List<?>) r.results().get("L")).get(0));
        assertNum("9", r.results().get("S"));
        assertNum("1", r.results().get("C"));
    }

    @Test
    void COLLECT_무적중에_기본_행도_없으면_모두_NULL() {
        RuleDefinition d = rule("CN", HitPolicy.COLLECT, collectCols(), collectRow(1, "100", "5"));
        RuleResult r = run(d, rec("A", 5));
        assertFalse(r.defaultApplied());
        for (String k : List.of("L", "S", "MN", "MX", "C", "D")) {
            assertTrue(r.results().containsKey(k), k);
            assertNull(r.results().get(k), k);
        }
    }

    @Test
    void COLLECT_문자열_MIN_MAX_와_타입_오류() {
        RuleDefinition d = rule("CS", HitPolicy.COLLECT,
                List.of(withCollect(resultVar(2, DispType.VALUE, "MN", STRING, 1), CollectAgg.MIN),
                        withCollect(resultVar(3, DispType.VALUE, "MX", STRING, 2), CollectAgg.MAX)),
                row(1, 1, 1, op("GT", "0"), 2, val("b"), 3, val("b")),
                row(2, 2, 1, op("GT", "0"), 2, val("a"), 3, val("a")),
                row(3, 3, 1, op("GT", "0"), 2, val("c"), 3, val("c")));
        RuleResult r = run(d, rec("A", 5));
        assertEquals("a", r.results().get("MN"));
        assertEquals("c", r.results().get("MX"));

        RuleDefinition bad = rule("CB", HitPolicy.COLLECT,
                List.of(withCollect(resultVar(2, DispType.VALUE, "S", STRING, 1), CollectAgg.SUM)),
                row(1, 1, 1, op("GT", "0"), 2, val("b")));
        assertEquals(List.of("RESULT_EVAL/EVALUATION_ERROR/CB/null/S"), violations(fail(bad, rec("A", 5))));
    }

    @Test
    void COLLECT_집계_함수_단위() {
        List<Object> nums = Arrays.asList(new BigDecimal("2"), null, new BigDecimal("1.5"));
        assertEquals(Arrays.asList(new BigDecimal("2"), new BigDecimal("1.5")), ResultAggregator.collect(CollectAgg.LIST, nums));
        assertEquals(0, new BigDecimal("3.5").compareTo((BigDecimal) ResultAggregator.collect(CollectAgg.SUM, nums)));
        assertEquals(0, new BigDecimal("1.5").compareTo((BigDecimal) ResultAggregator.collect(CollectAgg.MIN, nums)));
        assertEquals(0, new BigDecimal("2").compareTo((BigDecimal) ResultAggregator.collect(CollectAgg.MAX, nums)));
        assertEquals(0, new BigDecimal("2").compareTo((BigDecimal) ResultAggregator.collect(CollectAgg.COUNT, nums)));
        assertEquals(List.of(), ResultAggregator.collect(CollectAgg.LIST, Arrays.asList(null, null)));
        assertEquals(0, BigDecimal.ZERO.compareTo((BigDecimal) ResultAggregator.collect(CollectAgg.COUNT, List.of())));
        assertNull(ResultAggregator.collect(CollectAgg.SUM, List.of()));
        assertNull(ResultAggregator.collect(CollectAgg.MIN, List.of()));
        assertNull(ResultAggregator.collect(CollectAgg.MAX, List.of()));
        assertEquals("B", ResultAggregator.collect(CollectAgg.MIN, List.of("a", "B")));
        assertThrows(IllegalArgumentException.class, () -> ResultAggregator.collect(CollectAgg.SUM, List.of("a")));
        assertThrows(IllegalArgumentException.class,
                () -> ResultAggregator.collect(CollectAgg.MIN, List.of("a", BigDecimal.ONE)));
        assertThrows(IllegalArgumentException.class,
                () -> ResultAggregator.collect(CollectAgg.MAX, List.of(Boolean.TRUE, Boolean.FALSE)));
        assertEquals(0, new BigDecimal("2").compareTo((BigDecimal) ResultAggregator.collect(CollectAgg.COUNT,
                List.of("a", Boolean.TRUE))));
    }

    // ------------------------------------------------------------------ ANY(I24)

    @Test
    void ANY_는_모든_적중_행_값이_같으면_첫_적중_행_값() {
        RuleDefinition d = rule("A1", HitPolicy.ANY,
                List.of(resultVar(2, DispType.VALUE, "R", STRING, 1), resultVar(3, DispType.EXPRESSION, "N", NUMBER, 2),
                        resultVar(4, DispType.EXPRESSION, "Z", NUMBER, 3)),
                row(1, 1, 1, op("GT", "0"), 2, val("x"), 3, expr("1.0"), 4, expr("NULL")),
                row(2, 2, 1, op("GT", "0"), 2, val("x"), 3, expr("2 - 1"), 4, expr("NULL")),
                row(3, 3, 1, op("GT", "100"), 2, val("y"), 3, expr("9"), 4, expr("1")));
        RuleResult r = run(d, rec("A", 5));
        assertEquals("x", r.results().get("R"));
        assertNum("1", r.results().get("N"));
        assertNull(r.results().get("Z"));
        assertEquals(List.of(1, 2), hitRows(r));
    }

    @Test
    void ANY_결과가_다르면_결과_변수마다_ANY_CONFLICT() {
        RuleDefinition d = rule("A2", HitPolicy.ANY,
                List.of(resultVar(2, DispType.VALUE, "R", STRING, 1), resultVar(3, DispType.VALUE, "N", NUMBER, 2),
                        resultVar(4, DispType.VALUE, "SAME", STRING, 3)),
                row(1, 1, 1, op("GT", "0"), 2, val("x"), 3, val("1"), 4, val("s")),
                row(2, 2, 1, op("GT", "0"), 2, val("y"), 3, val("2"), 4, val("s")));
        assertEquals(List.of("RESULT_EVAL/ANY_CONFLICT/A2/null/R", "RESULT_EVAL/ANY_CONFLICT/A2/null/N"),
                violations(fail(d, rec("A", 5))));
    }

    @Test
    void ANY_값_비교는_숫자_compareTo_목록_원소별_null_끼리_같음() {
        assertTrue(ResultAggregator.sameValue(new BigDecimal("1.0"), BigDecimal.ONE));
        assertTrue(ResultAggregator.sameValue(new BigDecimal("1E+2"), new BigDecimal("100")));
        assertFalse(ResultAggregator.sameValue(new BigDecimal("1.1"), BigDecimal.ONE));
        assertTrue(ResultAggregator.sameValue(null, null));
        assertFalse(ResultAggregator.sameValue(null, "a"));
        assertFalse(ResultAggregator.sameValue("a", null));
        assertTrue(ResultAggregator.sameValue("a", "a"));
        assertFalse(ResultAggregator.sameValue("a", "A"));
        assertTrue(ResultAggregator.sameValue(Arrays.asList(new BigDecimal("1.0"), null), Arrays.asList(BigDecimal.ONE, null)));
        assertFalse(ResultAggregator.sameValue(List.of(BigDecimal.ONE), List.of(BigDecimal.ONE, BigDecimal.ONE)));
        assertFalse(ResultAggregator.sameValue(BigDecimal.ONE, "1"));
        assertTrue(ResultAggregator.sameValue(Boolean.TRUE, Boolean.TRUE));
    }

    // ------------------------------------------------------------------ 기본 행(I25, D8)

    @Test
    void 기본_행은_적중이_없을_때만_쓰고_hits_에_넣지_않는다() {
        RuleDefinition d = rule("D", HitPolicy.FIRST, List.of(resultVar(2, DispType.VALUE, "R", STRING, 1)),
                row(1, 1, 1, op("GT", "10"), 2, val("a")),
                defaultRow(2, 2, val("dflt")));
        RuleResult miss = run(d, rec("A", 5));
        assertEquals("dflt", miss.results().get("R"));
        assertTrue(miss.defaultApplied());
        assertEquals(List.of(), miss.hits());
        assertEquals(List.of("1:T/F/1"), trace(miss));

        RuleResult hit = engine.evaluate("D", rec("A", 50), TS);
        assertEquals("a", hit.results().get("R"));
        assertFalse(hit.defaultApplied());
    }

    @Test
    void 기본_행이_없는_무적중은_결과_키가_모두_있고_값은_null() {
        RuleDefinition d = rule("DN", HitPolicy.UNIQUE,
                List.of(resultVar(2, DispType.VALUE, "R", STRING, 1), resultVar(3, DispType.VALUE, "S", STRING, 2)),
                row(1, 1, 1, op("GT", "10"), 2, val("a"), 3, val("b")));
        RuleResult r = run(d, rec("A", 5));
        assertEquals(List.of("R", "S"), List.copyOf(r.results().keySet()));
        assertNull(r.results().get("R"));
        assertNull(r.results().get("S"));
        assertFalse(r.defaultApplied());
        assertEquals(List.of(), r.hits());
    }
}
