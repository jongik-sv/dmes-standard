package com.dongkuk.dmes.cactus.security.jwt;

import com.dongkuk.dmes.cactus.autoconfigure.CactusProperties;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.*;

class JwtTokenProviderTest {

    private JwtTokenProvider tokenProvider;
    private static final String SECRET = Base64.getEncoder().encodeToString(
            "this-is-a-test-secret-key-at-least-32-bytes!!".getBytes(StandardCharsets.UTF_8)
    );
    private static final String ISSUER = "dmes-test";

    @BeforeEach
    void setUp() {
        CactusProperties properties = new CactusProperties();
        properties.getJwt().setSecret(SECRET);
        properties.getJwt().setIssuer(ISSUER);
        properties.getJwt().setAccessTokenExpiry(3600);
        properties.getJwt().setRefreshTokenExpiry(86400);
        tokenProvider = new JwtTokenProvider(properties);
    }

    @Test
    @DisplayName("토큰 쌍 생성 - accessToken, refreshToken 모두 non-null")
    void generateTokenPair() {
        UserInfo userInfo = new UserInfo("admin", "홍길동", "E20210001");

        TokenPair pair = tokenProvider.generateTokenPair(userInfo);

        assertNotNull(pair.accessToken());
        assertNotNull(pair.refreshToken());
        assertNotEquals(pair.accessToken(), pair.refreshToken());
    }

    @Test
    @DisplayName("Access 토큰 검증 - UserInfo 추출 성공")
    void validateAndExtract() {
        UserInfo original = new UserInfo("admin", "홍길동", "E20210001");
        TokenPair pair = tokenProvider.generateTokenPair(original);

        UserInfo extracted = tokenProvider.validateAndExtract(pair.accessToken());

        assertEquals("admin", extracted.userId());
        assertEquals("홍길동", extracted.userNm());
        assertEquals("E20210001", extracted.userEmpNo());
    }

    @Test
    @DisplayName("Refresh 토큰으로 Access 검증 시도하면 예외 발생")
    void validateAndExtract_withRefreshToken_throws() {
        UserInfo userInfo = new UserInfo("admin", "홍길동", "E20210001");
        TokenPair pair = tokenProvider.generateTokenPair(userInfo);

        assertThrows(JwtException.class, () ->
                tokenProvider.validateAndExtract(pair.refreshToken())
        );
    }

    @Test
    @DisplayName("Refresh 토큰 검증 - userId 반환")
    void validateRefreshToken() {
        UserInfo userInfo = new UserInfo("admin", "홍길동", "E20210001");
        TokenPair pair = tokenProvider.generateTokenPair(userInfo);

        String userId = tokenProvider.validateRefreshToken(pair.refreshToken());

        assertEquals("admin", userId);
    }

    @Test
    @DisplayName("Access 토큰으로 Refresh 검증 시도하면 예외 발생")
    void validateRefreshToken_withAccessToken_throws() {
        UserInfo userInfo = new UserInfo("admin", "홍길동", "E20210001");
        TokenPair pair = tokenProvider.generateTokenPair(userInfo);

        assertThrows(JwtException.class, () ->
                tokenProvider.validateRefreshToken(pair.accessToken())
        );
    }

    @Test
    @DisplayName("만료된 토큰 검증 시 ExpiredJwtException 발생")
    void validateExpiredToken() {
        // 만료시간을 과거로 설정한 토큰 직접 생성
        byte[] keyBytes = Base64.getDecoder().decode(SECRET);
        SecretKey key = Keys.hmacShaKeyFor(keyBytes);

        String expiredToken = Jwts.builder()
                .subject("admin")
                .issuer(ISSUER)
                .claim("userNm", "홍길동")
                .claim("userEmpNo", "E20210001")
                .issuedAt(new Date(System.currentTimeMillis() - 7200_000))
                .expiration(new Date(System.currentTimeMillis() - 3600_000))
                .signWith(key)
                .compact();

        assertThrows(ExpiredJwtException.class, () ->
                tokenProvider.validateAndExtract(expiredToken)
        );
    }

    @Test
    @DisplayName("변조된 토큰 검증 시 예외 발생")
    void validateTamperedToken() {
        UserInfo userInfo = new UserInfo("admin", "홍길동", "E20210001");
        TokenPair pair = tokenProvider.generateTokenPair(userInfo);

        String tampered = pair.accessToken() + "tampered";

        assertThrows(JwtException.class, () ->
                tokenProvider.validateAndExtract(tampered)
        );
    }

    @Test
    @DisplayName("isTokenValid - 유효한 토큰이면 true")
    void isTokenValid_valid() {
        UserInfo userInfo = new UserInfo("admin", "홍길동", "E20210001");
        TokenPair pair = tokenProvider.generateTokenPair(userInfo);

        assertTrue(tokenProvider.isTokenValid(pair.accessToken()));
    }

    @Test
    @DisplayName("isTokenValid - 잘못된 토큰이면 false")
    void isTokenValid_invalid() {
        assertFalse(tokenProvider.isTokenValid("invalid.token.here"));
    }
}
