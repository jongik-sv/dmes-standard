package com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto;

/** {@code dataCsvUploadPop} action={@code validate} 요청 — dryRun 검증(design.md D3, 화면은 CSV 를 파싱하지 않는다). */
public class DataCsvValidateRequest {

    private String maruDataId;
    /** 업로드 파일 원문(UTF-8, 화면이 {@code FileReader.readAsText} 로 읽은 그대로). */
    private String csvText;

    public String getMaruDataId() { return maruDataId; }
    public String getCsvText() { return csvText; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setCsvText(String v) { this.csvText = v; }
}
