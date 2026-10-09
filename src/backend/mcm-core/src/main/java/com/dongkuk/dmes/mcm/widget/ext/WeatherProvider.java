package com.dongkuk.dmes.mcm.widget.ext;

import java.math.BigDecimal;

/**
 * 날씨 제공자 — 스펙 §8.2. 좌표는 서비스가 소수 둘째 자리로 반올림해 넘긴다. 실패는 {@link WidgetExtException}.
 *
 * @deprecated 날씨는 예약 작업 수집으로 옮김(2026-10-09, 설계 2026-10-09-weather-collect-design.md). 더는 쓰는 곳이 없으며 삭제는 사용자 결정 대기.
 */
@Deprecated
public interface WeatherProvider {

    WeatherReport fetch(BigDecimal lat, BigDecimal lon);
}
