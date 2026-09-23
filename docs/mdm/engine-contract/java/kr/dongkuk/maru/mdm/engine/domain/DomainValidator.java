package kr.dongkuk.maru.mdm.engine.domain;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * 도메인 검증기(06-business-rule.md:448·459). 02 실행 순서 1-4단계: 빈 값 정규화 → 필수 → 타입 변환 →
 * 유효 표준식 → 유효 비즈니스식. 유일성·DB 제약은 호출자 몫이다.
 *
 * <p>원천 진입점은 {@code validate(table, column, record)} 이다. {@code MASTER} 판정 시각이 필요하므로
 * {@code evalTs} 를 더한다(06:422 "검증 한 번마다 하나"). 서버 API 가 "주지 않으면 현재 시각"을 채운다.
 */
public interface DomainValidator {

    /** 식 평가 중 예외는 {@code EngineEvaluationException}(판정 오류). 값이 틀린 것은 결과의 failures. */
    ValidationResult validate(String table, String column, Map<String, Object> record, Instant evalTs);

    /**
     * @param value 정규화·타입 변환을 거친 값(BigDecimal·String·Boolean·null). 변환에 실패했으면 null
     */
    record ValidationResult(boolean valid, Object value, List<Failure> failures) {}

    record Failure(Step step, String message) {}

    enum Step {
        /** (table, column) 이 컬럼 사전에 없다. */
        NOT_DEFINED,
        /** 필수인데 빈 값. */
        REQUIRED,
        /** 도메인 데이터 타입으로 바꾸지 못했다(02 3단계). */
        TYPE_CONVERSION,
        /** 유효 표준식이 거짓. */
        STD_EXPR,
        /** 비즈니스 요구 변수가 레코드에 없다 — 통과가 아니라 실패(06:448). */
        BIZ_VAR_MISSING,
        /** 유효 비즈니스식이 거짓. */
        BIZ_EXPR
    }
}
