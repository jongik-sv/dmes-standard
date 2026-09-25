package com.dongkuk.dmes.mdm.dme.ruleSetMng.dto;

/** {@code ruleSetMng} action={@code reg} 요청 — 빈 세트 등록. 상태·룰 목록은 받지 않는다(서버가 INUSE·{@code []} 로 쓴다, I2). */
public class RuleSetRegRequest {

    private String setId;
    private String setName;
    private String description;

    public String getSetId() { return setId; }
    public String getSetName() { return setName; }
    public String getDescription() { return description; }

    public void setSetId(String v) { this.setId = v; }
    public void setSetName(String v) { this.setName = v; }
    public void setDescription(String v) { this.description = v; }
}
