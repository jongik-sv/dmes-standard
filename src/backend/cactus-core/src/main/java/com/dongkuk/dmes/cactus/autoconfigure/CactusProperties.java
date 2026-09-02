package com.dongkuk.dmes.cactus.autoconfigure;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Cactus 프레임워크 설정 프로퍼티.
 * application.yml의 cactus.* 프리픽스 하위 설정을 바인딩한다.
 */
@ConfigurationProperties(prefix = "cactus")
public class CactusProperties {

    /** JWT 관련 설정 */
    private final Jwt jwt = new Jwt();
    /** 보안 관련 설정 */
    private final Security security = new Security();

    /** JWT 설정을 반환한다. */
    public Jwt getJwt() {
        return jwt;
    }

    /** 보안 설정을 반환한다. */
    public Security getSecurity() {
        return security;
    }

    /**
     * JWT 토큰 관련 설정 클래스.
     */
    public static class Jwt {
        /**
         * Base64-encoded HMAC secret (필수, 최소 256bit)
         */
        private String secret;
        /**
         * 발급자
         */
        private String issuer = "dmes";
        /**
         * Access token 유효시간 (초), 기본 28800 (8시간, MES 1교대)
         */
        private long accessTokenExpiry = 28800;
        /**
         * Refresh token 유효시간 (초), 기본 86400 (24시간)
         */
        private long refreshTokenExpiry = 86400;

        /** HMAC 비밀키를 반환한다. */
        public String getSecret() {
            return secret;
        }

        /** HMAC 비밀키를 설정한다. */
        public void setSecret(String secret) {
            this.secret = secret;
        }

        /** 발급자를 반환한다. */
        public String getIssuer() {
            return issuer;
        }

        /** 발급자를 설정한다. */
        public void setIssuer(String issuer) {
            this.issuer = issuer;
        }

        /** Access 토큰 유효시간(초)을 반환한다. */
        public long getAccessTokenExpiry() {
            return accessTokenExpiry;
        }

        /** Access 토큰 유효시간(초)을 설정한다. */
        public void setAccessTokenExpiry(long accessTokenExpiry) {
            this.accessTokenExpiry = accessTokenExpiry;
        }

        /** Refresh 토큰 유효시간(초)을 반환한다. */
        public long getRefreshTokenExpiry() {
            return refreshTokenExpiry;
        }

        /** Refresh 토큰 유효시간(초)을 설정한다. */
        public void setRefreshTokenExpiry(long refreshTokenExpiry) {
            this.refreshTokenExpiry = refreshTokenExpiry;
        }
    }

    /**
     * 보안 정책 관련 설정 클래스.
     */
    public static class Security {
        /**
         * 로그인 실패 허용 횟수, 초과 시 계정 잠금
         */
        private int maxLoginFailures = 5;
        /**
         * 비밀번호 변경 주기 (일)
         */
        private int passwordExpiryDays = 90;

        /** 로그인 실패 허용 횟수를 반환한다. */
        public int getMaxLoginFailures() {
            return maxLoginFailures;
        }

        /** 로그인 실패 허용 횟수를 설정한다. */
        public void setMaxLoginFailures(int maxLoginFailures) {
            this.maxLoginFailures = maxLoginFailures;
        }

        /** 비밀번호 변경 주기(일)를 반환한다. */
        public int getPasswordExpiryDays() {
            return passwordExpiryDays;
        }

        /** 비밀번호 변경 주기(일)를 설정한다. */
        public void setPasswordExpiryDays(int passwordExpiryDays) {
            this.passwordExpiryDays = passwordExpiryDays;
        }
    }
}
