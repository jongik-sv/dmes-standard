package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.Expression;
import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.parser.ParseException;
import java.math.BigDecimal;

/**
 * EvalEx 를 감싸는 얇은 수식 평가기.
 *
 * <p>TSK-01-01 스캐폴드 단계 — "엔진이 EvalEx 를 실제로 쓴다"를 증명하는 최소 클래스다
 * (design.md §2.2 주석: "ArchUnit 대상 0건 방지"). 실 업무 규칙(할당·검증식 등)은 이 클래스를
 * 확장하는 후속 Task 에서 채운다.
 */
public class ExpressionEvaluator {

    /**
     * 수식 문자열을 평가해 숫자 결과를 돌려준다.
     *
     * @param expression EvalEx 문법의 수식(예: {@code "1 + 2"}, {@code "(2 + 3) * 4"})
     * @return 평가 결과
     * @throws IllegalArgumentException 수식이 잘못됐거나(파싱 실패) 평가할 수 없을 때
     */
    public BigDecimal evaluate(String expression) {
        try {
            EvaluationValue result = new Expression(expression).evaluate();
            return result.getNumberValue();
        } catch (ParseException | EvaluationException e) {
            throw new IllegalArgumentException("식을 평가할 수 없습니다: " + expression, e);
        }
    }
}
