package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto;

/** save(발행 요청 → 검토중) 요청 params — 코일 번호, 적용 규격, 시험 성적 출처(SELF·EXT), 언어(KO·EN), 비고. Heat 는 코일에서 읽는다. */
public class InspectionCertificateSaveRequest {
    private String coilNo;
    private String stdCd;
    private String srcCd;
    private String langCd;
    private String note;
    public String getCoilNo() { return coilNo; }
    public void setCoilNo(String v) { this.coilNo = v; }
    public String getStdCd() { return stdCd; }
    public void setStdCd(String v) { this.stdCd = v; }
    public String getSrcCd() { return srcCd; }
    public void setSrcCd(String v) { this.srcCd = v; }
    public String getLangCd() { return langCd; }
    public void setLangCd(String v) { this.langCd = v; }
    public String getNote() { return note; }
    public void setNote(String v) { this.note = v; }
}
