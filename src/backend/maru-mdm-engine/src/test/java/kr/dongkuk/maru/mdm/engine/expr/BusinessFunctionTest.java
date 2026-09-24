package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.Body;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.BusinessFunction;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.Param;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups.CountingBody;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-03-02 design.md §3.1·§6.2 — 비즈니스 함수 적재 규칙(engine-contract §5 1-4). 이름 충돌·형식 위반은 적재 거부,
 * {@code nullable=false} 자리의 NULL·허용 밖 반환·본문 예외는 평가 오류다.
 */
class BusinessFunctionTest {

    private static final Instant TS = Instant.parse("2026-09-06T00:00:00Z");

    private static MdmEvaluator evaluator(Body body, boolean nullable) {
        BusinessFunction fn = new BusinessFunction("THK_OK", List.of(new Param("v", nullable)), false, body);
        return new MdmEvaluator(InMemoryLookups.create().function(fn).build());
    }

    private static Map<String, Object> value(Object v) {
        Map<String, Object> m = new HashMap<>();
        m.put("value", v);
        return m;
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"thk_ok", "1ABC", "MASTER", "IF", "DT_NOW"})
    void 적재를_거부하는_이름(String name) {
        BusinessFunction fn = InMemoryLookups.fn(name, args -> Boolean.TRUE, "v");
        assertThrows(IllegalArgumentException.class,
                () -> MdmExpressionConfig.create(InMemoryLookups.create().function(fn).build()));
    }

    @Test
    void 등록된_함수는_DOMAIN_BIZ_식에서_평가된다() {
        MdmEvaluator e = evaluator(args -> ((BigDecimal) args.get(0)).compareTo(new BigDecimal("2")) < 0, true);
        assertAll(
                () -> assertEquals(Boolean.TRUE, e.evaluate("THK_OK(value)", value(new BigDecimal("1.5")), TS).getBooleanValue()),
                () -> assertEquals(Boolean.FALSE, e.evaluate("THK_OK(value)", value(new BigDecimal("2.5")), TS).getBooleanValue()));
    }

    @Test
    void nullable_false_인자에_NULL_이면_부르지_않고_평가_오류다() {
        CountingBody body = new CountingBody(args -> Boolean.TRUE);
        MdmEvaluator e = evaluator(body, false);
        ExpressionFailure f = assertThrows(ExpressionFailure.class, () -> e.evaluate("THK_OK(value)", value(null), TS));
        assertAll(
                () -> assertEquals(Code.EVALUATION_ERROR, f.code()),
                () -> assertEquals(0, body.calls()));
    }

    @Test
    void 허용_밖_반환_타입은_평가_오류다() {
        MdmEvaluator e = evaluator(args -> Integer.valueOf(1), true);
        ExpressionFailure f = assertThrows(ExpressionFailure.class, () -> e.evaluate("THK_OK(value)", value("A"), TS));
        assertEquals(Code.EVALUATION_ERROR, f.code());
    }

    @Test
    void 본문_예외는_평가_오류다() {
        MdmEvaluator e = evaluator(args -> {
            throw new IllegalStateException("boom");
        }, true);
        ExpressionFailure f = assertThrows(ExpressionFailure.class, () -> e.evaluate("THK_OK(value)", value("A"), TS));
        assertAll(
                () -> assertEquals(Code.EVALUATION_ERROR, f.code()),
                () -> assertEquals(ExpressionFailure.EVALUATION, f.reason()),
                () -> assertEquals("THK_OK", f.name()));
    }
}
