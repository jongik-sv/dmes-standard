package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** {@link WeatherService} — 10분 캐시, 좌표 소수 둘째 자리 반올림, 실패 시 이전 값 stale, enabled=false, 입력 검사. */
@ExtendWith(MockitoExtension.class)
class WeatherServiceTest {

    @Mock WeatherProvider provider;

    private WidgetExtProperties props;
    private ExchangeServiceTest.MutableClock clock;
    private WeatherService service;

    private static final BigDecimal LAT = new BigDecimal("37.57");
    private static final BigDecimal LON = new BigDecimal("126.98");

    @BeforeEach
    void setUp() {
        props = new WidgetExtProperties();
        clock = new ExchangeServiceTest.MutableClock(
                ZonedDateTime.of(2026, 10, 3, 10, 0, 0, 0, ZoneId.of("Asia/Seoul")).toInstant());
        service = new WeatherService(props, provider, clock);
    }

    private static WeatherReport report(double temp) {
        return new WeatherReport(new WeatherReport.Current(temp, 0, 5.0, 50),
                List.of(new WeatherReport.Daily("2026-10-03", 10.0, 20.0, 0, 0)));
    }

    private static BigDecimal n(String v) {
        return new BigDecimal(v);
    }

    @SuppressWarnings("unchecked")
    private static Object temp(Map<String, Object> result) {
        return ((Map<String, Object>) result.get("current")).get("temp");
    }

    @Test
    @DisplayName("좌표는 소수 둘째 자리로 반올림해 묻고, 같은 칸은 10분 동안 캐시에서 준다")
    void cachesTenMinutesByRoundedCoordinate() {
        when(provider.fetch(LAT, LON)).thenReturn(report(18.0), report(19.0));

        Map<String, Object> first = service.weather(n("37.5665"), n("126.978"));
        clock.now = clock.now.plus(Duration.ofMinutes(9).plusSeconds(59));
        Map<String, Object> cached = service.weather(n("37.5711"), n("126.9849")); // 같은 칸(37.57, 126.98)

        verify(provider, times(1)).fetch(any(), any());
        assertThat(temp(first)).isEqualTo(18.0);
        assertThat(temp(cached)).isEqualTo(18.0);
        assertThat(cached).doesNotContainKey("stale");

        clock.now = clock.now.plusSeconds(1); // 10분 지남
        Map<String, Object> refreshed = service.weather(n("37.5665"), n("126.978"));
        verify(provider, times(2)).fetch(LAT, LON);
        assertThat(temp(refreshed)).isEqualTo(19.0);
    }

    @Test
    @DisplayName("실패 시 이전 값이 있으면 그것 + stale:true, 없으면 「날씨 정보를 불러오지 못했습니다」")
    void failureFallsBackToPreviousValue() {
        when(provider.fetch(LAT, LON)).thenReturn(report(18.0))
                .thenThrow(new WidgetExtException("날씨(Open-Meteo) 요청 실패: HTTP 503"));
        service.weather(LAT, LON);
        clock.now = clock.now.plus(Duration.ofMinutes(11));

        Map<String, Object> stale = service.weather(LAT, LON);

        assertThat(stale).containsEntry("stale", true);
        assertThat(temp(stale)).isEqualTo(18.0);

        when(provider.fetch(n("35.18"), n("129.08"))).thenThrow(new WidgetExtException("timeout"));
        assertThatThrownBy(() -> service.weather(n("35.1796"), n("129.0756")))
                .isInstanceOf(BusinessException.class)
                .hasMessage("날씨 정보를 불러오지 못했습니다");
    }

    @Test
    @DisplayName("enabled=false — 외부 호출 없음, 캐시가 없으면 빈 결과 + disabled:true, 지난 캐시는 stale")
    void disabledUsesCacheOnly() {
        props.setEnabled(false);
        Map<String, Object> empty = service.weather(LAT, LON);
        verify(provider, never()).fetch(any(), any());
        assertThat(empty).containsEntry("disabled", true).containsEntry("current", null);
        assertThat((List<?>) empty.get("daily")).isEmpty();

        props.setEnabled(true);
        when(provider.fetch(LAT, LON)).thenReturn(report(18.0));
        service.weather(LAT, LON);
        props.setEnabled(false);

        Map<String, Object> fresh = service.weather(LAT, LON);
        assertThat(temp(fresh)).isEqualTo(18.0);
        assertThat(fresh).doesNotContainKeys("stale", "disabled");

        clock.now = clock.now.plus(Duration.ofMinutes(30));
        Map<String, Object> old = service.weather(LAT, LON);
        assertThat(old).containsEntry("stale", true);
        verify(provider, times(1)).fetch(any(), any());
    }

    @Test
    @DisplayName("입력 검사 — 위도 −90~90, 경도 −180~180, 둘 다 필수")
    void validatesCoordinates() {
        assertThatThrownBy(() -> service.weather(null, LON)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.weather(LAT, null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.weather(n("90.001"), LON)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.weather(LAT, n("-180.5"))).isInstanceOf(BusinessException.class);
        verify(provider, never()).fetch(any(), any());

        when(provider.fetch(n("-90.00"), n("180.00"))).thenReturn(report(-30.0));
        assertThat(temp(service.weather(n("-90"), n("180")))).isEqualTo(-30.0);
    }
}
