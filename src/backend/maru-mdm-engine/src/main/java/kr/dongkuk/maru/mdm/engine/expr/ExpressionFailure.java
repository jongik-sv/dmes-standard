package kr.dongkuk.maru.mdm.engine.expr;

import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * {@link MdmEvaluator} 가 던지는 식 한 개의 실패. 호출자(도메인 검증기·룰 엔진)가 {@link #code()} 를
 * {@code EngineEvaluationException.Violation} 의 code 로 옮기고 stage 는 자기 단계로 채운다(TSK-03-02 design §8).
 *
 * <p>expr 패키지에는 record·enum 을 새로 두지 않으므로(영구 스키마 대조 테스트) 이유는 문자열 상수다.
 */
public final class ExpressionFailure extends RuntimeException {

    private static final long serialVersionUID = 1L;

    /** 파싱 실패 — 사전 밖 함수·인자 수 부족·문법 축소 위반(code = EVALUATION_ERROR). */
    public static final String PARSE = "PARSE";
    /** 평가 중 예외 — EvalEx 평가 예외·함수 예외·NPE 등(code = EVALUATION_ERROR). */
    public static final String EVALUATION = "EVALUATION";
    /** 평가 타임아웃(code = EVALUATION_ERROR). */
    public static final String TIMEOUT = "TIMEOUT";
    /** 레코드 키가 표준 상수 이름이다(code = CONSTANT_KEY). */
    public static final String CONSTANT_KEY = "CONSTANT_KEY";

    private final Code code;
    private final String reason;
    private final String name;

    ExpressionFailure(Code code, String reason, @Nullable String name, String message, @Nullable Throwable cause) {
        super(message, cause);
        this.code = code;
        this.reason = reason;
        this.name = name;
    }

    public Code code() {
        return code;
    }

    /** {@link #PARSE}·{@link #EVALUATION}·{@link #TIMEOUT}·{@link #CONSTANT_KEY} 중 하나. */
    public String reason() {
        return reason;
    }

    /** 문제를 일으킨 함수·변수·키 이름. 모르면 null. */
    @Nullable
    public String name() {
        return name;
    }
}
