package com.dongkuk.dmes.cactus.security.jwt;

/**
 * Access / Refresh 토큰 쌍.
 */
public record TokenPair(String accessToken, String refreshToken) {
}
