package com.dongkuk.dmes.mcm.security.perm;

import java.util.Set;

/**
 * 사용자 영향.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 그래프 변경 전후 사용자×오브젝트의 action 증감. gained = 새로 생김, lost = 사라짐.
 */
public record UserImpact(String userId, String objectId, Set<String> gained, Set<String> lost) {
    public UserImpact {
        gained = gained == null ? Set.of() : Set.copyOf(gained);
        lost = lost == null ? Set.of() : Set.copyOf(lost);
    }
}
