package com.dongkuk.caravan.core.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import lombok.experimental.SuperBuilder;

import java.time.Instant;

/**
 * caravan entity 의 audit 컬럼 공통 베이스 (MappedSuperclass).
 *
 * <p>v4 §결정 #13 (2026-05-11) — caravan 메타 entity 의 audit 컬럼명을 cactus-core 표준과 통일:
 * {@code C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER}.
 *
 * <p>설계 원칙:
 * <ul>
 *   <li><b>caravan 라이브러리는 cactus-core 의존 0 유지</b> (v4 §결정 #1) — {@code CactusAuditEntity}
 *       상속 못 함. 동일 컬럼 구조를 caravan 자체로 정의.</li>
 *   <li>Hibernate 자체 기능 (mapped superclass + entity listener) 만 사용 — Spring Data 의 {@code @CreatedBy}
 *       / {@code AuditingEntityListener} 같은 외부 의존 회피.</li>
 *   <li>사용자 ID 자동 채움 = SYSTEM 고정 (v4 §결정 #17 옵션 B) — caravan 메타는 백그라운드 자동 생성/변경
 *       위주라 RequestContext 의존 X.</li>
 * </ul>
 *
 * <p>2026-05-13 신설 (v4 §결정 #13 본격 적용).
 */
@MappedSuperclass
@EntityListeners(CaravanAuditListener.class)
@SuperBuilder
public abstract class CaravanAuditBase {

    /** Lombok {@code @SuperBuilder} 가 protected 생성자를 요구. {@code @NoArgsConstructor} 효과를 명시 정의. */
    protected CaravanAuditBase() {}


    @Column(name = "C_USR_ID", length = 100, updatable = false)
    private String createdBy;

    @Column(name = "C_AT", updatable = false)
    private Instant createdAt;

    @Column(name = "C_SVC_ID", length = 100, updatable = false)
    private String createdSvcId;

    @Column(name = "C_PGM_ID", length = 100, updatable = false)
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

    // ── 패키지 접근 setter (CaravanAuditListener 전용) ──

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
