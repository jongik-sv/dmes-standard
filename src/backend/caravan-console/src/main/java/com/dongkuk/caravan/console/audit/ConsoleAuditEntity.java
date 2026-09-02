package com.dongkuk.caravan.console.audit;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;

import java.time.Instant;

/**
 * caravan-console 메타 entity 의 감사 컬럼 base class (0.2.0 신규 — cactus 의존 제거 패턴 B).
 *
 * <p>cactus-core 의 {@code CactusAuditEntity} 와 schema 동일 (C_USR_ID/C_AT/C_SVC_ID/C_PGM_ID/
 * U_USR_ID/U_AT/U_SVC_ID/U_PGM_ID/VER 9컬럼). 호환 유지로 같은 테이블에 cactus / console 모두 저장 가능.
 *
 * <p>{@link ConsoleAuditListener} 가 Spring SecurityContext 기반으로 createdBy / updatedBy 자동 채움.
 * service-id / pgm-id 는 caravan-console 컨텍스트상 nullable (BPMN OASIS 컨텍스트는 cactus 가 별도 처리).
 */
@MappedSuperclass
@EntityListeners(ConsoleAuditListener.class)
public abstract class ConsoleAuditEntity {

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

    void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    void setCreatedSvcId(String createdSvcId) { this.createdSvcId = createdSvcId; }
    void setCreatedPgmId(String createdPgmId) { this.createdPgmId = createdPgmId; }
    void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    void setUpdatedSvcId(String updatedSvcId) { this.updatedSvcId = updatedSvcId; }
    void setUpdatedPgmId(String updatedPgmId) { this.updatedPgmId = updatedPgmId; }
    void setVersion(Long version) { this.version = version; }
}
