package com.dongkuk.dmes.cactus.security.context;

/**
 * Spring Bean으로 주입 가능한 UserContextHolder 래퍼.
 * SecurityAutoConfiguration에서 빈으로 등록된다.
 */
public class UserContext {

    /** 현재 인증된 사용자 정보를 반환한다. */
    public UserInfo getCurrentUser() {
        return UserContextHolder.get();
    }

    /** 현재 인증된 사용자 ID를 반환한다. 미인증 시 "SYSTEM". */
    public String getCurrentUserId() {
        return UserContextHolder.getUserId();
    }

    /** 현재 사용자가 인증되었는지 여부를 반환한다. */
    public boolean isAuthenticated() {
        return UserContextHolder.get() != null;
    }

    /** 현재 사용자 이름을 반환한다. */
    public String getUserNm() {
        UserInfo info = UserContextHolder.get();
        return info != null ? info.userNm() : null;
    }

    /** 현재 사용자 사번을 반환한다. */
    public String getUserEmpNo() {
        UserInfo info = UserContextHolder.get();
        return info != null ? info.userEmpNo() : null;
    }
}
