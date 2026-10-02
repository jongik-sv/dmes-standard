package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 룰 세트 부모 — {@code TB_MDM_RULE_SET}(D-144 2단계, V18). 흐름·행 버전은 {@link MdmRuleSetVer} 에 있다.
 * 상태는 CREATED → INUSE(첫 확정, 공통 엔진 markParentInUse) → DEPRECATED. 감사 카운터는 {@code VER}(부모 관례, D-034).
 */
@Entity
@Table(name = "TB_MDM_RULE_SET")
public class MdmRuleSet extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_RULE_SET_ID", length = 50)
    private String maruRuleSetId;

    @Column(name = "MARU_RULE_SET_NAME", nullable = false)
    private String maruRuleSetName;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "STATUS", length = 20, nullable = false)
    private String status;

    protected MdmRuleSet() {
        // JPA 기본 생성자
    }

    public MdmRuleSet(String maruRuleSetId, String maruRuleSetName) {
        this.maruRuleSetId = maruRuleSetId;
        this.maruRuleSetName = maruRuleSetName;
        this.status = "CREATED";
    }

    public String getMaruRuleSetId() { return maruRuleSetId; }
    public String getMaruRuleSetName() { return maruRuleSetName; }
    public String getDescription() { return description; }
    public String getStatus() { return status; }

    public void setMaruRuleSetName(String v) { this.maruRuleSetName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setStatus(String v) { this.status = v; }
}
