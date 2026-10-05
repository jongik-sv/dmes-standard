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

    /** 06:212-217 의 네 단계 + 세트 사전 검사 + IF 갈래 고르기(룰 세트 흐름도). */
    public enum Stage { SET_CHECK, INPUT_CHECK, ROW_SELECT, RESULT_CHECK, RESULT_EVAL, BRANCH_SELECT }

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
        EVALUATION_ERROR,
        /** IF 갈래 조건식이 불린이 아니거나 평가에 실패했다. */
        BRANCH_EVAL_ERROR,
        /** 세트 흐름이 구조 검사를 통과하지 못했다(plan D5). */
        FLOW_INVALID,
        /**
         * 디버거에서 고친 값(4단계 spec §2.2)의 자리가 실행 순서와 어긋났거나(그 순번 노드 ID 가 다르다), 실행이 오류 없이 끝났는데 쓰이지 않은
         * 고친 값이 남았다. 단계는 늘 {@link Stage#INPUT_CHECK} 이다.
         */
        EDIT_POINT_MISMATCH,
        /** 세트 호출 경로에 같은 세트가 다시 나왔다(하위 세트 spec §3.3). 저장 검사 CALL_CYCLE 이 먼저 막는다. 단계는 늘 {@link Stage#SET_CHECK}. */
        SET_CALL_CYCLE,
        /** 최상위 세트에서 하위로 들어가는 단계가 5 를 넘었다(하위 세트 spec §3.3). 단계는 늘 {@link Stage#SET_CHECK}. */
        SET_CALL_DEPTH
    }

    /**
     * @param name    변수 이름(키 없음·NULL·타입 변환) 또는 함수 이름(평가 오류). 세트 호출 오류는 부르는 세트 ID
     * @param setPath 최상위 세트에서 이 위반이 난 세트까지 거친 SET 노드 ID(바깥부터). 이 세트에서 났으면 빈 목록(하위 세트 spec §4.1)
     */
    public record Violation(
            Stage stage, Code code, @Nullable String ruleId, @Nullable Integer rowId, @Nullable String name, String message,
            List<String> setPath) {}
}
