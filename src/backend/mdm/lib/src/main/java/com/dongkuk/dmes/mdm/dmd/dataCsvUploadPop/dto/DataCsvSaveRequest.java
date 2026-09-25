package com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto;

/**
 * {@code dataCsvUploadPop} action={@code save} 요청 — 검증 뒤 그대로 다시 보낸 CSV 원문(C0 처럼 서버가 저장 시점에 다시
 * 파싱·검사한다. 화면이 보낸 "검증 통과" 상태를 신뢰하지 않는다, design.md D3).
 */
public class DataCsvSaveRequest {

    private String maruDataId;
    private String csvText;

    public String getMaruDataId() { return maruDataId; }
    public String getCsvText() { return csvText; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setCsvText(String v) { this.csvText = v; }
}
