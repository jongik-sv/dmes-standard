package kr.dongkuk.maru.mdm.engine.flow;

import java.util.List;
import java.util.Optional;

/**
 * 받는 노드가 받는 exception 종류(받는 노드 spec §1). 코드 → 종류 표는 엔진에서 여기 한 곳이다. flow 패키지는 spi 만 보므로
 * 위반 코드는 {@code EngineEvaluationException.Code} 이름 문자열로 둔다(rule 패키지 {@code CatchKindTableTest} 가 실제 Code 와 맞춘다).
 * 표에 없는 코드(정의·설정 오류)는 받지 않는다(X-D2). 선언 순서가 저장 순서다(NO_RESULT·INPUT_ERROR·EVAL_ERROR·HIT_CONFLICT).
 */
public enum CatchKind {
    /** 룰 결과의 hits 가 비고 기본 행도 쓰지 않았다. 받는 노드가 있을 때만 exception 이다(X-D3). */
    NO_RESULT(List.of()),
    INPUT_ERROR(List.of("MISSING_KEY", "REQUIRED_NULL", "TYPE_CONVERSION")),
    EVAL_ERROR(List.of("EVALUATION_ERROR")),
    HIT_CONFLICT(List.of("UNIQUE_MULTIPLE_HITS", "ANY_CONFLICT")),
    /** 하위 세트가 자기 받는 노드의 처리 갈래로 END 에 닿았다(하위 세트 spec §4.2). SET 노드에 붙은 받는 노드만 고른다. 오류 코드와 짝이 없다. */
    SUBSET_ENDED(List.of());

    /** 결과 없음일 때 CATCH_CODE 값. */
    public static final String NO_RESULT_CODE = "NO_RESULT";
    /** 결과 없음일 때 CATCH_MSG 값. */
    public static final String NO_RESULT_MESSAGE = "맞는 행과 기본 행이 없다";

    private final List<String> codes;

    CatchKind(List<String> codes) {
        this.codes = codes;
    }

    /** 이 종류에 드는 위반 코드 이름. */
    public List<String> codes() {
        return codes;
    }

    /** 저장 키(대소문자 그대로) → 종류. 모르는 키·null 은 빈 값. */
    public static Optional<CatchKind> parse(String key) {
        if (key == null) {
            return Optional.empty();
        }
        for (CatchKind k : values()) {
            if (k.name().equals(key)) {
                return Optional.of(k);
            }
        }
        return Optional.empty();
    }

    /** 위반 코드 이름 → 종류. 받지 않는 코드는 빈 값. */
    public static Optional<CatchKind> ofCode(String codeName) {
        for (CatchKind k : values()) {
            if (k.codes.contains(codeName)) {
                return Optional.of(k);
            }
        }
        return Optional.empty();
    }
}
