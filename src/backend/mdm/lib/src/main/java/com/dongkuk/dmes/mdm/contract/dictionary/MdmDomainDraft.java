package com.dongkuk.dmes.mdm.contract.dictionary;

/**
 * 아직 저장되지 않은 도메인(자기 식+부모 링크)의 유효 식을 미리 조립할 때 쓴다(TSK-04-01 design.md §7.2)
 * — "저장" 경로(도메인검증 버튼·저장 전 diff 미리보기)의 입력.
 */
public record MdmDomainDraft(
        Long domainId, Long parentDomainId, MdmDomainKind domainKind,
        String stdRule, String bizRule, MdmCodeRef codeRef) {
}
