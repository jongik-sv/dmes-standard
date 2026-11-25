package com.dongkuk.dmes.mqc.qpr.tagManagement.dto;

/**
 * reissue 요청 params — Tag 번호 또는 코일 번호(코일이면 그 코일의 가장 최근 발행 Tag), 사유 코드(DAMAGE 훼손·LOST 분실·CORRECT 정보 정정),
 * 프린터(비면 그대로), 매수(1~9, 비면 1), 비고.
 */
public class TagReissueRequest {
    private String tagNo;
    private String coilNo;
    private String reasonCd;
    private String prtId;
    private String copies;
    private String note;
    public String getTagNo() { return tagNo; }
    public void setTagNo(String v) { this.tagNo = v; }
    public String getCoilNo() { return coilNo; }
    public void setCoilNo(String v) { this.coilNo = v; }
    public String getReasonCd() { return reasonCd; }
    public void setReasonCd(String v) { this.reasonCd = v; }
    public String getPrtId() { return prtId; }
    public void setPrtId(String v) { this.prtId = v; }
    public String getCopies() { return copies; }
    public void setCopies(String v) { this.copies = v; }
    public String getNote() { return note; }
    public void setNote(String v) { this.note = v; }
}
