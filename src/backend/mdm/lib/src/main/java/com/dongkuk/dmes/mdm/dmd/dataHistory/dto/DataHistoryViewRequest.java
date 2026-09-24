package com.dongkuk.dmes.mdm.dmd.dataHistory.dto;

/** {@code dataHistory} action={@code view} 요청. */
public class DataHistoryViewRequest {

    /** 선택. */
    private String maruDataId;

    public String getMaruDataId() { return maruDataId; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
}
