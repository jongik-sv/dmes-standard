package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import jakarta.persistence.AttributeOverride;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

/**
 * 마루 코드 버전 — {@code TB_MDM_CODE_VER}(TSK-06-01 design.md §6.0.3). 복합 PK 는 {@link MdmCodeVerId}.
 *
 * <p>업무 칼럼 {@code VER}(버전 번호)과 감사 카운터가 이름이 겹쳐 감사 카운터는 {@code AUD_VER} 로 재매핑한다(D-034,
 * 불변 규칙 11). {@code ROW_VERSION} 은 {@code @Version} 이 아니다 — 증가는 {@code VersionWriteGuard}·{@code VersionRowStore}
 * 몫이다(불변 규칙 13). 업무 일시 세터는 초 단위로 자른다(MSSQL {@code DATETIME2(0)} 는 반올림하므로 두 방언이 같은 값을
 * 갖게 한다, 불변 규칙 22). SQLite 에서는 {@code MdmSqliteTemporalContributor} 가 네이티브와 같은 19자 TEXT 로 쓴다(D7).
 *
 * <p>공통 버전 서비스는 이 표를 네이티브 UPDATE 로 바꾸며 관리 엔티티를 갱신하지 않는다 — 엔티티를 들고 있다가 공통
 * 서비스를 부른 뒤에는 다시 읽는다(TSK-01-03 §7).
 */
@Entity
@Table(name = "TB_MDM_CODE_VER")
@IdClass(MdmCodeVerId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmCodeVer extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_CODE_ID", length = 50)
    private String maruCodeId;

    @Id
    @Column(name = "VER", precision = 7, scale = 3)
    private BigDecimal ver;

    @Column(name = "VER_KIND", length = 20, nullable = false)
    private String verKind;

    @Column(name = "RESTORED_FROM", precision = 7, scale = 3)
    private BigDecimal restoredFrom;

    @Column(name = "STATUS", length = 20, nullable = false)
    private String status = VersionStatus.DRAFT.name();

    @Column(name = "OWNER_ID", length = 50)
    private String ownerId;

    @Column(name = "APPLY_FROM")
    private LocalDateTime applyFrom;

    @Column(name = "APPLY_TO")
    private LocalDateTime applyTo;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "REQUESTED_BY", length = 50)
    private String requestedBy;

    @Column(name = "REQUESTED_AT")
    private LocalDateTime requestedAt;

    @Column(name = "EMERGENCY_YN", length = 1, nullable = false)
    private String emergencyYn = "N";

    @Column(name = "EMERGENCY_REASON")
    private String emergencyReason;

    @Column(name = "APPROVED_BY", length = 50)
    private String approvedBy;

    @Column(name = "APPROVED_AT")
    private LocalDateTime approvedAt;

    @Column(name = "REJECT_REASON")
    private String rejectReason;

    @Column(name = "RELEASED_AT")
    private LocalDateTime releasedAt;

    @Column(name = "CANCELLED_AT")
    private LocalDateTime cancelledAt;

    @Column(name = "CANCEL_REASON")
    private String cancelReason;

    /** 낙관적 잠금 칸이지만 {@code @Version} 이 아니다(불변 규칙 13). */
    @Column(name = "ROW_VERSION", nullable = false)
    private long rowVersion = VersionConventions.INITIAL_ROW_VERSION;

    protected MdmCodeVer() {
        // JPA 기본 생성자
    }

    public MdmCodeVer(String maruCodeId, BigDecimal ver, String verKind) {
        this.maruCodeId = maruCodeId;
        this.ver = MdmCodeVerNumbers.scaled(ver);
        this.verKind = verKind;
    }

    public String getMaruCodeId() { return maruCodeId; }
    public BigDecimal getVer() { return MdmCodeVerNumbers.scaled(ver); }
    public String getVerKind() { return verKind; }
    public BigDecimal getRestoredFrom() { return MdmCodeVerNumbers.scaled(restoredFrom); }
    public String getStatus() { return status; }
    public String getOwnerId() { return ownerId; }
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

    public void setVerKind(String v) { this.verKind = v; }
    public void setRestoredFrom(BigDecimal v) { this.restoredFrom = MdmCodeVerNumbers.scaled(v); }
    public void setStatus(String v) { this.status = v; }
    public void setOwnerId(String v) { this.ownerId = v; }
    public void setApplyFrom(LocalDateTime v) { this.applyFrom = seconds(v); }
    public void setApplyTo(LocalDateTime v) { this.applyTo = seconds(v); }
    public void setDescription(String v) { this.description = v; }
    public void setRequestedBy(String v) { this.requestedBy = v; }
    public void setRequestedAt(LocalDateTime v) { this.requestedAt = seconds(v); }
    public void setEmergencyYn(String v) { this.emergencyYn = v; }
    public void setEmergencyReason(String v) { this.emergencyReason = v; }
    public void setApprovedBy(String v) { this.approvedBy = v; }
    public void setApprovedAt(LocalDateTime v) { this.approvedAt = seconds(v); }
    public void setRejectReason(String v) { this.rejectReason = v; }
    public void setReleasedAt(LocalDateTime v) { this.releasedAt = seconds(v); }
    public void setCancelledAt(LocalDateTime v) { this.cancelledAt = seconds(v); }
    public void setCancelReason(String v) { this.cancelReason = v; }

    private static LocalDateTime seconds(LocalDateTime v) {
        return v == null ? null : v.truncatedTo(ChronoUnit.SECONDS);
    }
}
