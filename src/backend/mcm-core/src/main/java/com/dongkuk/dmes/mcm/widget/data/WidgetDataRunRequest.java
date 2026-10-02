package com.dongkuk.dmes.mcm.widget.data;

/**
 * widgetData run 요청(스펙 2026-10-02-widget-admin-generic §5.1). 정의 ID 만 받는다 —
 * 요청 본문에 SQL 이 와도 읽지 않는다(W-D23).
 */
public class WidgetDataRunRequest {

    private String defId;

    public WidgetDataRunRequest() {}

    public String getDefId() { return defId; }
    public void setDefId(String defId) { this.defId = defId; }
}
