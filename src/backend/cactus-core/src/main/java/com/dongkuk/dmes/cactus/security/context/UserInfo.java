package com.dongkuk.dmes.cactus.security.context;

import java.util.List;

/**
 * 인증된 사용자 정보.
 */
public record UserInfo(String userId, String userNm, String userEmpNo, List<String> roles) {

    /** 기존 호환 생성자 — roles 없이 호출 시 ROLE_USER 기본 부여 */
    public UserInfo(String userId, String userNm, String userEmpNo) {
        this(userId, userNm, userEmpNo, List.of("ROLE_USER"));
    }
}
