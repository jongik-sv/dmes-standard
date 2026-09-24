package com.dongkuk.dmes.mdm.contract.layout;

/**
 * 전문 항목 스냅샷(TSK-05-01 design.md §6.1). {@code offset} 의 기준은 이 항목을 담는 자리에 따라
 * 다르다(F23) — {@link MdmLayoutHeaderRef#items()} 안이면 그 헤더 내부 상대값(0부터), {@link
 * MdmLayoutSnapshot#items()}(본문) 안이면 메시지 전체 절대값이다. 이 record 자신은 그 구분을 모른다 —
 * 소비자가 자신이 어느 리스트에서 이 값을 꺼냈는지로 판단한다.
 *
 * <p>{@code defaultValue}는 헤더 자신의 기본값, {@code overrideValue}는 이 전문이 재정의한 값이다(F22,
 * 불변 규칙 14) — 둘 다 별도 필드로 담아 헤더 기본값과 전문별 재정의를 구분한다.
 */
public record MdmLayoutItemSnapshot(
        int seq,
        MdmFillKind fillKind,
        MdmLayoutItemType dataType,
        String columnPhys,
        String transUnit,
        String unitItem,
        MdmLayoutNumFormat numFormat,
        String defaultValue,
        String overrideValue,
        Integer fillerLength,
        int offset,
        int length) {
}
