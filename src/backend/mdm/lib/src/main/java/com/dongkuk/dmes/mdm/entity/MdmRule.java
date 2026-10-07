package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/**
 * 룰 — {@code TB_MDM_RULE}(TSK-08-01 design.md §6.0 ①·§6.2). 버전 테이블 {@link MdmRuleVer} 의 부모다.
 *
 * <p>{@code STATUS} 와 식별자 카운터({@code LAST_VAR_ID}·{@code LAST_ROW_ID}·{@code LAST_CASE_ID})는 공통 버전 서비스와
 * 식별자 발급기가 네이티브 SQL 로만 바꾼다. 오래된 엔티티의 저장이 발급 번호·상태를 되돌리지 못하게
 * {@code updatable = false} 로 매핑한다(D7, 불변 규칙 16). {@code SOURCE_SYSTEM}({@code TB_MDM_SYSTEM})은 원시 필드다.
 */
@Entity
@Table(name = "TB_MDM_RULE")
public class MdmRule extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_RULE_ID", length = 50)
    private String maruRuleId;

    @Column(name = "MARU_RULE_NAME", nullable = false)
    private String maruRuleName;

    @Column(name = "RULE_KIND", length = 20, nullable = false)
    private String ruleKind;

    @Column(name = "STATUS", length = 20, nullable = false, updatable = false)
    private String status;

    @Column(name = "SOURCE_KIND", length = 20, nullable = false)
    private String sourceKind;

    /** {@code TB_MDM_SYSTEM.SYSTEM_CODE} 를 가리키는 FK. 원시 필드로만 둔다. */
    @Column(name = "SOURCE_SYSTEM", length = 20)
    private String sourceSystem;

    @Lob
    @Column(name = "DESCRIPTION")
    private String description;

    @Lob
    @Column(name = "USAGE_NOTE")
    private String usageNote;

    @Column(name = "LAST_VAR_ID", nullable = false, updatable = false)
    private int lastVarId;

    @Column(name = "LAST_ROW_ID", nullable = false, updatable = false)
    private int lastRowId;

    @Column(name = "LAST_CASE_ID", nullable = false, updatable = false)
    private int lastCaseId;

    protected MdmRule() {
        // JPA 기본 생성자
    }

    public MdmRule(String maruRuleId, String maruRuleName, String ruleKind, String sourceKind) {
        this.maruRuleId = maruRuleId;
        this.maruRuleName = maruRuleName;
        this.ruleKind = ruleKind;
        this.sourceKind = sourceKind;
        this.status = "CREATED";
    }

    public String getMaruRuleId() { return maruRuleId; }
    public String getMaruRuleName() { return maruRuleName; }
    public String getRuleKind() { return ruleKind; }
    public String getStatus() { return status; }
    public String getSourceKind() { return sourceKind; }
    public String getSourceSystem() { return sourceSystem; }
    public String getDescription() { return description; }
    public String getUsageNote() { return usageNote; }
    public int getLastVarId() { return lastVarId; }
    public int getLastRowId() { return lastRowId; }
    public int getLastCaseId() { return lastCaseId; }

    public void setMaruRuleName(String v) { this.maruRuleName = v; }
    public void setRuleKind(String v) { this.ruleKind = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 공통 버전 서비스가 네이티브 SQL 로 바꾼다(D7). */
    public void setStatus(String v) { this.status = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
    public void setSourceSystem(String v) { this.sourceSystem = v; }
    public void setDescription(String v) { this.description = v; }
    public void setUsageNote(String v) { this.usageNote = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 식별자 발급기가 네이티브 SQL 로 바꾼다(D7). */
    public void setLastVarId(int v) { this.lastVarId = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 식별자 발급기가 네이티브 SQL 로 바꾼다(D7). */
    public void setLastRowId(int v) { this.lastRowId = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 식별자 발급기가 네이티브 SQL 로 바꾼다(D7). */
    public void setLastCaseId(int v) { this.lastCaseId = v; }
}
