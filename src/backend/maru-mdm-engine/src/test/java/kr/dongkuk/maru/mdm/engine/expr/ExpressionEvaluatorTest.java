package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/**
 * EvalEx 를 실제로 호출해 동작을 증명한다(TSK-01-01 design.md §3.1).
 *
 * <p>이 테스트가 그린이라는 것은 두 가지를 함께 증명한다 — ① EvalEx 좌표가 실제로 resolve 되고
 * 동작한다 ② ArchUnit 규칙(§6.5)의 대상 클래스가 0건이 아니다(빈 패키지는 ArchUnit 이 항상
 * 통과해 버리는 함정을 피한다).
 */
class ExpressionEvaluatorTest {

    // BigDecimal.equals 는 scale 까지 비교한다(예: EvalEx 의 20 은 "2E+1"). 값만 비교하려면
    // compareTo(==0) 를 써야 한다 — assertEquals(BigDecimal, BigDecimal) 를 직접 쓰지 않는 이유.
    @Test
    void 단순_사칙연산을_평가한다() {
        ExpressionEvaluator evaluator = new ExpressionEvaluator();

        BigDecimal result = evaluator.evaluate("1 + 2");

        assertEquals(0, new BigDecimal("3").compareTo(result));
    }

    @Test
    void 괄호와_곱셈을_포함한_식을_평가한다() {
        ExpressionEvaluator evaluator = new ExpressionEvaluator();

        BigDecimal result = evaluator.evaluate("(2 + 3) * 4");

        assertEquals(0, new BigDecimal("20").compareTo(result));
    }

    @Test
    void 잘못된_식은_예외를_던진다() {
        ExpressionEvaluator evaluator = new ExpressionEvaluator();

        assertThrows(RuntimeException.class, () -> evaluator.evaluate("1 + "));
    }
}
