package com.dongkuk.dmes.cactus.audit;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;

import java.time.Instant;

/**
 * 감사 컬럼을 제공하는 기본 엔티티.
 * 비즈니스 엔티티는 이 클래스를 상속하면 INSERT/UPDATE 시 감사 컬럼이 자동으로 채워진다.
 *
 * <pre>
 * {@code @Entity}
 * public class Product extends CactusAuditEntity {
 *     {@code @Id}
 *     private String productId;
 *     private String productName;
 *     // 감사 컬럼은 자동 관리
 * }
 * </pre>
 */
@MappedSuperclass
@EntityListeners(CactusAuditListener.class)
public abstract class CactusAuditEntity {

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

    // ── public getter (조회용) ──

    public String getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public String getCreatedSvcId() { return createdSvcId; }
    public String getCreatedPgmId() { return createdPgmId; }
    public String getUpdatedBy() { return updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
    public String getUpdatedSvcId() { return updatedSvcId; }
    public String getUpdatedPgmId() { return updatedPgmId; }
    public Long getVersion() { return version; }

    // ── 패키지 접근 setter (CactusAuditListener 전용) ──

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
