package com.dongkuk.dmes.mcm.widget.layout.dto;

/**
 * commWidgetMng 기본 탭 action(loadDefaultTabs·saveDefaultTab·deleteDefaultTab·reorderDefaultTabs)의 params —
 * design-widget-tabs.md §3.2. saveDefaultTab 의 위젯 목록은 grids.widgets.rows(파라미터 이름 widgets),
 * reorderDefaultTabs 의 순서는 grids.tabs.rows(파라미터 이름 tabs)로 따로 받는다.
 */
public class CommWidgetDefaultTabRequest {

    /** {@code *}(전사) 또는 부서 코드. */
    private String layoutKey;
    /** {@code def-N}. saveDefaultTab 에서 없거나 그 키에 없는 ID 면 새 탭을 만든다. */
    private String tabId;
    private String tabNm;
    /** 표시 순서(1부터). saveDefaultTab 에서 없으면 새 탭은 맨 뒤, 기존 탭은 그대로. */
    private Integer tabSeq;

    public CommWidgetDefaultTabRequest() {}

    public String getLayoutKey() { return layoutKey; }
    public void setLayoutKey(String layoutKey) { this.layoutKey = layoutKey; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
    public String getTabNm() { return tabNm; }
    public void setTabNm(String tabNm) { this.tabNm = tabNm; }
    public Integer getTabSeq() { return tabSeq; }
    public void setTabSeq(Integer tabSeq) { this.tabSeq = tabSeq; }
}
