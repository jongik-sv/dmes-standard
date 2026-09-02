package com.dongkuk.oasis.unmarshal;

import com.dongkuk.oasis.model.Process;

/**
 * 프로세스 레벨 엘리먼트로부터 {@link Process} 개체 생성.
 *
 * @param <T> 요소 타입
 * @author Jeongjin Kim
 * @since 2021-02-02
 */
public interface ProcessBuilder<T> {
    /**
     * @param processElement 소스 객체
     * @param errors         에러 저장소
     * @return 프로세스 객체
     */
    Process buildProcess(T processElement, ErrorStore errors);
}
