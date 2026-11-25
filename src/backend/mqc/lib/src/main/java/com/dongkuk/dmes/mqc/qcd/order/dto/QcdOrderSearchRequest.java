package com.dongkuk.dmes.mqc.qcd.order.dto;

/** qcdOrder search params — 키워드(주문 키·규격약호·수요가), 품명 코드, 최대 건수. 모두 생략 가능. */
public class QcdOrderSearchRequest {
    private String keyword;
    private String prdNmCd;
    private String limit;
    public String getKeyword() { return keyword; }
    public void setKeyword(String v) { this.keyword = v; }
    public String getPrdNmCd() { return prdNmCd; }
    public void setPrdNmCd(String v) { this.prdNmCd = v; }
    public String getLimit() { return limit; }
    public void setLimit(String v) { this.limit = v; }
}
