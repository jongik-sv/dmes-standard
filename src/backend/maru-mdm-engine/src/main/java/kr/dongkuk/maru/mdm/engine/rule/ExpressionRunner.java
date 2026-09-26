package kr.dongkuk.maru.mdm.engine.rule;

import com.ezylang.evalex.BaseException;
import com.ezylang.evalex.data.EvaluationValue;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;

/**
 * EvalEx 를 부르는 유일한 곳(TSK-03-03 design §2.1·§6.17). 공유 {@link MdmEvaluator} 의 컴파일 캐시로 평가한다
 * (D17 개정·D19·D20) — 캐시는 평가기 인스턴스에 있고 엔진 인스턴스와 무관하다.
 */
final class ExpressionRunner {

    private final MdmEvaluator evaluator;

    ExpressionRunner(MdmEvaluator evaluator) {
        this.evaluator = Objects.requireNonNull(evaluator, "evaluator");
    }

    /**
     * 값 맵은 null 값을 담을 수 있어야 한다(E2). {@code Error} 는 잡지 않는다(I43). 두 {@code ExpressionFailure} 의
     * 이름이 같으므로(F13d) expr 쪽은 정규 이름으로 적는다.
     */
    EvaluationValue run(String text, Map<String, Object> values, Instant evalTs) throws ExpressionFailure {
        try {
            return evaluator.evaluate(text, values, evalTs);
        } catch (kr.dongkuk.maru.mdm.engine.expr.ExpressionFailure f) {
            Throwable cause = f.getCause();
            if (cause instanceof Error error) {
                throw error;
            }
            if (cause instanceof BaseException || cause instanceof RuntimeException) {
                throw new ExpressionFailure(cause);
            }
            throw new ExpressionFailure(f);
        }
    }
}
