package com.dongkuk.dmes.mqc.qjd.qualityJudgment.dto;

/** history 요청 params — 코일 번호(주면 그 코일 전체 이력), 아니면 처리일 기간(yyyy-MM-dd). */
public class QualityJudgmentHistoryRequest {
    private String coilNo;
    private String fromDt;
    private String toDt;
    public String getCoilNo() { return coilNo; }
    public void setCoilNo(String v) { this.coilNo = v; }
    public String getFromDt() { return fromDt; }
    public void setFromDt(String v) { this.fromDt = v; }
    public String getToDt() { return toDt; }
    public void setToDt(String v) { this.toDt = v; }
}
