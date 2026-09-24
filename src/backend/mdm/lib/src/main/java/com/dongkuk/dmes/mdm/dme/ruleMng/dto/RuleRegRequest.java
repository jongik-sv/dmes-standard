package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/** {@code ruleMng} action={@code reg} 요청 — MDM 원천 룰 등록(TSK-08-02 design I2·I3). */
public class RuleRegRequest {

    private String maruRuleId;
    private String maruRuleName;

    /** DECISION·DERIVE. */
    private String ruleKind;

    /** 선택. 비었거나 MDM 이어야 한다(EXTERNAL 은 거부). */
    private String sourceKind;

    private String description;
    private String usageNote;

    public String getMaruRuleId() { return maruRuleId; }
    public String getMaruRuleName() { return maruRuleName; }
    public String getRuleKind() { return ruleKind; }
    public String getSourceKind() { return sourceKind; }
    public String getDescription() { return description; }
    public String getUsageNote() { return usageNote; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setMaruRuleName(String v) { this.maruRuleName = v; }
    public void setRuleKind(String v) { this.ruleKind = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
    public void setDescription(String v) { this.description = v; }
    public void setUsageNote(String v) { this.usageNote = v; }
}
