package com.dongkuk.caravan.core.entity;

import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

import java.time.Instant;

/**
 * {@link CaravanAuditBase} 의 audit 컬럼을 자동 채우는 JPA EntityListener.
 *
 * <p>v4 §결정 #17 (옵션 B) — caravan 메타는 백그라운드 자동 생성/변경 위주라 RequestContext 의존 없이
 * SYSTEM 고정값 사용:
 * <ul>
 *   <li>{@code C_USR_ID} = {@code "SYSTEM"} — caravan 라이브러리 자체 동작 식별</li>
 *   <li>{@code C_SVC_ID} = {@code "caravan"} — 서비스 식별</li>
 *   <li>{@code C_PGM_ID} = entity 클래스 SimpleName — 어떤 entity 의 audit 인지 식별</li>
 * </ul>
 *
 * <p>호스트가 audit 필드를 명시 set 한 경우 (예: 테스트 또는 운영자 수동 INSERT) 는 덮어쓰지 않음 —
 * null 일 때만 SYSTEM 기본값 적용.
 *
 * <p>{@code @Version} 어노테이션 미사용 — cactus {@code CactusAuditEntity} 동일 패턴.
 * PrePersist 0 초기화 + PreUpdate +1 수동 관리.
 */
public class CaravanAuditListener {

    private static final String SYSTEM_USER_ID = "SYSTEM";
    private static final String CARAVAN_SVC_ID = "caravan";

    @PrePersist
    public void onPrePersist(CaravanAuditBase entity) {
        Instant now = Instant.now();
        if (entity.getCreatedAt() == null) {
            entity.setCreatedAt(now);
        }
        if (entity.getUpdatedAt() == null) {
            entity.setUpdatedAt(now);
        }
        if (entity.getCreatedBy() == null) {
            entity.setCreatedBy(SYSTEM_USER_ID);
        }
        if (entity.getCreatedSvcId() == null) {
            entity.setCreatedSvcId(CARAVAN_SVC_ID);
        }
        if (entity.getCreatedPgmId() == null) {
            entity.setCreatedPgmId(entity.getClass().getSimpleName());
        }
        if (entity.getUpdatedBy() == null) {
            entity.setUpdatedBy(entity.getCreatedBy());
        }
        if (entity.getUpdatedSvcId() == null) {
            entity.setUpdatedSvcId(entity.getCreatedSvcId());
        }
        if (entity.getUpdatedPgmId() == null) {
            entity.setUpdatedPgmId(entity.getCreatedPgmId());
        }
        if (entity.getVersion() == null) {
            entity.setVersion(0L);
        }
    }

    @PreUpdate
    public void onPreUpdate(CaravanAuditBase entity) {
        entity.setUpdatedAt(Instant.now());
        if (entity.getUpdatedBy() == null) {
            entity.setUpdatedBy(SYSTEM_USER_ID);
        }
        if (entity.getUpdatedSvcId() == null) {
            entity.setUpdatedSvcId(CARAVAN_SVC_ID);
        }
        if (entity.getUpdatedPgmId() == null) {
            entity.setUpdatedPgmId(entity.getClass().getSimpleName());
        }
        Long ver = entity.getVersion();
        entity.setVersion(ver == null ? 0L : ver + 1L);
    }
}
