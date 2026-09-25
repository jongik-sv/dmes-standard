package com.dongkuk.dmes.mdm.dmc.codeConfirm.dto;

/**
 * {@code codeConfirm} action={@code validate} 요청 params(TSK-06-05 design.md §6.5). 쓰기 없는 확정 검사 10행.
 * applyFrom 은 {@code yyyy-MM-dd HH:mm:ss}(KST) 문자열이다.
 */
public class CodeConfirmValidateRequest {

    private String maruCodeId;
    private String ver;
    private String applyFrom;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }
    public String getApplyFrom() { return applyFrom; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setApplyFrom(String v) { this.applyFrom = v; }
}
