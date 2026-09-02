package com.dongkuk.caravan.console.audit;

import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;

/**
 * {@link ConsoleAuditEntity} 의 감사 컬럼 자동 채움 EntityListener (0.2.0 신규 — cactus 의존 제거 패턴 B).
 *
 * <p>cactus 의 {@code CactusAuditListener} 가 oasis-core 의 {@code AuditHolder} (BPMN 컨텍스트) 사용 —
 * caravan-console 는 oasis 의존 끊고 Spring SecurityContext 의 Authentication 기반으로 단순화.
 *
 * <p>caravan-console 콘솔 (REST API) 에서 caravan-console entity 변경 시 인증된 사용자 ID 가 createdBy / updatedBy 에 자동 채워짐.
 * service-id / pgm-id 는 nullable — caravan-console 컨텍스트상 일반적으로 미사용.
 */
public class ConsoleAuditListener {

    @PrePersist
    public void onPrePersist(ConsoleAuditEntity entity) {
        Instant now = Instant.now();
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);

        String userId = currentUserId();
        if (userId != null) {
            entity.setCreatedBy(userId);
            entity.setUpdatedBy(userId);
        }
        entity.setVersion(0L);
    }

    @PreUpdate
    public void onPreUpdate(ConsoleAuditEntity entity) {
        entity.setUpdatedAt(Instant.now());

        String userId = currentUserId();
        if (userId != null) {
            entity.setUpdatedBy(userId);
        }
        Long ver = entity.getVersion();
        entity.setVersion(ver == null ? 0L : ver + 1);
    }

    private String currentUserId() {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && auth.getName() != null) {
                return auth.getName();
            }
        } catch (Throwable t) {
            // SecurityContextHolder 접근 실패 시 silent — audit 컬럼은 nullable
        }
        return null;
    }
}
