package com.dongkuk.oasis.model.error;

/**
 * @author Jeongjin Kim
 * @since 2021-07-21
 */
public class DefaultError implements Error {
    private final String errorId;
    private final String errorName;
    private final String errorCode;
    private final String errorMessage;

    /**
     * @param errorId      에러 식별자
     * @param errorName    에러 이름
     * @param errorCode    에러 코드
     * @param errorMessage 에러 메시지
     */
    public DefaultError(String errorId, String errorName, String errorCode, String errorMessage) {
        this.errorId = errorId;
        this.errorName = errorName;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    @Override
    public String errorId() {
        return errorId;
    }

    @Override
    public String errorName() {
        return errorName;
    }

    @Override
    public String errorCode() {
        return errorCode;
    }

    @Override
    public String errorMessage() {
        return errorMessage;
    }
}
