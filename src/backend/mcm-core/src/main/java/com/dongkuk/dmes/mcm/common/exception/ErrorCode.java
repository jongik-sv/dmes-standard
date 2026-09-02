package com.dongkuk.dmes.mcm.common.exception;

/**
 * mcm-core 자체 에러 코드. cactus {@code ErrorCode} 와 동일 enum 값을 가진다.
 *
 * <ul>
 *   <li>E0xx — 비즈니스 에러 (400)</li>
 *   <li>A0xx — 인증/권한 에러 (401/403)</li>
 *   <li>S0xx — 시스템 에러 (500)</li>
 * </ul>
 */
public enum ErrorCode {

    REQUIRED_VALUE("E001", 400, "필수값이 누락되었습니다"),
    INVALID_VALUE("E002", 400, "유효하지 않은 값입니다"),
    DUPLICATE_DATA("E003", 400, "중복 데이터가 존재합니다"),
    BUSINESS_ERROR("E010", 400, "비즈니스 규칙 위반입니다"),

    AUTH_FAILED("A004", 401, "사용자 ID 또는 비밀번호가 일치하지 않습니다"),
    ACCOUNT_LOCKED("A005", 403, "계정이 잠겼습니다. 관리자에게 문의하세요"),
    ACCOUNT_DISABLED("A006", 403, "비활성 계정입니다"),
    TOKEN_EXPIRED("A008", 401, "토큰이 만료되었습니다"),
    INVALID_TOKEN("A009", 401, "유효하지 않은 토큰입니다"),
    ACCESS_DENIED("A010", 403, "접근 권한이 없습니다"),

    INTERNAL_ERROR("S001", 500, "서버 내부 오류가 발생했습니다"),
    DB_ERROR("S002", 500, "데이터베이스 연결 오류입니다"),
    SERVICE_EXECUTION_ERROR("S003", 500, "서비스 실행 중 오류가 발생했습니다"),
    UNKNOWN_ERROR("S999", 500, "알 수 없는 오류가 발생했습니다");

    private final String code;
    private final int httpStatus;
    private final String defaultMessage;

    ErrorCode(String code, int httpStatus, String defaultMessage) {
        this.code = code;
        this.httpStatus = httpStatus;
        this.defaultMessage = defaultMessage;
    }

    public String getCode() { return code; }
    public int getHttpStatus() { return httpStatus; }
    public String getDefaultMessage() { return defaultMessage; }
}
