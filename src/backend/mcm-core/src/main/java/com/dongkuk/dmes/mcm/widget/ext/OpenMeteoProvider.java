package com.dongkuk.dmes.mcm.widget.ext;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Open-Meteo(키 없음) — 스펙 §8.2 요청 그대로:
 * {@code ?latitude&longitude&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m
 * &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Seoul&forecast_days=3}.
 * 매핑: current.temperature_2m→temp, weather_code→code, wind_speed_10m→wind(km/h), relative_humidity_2m→humidity,
 * daily.time[i]→date, temperature_2m_min/max→min/max, weather_code→code, precipitation_probability_max→pop.
 */
@Component
public class OpenMeteoProvider implements WeatherProvider {

    static final String CURRENT = "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m";
    static final String DAILY = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";

    private final WidgetExtProperties properties;
    private final RestClient http;

    @Autowired
    public OpenMeteoProvider(WidgetExtProperties properties) {
        this(properties, WidgetExtHttp.builder());
    }

    OpenMeteoProvider(WidgetExtProperties properties, RestClient.Builder builder) {
        this.properties = properties;
        this.http = builder.build();
    }

    @Override
    public WeatherReport fetch(BigDecimal lat, BigDecimal lon) {
        URI uri = UriComponentsBuilder.fromUriString(properties.getWeather().getBaseUrl())
                .queryParam("latitude", lat.toPlainString())
                .queryParam("longitude", lon.toPlainString())
                .queryParam("current", CURRENT)
                .queryParam("daily", DAILY)
                .queryParam("timezone", "Asia/Seoul")
                .queryParam("forecast_days", 3)
                .build().encode().toUri();
        return parse(WidgetExtHttp.getJson(http, uri, "날씨(Open-Meteo)"));
    }

    static WeatherReport parse(JsonNode root) {
        JsonNode current = root.path("current");
        JsonNode daily = root.path("daily");
        if (!current.isObject() && !daily.isObject()) {
            throw new WidgetExtException("날씨(Open-Meteo) 응답에 current·daily 가 없습니다.");
        }
        WeatherReport.Current now = current.isObject()
                ? new WeatherReport.Current(dbl(current.path("temperature_2m")), integer(current.path("weather_code")),
                        dbl(current.path("wind_speed_10m")), integer(current.path("relative_humidity_2m")))
                : null;
        List<WeatherReport.Daily> days = new ArrayList<>();
        JsonNode time = daily.path("time");
        for (int i = 0; i < time.size(); i++) {
            days.add(new WeatherReport.Daily(
                    time.get(i).asText(),
                    dbl(daily.path("temperature_2m_min").path(i)),
                    dbl(daily.path("temperature_2m_max").path(i)),
                    integer(daily.path("weather_code").path(i)),
                    integer(daily.path("precipitation_probability_max").path(i))));
        }
        return new WeatherReport(now, days);
    }

    private static Double dbl(JsonNode n) {
        return n.isNumber() ? n.doubleValue() : null;
    }

    private static Integer integer(JsonNode n) {
        return n.isNumber() ? n.intValue() : null;
    }
}
