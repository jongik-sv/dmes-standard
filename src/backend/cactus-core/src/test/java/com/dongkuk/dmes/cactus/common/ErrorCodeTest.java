package com.dongkuk.dmes.cactus.common;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ErrorCodeTest {

    @Test
    void 비즈니스에러는_400이다() {
        assertThat(ErrorCode.REQUIRED_VALUE.getHttpStatus()).isEqualTo(400);
        assertThat(ErrorCode.INVALID_VALUE.getHttpStatus()).isEqualTo(400);
        assertThat(ErrorCode.DUPLICATE_DATA.getHttpStatus()).isEqualTo(400);
        assertThat(ErrorCode.BUSINESS_ERROR.getHttpStatus()).isEqualTo(400);
    }

    @Test
    void 인증에러는_401이다() {
        assertThat(ErrorCode.AUTH_FAILED.getHttpStatus()).isEqualTo(401);
        assertThat(ErrorCode.TOKEN_EXPIRED.getHttpStatus()).isEqualTo(401);
        assertThat(ErrorCode.INVALID_TOKEN.getHttpStatus()).isEqualTo(401);
    }

    @Test
    void 권한에러는_403이다() {
        assertThat(ErrorCode.ACCOUNT_LOCKED.getHttpStatus()).isEqualTo(403);
        assertThat(ErrorCode.ACCESS_DENIED.getHttpStatus()).isEqualTo(403);
    }

    @Test
    void 시스템에러는_500이다() {
        assertThat(ErrorCode.INTERNAL_ERROR.getHttpStatus()).isEqualTo(500);
        assertThat(ErrorCode.DB_ERROR.getHttpStatus()).isEqualTo(500);
        assertThat(ErrorCode.SERVICE_EXECUTION_ERROR.getHttpStatus()).isEqualTo(500);
        assertThat(ErrorCode.UNKNOWN_ERROR.getHttpStatus()).isEqualTo(500);
    }

    @Test
    void 코드_접두사가_올바르다() {
        assertThat(ErrorCode.REQUIRED_VALUE.getCode()).startsWith("E");
        assertThat(ErrorCode.AUTH_FAILED.getCode()).startsWith("A");
        assertThat(ErrorCode.INTERNAL_ERROR.getCode()).startsWith("S");
    }
}
