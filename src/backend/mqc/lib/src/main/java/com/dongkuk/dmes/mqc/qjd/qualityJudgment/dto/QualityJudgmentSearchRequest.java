package com.dongkuk.dmes.mqc.qjd.qualityJudgment.dto;

/** search·codes 요청 params — 검사일 기간(yyyy-MM-dd), 공정(라인), 품명 코드, 판정 상태(WAIT·PASS·FAIL·HOLD), 키워드. 모두 생략 가능. */
public class QualityJudgmentSearchRequest {
    private String fromDt;
    private String toDt;
    private String lineCd;
    private String prdCd;
    private String status;
    private String keyword;
    public String getFromDt() { return fromDt; }
    public void setFromDt(String v) { this.fromDt = v; }
    public String getToDt() { return toDt; }
    public void setToDt(String v) { this.toDt = v; }
    public String getLineCd() { return lineCd; }
    public void setLineCd(String v) { this.lineCd = v; }
    public String getPrdCd() { return prdCd; }
    public void setPrdCd(String v) { this.prdCd = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String v) { this.keyword = v; }
}
