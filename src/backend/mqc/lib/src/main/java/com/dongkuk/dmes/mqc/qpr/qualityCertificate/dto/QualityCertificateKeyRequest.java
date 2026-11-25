package com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto;

/** view·issue·reissue·cancel 요청 params — 보증서 번호와 사유(재발행·회수 때 필수). */
public class QualityCertificateKeyRequest {
    private String qcNo;
    private String reason;
    public String getQcNo() { return qcNo; }
    public void setQcNo(String v) { this.qcNo = v; }
    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }
}
