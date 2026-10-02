package com.dongkuk.dmes.mcm.widget.dto;

/** secWidget saveTab 요청의 params — 위젯 목록은 grids.widgets.rows(파라미터 이름 widgets)로 따로 받는다. */
public class SecWidgetTabSaveRequest {

    private String tabId;
    private String tabNm;
    private Integer tabSeq;
    private String lockYn;

    public SecWidgetTabSaveRequest() {}

    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
    public String getTabNm() { return tabNm; }
    public void setTabNm(String tabNm) { this.tabNm = tabNm; }
    public Integer getTabSeq() { return tabSeq; }
    public void setTabSeq(Integer tabSeq) { this.tabSeq = tabSeq; }
    public String getLockYn() { return lockYn; }
    public void setLockYn(String lockYn) { this.lockYn = lockYn; }
}
