package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto;

/** search 요청 params — 검사일 기간, 적용 규격, 상태(REVIEW·ISSUED·HOLD), 키워드. 모두 생략 가능. */
public class InspectionCertificateSearchRequest {
    private String fromDt;
    private String toDt;
    private String stdCd;
    private String status;
    private String keyword;
    public String getFromDt() { return fromDt; }
    public void setFromDt(String v) { this.fromDt = v; }
    public String getToDt() { return toDt; }
    public void setToDt(String v) { this.toDt = v; }
    public String getStdCd() { return stdCd; }
    public void setStdCd(String v) { this.stdCd = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String v) { this.keyword = v; }
}
