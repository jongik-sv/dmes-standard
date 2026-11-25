package com.dongkuk.dmes.mqc.qdm.qualitySpec.dto;

/** history params — kind=CHANGE(변경 이력: fromDt·toDt yyyy-MM-dd, keyword, specNo) 또는 IF(전송 이력: direction, result, keyword, specNo). */
public class QualitySpecHistoryRequest {
    private String kind;
    private String fromDt;
    private String toDt;
    private String keyword;
    private String specNo;
    private String direction;
    private String result;
    public String getKind() { return kind; }
    public void setKind(String v) { this.kind = v; }
    public String getFromDt() { return fromDt; }
    public void setFromDt(String v) { this.fromDt = v; }
    public String getToDt() { return toDt; }
    public void setToDt(String v) { this.toDt = v; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String v) { this.keyword = v; }
    public String getSpecNo() { return specNo; }
    public void setSpecNo(String v) { this.specNo = v; }
    public String getDirection() { return direction; }
    public void setDirection(String v) { this.direction = v; }
    public String getResult() { return result; }
    public void setResult(String v) { this.result = v; }
}
