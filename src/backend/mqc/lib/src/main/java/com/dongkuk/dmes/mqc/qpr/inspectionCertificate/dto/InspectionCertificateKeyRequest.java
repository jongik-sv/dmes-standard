package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto;

/**
 * view·issue·reissue·cancel 요청 params — 증명서 번호(mtcNo), 일괄 발행은 mtcNos(쉼표), 사유(재발행·보류 때 필수).
 * issue 는 mtcNos 가 비면 mtcNo 하나를 발행한다.
 */
public class InspectionCertificateKeyRequest {
    private String mtcNo;
    private String mtcNos;
    private String reason;
    public String getMtcNo() { return mtcNo; }
    public void setMtcNo(String v) { this.mtcNo = v; }
    public String getMtcNos() { return mtcNos; }
    public void setMtcNos(String v) { this.mtcNos = v; }
    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }
}
