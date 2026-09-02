package com.dongkuk.dmes.cactus.security.auth;

/**
 * 토큰 갱신 요청 DTO.
 * @param refreshToken Refresh 토큰
 */
public record RefreshRequest(String refreshToken) {
}
