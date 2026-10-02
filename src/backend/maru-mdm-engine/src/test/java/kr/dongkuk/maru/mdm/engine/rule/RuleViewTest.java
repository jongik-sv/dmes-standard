package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.BOOM;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.violations;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.withText;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.RuleEngine.Part;
import kr.dongkuk.maru.mdm.engine.rule.RuleView.CellView;
import kr.dongkuk.maru.mdm.engine.rule.RuleView.ColumnView;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/**
 * 정의 조회 {@code view}·{@code setView}(design §6.14, 06:473-498, I36). 계산하지 않고 스냅샷의 것을 꺼낸다.
 */
class RuleViewTest {

    private static final Instant TS = SampleRules.EVAL_TS;

    /** QLTY 1행 COIL_THK 셀 텍스트를 생성기와 다르게 둔 스냅샷(판정이 쓴 식 = 조회가 보여 주는 식, 06:494). */
    private static final String CUSTOM = "COIL_THK != NULL && COIL_THK >= 1.6 && COIL_THK < 2.5 && TRUE";

    private final RuleDefinition qlty = RuleFixtures.replaceCell(SampleRules.qltyGrdJdg(), 1, 1,
            withText(SampleRules.qltyGrdJdg().rows().get(0).cells().get(1), CUSTOM));

    private final InMemoryDefinitionLookup lookup = new InMemoryDefinitionLookup()
            .add(qlty, SampleRules.prodWgtCalc(), SampleRules.baseSpdLkp(), SampleRules.spdExc(), SampleRules.spdJoin(),
                    exprVarRule(), strayCellRule())
            .addSet(SampleRules.lsA3(),
                    new RuleSetDefinition("OLD", null, null, null, List.of("QLTY_GRD_JDG", "PROD_WGT_CALC"), SetStatus.DEPRECATED, null),
                    new RuleSetDefinition("MISSING", null, null, null, List.of("QLTY_GRD_JDG", "NOPE1", "NOPE2"), SetStatus.INUSE, null));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private static RuleDefinition exprVarRule() {
        return CellTextGenerator.withTexts(RuleFixtures.decision("EXV", 2, HitPolicy.FIRST,
                java.time.LocalDateTime.of(2026, 1, 1, 0, 0),
                List.of(RuleFixtures.exprVar(7, DispType.EQUAL, "STR_LEFT(SPEC_NM, 1)", List.of("SPEC_NM"), DataType.STRING, 1),
                        RuleFixtures.resultVar(2, DispType.EXPRESSION, "R", DataType.NUMBER, 1)),
                RuleFixtures.contract(List.of()),
                RuleFixtures.row(1, 1, 7, RuleFixtures.op("EQ", "A"), 2, RuleFixtures.expr(BOOM))), d -> null);
    }

    /** 변수 정의에 없는 var_id(12·11) 셀이 섞인 행. 판정용이 아니라 조회 순서 확인용이다. */
    private static RuleDefinition strayCellRule() {
        RuleDefinition d = RuleFixtures.decision("STRAY", 1, HitPolicy.FIRST, java.time.LocalDateTime.of(2026, 1, 1, 0, 0),
                List.of(RuleFixtures.resultVar(2, DispType.VALUE, "R", DataType.STRING, 2),
                        RuleFixtures.condVar(1, DispType.ONE, "A", DataType.STRING, 1)),
                RuleFixtures.contract(List.of()),
                RuleFixtures.row(1, 1, 12, cell("x"), 2, cell("\"r\""), 11, cell("y"), 1, cell("A == \"a\"")));
        return d;
    }

    private static RuleCell cell(String text) {
        return new RuleCell(null, null, null, null, text, null, null, text);
    }

    @Test
    void 아무_부분도_고르지_않으면_summary_text_ast_contract_exprText_exprAst_가_null() {
        RuleView v = engine.view("QLTY_GRD_JDG", TS, EnumSet.noneOf(Part.class));
        assertNull(v.contract());
        for (ColumnView c : v.columns()) {
            assertNull(c.exprText());
            assertNull(c.exprAst());
        }
        for (RuleView.RowView r : v.rows()) {
            for (CellView c : r.cells().values()) {
                assertEquals(new CellView(null, null, null), c);
            }
        }
        assertEquals("QLTY_GRD_JDG", v.ruleId());
        assertEquals(new java.math.BigDecimal("1.000"), v.ver());
        assertEquals(qlty.ruleKind(), v.ruleKind());
        assertEquals(HitPolicy.FIRST, v.hitPolicy());
        assertEquals(qlty.applyFrom(), v.applyFrom());
        assertEquals(qlty.applyTo(), v.applyTo());
    }

    @Test
    void TEXT_만_고르면_summary_와_text_만_채운다() {
        RuleView v = engine.view("QLTY_GRD_JDG", TS, EnumSet.of(Part.TEXT));
        CellView c = v.rows().get(0).cells().get(1);
        assertEquals("1.6 <= 변수 < 2.5", c.summary());
        assertEquals(CUSTOM, c.text());
        assertNull(c.ast());
        assertNull(v.contract());
        assertEquals("-", v.rows().get(2).cells().get(2).summary());
        assertEquals("", v.rows().get(2).cells().get(2).text());
        assertEquals("A", v.rows().get(0).cells().get(4).summary());
        assertEquals("\"A\"", v.rows().get(0).cells().get(4).text());
    }

    @Test
    void text_는_스냅샷_값_그대로이고_생성기로_다시_만들지_않는다() {
        assertEquals(CUSTOM, engine.text("QLTY_GRD_JDG", TS).rows().get(0).cells().get(1).text());
    }

    @Test
    void AST_만_고르면_ast_와_exprAst_만_같은_인스턴스로() {
        RuleView v = engine.view("QLTY_GRD_JDG", TS, EnumSet.of(Part.AST));
        CellView c5 = v.rows().get(0).cells().get(5);
        assertSame(qlty.rows().get(0).cells().get(5).ast(), c5.ast());
        assertNotNull(c5.ast());
        assertNull(c5.summary());
        assertNull(c5.text());

        RuleView e = engine.view("EXV", TS, EnumSet.of(Part.AST));
        assertSame(lookupDef("EXV").vars().get(0).exprAst(), e.columns().get(0).exprAst());
        assertNull(e.columns().get(0).exprText());
    }

    private RuleDefinition lookupDef(String id) {
        return lookup.rule(id, TS).orElseThrow();
    }

    @Test
    void 모두_고르면_contract_도_같은_인스턴스() {
        RuleView v = engine.view("QLTY_GRD_JDG", TS, EnumSet.allOf(Part.class));
        assertSame(qlty.contract(), v.contract());
        CellView c = v.rows().get(0).cells().get(5);
        assertEquals("1.05", c.summary());
        assertEquals("1.05", c.text());
        assertSame(qlty.rows().get(0).cells().get(5).ast(), c.ast());
    }

    @Test
    void 식_변수의_exprText_와_text_textAndAst_기본_메서드() {
        RuleView t = engine.text("EXV", TS);
        assertEquals("STR_LEFT(SPEC_NM, 1)", t.columns().get(0).exprText());
        assertNull(t.columns().get(0).exprAst());
        assertEquals("_V7 != NULL && _V7 == \"A\"", t.rows().get(0).cells().get(7).text());
        RuleView ta = engine.textAndAst("EXV", TS);
        assertEquals("STR_LEFT(SPEC_NM, 1)", ta.columns().get(0).exprText());
        assertNotNull(ta.columns().get(0).exprAst());
        assertNull(ta.contract());
        assertEquals(new java.math.BigDecimal("2.000"), ta.ver());
    }

    @Test
    void 열은_조건_seq_다음_결과_seq_행은_NORMAL_seq_다음_DEFAULT() {
        RuleView p = engine.view("PROD_WGT_CALC", TS, EnumSet.of(Part.TEXT));
        assertEquals(List.of(1, 3, 2), p.columns().stream().map(ColumnView::varId).toList());
        assertEquals(List.of(1, 3, 2), p.rows().stream().map(RuleView.RowView::rowId).toList());
        assertEquals(List.of(1, 3, 2), List.copyOf(p.rows().get(0).cells().keySet()));
        assertEquals("COIL", p.rows().get(0).cells().get(1).summary());

        RuleView q = engine.view("QLTY_GRD_JDG", TS, EnumSet.of(Part.TEXT));
        assertEquals(List.of(1, 2, 3, 4, 5), q.columns().stream().map(ColumnView::varId).toList());
        assertEquals(List.of(1, 2, 3, 4), q.rows().stream().map(RuleView.RowView::rowId).toList());
        assertEquals(List.of(4, 5), List.copyOf(q.rows().get(3).cells().keySet()));
        ColumnView c1 = q.columns().get(0);
        assertEquals(new ColumnView(1, c1.varKind(), DispType.TWO, "COIL_THK", DataType.NUMBER, null, null, 1, null, null), c1);
    }

    @Test
    void 변수_정의에_없는_var_id_셀은_뒤에_var_id_오름차순() {
        RuleView v = engine.view("STRAY", TS, EnumSet.of(Part.TEXT));
        assertEquals(List.of(1, 2), v.columns().stream().map(ColumnView::varId).toList());
        assertEquals(List.of(1, 2, 11, 12), List.copyOf(v.rows().get(0).cells().keySet()));
        assertEquals("x", v.rows().get(0).cells().get(12).text());
        assertEquals("x", v.rows().get(0).cells().get(12).summary());
    }

    @Test
    void view_는_식을_평가하지_않는다() {
        RuleView v = engine.view("EXV", TS, EnumSet.allOf(Part.class));
        assertEquals(BOOM, v.rows().get(0).cells().get(2).text());
    }

    @Test
    void view_의_룰_없음은_INPUT_CHECK_RULE_NOT_FOUND() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.view("NOPE", TS, EnumSet.of(Part.TEXT)));
        assertEquals(List.of("INPUT_CHECK/RULE_NOT_FOUND/NOPE/null/null"), violations(e));
    }

    @Test
    void view_는_초_미만을_자른_시각으로_조회한다() {
        engine.view("QLTY_GRD_JDG", TS.plusNanos(1), EnumSet.of(Part.TEXT));
        assertEquals(TS, lookup.ruleEvalTs().get(lookup.ruleEvalTs().size() - 1));
    }

    @Test
    void setView_는_세트_순서대로이고_폐기_세트도_조회한다() {
        List<RuleView> ls = engine.setView("LS_A3", TS, EnumSet.of(Part.TEXT));
        assertEquals(List.of("BASE_SPD_LKP", "SPD_EXC", "SPD_JOIN"), ls.stream().map(RuleView::ruleId).toList());
        List<RuleView> old = engine.setView("OLD", TS, EnumSet.of(Part.CONTRACT));
        assertEquals(List.of("QLTY_GRD_JDG", "PROD_WGT_CALC"), old.stream().map(RuleView::ruleId).toList());
        assertSame(qlty.contract(), old.get(0).contract());
        assertThrows(UnsupportedOperationException.class, () -> ls.clear());
    }

    @Test
    void setView_없는_룰은_모아서_SET_CHECK_RULE_NOT_FOUND() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.setView("MISSING", TS, EnumSet.of(Part.TEXT)));
        assertEquals(List.of("SET_CHECK/RULE_NOT_FOUND/NOPE1/null/null", "SET_CHECK/RULE_NOT_FOUND/NOPE2/null/null"),
                violations(e));
        EngineEvaluationException e2 = assertThrows(EngineEvaluationException.class,
                () -> engine.setView("NONE", TS, EnumSet.of(Part.TEXT)));
        assertEquals(List.of("SET_CHECK/SET_NOT_FOUND/null/null/null"), violations(e2));
    }

    @Test
    void 결과_열_그룹_열은_ColumnView_에_그룹_칸_없이_싣는다() {
        RuleView b = engine.view("BASE_SPD_LKP", TS, EnumSet.of(Part.TEXT));
        assertEquals(9, b.columns().size());
        Map<Integer, String> names = new LinkedHashMap<>();
        for (ColumnView c : b.columns()) {
            names.put(c.varId(), c.varName());
            assertNull(c.exprText());
        }
        assertEquals("GENERAL", names.get(9));
        List<RuleRow> rows = SampleRules.baseSpdLkp().rows();
        assertEquals(rows.size(), b.rows().size());
    }

    @Test
    void minorVersionIsKeptOnView() {
        RuleDefinition def = RuleFixtures.decision("R_MINOR", new java.math.BigDecimal("1.001"), HitPolicy.FIRST,
                java.time.LocalDateTime.of(2026, 1, 1, 0, 0),
                List.of(RuleFixtures.resultVar(2, DispType.VALUE, "R", DataType.STRING, 2),
                        RuleFixtures.condVar(1, DispType.ONE, "A", DataType.STRING, 1)),
                RuleFixtures.contract(List.of()));
        RuleView view = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()),
                new InMemoryDefinitionLookup().add(def)).text("R_MINOR", TS);
        assertEquals(new java.math.BigDecimal("1.001"), view.ver());
    }

    /** 기본 Jackson 은 BigDecimal 을 scale 그대로 JSON 숫자로 쓴다(1.000 → 1.000, 1 이 아니다). */
    @Test
    void versionSerializesAsJsonNumberKeepingScale() throws Exception {
        String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(java.util.Map.of("ver", engine.text("QLTY_GRD_JDG", TS).ver()));
        assertEquals("{\"ver\":1.000}", json);
    }
}
