package com.dongkuk.dmes.mqc.qdm.qualitySpec.dto;

/** run params — 표본 주문 번호, 또는 직접 입력(고객사·품명·attrsJson = {"항목코드":"값"}). */
public class QualitySpecRunRequest {
    private String ordNo;
    private String cusCd;
    private String prdNmCd;
    private String attrsJson;
    public String getOrdNo() { return ordNo; }
    public void setOrdNo(String v) { this.ordNo = v; }
    public String getCusCd() { return cusCd; }
    public void setCusCd(String v) { this.cusCd = v; }
    public String getPrdNmCd() { return prdNmCd; }
    public void setPrdNmCd(String v) { this.prdNmCd = v; }
    public String getAttrsJson() { return attrsJson; }
    public void setAttrsJson(String v) { this.attrsJson = v; }
}
