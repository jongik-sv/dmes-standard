package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.Expression;
import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.parser.ParseException;
import java.math.BigDecimal;

/**
 * EvalEx 를 감싸는 얇은 수식 평가기.
 *
 * <p>TSK-01-01 스캐폴드로 시작했고, TSK-03-02 에서 설정 팩토리({@link MdmExpressionConfig#baseBuilder()})로 전환했다
 * (engine-contract §13). 그래서 고정값 14개와 BASE 24종 사전이 적용되고, 표준 사전의 {@code DT_NOW}·{@code RANDOM} 은
 * 파싱 단계에서 거부된다. 판정·검증은 {@link MdmEvaluator} 를 쓴다 — 이 클래스는 공개 시그니처를 지키는 단순 진입점이다.
 */
public class ExpressionEvaluator {

    private static final ExpressionConfiguration CONFIG = MdmExpressionConfig.baseBuilder().build();

    /**
     * 수식 문자열을 평가해 숫자 결과를 돌려준다.
     *
     * @param expression EvalEx 문법의 수식(예: {@code "1 + 2"}, {@code "(2 + 3) * 4"})
     * @return 평가 결과
     * @throws IllegalArgumentException 수식이 잘못됐거나(파싱 실패) 평가할 수 없을 때
     */
    public BigDecimal evaluate(String expression) {
        try {
            EvaluationValue result = new Expression(expression, CONFIG).evaluate();
            return result.getNumberValue();
        } catch (ParseException | EvaluationException e) {
            throw new IllegalArgumentException("식을 평가할 수 없습니다: " + expression, e);
        }
    }
}
