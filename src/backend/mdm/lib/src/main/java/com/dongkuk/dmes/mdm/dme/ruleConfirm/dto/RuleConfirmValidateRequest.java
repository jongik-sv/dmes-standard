package com.dongkuk.dmes.mdm.dme.ruleConfirm.dto;

/**
 * {@code ruleConfirm} action={@code validate} 요청 params(TSK-08-05 design §6.5). applyFrom 은 {@code yyyy-MM-dd HH:mm:ss}(KST) 문자열이고
 * 적용 순서 판정에만 쓴다. 쓰기를 하지 않는다(I27).
 */
public class RuleConfirmValidateRequest {

    private String maruRuleId;
    private Integer ver;
    private String applyFrom;

    public String getMaruRuleId() { return maruRuleId; }
    public Integer getVer() { return ver; }
    public String getApplyFrom() { return applyFrom; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setVer(Integer v) { this.ver = v; }
    public void setApplyFrom(String v) { this.applyFrom = v; }
}
