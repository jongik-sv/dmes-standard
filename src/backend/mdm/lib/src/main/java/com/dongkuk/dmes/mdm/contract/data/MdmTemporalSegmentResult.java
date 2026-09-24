package com.dongkuk.dmes.mdm.contract.data;

/**
 * 일시 선분 저장 결과(TSK-07-01 design.md §6.1). {@code value} 는 바뀐 뒤의 값(NONE 이면 호출 전 값
 * 그대로 돌려줘도 된다 — 계약은 강제하지 않는다).
 *
 * @param <V> 값 타입
 */
public record MdmTemporalSegmentResult<V>(MdmTemporalSegmentAction action, V value) {
}
