package com.dongkuk.dmes.mqc.qdm.qualitySpec.dto;

/** codes params — 항목 사전 거르기: 구분(COND·RESULT·BOTH), 사용 여부(Y·N), 키워드(항목명·시스템 코드·설명). */
public class QualitySpecCodesRequest {
    private String kind;
    private String useYn;
    private String keyword;
    public String getKind() { return kind; }
    public void setKind(String v) { this.kind = v; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String v) { this.useYn = v; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String v) { this.keyword = v; }
}
