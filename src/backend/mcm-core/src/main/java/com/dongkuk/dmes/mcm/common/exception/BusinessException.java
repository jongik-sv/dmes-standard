package com.dongkuk.dmes.mcm.common.exception;

import java.util.List;

/**
 * mcm-core 자체 비즈니스 예외. cactus {@code BusinessException} 와
 * 동일 시그니처(생성자 3종, getter 2종)이라 사이트의 cactus 예외 핸들러도
 * 본 클래스를 잡을 수 있도록 처리하면 된다.
 */
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;
    private final List<ErrorDetail> errors;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getDefaultMessage());
        this.errorCode = errorCode;
        this.errors = null;
    }

    public BusinessException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
        this.errors = null;
    }

    public BusinessException(ErrorCode errorCode, String message, List<ErrorDetail> errors) {
        super(message);
        this.errorCode = errorCode;
        this.errors = errors;
    }

    public ErrorCode getErrorCode() { return errorCode; }
    public List<ErrorDetail> getErrors() { return errors; }
}
