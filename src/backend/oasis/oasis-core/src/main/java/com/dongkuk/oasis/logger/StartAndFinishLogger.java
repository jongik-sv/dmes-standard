package com.dongkuk.oasis.logger;

/**
 * @param <T> 로거에 사용할 파라미터 타입
 * @author Jeongjin Kim
 * @since 2021-05-20
 */
public interface StartAndFinishLogger<T> {
    /**
     * 시작을 기록한다.
     *
     * @param params 메시지에 바인딩 될 값
     */
    void logStart(T params);

    /**
     * 종료를 기록한다.
     *
     * @param params 메시지에 바인딩 될 값
     */
    void logFinish(T params);

    /**
     * 예외 종료를 기록한다.
     *
     * @param params 메시지에 바인딩 될 값
     */
    void logFinishWithException(T params);
}
