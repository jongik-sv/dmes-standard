package com.dongkuk.oasis.unmarshal;

import com.dongkuk.oasis.model.Task;

/**
 * @param <T> 소스 객체 타입
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
public interface TaskBuilder<T> {
    /**
     * @param taskElement 태스크 요소
     * @param flows       흐름
     * @return 태스크 객체
     */
    Task buildTask(T taskElement, FlowStore flows);
}
