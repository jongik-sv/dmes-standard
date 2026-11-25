package com.dongkuk.dmes.mqc.qpr.tagManagement.dto;

/** view·issue·cancel 요청 params — Tag 번호(tagNo), 선택 출력은 tagNos(쉼표), 폐기 사유(cancel 때 필수). */
public class TagKeyRequest {
    private String tagNo;
    private String tagNos;
    private String reason;
    public String getTagNo() { return tagNo; }
    public void setTagNo(String v) { this.tagNo = v; }
    public String getTagNos() { return tagNos; }
    public void setTagNos(String v) { this.tagNos = v; }
    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }
}
