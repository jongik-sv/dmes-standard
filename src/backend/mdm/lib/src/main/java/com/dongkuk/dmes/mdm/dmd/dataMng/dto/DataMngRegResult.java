package com.dongkuk.dmes.mdm.dmd.dataMng.dto;

/** {@code dataMng} action={@code reg} 응답 — 등록한 ID(화면이 이 ID 로 dataEdit 탭을 연다, D7). */
public class DataMngRegResult {

    private String maruDataId;

    public DataMngRegResult() {
    }

    public DataMngRegResult(String maruDataId) {
        this.maruDataId = maruDataId;
    }

    public String getMaruDataId() { return maruDataId; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
}
