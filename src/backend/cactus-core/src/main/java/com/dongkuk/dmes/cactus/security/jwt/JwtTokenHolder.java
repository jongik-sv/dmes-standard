package com.dongkuk.dmes.cactus.security.jwt;

/**
 * 현재 요청의 JWT 토큰을 ThreadLocal로 전파한다.
 * 내부 서비스 호출 시 토큰을 전달할 때 사용.
 */
public final class JwtTokenHolder {

    /** JWT 토큰을 저장하는 ThreadLocal */
    private static final ThreadLocal<String> HOLDER = new ThreadLocal<>();

    /** 인스턴스화 방지 */
    private JwtTokenHolder() {
    }

    /**
     * 현재 스레드에 JWT 토큰을 설정한다.
     * @param token JWT 토큰 문자열
     */
    public static void set(String token) {
        HOLDER.set(token);
    }

    /** 현재 스레드의 JWT 토큰을 반환한다. */
    public static String get() {
        return HOLDER.get();
    }

    /** 현재 스레드의 JWT 토큰을 제거한다. */
    public static void clear() {
        HOLDER.remove();
    }
}
