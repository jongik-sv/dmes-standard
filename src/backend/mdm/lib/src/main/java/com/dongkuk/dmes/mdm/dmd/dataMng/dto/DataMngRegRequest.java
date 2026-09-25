package com.dongkuk.dmes.mdm.dmd.dataMng.dto;

/**
 * {@code dataMng} action={@code reg} 요청 — 등록은 MDM 원천만(R10, 05 「마루 데이터 등록」 입력에서 원천 종류·원천 시스템·
 * 배포 대상 시스템은 뺀다, D1·D2). 계층 칸 수는 비우면 0.
 */
public class DataMngRegRequest {

    private String maruDataId;
    private String maruDataName;
    private String description;
    /** 원천이 MDM 일 때만 뜻이 있는 키 형식 정규식. */
    private String codePattern;
    private Integer lvlCnt;

    public String getMaruDataId() { return maruDataId; }
    public String getMaruDataName() { return maruDataName; }
    public String getDescription() { return description; }
    public String getCodePattern() { return codePattern; }
    public Integer getLvlCnt() { return lvlCnt; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setMaruDataName(String v) { this.maruDataName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setCodePattern(String v) { this.codePattern = v; }
    public void setLvlCnt(Integer v) { this.lvlCnt = v; }
}
