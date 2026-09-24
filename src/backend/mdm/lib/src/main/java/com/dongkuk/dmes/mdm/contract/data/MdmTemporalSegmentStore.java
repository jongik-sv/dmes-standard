package com.dongkuk.dmes.mdm.contract.data;

import java.time.LocalDateTime;

/**
 * 일시 선분 저장 코어 SPI — 항목({@code TB_MDM_DATA_ITEM})·카테고리({@code TB_MDM_DATA_CATE})·소속
 * ({@code TB_MDM_DATA_CATE_ITEM}) 공통(05 「선분과 닫기」). 05:230-233 의 네 연산 그대로다. 구현은 이
 * Task 밖(TSK-07-03) — {@code MdmTemporalSegmentStoreNoImplementationTest}(ArchUnit)가 이 패키지 밖의
 * {@code src/main} 구현체가 없음을 확인한다(TSK-07-01 design.md F17, 수용 기준 "실행 로직 없음").
 *
 * @param <K> 키(예: maru_data_id+code)
 * @param <V> 값(그 시점의 업무 필드 스냅샷)
 */
public interface MdmTemporalSegmentStore<K, V> {

    /**
     * 등록 — 새 행 하나, valid_from = at(05:230). 키가 이미 있으면(닫힌 키 포함) 거부하고 "다시 열기"를
     * 안내한다(05:186 검사 순서 6, 05:245 "닫힌 키로는 새로 등록할 수 없다. 다시 연다" — 거부 판정 자체는
     * 이 Task 밖).
     */
    MdmTemporalSegmentResult<V> register(K key, V value, LocalDateTime at);

    /**
     * 수정 — 열린 행의 valid_to 를 at 으로 닫고, 같은 at 을 valid_from 으로 하는 새 행을 만든다(05:231).
     * 값이 현재 값과 같으면 아무 행도 만들지 않고 NONE 을 돌린다(05 「값이 같은 행」).
     */
    MdmTemporalSegmentResult<V> modify(K key, V value, LocalDateTime at);

    /** 닫기 — 열린 행의 valid_to 를 at 으로 적는다. 새 행은 없다(05:232). */
    MdmTemporalSegmentResult<V> close(K key, LocalDateTime at);

    /** 다시 열기 — 마지막 행의 값을 복사한 새 행, valid_from = at(05:233). */
    MdmTemporalSegmentResult<V> reopen(K key, LocalDateTime at);
}
