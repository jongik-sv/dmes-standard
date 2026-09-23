package com.dongkuk.dmes.mdm.contract.dictionary;

/**
 * 컬럼 사전 조회 결과(TSK-04-01 design.md §7.1) — 03 레이아웃·06 룰 변수가 화면 라벨·참조 정보를
 * 조립할 때 쓰는 모양이다.
 */
public record MdmColumnDictionaryEntry(
        Long columnId, String columnName, String physName, Long domainId,
        MdmDomainKind domainKind, boolean required, String labelLong, String labelMid, String labelShort,
        String defaultValue, String refKind, String refTarget, String refCateId, String usageNote) {
}
