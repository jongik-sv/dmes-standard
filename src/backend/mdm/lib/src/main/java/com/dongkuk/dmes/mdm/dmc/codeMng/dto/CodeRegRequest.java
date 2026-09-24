package com.dongkuk.dmes.mdm.dmc.codeMng.dto;

/** {@code codeMng} action={@code reg} 요청 — 등록은 MDM 원천만(불변 규칙 I8). */
public class CodeRegRequest {

    private String maruCodeId;
    private String maruCodeName;
    private String description;
    /** 계층 칸 수 0~5. 비면 0. */
    private Integer lvlCnt;
    /** 비우거나 MDM 만 허용. */
    private String sourceKind;

    public String getMaruCodeId() { return maruCodeId; }
    public String getMaruCodeName() { return maruCodeName; }
    public String getDescription() { return description; }
    public Integer getLvlCnt() { return lvlCnt; }
    public String getSourceKind() { return sourceKind; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setMaruCodeName(String v) { this.maruCodeName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setLvlCnt(Integer v) { this.lvlCnt = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
}
