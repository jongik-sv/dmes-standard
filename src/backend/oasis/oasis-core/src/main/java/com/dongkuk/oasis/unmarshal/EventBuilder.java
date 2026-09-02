package com.dongkuk.oasis.unmarshal;

import com.dongkuk.oasis.model.Event;

/**
 * 이벤트 요소를 생성.
 * <p>
 * 이벤트 레벨 요소가 필요함
 *
 * @param <T> 소스 객체 타입
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
public interface EventBuilder<T> {
    /**
     * @param eventElement 소스 객체
     * @param flows        흐름
     * @param errorStore   에러 저장소
     * @return 이벤트 객체
     */
    Event buildEvent(T eventElement, FlowStore flows, ErrorStore errorStore);
}
