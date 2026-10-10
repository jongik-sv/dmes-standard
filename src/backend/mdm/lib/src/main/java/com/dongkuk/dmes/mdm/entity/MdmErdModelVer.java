package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import jakarta.persistence.AttributeOverride;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** ERD 모델 버전 — {@code TB_MDM_ERD_MODEL_VER}. 상태·소유자·적용 기간·ROW_VERSION 은 공통 버전 서비스가 네이티브 SQL 로만 바꾼다. */
@Entity
@Table(name = "TB_MDM_ERD_MODEL_VER")
@IdClass(MdmErdModelVerId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmErdModelVer extends CactusAuditEntity {

    @Id @Column(name = "ERD_MODEL_ID", length = 50) private String erdModelId;
    @Id @Column(name = "VER", nullable = false, precision = 7, scale = 3) private BigDecimal ver;
    @Column(name = "VER_KIND", nullable = false) private String verKind;
    @Column(name = "STATUS", nullable = false, updatable = false) private String status;
    @Column(name = "BASE_VER", precision = 7, scale = 3) private BigDecimal baseVer;
    @Column(name = "OWNER_ID", updatable = false) private String ownerId;
    @Column(name = "APPLY_FROM", updatable = false) private LocalDateTime applyFrom;
    @Column(name = "APPLY_TO", updatable = false) private LocalDateTime applyTo;
    @Lob @Column(name = "MODEL_JSON", nullable = false, updatable = false) private String modelJson;
    @Column(name = "ROW_VERSION", nullable = false, updatable = false) private long rowVersion;

    protected MdmErdModelVer() {
        // JPA 기본 생성자
    }

    public MdmErdModelVer(String erdModelId, BigDecimal ver, String verKind, String ownerId, String modelJson) {
        this.erdModelId = erdModelId;
        this.ver = VersionNumbers.scaled(ver);
        this.verKind = verKind;
        this.status = "DRAFT";
        this.ownerId = ownerId;
        this.modelJson = modelJson;
    }

    public String getErdModelId() { return erdModelId; }
    public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public String getVerKind() { return verKind; }
    public String getStatus() { return status; }
    public BigDecimal getBaseVer() { return VersionNumbers.scaled(baseVer); }
    public void setBaseVer(BigDecimal baseVer) { this.baseVer = VersionNumbers.scaled(baseVer); }
    public String getOwnerId() { return ownerId; }
    public LocalDateTime getApplyFrom() { return applyFrom; }
    public LocalDateTime getApplyTo() { return applyTo; }
    public String getModelJson() { return modelJson; }
    public long getRowVersion() { return rowVersion; }
}
