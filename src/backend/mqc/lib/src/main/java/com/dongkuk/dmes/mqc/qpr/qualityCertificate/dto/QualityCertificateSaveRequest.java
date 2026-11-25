package com.dongkuk.dmes.mqc.qpr.qualityCertificate.dto;

/** save(발행 요청 → 초안) 요청 params — 주문번호, 코일 번호(쉼표), 양식(KS·CUS), 언어(KO·EN), 비고. */
public class QualityCertificateSaveRequest {
    private String ordNo;
    private String coilNos;
    private String tmplCd;
    private String langCd;
    private String note;
    public String getOrdNo() { return ordNo; }
    public void setOrdNo(String v) { this.ordNo = v; }
    public String getCoilNos() { return coilNos; }
    public void setCoilNos(String v) { this.coilNos = v; }
    public String getTmplCd() { return tmplCd; }
    public void setTmplCd(String v) { this.tmplCd = v; }
    public String getLangCd() { return langCd; }
    public void setLangCd(String v) { this.langCd = v; }
    public String getNote() { return note; }
    public void setNote(String v) { this.note = v; }
}
