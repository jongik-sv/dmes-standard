package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

/** {@code ruleEdit} action={@code view} 요청. {@code ver} 가 없으면 서버가 기본 버전을 고른다(design §6.3.1). */
public class RuleEditViewRequest {

    private String maruRuleId;
    private Integer ver;

    public String getMaruRuleId() { return maruRuleId; }
    public Integer getVer() { return ver; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setVer(Integer v) { this.ver = v; }
}
