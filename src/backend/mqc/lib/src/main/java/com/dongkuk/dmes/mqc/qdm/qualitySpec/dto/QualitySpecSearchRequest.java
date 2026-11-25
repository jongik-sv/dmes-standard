package com.dongkuk.dmes.mqc.qdm.qualitySpec.dto;

/** search params — 상태(DRAFT·CONF·SENT·FAIL), 키워드(사양번호·고객사·조건·결과), 고객사, 품명, 항목 코드(그 항목을 쓰는 사양). */
public class QualitySpecSearchRequest {
    private String status;
    private String keyword;
    private String cusCd;
    private String prdNmCd;
    private String attrCd;
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String v) { this.keyword = v; }
    public String getCusCd() { return cusCd; }
    public void setCusCd(String v) { this.cusCd = v; }
    public String getPrdNmCd() { return prdNmCd; }
    public void setPrdNmCd(String v) { this.prdNmCd = v; }
    public String getAttrCd() { return attrCd; }
    public void setAttrCd(String v) { this.attrCd = v; }
}
