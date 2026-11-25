package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto;

/** history 요청 params — 증명서 번호(주면 그 문서 전체), 아니면 처리일 기간. */
public class InspectionCertificateHistoryRequest {
    private String mtcNo;
    private String fromDt;
    private String toDt;
    public String getMtcNo() { return mtcNo; }
    public void setMtcNo(String v) { this.mtcNo = v; }
    public String getFromDt() { return fromDt; }
    public void setFromDt(String v) { this.fromDt = v; }
    public String getToDt() { return toDt; }
    public void setToDt(String v) { this.toDt = v; }
}
