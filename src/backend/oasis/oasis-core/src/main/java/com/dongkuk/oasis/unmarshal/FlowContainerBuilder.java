package com.dongkuk.oasis.unmarshal;

import com.dongkuk.oasis.model.flow.container.FlowContainer;

/**
 * 프로세스 레벨 요소로부터 {@link com.dongkuk.oasis.model.flow.container.FlowContainer} 를 생성.
 *
 * @param <T> 요소 타입
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
public interface FlowContainerBuilder<T> {
    /**
     * @param processElement 요소
     * @return 흐름 맵
     */
    FlowContainer flows(T processElement);
}
