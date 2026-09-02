package com.dongkuk.dmes.cactus.security.jwt;

import com.dongkuk.dmes.cactus.autoconfigure.CactusProperties;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

/**
 * JWT 토큰의 생성과 검증을 담당한다.
 * <p>
 * - 생성: AuthService에서 로그인/갱신 시 호출
 * - 검증: JwtAuthenticationFilter에서 매 요청마다 호출
 */
public class JwtTokenProvider {

    /** 사용자 이름 클레임 키 */
    private static final String CLAIM_USER_NM = "userNm";
    /** 사용자 사번 클레임 키 */
    private static final String CLAIM_USER_EMP_NO = "userEmpNo";
    /** 토큰 타입 클레임 키 */
    private static final String CLAIM_TOKEN_TYPE = "type";
    /** 역할 클레임 키 */
    private static final String CLAIM_ROLES = "roles";

    /** HMAC 서명 키 */
    private final SecretKey key;
    /** JWT 발급자 */
    private final String issuer;
    /** Access 토큰 유효시간 (초) */
    private final long accessTokenExpiry;
    /** Refresh 토큰 유효시간 (초) */
    private final long refreshTokenExpiry;

    /**
     * JwtTokenProvider 생성자.
     * @param properties Cactus 설정 프로퍼티
     */
    public JwtTokenProvider(CactusProperties properties) {
        CactusProperties.Jwt jwt = properties.getJwt();
        byte[] keyBytes = Decoders.BASE64.decode(jwt.getSecret());
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.issuer = jwt.getIssuer();
        this.accessTokenExpiry = jwt.getAccessTokenExpiry();
        this.refreshTokenExpiry = jwt.getRefreshTokenExpiry();
    }

    /**
     * Access + Refresh 토큰 쌍을 생성한다.
     */
    public TokenPair generateTokenPair(UserInfo userInfo) {
        Instant now = Instant.now();

        var accessBuilder = Jwts.builder()
                .subject(userInfo.userId())
                .issuer(issuer)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(accessTokenExpiry)))
                .id(UUID.randomUUID().toString())
                .claim(CLAIM_USER_NM, userInfo.userNm())
                .claim(CLAIM_USER_EMP_NO, userInfo.userEmpNo());

        if (userInfo.roles() != null && !userInfo.roles().isEmpty()) {
            accessBuilder.claim(CLAIM_ROLES, userInfo.roles());
        }

        String accessToken = accessBuilder.signWith(key).compact();

        String refreshToken = Jwts.builder()
                .subject(userInfo.userId())
                .issuer(issuer)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(refreshTokenExpiry)))
                .id(UUID.randomUUID().toString())
                .claim(CLAIM_TOKEN_TYPE, "refresh")
                .signWith(key)
                .compact();

        return new TokenPair(accessToken, refreshToken);
    }

    /**
     * Access 토큰을 검증하고 UserInfo를 추출한다.
     *
     * @throws io.jsonwebtoken.ExpiredJwtException 토큰 만료
     * @throws JwtException                        서명 불일치, 형식 오류 등
     */
    public UserInfo validateAndExtract(String token) {
        Claims claims = parseClaims(token);

        String tokenType = claims.get(CLAIM_TOKEN_TYPE, String.class);
        if ("refresh".equals(tokenType)) {
            throw new JwtException("Not an access token");
        }

        @SuppressWarnings("unchecked")
        List<String> roles = claims.get(CLAIM_ROLES, List.class);
        if (roles == null || roles.isEmpty()) {
            roles = List.of("ROLE_USER");
        }

        return new UserInfo(
                claims.getSubject(),
                claims.get(CLAIM_USER_NM, String.class),
                claims.get(CLAIM_USER_EMP_NO, String.class),
                roles
        );
    }

    /**
     * Refresh 토큰을 검증하고 사용자 ID를 반환한다.
     *
     * @throws JwtException 토큰이 유효하지 않은 경우
     */
    public String validateRefreshToken(String token) {
        Claims claims = parseClaims(token);

        String tokenType = claims.get(CLAIM_TOKEN_TYPE, String.class);
        if (!"refresh".equals(tokenType)) {
            throw new JwtException("Not a refresh token");
        }

        return claims.getSubject();
    }

    /**
     * 토큰 유효 여부를 boolean으로 반환한다.
     */
    public boolean isTokenValid(String token) {
        try {
            validateAndExtract(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 토큰을 파싱하여 클레임을 추출한다. */
    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .requireIssuer(issuer)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
