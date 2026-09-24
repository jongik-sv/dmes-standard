package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

/** 마루 데이터 선택지 한 줄. */
public class MaruDataOption {

    private String maruDataId;
    private String maruDataName;
    private String status;
    private String sourceKind;

    public MaruDataOption() {
    }

    public MaruDataOption(String maruDataId, String maruDataName, String status, String sourceKind) {
        this.maruDataId = maruDataId;
        this.maruDataName = maruDataName;
        this.status = status;
        this.sourceKind = sourceKind;
    }

    public String getMaruDataId() { return maruDataId; }
    public String getMaruDataName() { return maruDataName; }
    public String getStatus() { return status; }
    public String getSourceKind() { return sourceKind; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setMaruDataName(String v) { this.maruDataName = v; }
    public void setStatus(String v) { this.status = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
}
