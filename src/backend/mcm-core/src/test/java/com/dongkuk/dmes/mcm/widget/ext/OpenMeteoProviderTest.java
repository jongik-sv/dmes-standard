package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** {@link OpenMeteoProvider} — 요청 주소(스펙 §8.2)와 응답 매핑. 가짜 HTTP 만 쓴다. */
class OpenMeteoProviderTest {

    private static final String URL = "https://wx.test/v1/forecast?latitude=37.57&longitude=126.98"
            + "&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m"
            + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
            + "&timezone=Asia/Seoul&forecast_days=3";

    private MockRestServiceServer server;
    private OpenMeteoProvider provider;

    @BeforeEach
    void setUp() {
        WidgetExtProperties props = new WidgetExtProperties();
        props.getWeather().setBaseUrl("https://wx.test/v1/forecast");
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        provider = new OpenMeteoProvider(props, builder);
    }

    @Test
    @DisplayName("current·daily 를 temp·code·wind·humidity / date·min·max·code·pop 으로 옮긴다(빠진 값은 null)")
    void mapsCurrentAndDaily() {
        server.expect(requestTo(URL))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("""
                        {"latitude":37.57,"longitude":126.98,
                         "current":{"time":"2026-10-03T10:00","interval":900,"temperature_2m":18.3,
                                    "weather_code":3,"wind_speed_10m":7.2,"relative_humidity_2m":60},
                         "daily":{"time":["2026-10-03","2026-10-04","2026-10-05"],
                                  "weather_code":[3,61,0],
                                  "temperature_2m_max":[22.1,19.4,23.0],
                                  "temperature_2m_min":[14.2,15.0,12.8],
                                  "precipitation_probability_max":[10,80,null]}}
                        """, MediaType.APPLICATION_JSON));

        WeatherReport report = provider.fetch(new BigDecimal("37.57"), new BigDecimal("126.98"));

        server.verify();
        assertThat(report.current()).isEqualTo(new WeatherReport.Current(18.3, 3, 7.2, 60));
        assertThat(report.daily()).containsExactly(
                new WeatherReport.Daily("2026-10-03", 14.2, 22.1, 3, 10),
                new WeatherReport.Daily("2026-10-04", 15.0, 19.4, 61, 80),
                new WeatherReport.Daily("2026-10-05", 12.8, 23.0, 0, null));

        Map<String, Object> map = report.toMap();
        assertThat(map).containsOnlyKeys("current", "daily");
        @SuppressWarnings("unchecked")
        Map<String, Object> current = (Map<String, Object>) map.get("current");
        assertThat(current).containsEntry("temp", 18.3).containsEntry("code", 3)
                .containsEntry("wind", 7.2).containsEntry("humidity", 60);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> daily = (List<Map<String, Object>>) map.get("daily");
        assertThat(daily.get(1)).containsEntry("date", "2026-10-04").containsEntry("min", 15.0)
                .containsEntry("max", 19.4).containsEntry("code", 61).containsEntry("pop", 80);
    }

    @Test
    @DisplayName("HTTP 오류·current·daily 가 모두 없는 응답 → WidgetExtException")
    void errorsThrow() {
        server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
                .body("{\"error\":true,\"reason\":\"Latitude must be in range\"}").contentType(MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.fetch(new BigDecimal("37.57"), new BigDecimal("126.98")))
                .isInstanceOf(WidgetExtException.class)
                .hasMessageContaining("400");

        server.reset();
        server.expect(requestTo(URL)).andRespond(withSuccess("{\"latitude\":37.57}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.fetch(new BigDecimal("37.57"), new BigDecimal("126.98")))
                .isInstanceOf(WidgetExtException.class);
    }
}
