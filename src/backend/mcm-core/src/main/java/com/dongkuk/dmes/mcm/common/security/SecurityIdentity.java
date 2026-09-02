package com.dongkuk.dmes.mcm.common.security;

import java.util.Collection;
import java.util.List;

/**
 * 현재 인증된 사용자 식별자를 제공하는 추상화. mcm-core 가 cactus / oasis 비의존인 채로
 * IDOR 차단(요청 body 의 userId 무시)을 구현하기 위해 사용한다.
 *
 * <p>기본 구현({@link SpringSecurityIdentity}) 은 Spring Security {@code SecurityContextHolder}
 * 에서 가져온다. 모드 A(cactus 사용) 사이트는 cactus {@code UserContextHolder} 기반 구현을
 * {@code @Primary} 빈으로 제공해 override 한다.
 */
public interface SecurityIdentity {

    /**
     * 현재 인증된 사용자 ID. 미인증 상태면 {@code null}.
     */
    String currentUserId();

    /**
     * 인증된 사용자 ID 를 반환. 미인증/blank 면 {@link IllegalStateException}.
     *
     * <p>IDOR 차단이 필요한 비즈니스 로직(예: getMyMenus / resetPassword) 에서
     * request body 의 userId 대신 본 메서드로 강제 치환한다. fail-fast 정책.
     */
    default String requireUserId() {
        String userId = currentUserId();
        if (userId == null || userId.isBlank()) {
            throw new IllegalStateException(
                    "Authenticated userId is required but missing.");
        }
        return userId;
    }

    /**
     * 현재 인증된 사용자가 주어진 권한을 가지는지 여부.
     * 모드 B(외부 SI) 가 Spring Security ROLE 만으로 권한 검사할 때 사용.
     */
    boolean hasAuthority(String authority);

    /**
     * 현재 인증된 사용자의 ROLE_ID 집합. 미인증이면 빈 컬렉션.
     *
     * <p>구현체는 사이트의 인증 컨텍스트(cactus UserContextHolder / Spring Authentication 등)에서
     * 사용자 ROLE_ID 를 추출하여 반환한다. 본 interface 의 default 는 빈 리스트이며,
     * Endpoint 권한 매칭({@code EndpointPermissionFilter} / {@code UserPermCache}) 을 사용하려면 사이트가 override 해야 한다.
     */
    default Collection<String> currentRoleIds() {
        return List.of();
    }
}
