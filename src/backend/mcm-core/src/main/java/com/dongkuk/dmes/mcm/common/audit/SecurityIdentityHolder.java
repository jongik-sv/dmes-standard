package com.dongkuk.dmes.mcm.common.audit;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;

/**
 * JPA EntityListener 가 Spring 빈 주입을 받지 못하므로 사용하는 정적 holder.
 * 부팅 시 {@link SecurityIdentityHolderInitializer} 가 SecurityIdentity 빈을 set 하고,
 * {@link McmAuditListener} 가 매 persist/update 시 본 holder 를 통해 인증 사용자 ID 를 조회한다.
 *
 * <p>의존 방향 정책: cactus / aps 등 외부 라이브러리 import 0. {@link SecurityIdentity} 인터페이스만 봄.
 */
public final class SecurityIdentityHolder {

    private static volatile SecurityIdentity instance;

    private SecurityIdentityHolder() {}

    public static void set(SecurityIdentity identity) {
        instance = identity;
    }

    /** 현재 등록된 SecurityIdentity. 부팅 전이면 {@code null}. */
    public static SecurityIdentity get() {
        return instance;
    }

    /**
     * 현재 인증된 사용자 ID 안전 조회. 인증 컨텍스트 없으면 {@code null}.
     * EntityListener 의 batch 작업 / 시드 데이터 / 인증 없는 백그라운드 작업도 안전.
     */
    public static String currentUserIdOrNull() {
        SecurityIdentity identity = instance;
        if (identity == null) return null;
        try {
            return identity.currentUserId();
        } catch (RuntimeException e) {
            return null;
        }
    }
}
