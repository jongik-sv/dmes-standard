package com.dongkuk.caravan.console.common;

import java.time.LocalDateTime;

/**
 * caravan-console 의 통일된 API 응답 포맷 (0.2.0 신규 — cactus 의존 제거 패턴 B).
 *
 * <p>cactus-core 의 {@code ApiResponse} 와 동일한 형식 — schema 호환 유지.
 * mcm 호스트가 응답 변환 없이 두 wrapper 를 동일하게 처리.
 */
public class ConsoleApiResponse<T> {

    private final boolean success;
    private final T data;
    private final String message;
    private final String errorCode;
    private final LocalDateTime timestamp;

    private ConsoleApiResponse(boolean success, T data, String message, String errorCode) {
        this.success = success;
        this.data = data;
        this.message = message;
        this.errorCode = errorCode;
        this.timestamp = LocalDateTime.now();
    }

    public static <T> ConsoleApiResponse<T> ok(T data) {
        return new ConsoleApiResponse<>(true, data, null, null);
    }

    public static <T> ConsoleApiResponse<T> ok(T data, String message) {
        return new ConsoleApiResponse<>(true, data, message, null);
    }

    public static <T> ConsoleApiResponse<T> error(String errorCode, String message) {
        return new ConsoleApiResponse<>(false, null, message, errorCode);
    }

    public boolean isSuccess() { return success; }
    public T getData() { return data; }
    public String getMessage() { return message; }
    public String getErrorCode() { return errorCode; }
    public LocalDateTime getTimestamp() { return timestamp; }
}
