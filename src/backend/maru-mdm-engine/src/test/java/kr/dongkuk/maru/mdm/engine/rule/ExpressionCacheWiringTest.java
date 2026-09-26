package kr.dongkuk.maru.mdm.engine.rule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.FROM;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.condVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.decision;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.expr;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.exprCondVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.op;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.replaceCell;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.val;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.violations;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vts;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.withText;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.NUMBER;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.STRING;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.Expression;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.functions.AbstractFunction;
import com.ezylang.evalex.parser.Token;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.lang.reflect.Constructor;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestFunctions;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.api.Test;

/**
 * 캐시 연결 증명(TSK-03-03 design §3.6, 반려 재작업 I41-I48). 룰 판정이 주입한 {@link MdmEvaluator} 의 캐시·{@code copy()}
 * 로 도는지, Error·타임아웃·메시지 형식·공개 생성자 불변이 그대로인지 본다.
 */
class ExpressionCacheWiringTest {

    @Test
    void 룰_판정은_주입한_평가기의_캐시로_평가한다() {
        MdmEvaluator evaluator = MdmEvaluatorFixtures.of(TestExpressionConfig.create());
        MdmRuleEngine engine = new MdmRuleEngine(evaluator, SampleRules.lookup());
        RuleDefinition def = SampleRules.qltyGrdJdg();
        String condText = def.rows().get(0).cells().get(1).text();
        String resultText = def.rows().get(0).cells().get(5).text();
        assertNotEquals(condText, resultText);

        RuleResult r = engine.evaluate("QLTY_GRD_JDG",
                rec("COIL_THK", new BigDecimal("1.8"), "COIL_WID", new BigDecimal("1200"),
                        "SURF_GRD", "A", "BASE_FCT", new BigDecimal("1.0")),
                SampleRules.EVAL_TS);
        assertEquals("A", r.results().get("QLTY_GRD"));

        assertTrue(MdmEvaluatorFixtures.cacheSize(evaluator) > 0);
        assertTrue(MdmEvaluatorFixtures.isCached(evaluator, condText), condText);
        assertTrue(MdmEvaluatorFixtures.isCached(evaluator, resultText), resultText);
    }

    @Test
    void 요청마다_새_엔진이어도_평가기_캐시를_공유한다() {
        MdmEvaluator evaluator = MdmEvaluatorFixtures.of(TestExpressionConfig.create());
        Map<String, Object> record = rec("COIL_THK", new BigDecimal("1.8"), "COIL_WID", new BigDecimal("1200"),
                "SURF_GRD", "A", "BASE_FCT", new BigDecimal("1.0"));

        MdmRuleEngine a = new MdmRuleEngine(evaluator, SampleRules.lookup());
        RuleResult r1 = a.evaluate("QLTY_GRD_JDG", record, SampleRules.EVAL_TS);
        int n = MdmEvaluatorFixtures.cacheSize(evaluator);
        assertTrue(n > 0);

        MdmRuleEngine b = new MdmRuleEngine(evaluator, SampleRules.lookup());
        RuleResult r2 = b.evaluate("QLTY_GRD_JDG", record, SampleRules.EVAL_TS);
        assertEquals(n, MdmEvaluatorFixtures.cacheSize(evaluator));
        assertEquals(r1.results(), r2.results());
    }

    @Test
    void rule_main_은_Expression_을_직접_만들지_않는다() {
        JavaClasses rule = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("kr.dongkuk.maru.mdm.engine.rule");
        noClasses().that().resideInAPackage("..engine.rule..")
                .should().dependOnClassesThat().belongToAnyOf(Expression.class, ExpressionConfiguration.class)
                .as("rule main 은 EvalEx Expression 을 직접 만들지 않는다 — 공유 MdmEvaluator 만 거친다(I41)")
                .check(rule);
    }

    @Test
    void 평가_중_Error_는_잡지_않고_그대로_던진다() {
        MdmEvaluator evaluator = MdmEvaluatorFixtures.of(
                TestExpressionConfig.create(new TestFunctions(), Map.of("THROW_ERROR", new ThrowErrorFn())));
        ExpressionRunner runner = new ExpressionRunner(evaluator);
        AssertionError e = assertThrows(AssertionError.class,
                () -> runner.run("THROW_ERROR()", Map.of(), SampleRules.EVAL_TS));
        assertEquals("boom", e.getMessage());
    }

    @Test
    void 평가기가_감싸지_않은_RuntimeException_도_ExpressionFailure_로_감싼다() {
        MdmEvaluator evaluator = MdmEvaluatorFixtures.of(TestExpressionConfig.create());
        ExpressionRunner runner = new ExpressionRunner(evaluator);
        ExpressionFailure e = assertThrows(ExpressionFailure.class,
                () -> runner.run("1 == 1", Map.of(), null));
        assertTrue(e.getMessage().startsWith("NullPointerException: "), e.getMessage());
    }

    @Test
    void 평가_타임아웃은_단계의_EVALUATION_ERROR_다() {
        assertTimeoutPreemptively(Duration.ofSeconds(5), () -> {
            InMemoryDefinitionLookup lookup = new InMemoryDefinitionLookup();
            MdmEvaluator evaluator = MdmEvaluatorFixtures.of(
                    TestExpressionConfig.create(new TestFunctions(), Map.of("BLOCK", new BlockFn())),
                    Duration.ofMillis(50));
            MdmRuleEngine engine = new MdmRuleEngine(evaluator, lookup);

            RuleDefinition cond = CellTextGenerator.withTexts(decision("BC", 1, HitPolicy.FIRST, FROM,
                    List.of(exprCondVar(1, 1), resultVar(2, DispType.VALUE, "R", STRING, 1)),
                    contract(List.of()),
                    row(1, 1, 1, expr("BLOCK()"), 2, val("x"))), x -> null);
            lookup.add(cond);
            EngineEvaluationException e1 = assertThrows(EngineEvaluationException.class,
                    () -> engine.evaluate("BC", rec(), SampleRules.EVAL_TS));
            assertEquals(List.of("ROW_SELECT/EVALUATION_ERROR/BC/1/null"), violations(e1));
            assertTrue(e1.violations().get(0).message().contains("ms 안에 끝나지 않았다"), e1.violations().get(0).message());

            RuleDefinition res = CellTextGenerator.withTexts(decision("BR", 1, HitPolicy.FIRST, FROM,
                    List.of(condVar(1, DispType.ONE, "A", NUMBER, 1), resultVar(2, DispType.EXPRESSION, "R", NUMBER, 1)),
                    contract(vts("A", NUMBER)),
                    row(1, 1, 1, op("GT", "1"), 2, expr("BLOCK()"))), x -> null);
            lookup.add(res);
            EngineEvaluationException e2 = assertThrows(EngineEvaluationException.class,
                    () -> engine.evaluate("BR", rec("A", new BigDecimal("5")), SampleRules.EVAL_TS));
            assertEquals(List.of("RESULT_EVAL/EVALUATION_ERROR/BR/1/null"), violations(e2));
            assertTrue(e2.violations().get(0).message().contains("ms 안에 끝나지 않았다"), e2.violations().get(0).message());
        });
    }

    @Test
    void 실패_메시지는_원인_예외_형식을_지킨다() {
        InMemoryDefinitionLookup lookup = new InMemoryDefinitionLookup();
        MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

        RuleDefinition undefined = CellTextGenerator.withTexts(decision("MU", 1, HitPolicy.FIRST, FROM,
                List.of(exprCondVar(1, 1), resultVar(2, DispType.VALUE, "R", STRING, 1)),
                contract(List.of()),
                row(1, 1, 1, expr("Q > 1"), 2, val("x"))), x -> null);
        lookup.add(undefined);
        EngineEvaluationException e1 = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluate("MU", rec(), SampleRules.EVAL_TS));
        String msg1 = e1.violations().get(0).message();
        assertTrue(msg1.contains("EvaluationException: Variable or constant value for 'Q' not found"), msg1);
        assertFalse(msg1.contains("ExpressionFailure"), msg1);

        RuleDefinition parseOk = CellTextGenerator.withTexts(decision("MP", 1, HitPolicy.FIRST, FROM,
                List.of(condVar(1, DispType.ONE, "A", NUMBER, 1), resultVar(2, DispType.VALUE, "R", STRING, 1)),
                contract(vts("A", NUMBER)),
                row(1, 1, 1, op("GT", "1"), 2, val("x"))), x -> null);
        RuleDefinition parseFail = replaceCell(parseOk, 1, 1, withText(op("GT", "1"), "V =="));
        lookup.add(parseFail);
        EngineEvaluationException e2 = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluate("MP", rec("A", new BigDecimal("5")), SampleRules.EVAL_TS));
        assertTrue(e2.violations().get(0).message().contains("ParseException: "), e2.violations().get(0).message());
    }

    @Test
    void MdmEvaluator_의_공개_생성자는_두_개_그대로다() {
        Constructor<?>[] ctors = MdmEvaluator.class.getConstructors();
        assertEquals(2, ctors.length);
        Set<List<Class<?>>> shapes = new HashSet<>();
        for (Constructor<?> c : ctors) {
            shapes.add(List.of(c.getParameterTypes()));
        }
        assertTrue(shapes.contains(List.of(EngineLookups.class)));
        assertTrue(shapes.contains(List.of(EngineLookups.class, Duration.class)));

        EngineLookups lookups = InMemoryLookups.create()
                .function(InMemoryLookups.fn("THK_OK", args -> args.get(0), "x"))
                .build();
        MdmEvaluator e = new MdmEvaluator(lookups);
        assertEquals(Set.of("THK_OK"), e.businessFunctionNames());
    }

    /** 0인자 — 평가하면 항상 {@link AssertionError} 를 던진다(I43). */
    private static final class ThrowErrorFn extends AbstractFunction {
        @Override
        public EvaluationValue evaluate(Expression expression, Token functionToken, EvaluationValue... parameters) {
            throw new AssertionError("boom");
        }
    }

    /** 0인자 — 아무도 내리지 않는 래치를 최대 10 초 기다린다(03-02 SLOW 와 같은 모양). */
    private static final class BlockFn extends AbstractFunction {
        @Override
        public EvaluationValue evaluate(Expression expression, Token functionToken, EvaluationValue... parameters) {
            try {
                new CountDownLatch(1).await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return EvaluationValue.TRUE;
        }
    }
}
