package com.dongkuk.dmes.mcm.widget.ext;

import java.math.BigDecimal;

/** 날씨 제공자 — 스펙 §8.2. 좌표는 서비스가 소수 둘째 자리로 반올림해 넘긴다. 실패는 {@link WidgetExtException}. */
public interface WeatherProvider {

    WeatherReport fetch(BigDecimal lat, BigDecimal lon);
}
