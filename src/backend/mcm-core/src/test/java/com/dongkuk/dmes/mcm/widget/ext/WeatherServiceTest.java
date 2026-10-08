package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
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

/** {@link WeatherService} — 수집 값만 읽는다: 좌표 반올림, 수집 시각, 90분 넘으면 stale, 수집 대상 아님·값 없음, 입력 검사. */
@ExtendWith(MockitoExtension.class)
class WeatherServiceTest {

    @Mock WeatherCollectReader reader;

    private ExchangeServiceTest.MutableClock clock;
    private WeatherService service;

    private static final BigDecimal LAT = new BigDecimal("37.57");
    private static final BigDecimal LON = new BigDecimal("126.98");
    /** 시계: 2026-10-09 12:40 서울. */
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 9, 12, 40);

    @BeforeEach
    void setUp() {
        clock = new ExchangeServiceTest.MutableClock(ZonedDateTime.of(NOW, ZoneId.of("Asia/Seoul")).toInstant());
        service = new WeatherService(reader, clock);
    }

    private static WeatherCollectReader.Result ok(double temp, LocalDateTime collectedAt) {
        WeatherReport report = new WeatherReport(new WeatherReport.Current(temp, 0, 5.0, 50),
                List.of(new WeatherReport.Daily("2026-10-09", 10.0, 20.0, 0, 0)));
        return new WeatherCollectReader.Result(WeatherCollectReader.Status.OK, report, collectedAt);
    }

    private static BigDecimal n(String v) {
        return new BigDecimal(v);
    }

    @SuppressWarnings("unchecked")
    private static Object temp(Map<String, Object> result) {
        return ((Map<String, Object>) result.get("current")).get("temp");
    }

    @Test
    @DisplayName("좌표를 소수 둘째 자리로 반올림해 수집 값을 읽고, 수집 시각을 담는다")
    void readsRoundedCoordinate() {
        when(reader.read(LAT, LON)).thenReturn(ok(18.0, LocalDateTime.of(2026, 10, 9, 12, 30)));

        Map<String, Object> result = service.weather(n("37.5665"), n("126.978"));

        assertThat(temp(result)).isEqualTo(18.0);
        assertThat(result).containsEntry("collectedAt", "2026-10-09T12:30").doesNotContainKeys("stale", "uncollected", "empty");
    }

    @Test
    @DisplayName("수집 시각이 90분을 넘으면 stale:true — 정확히 90분은 아직 정상")
    void staleAfterNinetyMinutes() {
        when(reader.read(LAT, LON)).thenReturn(ok(18.0, NOW.minusMinutes(90)));
        assertThat(service.weather(LAT, LON)).doesNotContainKey("stale");

        when(reader.read(LAT, LON)).thenReturn(ok(18.0, NOW.minusMinutes(90).minusSeconds(1)));
        Map<String, Object> stale = service.weather(LAT, LON);
        assertThat(stale).containsEntry("stale", true);
        assertThat(temp(stale)).isEqualTo(18.0);
    }

    @Test
    @DisplayName("수집 대상이 아닌 좌표 → uncollected:true, 값 없음")
    void uncollected() {
        when(reader.read(LAT, LON)).thenReturn(new WeatherCollectReader.Result(WeatherCollectReader.Status.UNCOLLECTED, null, null));

        Map<String, Object> result = service.weather(LAT, LON);

        assertThat(result).containsEntry("uncollected", true).containsEntry("current", null).doesNotContainKey("empty");
        assertThat((List<?>) result.get("daily")).isEmpty();
    }

    @Test
    @DisplayName("수집된 값이 아직 없음 → empty:true")
    void empty() {
        when(reader.read(LAT, LON)).thenReturn(new WeatherCollectReader.Result(WeatherCollectReader.Status.EMPTY, null, null));

        Map<String, Object> result = service.weather(LAT, LON);

        assertThat(result).containsEntry("empty", true).containsEntry("current", null).doesNotContainKey("uncollected");
    }

    @Test
    @DisplayName("입력 검사 — 위도 −90~90, 경도 −180~180, 둘 다 필수. 틀리면 읽기도 하지 않는다")
    void validatesCoordinates() {
        assertThatThrownBy(() -> service.weather(null, LON)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.weather(LAT, null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.weather(n("90.001"), LON)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.weather(LAT, n("-180.5"))).isInstanceOf(BusinessException.class);
        verify(reader, never()).read(any(), any());

        when(reader.read(n("-90.00"), n("180.00"))).thenReturn(ok(-30.0, NOW));
        assertThat(temp(service.weather(n("-90"), n("180")))).isEqualTo(-30.0);
    }
}
