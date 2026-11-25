package com.dongkuk.dmes.mqc.qpr.tagManagement.dto;

/** history 요청 params — Tag 번호(주면 그 Tag 전체), 아니면 처리일 기간. */
public class TagHistoryRequest {
    private String tagNo;
    private String fromDt;
    private String toDt;
    public String getTagNo() { return tagNo; }
    public void setTagNo(String v) { this.tagNo = v; }
    public String getFromDt() { return fromDt; }
    public void setFromDt(String v) { this.fromDt = v; }
    public String getToDt() { return toDt; }
    public void setToDt(String v) { this.toDt = v; }
}
