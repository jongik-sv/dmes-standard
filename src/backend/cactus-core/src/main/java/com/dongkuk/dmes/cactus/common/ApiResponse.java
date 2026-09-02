package com.dongkuk.dmes.cactus.common;

import java.time.LocalDateTime;

/**
 * 통일된 API 응답 포맷.
 */
public class ApiResponse<T> {

    /** 성공 여부 */
    private final boolean success;
    /** 응답 데이터 */
    private final T data;
    /** 응답 메시지 */
    private final String message;
    /** 에러 코드 (에러 시에만 존재) */
    private final String errorCode;
    /** 응답 생성 시각 */
    private final LocalDateTime timestamp;

    /**
     * ApiResponse private 생성자.
     */
    private ApiResponse(boolean success, T data, String message, String errorCode) {
        this.success = success;
        this.data = data;
        this.message = message;
        this.errorCode = errorCode;
        this.timestamp = LocalDateTime.now();
    }

    /**
     * 성공 응답을 생성한다.
     * @param data 응답 데이터
     * @return 성공 ApiResponse
     */
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, null, null);
    }

    /**
     * 메시지를 포함한 성공 응답을 생성한다.
     * @param data    응답 데이터
     * @param message 응답 메시지
     * @return 성공 ApiResponse
     */
    public static <T> ApiResponse<T> ok(T data, String message) {
        return new ApiResponse<>(true, data, message, null);
    }

    /**
     * 에러 응답을 생성한다.
     * @param errorCode 에러 코드
     * @param message   에러 메시지
     * @return 에러 ApiResponse
     */
    public static <T> ApiResponse<T> error(String errorCode, String message) {
        return new ApiResponse<>(false, null, message, errorCode);
    }

    /** 성공 여부를 반환한다. */
    public boolean isSuccess() {
        return success;
    }

    /** 응답 데이터를 반환한다. */
    public T getData() {
        return data;
    }

    /** 응답 메시지를 반환한다. */
    public String getMessage() {
        return message;
    }

    /** 에러 코드를 반환한다. */
    public String getErrorCode() {
        return errorCode;
    }

    /** 응답 생성 시각을 반환한다. */
    public LocalDateTime getTimestamp() {
        return timestamp;
    }
}
