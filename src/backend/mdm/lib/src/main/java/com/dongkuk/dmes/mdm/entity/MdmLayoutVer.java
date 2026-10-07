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
 * 레이아웃 버전 — {@code TB_MDM_LAYOUT_VER}(D-144 3단계, V21). 복합 PK 는 {@link MdmLayoutVerId}. 룰 버전({@link MdmRuleVer})과
 * 같은 표준 칼럼에 형식 속성(EAI·자기 길이)과 확정 때 남기는 전환 방식·스냅샷을 더했다.
 *
 * <p>감사 카운터는 {@code AUD_VER} 로 재정의한다(D-034). 상태·소유자·적용 구간·{@code ROW_VERSION} 등은 공통 버전 엔진이
 * 네이티브 SQL 로만 바꾼다({@code updatable = false}). {@code ROW_VERSION} 은 {@code @Version} 이 아니다.
 */
@Entity
@Table(name = "TB_MDM_LAYOUT_VER")
@IdClass(MdmLayoutVerId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmLayoutVer extends CactusAuditEntity {

    @Id
    @Column(name = "LAYOUT_ID")
    private Long layoutId;

    @Id
    @Column(name = "VER", nullable = false, precision = 7, scale = 3)
    private BigDecimal ver;

    @Enumerated(EnumType.STRING)
    @Column(name = "VER_KIND", nullable = false, length = 20, updatable = false)
    private VersionKind verKind;

    @Column(name = "STATUS", length = 20, nullable = false, updatable = false)
    private String status;

    @Column(name = "BASE_VER", precision = 7, scale = 3)
    private BigDecimal baseVer;

    @Column(name = "OWNER_ID", length = 50, updatable = false)
    private String ownerId;

    @Column(name = "APPLY_FROM", updatable = false)
    private LocalDateTime applyFrom;

    @Column(name = "APPLY_TO", updatable = false)
    private LocalDateTime applyTo;

    @Column(name = "REQUESTED_BY", length = 50, updatable = false)
    private String requestedBy;

    @Column(name = "REQUESTED_AT", updatable = false)
    private LocalDateTime requestedAt;

    @Column(name = "RELEASED_AT", updatable = false)
    private LocalDateTime releasedAt;

    /** 낙관적 잠금(규칙표 #13). 공통 엔진이 조건부 네이티브 UPDATE 로만 올린다. */
    @Column(name = "ROW_VERSION", nullable = false, updatable = false)
    private long rowVersion;

    /**
     * 전문 버전: 그 전문의 EAI(인코딩·패딩은 EAI 소유, D5). 헤더 버전: 이 헤더를 표준 헤더로 쓸 EAI — 이 버전이 RELEASED 인
     * 구간에 이 헤더가 그 EAI 의 표준 헤더다(시각 T 해석, Ruling P3-15). DRAFT 저장은 공유 EAI 행을 바꾸지 않는다.
     */
    @Column(name = "EAI_CODE", length = 20)
    private String eaiCode;

    /** 이 버전 자신의 항목 길이 합 — 헤더는 헤더 길이, 전문은 본문 길이. 전문 총 길이는 시각 T 의 헤더 길이를 더해 합성한다. */
    @Column(name = "OWN_LENGTH", nullable = false)
    private int ownLength;

    /** 확정 때 기록(LayoutConfirmService → LayoutVersionStore.recordConfirm). */
    @Column(name = "SWITCH_MODE", length = 20, updatable = false)
    private String switchMode;

    @Column(name = "CHANGE_KINDS", length = 200, updatable = false)
    private String changeKinds;

    @Column(name = "CHANGE_SUMMARY", updatable = false)
    private String changeSummary;

    /** 확정 때 남기는 본문 스냅샷(LayoutBodySnapshot) 또는 이행 전 합성 스냅샷(LEGACY). */
    @Column(name = "SNAPSHOT_JSON", updatable = false)
    private String snapshotJson;

    @Column(name = "LEGACY_SNAPSHOT_YN", length = 1, nullable = false, updatable = false)
    private String legacySnapshotYn;

    protected MdmLayoutVer() {
        // JPA 기본 생성자
    }

    public MdmLayoutVer(Long layoutId, BigDecimal ver, VersionKind verKind, String ownerId) {
        this.layoutId = layoutId;
        this.ver = VersionNumbers.scaled(ver);
        this.verKind = verKind;
        this.ownerId = ownerId;
        this.status = "DRAFT";
        this.legacySnapshotYn = "N";
        this.rowVersion = 0L;
    }

    public Long getLayoutId() { return layoutId; }
    public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public VersionKind getVerKind() { return verKind; }
    public String getStatus() { return status; }
    public BigDecimal getBaseVer() { return VersionNumbers.scaled(baseVer); }
    public String getOwnerId() { return ownerId; }
    public LocalDateTime getApplyFrom() { return applyFrom; }
    public LocalDateTime getApplyTo() { return applyTo; }
    public String getRequestedBy() { return requestedBy; }
    public LocalDateTime getRequestedAt() { return requestedAt; }
    public LocalDateTime getReleasedAt() { return releasedAt; }
    public long getRowVersion() { return rowVersion; }
    public String getEaiCode() { return eaiCode; }
    public int getOwnLength() { return ownLength; }
    public String getSwitchMode() { return switchMode; }
    public String getChangeKinds() { return changeKinds; }
    public String getChangeSummary() { return changeSummary; }
    public String getSnapshotJson() { return snapshotJson; }
    public boolean isLegacySnapshot() { return "Y".equals(legacySnapshotYn); }
    public boolean isDraft() { return "DRAFT".equals(status); }
    public boolean isReleased() { return "RELEASED".equals(status); }

    public void setBaseVer(BigDecimal v) { this.baseVer = VersionNumbers.scaled(v); }
    public void setEaiCode(String v) { this.eaiCode = v; }
    public void setOwnLength(int v) { this.ownLength = v; }

    /** 시험 준비 전용 — INSERT 때만 반영된다(updatable = false). 운영 경로는 공통 엔진이 바꾼다. */
    public void setStatus(String v) { this.status = v; }
    public void setApplyFrom(LocalDateTime v) { this.applyFrom = MdmEntityTimes.seconds(v); }
    public void setApplyTo(LocalDateTime v) { this.applyTo = MdmEntityTimes.seconds(v); }
}
