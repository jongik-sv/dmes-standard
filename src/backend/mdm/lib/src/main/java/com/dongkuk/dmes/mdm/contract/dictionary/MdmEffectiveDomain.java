package com.dongkuk.dmes.mdm.contract.dictionary;

import java.util.List;

/**
 * 조상 AST 를 AND 로 조립한 유효 식·유효 코드 참조(TSK-04-01 design.md §7.2) — 조립(AND 체이닝)
 * 자체는 이 Task 가 하지 않는다(F8, D3). 여기서는 조립 결과의 모양만 정의한다.
 */
public record MdmEffectiveDomain(
        Long domainId, String effectiveStdExpr, String effectiveStdAstJson,
        String effectiveBizExpr, String effectiveBizAstJson,
        List<String> bizRequiredVars, MdmCodeRef effectiveCodeRef) {
}
