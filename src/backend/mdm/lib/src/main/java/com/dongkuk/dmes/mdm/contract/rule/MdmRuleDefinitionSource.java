package com.dongkuk.dmes.mdm.contract.rule;

/**
 * 엔진 {@code DefinitionLookup} 의 mdm 구현 대상 — 06 「값 테스트 API」 두 방식(06:1069-1074)·「DRAFT와 시험 사본」
 * 구현체(06:541). 구현 TSK-08-04. 배포 스냅샷을 읽는 구현(하위 시스템)과 시험 사본 구현은 보류라 두지 않는다
 * (TSK-08-01 design.md D9, 06 칼럼 → 엔진 필드 매핑은 §6.4).
 */
public enum MdmRuleDefinitionSource {
    /** 원장에서 ver 로(또는 evalTs 에 유효한 RELEASED 를) 골라 읽는다. DRAFT 포함. */
    STORED_VERSION,
    /** 요청 본문의 변수·행 정의를 메모리에서만 쓴다. 원장에 쓰지 않는다. */
    REQUEST_BODY
}
