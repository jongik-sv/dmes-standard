package com.dongkuk.dmes.cactus.common;

/**
 * 에러 코드 체계.
 * <ul>
 *   <li>E0xx — 비즈니스 에러 (400)</li>
 *   <li>A0xx — 인증/권한 에러 (401/403)</li>
 *   <li>S0xx — 시스템 에러 (500)</li>
 * </ul>
 */
public enum ErrorCode {

    // ── 비즈니스 에러 (E0xx) ──
    REQUIRED_VALUE("E001", 400, "필수값이 누락되었습니다"),
    INVALID_VALUE("E002", 400, "유효하지 않은 값입니다"),
    DUPLICATE_DATA("E003", 400, "중복 데이터가 존재합니다"),
    BUSINESS_ERROR("E010", 400, "비즈니스 규칙 위반입니다"),

    // ── 인증/권한 (A0xx) ──
    AUTH_FAILED("A004", 401, "사용자 ID 또는 비밀번호가 일치하지 않습니다"),
    ACCOUNT_LOCKED("A005", 403, "계정이 잠겼습니다. 관리자에게 문의하세요"),
    ACCOUNT_DISABLED("A006", 403, "비활성 계정입니다"),
    TOKEN_EXPIRED("A008", 401, "토큰이 만료되었습니다"),
    INVALID_TOKEN("A009", 401, "유효하지 않은 토큰입니다"),
    ACCESS_DENIED("A010", 403, "접근 권한이 없습니다"),

    // ── 시스템 에러 (S0xx) ──
    INTERNAL_ERROR("S001", 500, "서버 내부 오류가 발생했습니다"),
    DB_ERROR("S002", 500, "데이터베이스 연결 오류입니다"),
    SERVICE_EXECUTION_ERROR("S003", 500, "서비스 실행 중 오류가 발생했습니다"),
    UNKNOWN_ERROR("S999", 500, "알 수 없는 오류가 발생했습니다");

    /** 에러 코드 (예: E001, S001) */
    private final String code;
    /** HTTP 상태 코드 */
    private final int httpStatus;
    /** 기본 에러 메시지 */
    private final String defaultMessage;

    /**
     * ErrorCode 생성자.
     * @param code           에러 코드
     * @param httpStatus     HTTP 상태 코드
     * @param defaultMessage 기본 메시지
     */
    ErrorCode(String code, int httpStatus, String defaultMessage) {
        this.code = code;
        this.httpStatus = httpStatus;
        this.defaultMessage = defaultMessage;
    }

    /** 에러 코드를 반환한다. */
    public String getCode() {
        return code;
    }

    /** HTTP 상태 코드를 반환한다. */
    public int getHttpStatus() {
        return httpStatus;
    }

    /** 기본 에러 메시지를 반환한다. */
    public String getDefaultMessage() {
        return defaultMessage;
    }
}
