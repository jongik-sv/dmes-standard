package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/** ERD 작업 중 표시 — {@code TB_MDM_ERD_CLAIM}(권고용, 스펙 D17). 만료가 지나면 무시한다. 감사 카운터는 {@code VER}. */
@Entity
@Table(name = "TB_MDM_ERD_CLAIM")
@IdClass(MdmErdClaimId.class)
public class MdmErdClaim extends CactusAuditEntity {

    @Id @Column(name = "ERD_MODEL_ID", length = 50) private String erdModelId;
    @Id @Column(name = "TABLE_UUID", length = 50) private String tableUuid;
    @Column(name = "SESSION_NM", nullable = false) private String sessionNm;
    @Column(name = "USER_ID", nullable = false) private String userId;
    @Column(name = "EXPIRES_AT", nullable = false) private LocalDateTime expiresAt;

    protected MdmErdClaim() {
        // JPA 기본 생성자
    }

    public MdmErdClaim(String erdModelId, String tableUuid, String sessionNm, String userId, LocalDateTime expiresAt) {
        this.erdModelId = erdModelId;
        this.tableUuid = tableUuid;
        this.sessionNm = sessionNm;
        this.userId = userId;
        this.expiresAt = expiresAt;
    }

    public String getErdModelId() { return erdModelId; }
    public String getTableUuid() { return tableUuid; }
    public String getSessionNm() { return sessionNm; }
    public void setSessionNm(String v) { this.sessionNm = v; }
    public String getUserId() { return userId; }
    public void setUserId(String v) { this.userId = v; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime v) { this.expiresAt = v; }
}
