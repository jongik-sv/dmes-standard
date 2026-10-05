package com.dongkuk.dmes.mcm.widget.admin.dto;

/** commWidgetMng search·delete·previewQuery 요청의 params — 스펙 2026-10-02-widget-admin-generic §5.2. */
public class CommWidgetMngRequest {

    /** delete 대상. search 에서는 값이 있으면 그 정의 1건의 상세(configJson 포함)만 돌려준다. */
    private String widgetId;
    /** search 에서 false 면 목록 행에 configJson 을 싣지 않는다. 비면 true(기존 응답과 같다). */
    private Boolean includeConfig;
    /** previewQuery 실행 모듈(지금은 mcm 만). */
    private String dataSrc;
    /** previewQuery 시험 SQL — 관리자 전용 action 이라 받는다(사용자용 widgetData/run 은 SQL 을 받지 않는다). */
    private String sql;
    /** previewQuery 입력 조건 정의 — CONFIG_JSON 의 params 배열을 담은 JSON 글자. 시험 실행은 각 조건의 default 를 값으로 쓴다. */
    private String paramsJson;

    public CommWidgetMngRequest() {}

    public String getWidgetId() { return widgetId; }
    public void setWidgetId(String widgetId) { this.widgetId = widgetId; }
    public Boolean getIncludeConfig() { return includeConfig; }
    public void setIncludeConfig(Boolean includeConfig) { this.includeConfig = includeConfig; }
    public String getDataSrc() { return dataSrc; }
    public void setDataSrc(String dataSrc) { this.dataSrc = dataSrc; }
    public String getSql() { return sql; }
    public void setSql(String sql) { this.sql = sql; }
    public String getParamsJson() { return paramsJson; }
    public void setParamsJson(String paramsJson) { this.paramsJson = paramsJson; }
}
