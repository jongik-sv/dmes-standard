package com.dongkuk.dmes.mdm.dmd.dataMng.dto;

/** {@code dataMng} action={@code search} 요청 — ID·이름·상태(D2, 05 요구사항 "조회(ID·이름·상태)"). */
public class DataMngSearchRequest {

    /** ID 부분 일치(대소문자 무시). */
    private String maruDataId;
    /** 이름 부분 일치. */
    private String maruDataName;
    /** 비우면 전체. */
    private String status;

    public String getMaruDataId() { return maruDataId; }
    public String getMaruDataName() { return maruDataName; }
    public String getStatus() { return status; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setMaruDataName(String v) { this.maruDataName = v; }
    public void setStatus(String v) { this.status = v; }
}
