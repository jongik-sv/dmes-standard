package com.dongkuk.dmes.cactus.security.auth;

import java.util.Objects;

/**
 * 로그인 요청 DTO.
 * @param userId 사용자 ID
 * @param password 비밀번호
 */
public record LoginRequest(String userId, String password) {
    /** 필수 필드 유효성을 검증한다. */
    public LoginRequest {
        Objects.requireNonNull(userId, "사용자 ID는 필수입니다");
        Objects.requireNonNull(password, "비밀번호는 필수입니다");
    }
}
