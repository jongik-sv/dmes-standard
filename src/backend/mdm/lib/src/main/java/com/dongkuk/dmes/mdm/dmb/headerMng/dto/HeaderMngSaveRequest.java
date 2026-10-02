package com.dongkuk.dmes.mdm.dmb.headerMng.dto;

/**
 * {@code headerMng} action={@code save} 요청(TSK-05-02 design.md §6.1). 항목은 grid {@code items}. 인코딩·패딩은 EAI 소유(D2).
 *
 * <p>D-144 3단계: 등록이면 {@code layoutId} 가 없고, 수정이면 {@code layoutId}·{@code ver}(업무 버전 문자열)·{@code rowVersion} 이
 * 필요하다. 저장은 내 DRAFT 에만 쓴다.
 */
public class HeaderMngSaveRequest {

    private Long layoutId;
    private String ver;
    private Long rowVersion;
    private String layoutName;
    private String eaiCode;
    private String eaiName;
    private String encoding;
    private String padRule;

    public Long getLayoutId() { return layoutId; }

    public void setLayoutId(Long v) { this.layoutId = v; }

    public String getVer() { return ver; }

    public void setVer(String v) { this.ver = v; }

    public Long getRowVersion() { return rowVersion; }

    public void setRowVersion(Long v) { this.rowVersion = v; }

    public String getLayoutName() { return layoutName; }

    public void setLayoutName(String v) { this.layoutName = v; }

    public String getEaiCode() { return eaiCode; }

    public void setEaiCode(String v) { this.eaiCode = v; }

    public String getEaiName() { return eaiName; }

    public void setEaiName(String v) { this.eaiName = v; }

    public String getEncoding() { return encoding; }

    public void setEncoding(String v) { this.encoding = v; }

    public String getPadRule() { return padRule; }

    public void setPadRule(String v) { this.padRule = v; }
}
