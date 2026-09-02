package com.dongkuk.dmes.cactus.common;

import com.dongkuk.dmes.cactus.web.response.ErrorDetail;

import java.util.List;

/**
 * 비즈니스 로직 예외. ErrorCode와 함께 사용.
 * 그리드 행 단위 에러가 필요한 경우 errors 리스트를 함께 전달한다.
 */
public class BusinessException extends RuntimeException {

    /** 에러 코드 */
    private final ErrorCode errorCode;
    /** 행 단위 에러 상세 목록 */
    private final List<ErrorDetail> errors;

    /**
     * 기본 메시지로 BusinessException을 생성한다.
     * @param errorCode 에러 코드
     */
    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getDefaultMessage());
        this.errorCode = errorCode;
        this.errors = null;
    }

    /**
     * 커스텀 메시지로 BusinessException을 생성한다.
     * @param errorCode 에러 코드
     * @param message   커스텀 에러 메시지
     */
    public BusinessException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
        this.errors = null;
    }

    /**
     * 커스텀 메시지와 행 단위 에러 목록으로 BusinessException을 생성한다.
     * @param errorCode 에러 코드
     * @param message   커스텀 에러 메시지
     * @param errors    행 단위 에러 상세 목록
     */
    public BusinessException(ErrorCode errorCode, String message, List<ErrorDetail> errors) {
        super(message);
        this.errorCode = errorCode;
        this.errors = errors;
    }

    /** 에러 코드를 반환한다. */
    public ErrorCode getErrorCode() {
        return errorCode;
    }

    /** 행 단위 에러 상세 목록을 반환한다. */
    public List<ErrorDetail> getErrors() {
        return errors;
    }
}
