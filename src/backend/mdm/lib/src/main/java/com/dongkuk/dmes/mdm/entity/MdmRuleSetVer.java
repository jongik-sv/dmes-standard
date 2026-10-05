package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.common.version.VersionedRow;
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
 * 룰 세트 버전 — {@code TB_MDM_RULE_SET_VER}(D-144 2단계, V18). 흐름({@code FLOW_JSON}, NULL 이면 RULE_IDS 한 줄 흐름)과 펼친 룰 목록
 * ({@code RULE_IDS}), 흐름의 SET 노드가 부르는 세트 ID 목록({@code CALL_SET_IDS}, JSON, 기본 [], V23)을 버전마다 둔다. 감사 카운터는 업무 VER 와 겹치지 않게 {@code AUD_VER}(D-034).
 *
 * <p>상태·소유자·적용 구간·확정 칸·{@code ROW_VERSION} 은 공통 버전 엔진이 네이티브 SQL 로만 바꾼다({@code updatable = false}). 흐름 저장은
 * {@code RuleSetWrites} 의 네이티브 UPDATE 다. 엔티티 저장은 새 버전 INSERT 에만 쓴다.
 */
@Entity
@Table(name = "TB_MDM_RULE_SET_VER")
@IdClass(MdmRuleSetVerId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmRuleSetVer extends CactusAuditEntity implements VersionedRow {

    @Id
    @Column(name = "MARU_RULE_SET_ID", length = 50)
    private String maruRuleSetId;

    @Id
    @Column(name = "VER", nullable = false, precision = 7, scale = 3)
    private BigDecimal ver;

    @Enumerated(EnumType.STRING)
    @Column(name = "VER_KIND", nullable = false, length = 20, updatable = false)
    private VersionKind verKind;

    @Column(name = "STATUS", length = 20, nullable = false, updatable = false)
    private String status;

    @Column(name = "BASE_VER", precision = 7, scale = 3, updatable = false)
    private BigDecimal baseVer;

    @Column(name = "OWNER_ID", length = 50, updatable = false)
    private String ownerId;

    @Column(name = "APPLY_FROM", updatable = false)
    private LocalDateTime applyFrom;

    @Column(name = "APPLY_TO", updatable = false)
    private LocalDateTime applyTo;

    @Column(name = "RULE_IDS", nullable = false, updatable = false)
    private String ruleIds;

    @Column(name = "FLOW_JSON", updatable = false)
    private String flowJson;

    /** 흐름의 SET 노드를 깊이 우선으로 펼친 중복 없는 세트 ID JSON 배열(하위 세트 spec §1.1, V23). 서버가 DRAFT 저장 때 계산한다. */
    @Column(name = "CALL_SET_IDS", nullable = false, updatable = false)
    private String callSetIds = "[]";

    @Column(name = "REQUESTED_BY", length = 50, updatable = false)
    private String requestedBy;

    @Column(name = "RELEASED_AT", updatable = false)
    private LocalDateTime releasedAt;

    @Column(name = "ROW_VERSION", nullable = false, updatable = false)
    private long rowVersion;

    protected MdmRuleSetVer() {
        // JPA 기본 생성자
    }

    /** 새 DRAFT. 상태 DRAFT·row_version 0. */
    public MdmRuleSetVer(String maruRuleSetId, BigDecimal ver, VersionKind verKind, String ownerId, String ruleIds) {
        this.maruRuleSetId = maruRuleSetId;
        this.ver = VersionNumbers.scaled(ver);
        this.verKind = verKind;
        this.ownerId = ownerId;
        this.ruleIds = ruleIds;
        this.status = "DRAFT";
        this.rowVersion = 0;
    }

    public String getMaruRuleSetId() { return maruRuleSetId; }
    /** SQLite 가 1.000 을 INTEGER 로 돌려줘도 scale 3 으로 돌려준다. */
    @Override public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public VersionKind getVerKind() { return verKind; }
    @Override public String getStatus() { return status; }
    public BigDecimal getBaseVer() { return VersionNumbers.scaled(baseVer); }
    public String getOwnerId() { return ownerId; }
    @Override public LocalDateTime getApplyFrom() { return applyFrom; }
    @Override public LocalDateTime getApplyTo() { return applyTo; }
    public String getRuleIds() { return ruleIds; }
    public String getFlowJson() { return flowJson; }
    public String getCallSetIds() { return callSetIds; }
    public String getRequestedBy() { return requestedBy; }
    public LocalDateTime getReleasedAt() { return releasedAt; }
    public long getRowVersion() { return rowVersion; }

    /** 아래 setter 는 INSERT 때만 반영된다(updatable=false). 저장된 행은 공통 엔진·RuleSetWrites 가 네이티브로 바꾼다. */
    public void setStatus(String v) { this.status = v; }
    public void setBaseVer(BigDecimal v) { this.baseVer = VersionNumbers.scaled(v); }
    public void setApplyFrom(LocalDateTime v) { this.applyFrom = v; }
    public void setApplyTo(LocalDateTime v) { this.applyTo = v; }
    public void setFlowJson(String v) { this.flowJson = v; }
    public void setCallSetIds(String v) { this.callSetIds = v; }
    public void setRequestedBy(String v) { this.requestedBy = v; }
    public void setReleasedAt(LocalDateTime v) { this.releasedAt = v; }
    public void setRowVersion(long v) { this.rowVersion = v; }
}
