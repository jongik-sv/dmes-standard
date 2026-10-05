package com.dongkuk.dmes.mcm.widget.dto;

/** secWidget deleteTab·resetTab·shareTab 요청(shareTab 받는 사람은 grids.targets.rows). */
public class SecWidgetTabRequest {

    private String tabId;

    public SecWidgetTabRequest() {}

    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
}
