package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** {@link WidgetExtService#options()} — 통화·지점 선택지 조립과, 한쪽을 못 읽어도 다른 쪽은 돌려주는 것. */
class WidgetExtServiceOptionsTest {

    private final FxMasterReader fx = mock(FxMasterReader.class);
    private final WeatherCollectReader weather = mock(WeatherCollectReader.class);
    private final WidgetExtService service =
            new WidgetExtService(mock(ExchangeService.class), mock(WeatherService.class), mock(SecurityIdentity.class), fx, weather);

    @Test
    @DisplayName("통화 목록과 지점(이름·좌표)을 한 응답에 싣는다")
    void assemblesBoth() {
        when(fx.currencies()).thenReturn(List.of("USD", "EUR"));
        when(weather.places()).thenReturn(List.of(new WeatherCollectReader.Place("서울", new BigDecimal("37.57"), new BigDecimal("126.98"))));

        Map<String, Object> r = service.options();

        assertThat(r.get("currencies")).isEqualTo(List.of("USD", "EUR"));
        assertThat(r.get("places")).isEqualTo(List.of(Map.of("name", "서울", "lat", 37.57, "lon", 126.98)));
    }

    @Test
    @DisplayName("한쪽을 읽다 실패해도 그 목록만 비우고 다른 쪽과 응답은 그대로")
    void oneSideFailureDoesNotBlockTheOther() {
        when(fx.currencies()).thenThrow(new IllegalStateException("스키마 이상"));
        when(weather.places()).thenReturn(List.of(new WeatherCollectReader.Place("부산", new BigDecimal("35.18"), new BigDecimal("129.08"))));

        Map<String, Object> r = service.options();

        assertThat((List<?>) r.get("currencies")).isEmpty();
        assertThat((List<?>) r.get("places")).hasSize(1);

        doReturn(List.of("USD")).when(fx).currencies();
        doThrow(new IllegalStateException("표 없음")).when(weather).places();
        Map<String, Object> r2 = service.options();
        assertThat(r2.get("currencies")).isEqualTo(List.of("USD"));
        assertThat((List<?>) r2.get("places")).isEmpty();
    }

    @Test
    @DisplayName("같은 원인의 읽기 실패는 1분 안에 다시 읽어도 경고를 한 번만 남긴다(응답은 늘 빈 목록으로 돌아온다)")
    void sameFailureWarnsOncePerMinute() {
        java.util.concurrent.atomic.AtomicLong clock = new java.util.concurrent.atomic.AtomicLong(1_000);
        WidgetExtService timed = new WidgetExtService(mock(ExchangeService.class), mock(WeatherService.class),
                mock(SecurityIdentity.class), fx, weather, clock::get);
        doThrow(new IllegalStateException("표 없음")).when(weather).places();
        doReturn(List.of()).when(fx).currencies();

        ch.qos.logback.classic.Logger logger = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(WidgetExtService.class);
        ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender = new ch.qos.logback.core.read.ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThat((List<?>) timed.options().get("places")).isEmpty();
            clock.addAndGet(WidgetExtService.WARN_INTERVAL_MS - 1);
            timed.options();
            assertThat(appender.list).hasSize(1);

            clock.addAndGet(1);
            timed.options();
            assertThat(appender.list).hasSize(2);

            doThrow(new IllegalStateException("다른 원인")).when(weather).places();
            timed.options();
            assertThat(appender.list).hasSize(3);
        } finally {
            logger.detachAppender(appender);
        }
    }
}
