package com.dongkuk.oasis.unmarshal;

import com.dongkuk.oasis.model.SubProcess;
import com.dongkuk.oasis.model.Task;

/**
 * 프로세스 레벨 엘리먼트로부터 {@link SubProcess} 개체 생성.
 *
 * @param <T> 요소 타입
 * @author Jeongjin Kim
 * @since 2021-06-22
 */
public interface SubProcessBuilder<T> {
    /**
     * @param processElement 소스 객체
     * @param flows          flows
     * @param errorStore     에러 저장소
     * @return 프로세스 객체
     */
    Task buildProcess(T processElement, FlowStore flows, ErrorStore errorStore);
}
