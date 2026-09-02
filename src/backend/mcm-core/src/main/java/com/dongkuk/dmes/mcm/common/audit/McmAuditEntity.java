package com.dongkuk.dmes.mcm.common.audit;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;

import java.time.Instant;

/**
 * mcm-core 자체 감사 컬럼 base entity. cactus {@code CactusAuditEntity} 와
 * 컬럼 이름·시그니처가 동일하여 같은 테이블에 매핑된다.
 *
 * <p>{@link McmAuditListener} 가 자동으로 createdBy/updatedBy/createdAt/updatedAt/version 을 채운다.
 * userId 는 mcm-core 의 {@code SecurityIdentity} 에서 조회 (cactus 의존 X).
 */
@MappedSuperclass
@EntityListeners(McmAuditListener.class)
public abstract class McmAuditEntity {

    @Column(name = "C_USR_ID", length = 100)
    private String createdBy;

    @Column(name = "C_AT")
    private Instant createdAt;

    @Column(name = "C_SVC_ID", length = 100)
    private String createdSvcId;

    @Column(name = "C_PGM_ID", length = 100)
    private String createdPgmId;

    @Column(name = "U_USR_ID", length = 100)
    private String updatedBy;

    @Column(name = "U_AT")
    private Instant updatedAt;

    @Column(name = "U_SVC_ID", length = 100)
    private String updatedSvcId;

    @Column(name = "U_PGM_ID", length = 100)
    private String updatedPgmId;

    @Column(name = "VER")
    private Long version;

    public String getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public String getCreatedSvcId() { return createdSvcId; }
    public String getCreatedPgmId() { return createdPgmId; }
    public String getUpdatedBy() { return updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
    public String getUpdatedSvcId() { return updatedSvcId; }
    public String getUpdatedPgmId() { return updatedPgmId; }
    public Long getVersion() { return version; }

    public void setCreatedBy(String v) { this.createdBy = v; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
    public void setCreatedSvcId(String v) { this.createdSvcId = v; }
    public void setCreatedPgmId(String v) { this.createdPgmId = v; }
    public void setUpdatedBy(String v) { this.updatedBy = v; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
    public void setUpdatedSvcId(String v) { this.updatedSvcId = v; }
    public void setUpdatedPgmId(String v) { this.updatedPgmId = v; }
    public void setVersion(Long v) { this.version = v; }
}
