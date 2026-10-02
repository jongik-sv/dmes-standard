package com.dongkuk.dmes.mcm.widget.layout.dto;

/**
 * commWidgetMng 기본 배치 action(searchLayouts·loadLayout·saveLayout·deleteLayout·searchDepts)의 params —
 * 스펙 2026-10-02-widget-admin-generic §5.2. saveLayout 의 위젯 목록은 grids.widgets.rows(파라미터 이름 widgets)로 따로 받는다.
 */
public class CommWidgetLayoutRequest {

    /** {@code *}(전사) 또는 부서 코드. */
    private String layoutKey;
    /** loadLayout — Y 면 그 키에 행이 없을 때 상위 부서 → 전사 배치를 대신 돌려준다. */
    private String effective;
    /** searchDepts — 부서 코드·이름 앞부분(없으면 전체). */
    private String keyword;

    public CommWidgetLayoutRequest() {}

    public String getLayoutKey() { return layoutKey; }
    public void setLayoutKey(String layoutKey) { this.layoutKey = layoutKey; }
    public String getEffective() { return effective; }
    public void setEffective(String effective) { this.effective = effective; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }
}
