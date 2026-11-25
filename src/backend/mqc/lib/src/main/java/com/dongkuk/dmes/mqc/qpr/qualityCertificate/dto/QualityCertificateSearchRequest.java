package com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto;

/** search 요청 params — 발행일(초안은 요청일) 기간, 수요가, 상태(DRAFT·ISSUED·REISSUED·RECALLED), 키워드. 모두 생략 가능. */
public class QualityCertificateSearchRequest {
    private String fromDt;
    private String toDt;
    private String cusNm;
    private String status;
    private String keyword;
    public String getFromDt() { return fromDt; }
    public void setFromDt(String v) { this.fromDt = v; }
    public String getToDt() { return toDt; }
    public void setToDt(String v) { this.toDt = v; }
    public String getCusNm() { return cusNm; }
    public void setCusNm(String v) { this.cusNm = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String v) { this.keyword = v; }
}
