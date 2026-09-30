package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 룰 세트 — {@code TB_MDM_RULE_SET}(TSK-08-01 design.md §6.0 ⑦·§6.2). 버전 없이 저장 즉시 배포한다.
 *
 * <p>{@code RULE_IDS} 는 룰 ID 의 JSON 배열이고 FK 가 아니다. {@code ROW_VERSION} 은 조건부 네이티브 UPDATE 로만
 * 오르고 {@code @Version} 이 아니다(D7, 규칙표 #13). {@code FLOW_JSON} 은 흐름도 정의(NULL 이면 RULE_IDS 순서의 한 줄 흐름, spec §3.3).
 */
@Entity
@Table(name = "TB_MDM_RULE_SET")
public class MdmRuleSet extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_RULE_SET_ID", length = 50)
    private String maruRuleSetId;

    @Column(name = "MARU_RULE_SET_NAME", nullable = false)
    private String maruRuleSetName;

    @Column(name = "RULE_IDS", nullable = false)
    private String ruleIds;

    @Column(name = "FLOW_JSON")
    private String flowJson;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "STATUS", length = 20, nullable = false)
    private String status;

    @Column(name = "ROW_VERSION", nullable = false, updatable = false)
    private long rowVersion;

    protected MdmRuleSet() {
        // JPA 기본 생성자
    }

    public MdmRuleSet(String maruRuleSetId, String maruRuleSetName, String ruleIds) {
        this.maruRuleSetId = maruRuleSetId;
        this.maruRuleSetName = maruRuleSetName;
        this.ruleIds = ruleIds;
        this.status = "INUSE";
        this.rowVersion = 0;
    }

    public String getMaruRuleSetId() { return maruRuleSetId; }
    public String getMaruRuleSetName() { return maruRuleSetName; }
    public String getRuleIds() { return ruleIds; }
    public String getFlowJson() { return flowJson; }
    public String getDescription() { return description; }
    public String getStatus() { return status; }
    public long getRowVersion() { return rowVersion; }

    public void setMaruRuleSetName(String v) { this.maruRuleSetName = v; }
    public void setRuleIds(String v) { this.ruleIds = v; }
    public void setFlowJson(String v) { this.flowJson = v; }
    public void setDescription(String v) { this.description = v; }
    public void setStatus(String v) { this.status = v; }
    /** INSERT 때만 반영된다. 저장된 행의 값은 조건부 네이티브 UPDATE 로 올린다(D7). */
    public void setRowVersion(long v) { this.rowVersion = v; }
}
