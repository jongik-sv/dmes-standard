package kr.dongkuk.maru.mdm.engine.expr;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 판정 오류. 단계마다 어긋난 것을 모두 모아 한 번에 던진다(06-business-rule.md:210·418).
 * 도메인 검증의 "검증 실패"(값이 틀림)는 예외가 아니라 결과다 — {@code engine.domain} 참고.
 */
public class EngineEvaluationException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final transient List<Violation> violations;

    public EngineEvaluationException(List<Violation> violations) {
        super(violations.isEmpty() ? "판정 오류" : violations.get(0).message());
        this.violations = List.copyOf(violations);
    }

    public List<Violation> violations() {
        return violations;
    }

    /** 06:212-217 의 네 단계 + 세트 사전 검사. */
    public enum Stage { SET_CHECK, INPUT_CHECK, ROW_SELECT, RESULT_CHECK, RESULT_EVAL }

    public enum Code {
        RULE_NOT_FOUND,
        SET_NOT_FOUND,
        SET_DEPRECATED,
        MISSING_KEY,
        REQUIRED_NULL,
        TYPE_CONVERSION,
        CONSTANT_KEY,
        RESERVED_KEY,
        EVAL_TS_KEY,
        UNIQUE_MULTIPLE_HITS,
        ANY_CONFLICT,
        EVALUATION_ERROR
    }

    /**
     * @param name 변수 이름(키 없음·NULL·타입 변환) 또는 함수 이름(평가 오류)
     */
    public record Violation(
            Stage stage, Code code, @Nullable String ruleId, @Nullable Integer rowId, @Nullable String name, String message) {}
}
