package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import jakarta.persistence.AttributeOverride;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 룰 버전 — {@code TB_MDM_RULE_VER}(TSK-08-01 design.md §6.0 ③·§6.2). 복합 PK 는 {@link MdmRuleVerId}.
 *
 * <p>업무 칼럼 {@code VER} 와 감사 카운터가 겹치지 않도록 감사 카운터를 {@code AUD_VER} 로 재정의한다(D-034, 불변 규칙 2).
 * 이 재정의가 없으면 업무 필드 {@code ver} 와 상속 필드 {@code version} 이 같은 칼럼에 매핑되어 부팅이 실패한다.
 *
 * <p>상태·소유자·적용 구간·결재 칸 일부·{@code ROW_VERSION} 은 공통 버전 서비스가 네이티브 SQL 로만 바꾼다
 * ({@code updatable = false}, D7). {@code ROW_VERSION} 은 {@code @Version} 이 아니다(불변 규칙 17).
 */
@Entity
@Table(name = "TB_MDM_RULE_VER")
@IdClass(MdmRuleVerId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmRuleVer extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_RULE_ID", length = 50)
    private String maruRuleId;

    @Id
    @Column(name = "VER", nullable = false, precision = 7, scale = 3)
    private BigDecimal ver;

    /** 버전 종류(D-144). 만든 뒤 바꾸지 않는다. */
    @Enumerated(EnumType.STRING)
    @Column(name = "VER_KIND", nullable = false, length = 20, updatable = false)
    private VersionKind verKind;

    @Column(name = "STATUS", length = 20, nullable = false, updatable = false)
    private String status;

    @Column(name = "BASE_VER", precision = 7, scale = 3)
    private BigDecimal baseVer;

    @Column(name = "OWNER_ID", length = 50, updatable = false)
    private String ownerId;

    @Column(name = "HIT_POLICY", length = 20)
    private String hitPolicy;

    @Column(name = "APPLY_FROM", updatable = false)
    private LocalDateTime applyFrom;

    @Column(name = "APPLY_TO", updatable = false)
    private LocalDateTime applyTo;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "REQUESTED_BY", length = 50, updatable = false)
    private String requestedBy;

    @Column(name = "REQUESTED_AT", updatable = false)
    private LocalDateTime requestedAt;

    @Column(name = "EMERGENCY_YN", length = 1, nullable = false)
    private String emergencyYn;

    @Column(name = "EMERGENCY_REASON")
    private String emergencyReason;

    @Column(name = "APPROVED_BY", length = 50)
    private String approvedBy;

    @Column(name = "APPROVED_AT")
    private LocalDateTime approvedAt;

    @Column(name = "REJECT_REASON")
    private String rejectReason;

    @Column(name = "RELEASED_AT", updatable = false)
    private LocalDateTime releasedAt;

    @Column(name = "CANCELLED_AT")
    private LocalDateTime cancelledAt;

    @Column(name = "CANCEL_REASON")
    private String cancelReason;

    /** 낙관적 잠금 카운터(규칙표 #13). JPA {@code @Version} 이 아니다 — 조건부 네이티브 UPDATE 로만 오른다. */
    @Column(name = "ROW_VERSION", nullable = false, updatable = false)
    private long rowVersion;

    protected MdmRuleVer() {
        // JPA 기본 생성자
    }

    public MdmRuleVer(String maruRuleId, BigDecimal ver, VersionKind verKind, String ownerId) {
        this.maruRuleId = maruRuleId;
        this.ver = VersionNumbers.scaled(ver);
        this.verKind = verKind;
        this.ownerId = ownerId;
        this.status = "DRAFT";
        this.emergencyYn = "N";
        this.rowVersion = 0;
    }

    public String getMaruRuleId() { return maruRuleId; }
    /** SQLite 가 1.000 을 INTEGER 로 돌려줘도 scale 3 으로 돌려준다. */
    public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public VersionKind getVerKind() { return verKind; }
    public String getStatus() { return status; }
    public BigDecimal getBaseVer() { return VersionNumbers.scaled(baseVer); }
    public String getOwnerId() { return ownerId; }
    public String getHitPolicy() { return hitPolicy; }
    public LocalDateTime getApplyFrom() { return applyFrom; }
    public LocalDateTime getApplyTo() { return applyTo; }
    public String getDescription() { return description; }
    public String getRequestedBy() { return requestedBy; }
    public LocalDateTime getRequestedAt() { return requestedAt; }
    public String getEmergencyYn() { return emergencyYn; }
    public String getEmergencyReason() { return emergencyReason; }
    public String getApprovedBy() { return approvedBy; }
    public LocalDateTime getApprovedAt() { return approvedAt; }
    public String getRejectReason() { return rejectReason; }
    public LocalDateTime getReleasedAt() { return releasedAt; }
    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public String getCancelReason() { return cancelReason; }
    public long getRowVersion() { return rowVersion; }

    /** INSERT 때만 반영된다. 저장된 행의 값은 공통 버전 서비스가 네이티브 SQL 로 바꾼다(D7). */
    public void setStatus(String v) { this.status = v; }
    public void setBaseVer(BigDecimal v) { this.baseVer = VersionNumbers.scaled(v); }
    /** INSERT 때만 반영된다. 저장된 행의 값은 공통 버전 서비스가 네이티브 SQL 로 바꾼다(D7). */
    public void setOwnerId(String v) { this.ownerId = v; }
    public void setHitPolicy(String v) { this.hitPolicy = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 공통 버전 서비스가 네이티브 SQL 로 바꾼다(D7). */
    public void setApplyFrom(LocalDateTime v) { this.applyFrom = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 공통 버전 서비스가 네이티브 SQL 로 바꾼다(D7). */
    public void setApplyTo(LocalDateTime v) { this.applyTo = v; }
    public void setDescription(String v) { this.description = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 공통 버전 서비스가 네이티브 SQL 로 바꾼다(D7). */
    public void setRequestedBy(String v) { this.requestedBy = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 공통 버전 서비스가 네이티브 SQL 로 바꾼다(D7). */
    public void setRequestedAt(LocalDateTime v) { this.requestedAt = v; }
    public void setEmergencyYn(String v) { this.emergencyYn = v; }
    public void setEmergencyReason(String v) { this.emergencyReason = v; }
    public void setApprovedBy(String v) { this.approvedBy = v; }
    public void setApprovedAt(LocalDateTime v) { this.approvedAt = v; }
    public void setRejectReason(String v) { this.rejectReason = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 공통 버전 서비스가 네이티브 SQL 로 바꾼다(D7). */
    public void setReleasedAt(LocalDateTime v) { this.releasedAt = v; }
    public void setCancelledAt(LocalDateTime v) { this.cancelledAt = v; }
    public void setCancelReason(String v) { this.cancelReason = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 공통 버전 서비스가 조건부 네이티브 UPDATE 로 올린다(D7). */
    public void setRowVersion(long v) { this.rowVersion = v; }
}
