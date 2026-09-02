package com.dongkuk.dmes.cactus.audit;

import com.dongkuk.oasis.audit.AuditHolder;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

import java.time.Instant;

/**
 * CactusAuditEntity의 감사 컬럼을 자동으로 채우는 JPA EntityListener.
 *
 * <p>동작 원리:
 * <ol>
 *   <li>OasisServiceExecutor가 요청 시작 시 AuditHolder에 CactusAudit 저장</li>
 *   <li>JPA persist/update 시 이 리스너가 자동 호출</li>
 *   <li>AuditHolder에서 CactusAudit를 꺼내 감사 컬럼에 값 세팅</li>
 * </ol>
 */
public class CactusAuditListener {

    /**
     * INSERT 시 생성/수정 감사 컬럼을 모두 채운다.
     */
    @PrePersist
    public void onPrePersist(CactusAuditEntity entity) {
        Instant now = Instant.now();
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);

        CactusAudit audit = AuditHolder.getAudit();
        if (audit != null) {
            entity.setCreatedBy(audit.userId());
            entity.setUpdatedBy(audit.userId());
            entity.setCreatedSvcId(audit.serviceId());
            entity.setUpdatedSvcId(audit.serviceId());
            entity.setCreatedPgmId(audit.menuId());
            entity.setUpdatedPgmId(audit.menuId());
        }

        entity.setVersion(0L);
    }

    /**
     * UPDATE 시 수정 감사 컬럼만 갱신한다.
     */
    @PreUpdate
    public void onPreUpdate(CactusAuditEntity entity) {
        entity.setUpdatedAt(Instant.now());

        CactusAudit audit = AuditHolder.getAudit();
        if (audit != null) {
            entity.setUpdatedBy(audit.userId());
            entity.setUpdatedSvcId(audit.serviceId());
            entity.setUpdatedPgmId(audit.menuId());
        }

        Long ver = entity.getVersion();
        entity.setVersion(ver == null ? 0L : ver + 1);
    }
}
