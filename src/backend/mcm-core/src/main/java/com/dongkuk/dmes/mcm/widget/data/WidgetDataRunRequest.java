package com.dongkuk.dmes.mcm.widget.data;

/**
 * widgetData run 요청(스펙 2026-10-02-widget-admin-generic §5.1). 정의 ID 와 입력 조건 값만 받는다 —
 * 요청 본문에 SQL 이 와도 읽지 않는다(W-D23).
 */
public class WidgetDataRunRequest {

    private String defId;
    /** 입력 조건 값 — JSON 객체 글자 {@code {"이름":"값"}}. 정의에 선언된 이름만 쓰이고 값은 서버가 형별로 다시 해석한다(바인드 변수로만 SQL 에 들어간다). */
    private String paramsJson;

    public WidgetDataRunRequest() {}

    public String getDefId() { return defId; }
    public void setDefId(String defId) { this.defId = defId; }
    public String getParamsJson() { return paramsJson; }
    public void setParamsJson(String paramsJson) { this.paramsJson = paramsJson; }
}
