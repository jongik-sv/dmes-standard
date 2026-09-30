package com.dongkuk.dmes.mdm.common.rule.definition;

/**
 * 원장에 저장된 룰 정의를 읽지 못함(룰 세트 흐름도 2단계 P-D9, spec §9.1-9) — {@link StoredDefinitionLookup} 이 저장된 행 조립·FLOW_JSON 코덱·AST
 * 읽기에서 난 {@code IllegalArgumentException}·{@code IllegalStateException}·{@code BusinessException} 을 원인으로 감싼다. 메시지는 원인 메시지
 * 그대로다. OASIS 입구({@code RuleSetRunner#execute}·{@code RuleSetEditService#simulate})는 이 예외만 MDM026 으로 바꾼다 — 엔진 안에서 난
 * IAE·ISE 는 감싸지 않아 엔진 버그를 입력·데이터 오류로 가리지 않는다.
 */
public class StoredDefinitionException extends RuntimeException {

    public StoredDefinitionException(String message, Throwable cause) {
        super(message, cause);
    }
}
