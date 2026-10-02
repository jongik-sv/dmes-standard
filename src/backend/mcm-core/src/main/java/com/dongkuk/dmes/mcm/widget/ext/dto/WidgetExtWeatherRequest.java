package com.dongkuk.dmes.mcm.widget.ext.dto;

import java.math.BigDecimal;

/** widgetExt weather 요청(스펙 §5.1) — 위도 −90~90, 경도 −180~180. 숫자·문자열 모두 BigDecimal 로 받는다. */
public class WidgetExtWeatherRequest {

    private BigDecimal lat;
    private BigDecimal lon;

    public WidgetExtWeatherRequest() {}

    public BigDecimal getLat() { return lat; }
    public void setLat(BigDecimal lat) { this.lat = lat; }
    public BigDecimal getLon() { return lon; }
    public void setLon(BigDecimal lon) { this.lon = lon; }
}
