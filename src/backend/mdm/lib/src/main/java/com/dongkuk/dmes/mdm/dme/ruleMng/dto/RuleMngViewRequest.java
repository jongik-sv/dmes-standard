package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/** {@code ruleMng} action={@code view} 요청 — 헤더·버전 화면에 열 룰 하나. */
public class RuleMngViewRequest {

    private String maruRuleId;

    public String getMaruRuleId() { return maruRuleId; }
    public void setMaruRuleId(String v) { this.maruRuleId = v; }
}
