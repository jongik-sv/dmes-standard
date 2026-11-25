package com.dongkuk.dmes.mqc.qpr.tagManagement.dto;

/** search 요청 params — 발행일 기간(대기 Tag 는 늘 포함), 프린터, 상태(WAIT·ISSUED·REISSUED·DISCARDED), 키워드. 모두 생략 가능. */
public class TagSearchRequest {
    private String fromDt;
    private String toDt;
    private String prtId;
    private String status;
    private String keyword;
    public String getFromDt() { return fromDt; }
    public void setFromDt(String v) { this.fromDt = v; }
    public String getToDt() { return toDt; }
    public void setToDt(String v) { this.toDt = v; }
    public String getPrtId() { return prtId; }
    public void setPrtId(String v) { this.prtId = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String v) { this.keyword = v; }
}
