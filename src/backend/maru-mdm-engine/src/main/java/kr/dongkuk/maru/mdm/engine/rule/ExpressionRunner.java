package kr.dongkuk.maru.mdm.engine.rule;

import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.Expression;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.parser.ParseException;
import java.util.Map;

/**
 * EvalEx 를 부르는 유일한 곳(TSK-03-03 design §2.1). 평가마다 {@code new Expression(text, config)} 를 만든다.
 * 컴파일 캐시 + {@code copy()} 는 TSK-03-02 몫이라 여기에 끼워 넣는다(D17). 새 인스턴스 평가라 스레드 안전하다.
 */
final class ExpressionRunner {

    private final ExpressionConfiguration configuration;

    ExpressionRunner(ExpressionConfiguration configuration) {
        this.configuration = configuration;
    }

    /** 값 맵은 null 값을 담을 수 있어야 한다(E2). {@code Error} 는 잡지 않는다. */
    EvaluationValue run(String text, Map<String, Object> values) throws ExpressionFailure {
        try {
            return new Expression(text, configuration).withValues(values).evaluate();
        } catch (ParseException | EvaluationException | RuntimeException e) {
            throw new ExpressionFailure(e);
        }
    }
}
