package com.dongkuk.dmes.mdm.dmd.dataMng.dto;

/** {@code dataMng} 목록 한 행 — ID·이름·원천·상태 네 열만(D2, 배포 대상·항목 수 등은 뺀다). */
public class DataMngRow {

    private String maruDataId;
    private String maruDataName;
    private String sourceKind;
    private String status;

    public DataMngRow() {
    }

    public DataMngRow(String maruDataId, String maruDataName, String sourceKind, String status) {
        this.maruDataId = maruDataId;
        this.maruDataName = maruDataName;
        this.sourceKind = sourceKind;
        this.status = status;
    }

    public String getMaruDataId() { return maruDataId; }
    public String getMaruDataName() { return maruDataName; }
    public String getSourceKind() { return sourceKind; }
    public String getStatus() { return status; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setMaruDataName(String v) { this.maruDataName = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
    public void setStatus(String v) { this.status = v; }
}
