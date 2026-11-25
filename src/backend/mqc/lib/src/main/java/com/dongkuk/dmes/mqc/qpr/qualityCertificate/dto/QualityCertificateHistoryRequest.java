package com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto;

/** history 요청 params — 보증서 번호(주면 그 문서 전체), 아니면 처리일 기간. */
public class QualityCertificateHistoryRequest {
    private String qcNo;
    private String fromDt;
    private String toDt;
    public String getQcNo() { return qcNo; }
    public void setQcNo(String v) { this.qcNo = v; }
    public String getFromDt() { return fromDt; }
    public void setFromDt(String v) { this.fromDt = v; }
    public String getToDt() { return toDt; }
    public void setToDt(String v) { this.toDt = v; }
}
