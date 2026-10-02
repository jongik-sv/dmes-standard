package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

/**
 * {@code ruleSetEdit} action={@code view} 요청. {@code ver}(예: {@code "1.001"})가 비면 서버가 고른다 — 내 DRAFT → 지금 적용 중인 RELEASED →
 * VER 최대(D-144 2단계).
 */
public class RuleSetViewRequest {

    private String setId;
    private String ver;

    public String getSetId() { return setId; }
    public String getVer() { return ver; }

    public void setSetId(String v) { this.setId = v; }
    public void setVer(String v) { this.ver = v; }
}
