package kr.dongkuk.maru.mdm.engine.domain;

import static kr.dongkuk.maru.mdm.engine.testsupport.DomainFixtures.COIL_THK_OWN;
import static kr.dongkuk.maru.mdm.engine.testsupport.DomainFixtures.RMTL_COIL_THK_OWN;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.parser.ParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.CodeRef;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * TSK-03-02 design.md §3.3·§6.8 — 상속 체인 AND 누적 유효 식 조립(02:79, 02:103-134). 유효 식은 저장하지 않는 파생값이다.
 * 유효 AST 는 조상 AST 를 AND 노드로 잇기만 하고 다시 파싱하지 않는다(02:125).
 */
class EffectiveExpressionsTest {

    private static final MdmEvaluator EVALUATOR = new MdmEvaluator(InMemoryLookups.create().build());
    private static final ExpressionConfiguration CONFIG = EVALUATOR.configuration();

    private static final String GRAND = "value > 0";
    private static final String PARENT = "value <= 30";
    private static final String SELF = "value >= 1 && value <= 25";

    @Test
    void 두_단계_유효_텍스트는_02_예시와_같다() {
        assertEquals("(value >= 0.1 && value <= 3.5 && value % 0.1 == 0) && (value >= 1.6)",
                EffectiveExpressions.text(List.of(COIL_THK_OWN, RMTL_COIL_THK_OWN)));
    }

    @Test
    void 한_단계는_자신의_식_그대로다() {
        assertEquals("value > 0", EffectiveExpressions.text(List.of("value > 0")));
    }

    @Test
    void 빈_식은_건너뛴다() {
        assertEquals(EffectiveExpressions.text(List.of(GRAND, PARENT)),
                EffectiveExpressions.text(Arrays.asList(GRAND, PARENT, null)));
    }

    static Stream<Arguments> 체인() {
        return Stream.of(
                Arguments.of(List.of(GRAND)),
                Arguments.of(List.of(GRAND, PARENT)),
                Arguments.of(List.of(GRAND, PARENT, SELF)));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("체인")
    void AST_조립은_유효_텍스트를_다시_파싱한_AST_와_같다(List<String> chain) throws ParseException {
        List<Map<String, Object>> asts = new ArrayList<>();
        for (String own : chain) {
            asts.add(AstExporter.export(own, CONFIG));
        }
        assertEquals(AstExporter.export(EffectiveExpressions.text(chain), CONFIG), EffectiveExpressions.ast(asts));
    }

    @Test
    @SuppressWarnings("unchecked")
    void 세_단계_AST_는_AND_AND_조부_부_자신_이다() throws ParseException {
        Map<String, Object> self = AstExporter.export(SELF, CONFIG);
        Map<String, Object> root = EffectiveExpressions.ast(List.of(
                AstExporter.export(GRAND, CONFIG), AstExporter.export(PARENT, CONFIG), self));
        List<Map<String, Object>> params = (List<Map<String, Object>>) root.get("params");
        assertAll(
                () -> assertEquals("&&", root.get("value")),
                () -> assertEquals("&&", params.get(0).get("value")),
                () -> assertEquals(self, params.get(1)));
    }

    @Test
    void CODE_종류_MASTER_식() throws ParseException {
        CodeRef ref = new CodeRef("PROC_CD", "COATING");
        String text = EffectiveExpressions.codeRefText(ref);
        assertAll(
                () -> assertEquals("MASTER(\"PROC_CD\", \"COATING\", value)", text),
                () -> assertEquals(AstExporter.export(text, CONFIG), EffectiveExpressions.codeRefAst(ref)));
    }

    static Stream<Arguments> 참조_체인() {
        CodeRef a = new CodeRef("PROC_CD", "A");
        CodeRef b = new CodeRef("PROC_CD", "B");
        return Stream.of(
                Arguments.of(Arrays.asList(a, null), a),
                Arguments.of(List.of(a, b), b));
    }

    @ParameterizedTest(name = "{0} → {1}")
    @MethodSource("참조_체인")
    void 유효_코드_참조는_가장_가까운_지정값이다(List<CodeRef> rootFirst, CodeRef expected) {
        assertEquals(expected, EffectiveExpressions.effectiveCodeRef(rootFirst));
    }

    @Test
    void 비즈니스_요구_변수는_value_와_상수를_뺀다() {
        assertEquals(List.of("COIL_NET_WGT", "GRADE"),
                EffectiveExpressions.bizRequiredVars("value >= COIL_NET_WGT && GRADE != NULL", EVALUATOR));
    }
}
