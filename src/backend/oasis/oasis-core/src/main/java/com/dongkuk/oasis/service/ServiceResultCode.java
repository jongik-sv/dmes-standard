package com.dongkuk.oasis.service;

/**
 * 서비스 수행결과 코드를 정의한다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-02
 */
public enum ServiceResultCode {
    /**
     * 서비스 수행 성공.
     */
    SUCCESS,
    /**
     * 사용자가 임의로 발생시킨 오류.
     */
    USER_ERROR,
    /**
     * 시스템에서 발생한 오류.
     */
    SYSTEM_ERROR
}
