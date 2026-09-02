package com.dongkuk.dmes.mcm.common.audit;

import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

import java.time.Instant;

/**
 * mcm-core 의 {@link McmAuditEntity} 자식 entity 에 자동으로 audit 컬럼 (createdBy/updatedBy 등) 을 채우는 JPA EntityListener.
 *
 * <p>cactus.CactusAuditListener 와 동등한 역할이지만 cactus 의존 0 — {@link SecurityIdentityHolder} 를 통해
 * mcm-core 자체 인터페이스 {@code SecurityIdentity} 에서 인증 사용자 ID 를 가져온다.
 *
 * <p>모드 A (cactus 사용) 사이트는 {@code SpringSecurityIdentity} 가 SecurityContext 에서 userId 를 읽음 →
 * cactus.UserContextHolder 에 저장된 값과 동일.
 *
 * <p>모드 B (외부, cactus 미사용) 사이트는 사이트가 자체 SecurityIdentity 빈 등록 → 동일 동작.
 *
 * <p>인증 컨텍스트 없는 호출 (배치, 시드 데이터, 백그라운드 작업) 은 createdBy/updatedBy 가 null 로 둠.
 */
public class McmAuditListener {

    /** INSERT 시 생성/수정 audit 컬럼 모두 채움. */
    @PrePersist
    public void onPrePersist(McmAuditEntity entity) {
        Instant now = Instant.now();
        if (entity.getCreatedAt() == null) entity.setCreatedAt(now);
        entity.setUpdatedAt(now);

        String userId = SecurityIdentityHolder.currentUserIdOrNull();
        if (userId != null && !userId.isBlank()) {
            if (entity.getCreatedBy() == null) entity.setCreatedBy(userId);
            entity.setUpdatedBy(userId);
        }

        if (entity.getVersion() == null) entity.setVersion(0L);
    }

    /** UPDATE 시 수정 audit 컬럼만 갱신. */
    @PreUpdate
    public void onPreUpdate(McmAuditEntity entity) {
        entity.setUpdatedAt(Instant.now());

        String userId = SecurityIdentityHolder.currentUserIdOrNull();
        if (userId != null && !userId.isBlank()) {
            entity.setUpdatedBy(userId);
        }

        Long ver = entity.getVersion();
        entity.setVersion(ver == null ? 0L : ver + 1);
    }
}
