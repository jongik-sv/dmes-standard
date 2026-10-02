package com.dongkuk.dmes.mcm.widget.ext.dto;

/**
 * widgetExt exchange 요청(스펙 §5.1). {@code symbols} 는 두 모양을 받는다 — params 의 쉼표 문자열({@code "USD,EUR"})
 * 또는 grids.symbols.rows({@code [{cur:"USD"}, …]}). OASIS 가 컨텍스트를 Gson 으로 DTO 에 옮기므로 형을 Object 로 둔다.
 */
public class WidgetExtExchangeRequest {

    private String base;
    private Object symbols;
    private Integer days;

    public WidgetExtExchangeRequest() {}

    public String getBase() { return base; }
    public void setBase(String base) { this.base = base; }
    public Object getSymbols() { return symbols; }
    public void setSymbols(Object symbols) { this.symbols = symbols; }
    public Integer getDays() { return days; }
    public void setDays(Integer days) { this.days = days; }
}
