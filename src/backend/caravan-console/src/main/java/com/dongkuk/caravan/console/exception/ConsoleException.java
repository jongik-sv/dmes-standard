package com.dongkuk.caravan.console.exception;

/**
 * caravan-console 도메인 예외. mcm 측 cactus GlobalExceptionHandler 가 ApiResponse 형태로 변환한다
 * (메인 플랜 v2.4 §3-3 "유지 검토" 표 — caravan-console 자체 GlobalExceptionHandler 는 옮기지 않고
 * 도메인 예외만 유지).
 */
public class ConsoleException extends RuntimeException {

    public ConsoleException(String message) {
        super(message);
    }

    public ConsoleException(String message, Throwable cause) {
        super(message, cause);
    }
}
