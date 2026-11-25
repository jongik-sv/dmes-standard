package com.dongkuk.dmes.mqc.qdr.qualityDesignResult.dto;

/** search params — 의뢰일 기간(yyyy-MM-dd), 품명 코드, 설계 상태(WAIT·ING·CONF·HOLD), 키워드. 모두 생략 가능. */
public class QualityDesignResultSearchRequest {
    private String fromDt;
    private String toDt;
    private String prdNmCd;
    private String status;
    private String keyword;
    public String getFromDt() { return fromDt; }
    public void setFromDt(String v) { this.fromDt = v; }
    public String getToDt() { return toDt; }
    public void setToDt(String v) { this.toDt = v; }
    public String getPrdNmCd() { return prdNmCd; }
    public void setPrdNmCd(String v) { this.prdNmCd = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String v) { this.keyword = v; }
}
