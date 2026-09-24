package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

/**
 * {@code ruleEdit} 버전 조작 요청 — delete(target VERSION = DRAFT 삭제, RULE = 폐기)·copy(새 버전)·lock·unlock·handover.
 */
public class RuleVersionRequest {

    private String maruRuleId;
    private Integer ver;
    private Long rowVersion;

    /** handover 의 넘겨받을 사용자 ID. */
    private String newOwnerId;

    /** delete 의 대상 VERSION·RULE. */
    private String target;

    public String getMaruRuleId() { return maruRuleId; }
    public Integer getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getNewOwnerId() { return newOwnerId; }
    public String getTarget() { return target; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setVer(Integer v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setNewOwnerId(String v) { this.newOwnerId = v; }
    public void setTarget(String v) { this.target = v; }
}
