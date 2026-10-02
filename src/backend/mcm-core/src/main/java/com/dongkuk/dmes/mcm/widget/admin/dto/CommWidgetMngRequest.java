package com.dongkuk.dmes.mcm.widget.admin.dto;

/** commWidgetMng search·delete·previewQuery 요청의 params — 스펙 2026-10-02-widget-admin-generic §5.2. */
public class CommWidgetMngRequest {

    /** delete 대상. */
    private String widgetId;
    /** previewQuery 실행 모듈(지금은 mcm 만). */
    private String dataSrc;
    /** previewQuery 시험 SQL — 관리자 전용 action 이라 받는다(사용자용 widgetData/run 은 SQL 을 받지 않는다). */
    private String sql;

    public CommWidgetMngRequest() {}

    public String getWidgetId() { return widgetId; }
    public void setWidgetId(String widgetId) { this.widgetId = widgetId; }
    public String getDataSrc() { return dataSrc; }
    public void setDataSrc(String dataSrc) { this.dataSrc = dataSrc; }
    public String getSql() { return sql; }
    public void setSql(String sql) { this.sql = sql; }
}
