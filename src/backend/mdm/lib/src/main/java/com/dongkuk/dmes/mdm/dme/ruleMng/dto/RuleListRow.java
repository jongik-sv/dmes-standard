package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/**
 * 룰 목록 한 행. {@code releasedVer}·{@code hitPolicy} 는 지금 적용 중인 RELEASED({@code APPLY_FROM <= 지금 < APPLY_TO}),
 * {@code pending*} 은 미적용 버전(DRAFT·REQUESTED·APPROVED·적용 전 RELEASED — 여럿이면 VER 가 가장 큰 것)이다. 없으면 null.
 */
public class RuleListRow {

    private String maruRuleId;
    private String maruRuleName;
    private String ruleKind;
    private String sourceKind;
    private String status;
    private Integer releasedVer;
    private String hitPolicy;
    private Integer pendingVer;
    private String pendingStatus;
    private String pendingOwnerId;

    public String getMaruRuleId() { return maruRuleId; }
    public String getMaruRuleName() { return maruRuleName; }
    public String getRuleKind() { return ruleKind; }
    public String getSourceKind() { return sourceKind; }
    public String getStatus() { return status; }
    public Integer getReleasedVer() { return releasedVer; }
    public String getHitPolicy() { return hitPolicy; }
    public Integer getPendingVer() { return pendingVer; }
    public String getPendingStatus() { return pendingStatus; }
    public String getPendingOwnerId() { return pendingOwnerId; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setMaruRuleName(String v) { this.maruRuleName = v; }
    public void setRuleKind(String v) { this.ruleKind = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
    public void setStatus(String v) { this.status = v; }
    public void setReleasedVer(Integer v) { this.releasedVer = v; }
    public void setHitPolicy(String v) { this.hitPolicy = v; }
    public void setPendingVer(Integer v) { this.pendingVer = v; }
    public void setPendingStatus(String v) { this.pendingStatus = v; }
    public void setPendingOwnerId(String v) { this.pendingOwnerId = v; }
}
