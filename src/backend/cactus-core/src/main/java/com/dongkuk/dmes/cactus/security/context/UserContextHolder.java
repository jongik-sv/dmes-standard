package com.dongkuk.dmes.cactus.security.context;

/**
 * ThreadLocal 기반 사용자 컨텍스트.
 * 인증 필터가 set/clear 하고, 비즈니스 코드에서 조회한다.
 */
public final class UserContextHolder {

    /** 사용자 정보를 저장하는 ThreadLocal */
    private static final ThreadLocal<UserInfo> HOLDER = new ThreadLocal<>();

    /** 인스턴스화 방지 */
    private UserContextHolder() {
    }

    /**
     * 현재 스레드에 사용자 정보를 설정한다.
     * @param userInfo 사용자 정보
     */
    public static void set(UserInfo userInfo) {
        HOLDER.set(userInfo);
    }

    /** 현재 스레드의 사용자 정보를 반환한다. */
    public static UserInfo get() {
        return HOLDER.get();
    }

    /**
     * 현재 사용자 ID를 반환한다. 인증 정보가 없으면 "SYSTEM".
     */
    public static String getUserId() {
        UserInfo info = HOLDER.get();
        return info != null ? info.userId() : "SYSTEM";
    }

    /** 현재 스레드의 사용자 정보를 제거한다. */
    public static void clear() {
        HOLDER.remove();
    }
}
