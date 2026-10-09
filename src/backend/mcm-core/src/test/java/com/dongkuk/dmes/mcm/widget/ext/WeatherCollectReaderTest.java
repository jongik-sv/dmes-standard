package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.jdbc.core.JdbcTemplate;

/** {@link WeatherCollectReader} 의 변환 — 수집 항목(숫자는 BigDecimal, 날짜는 글자) → 위젯 응답 모양. DB 읽기는 WeatherCollectOraTest. */
class WeatherCollectReaderTest {

    private static Map<String, Object> full() {
        Map<String, Object> m = new HashMap<>();
        m.put("cur_temp", new BigDecimal("18.4"));
        m.put("cur_code", new BigDecimal("3"));
        m.put("cur_wind", new BigDecimal("12.5"));
        m.put("cur_humidity", new BigDecimal("61"));
        for (int i = 0; i < 3; i++) {
            m.put("d" + i + "_date", "2026-10-" + String.format("%02d", 9 + i));
            m.put("d" + i + "_min", new BigDecimal(10 + i));
            m.put("d" + i + "_max", new BigDecimal(20 + i));
            m.put("d" + i + "_code", new BigDecimal(i));
            m.put("d" + i + "_pop", new BigDecimal(10 * i));
        }
        return m;
    }

    @Test
    @DisplayName("항목 19개가 현재 + 3일 예보로 바뀐다 — 정수 칸은 정수로")
    void mapsAllItems() {
        WeatherReport r = WeatherCollectReader.toReport(full());

        assertThat(r.current()).isEqualTo(new WeatherReport.Current(18.4, 3, 12.5, 61));
        assertThat(r.daily()).hasSize(3);
        assertThat(r.daily().get(1)).isEqualTo(new WeatherReport.Daily("2026-10-10", 11.0, 21.0, 1, 10));
    }

    @Test
    @DisplayName("빠진 항목은 null — 강수확률이 없어도 그날은 나온다. 날짜가 없는 날은 뺀다. 현재값이 하나도 없으면 current 는 null")
    void toleratesMissingItems() {
        Map<String, Object> m = full();
        m.remove("d0_pop");
        m.remove("d1_date");
        m.keySet().removeIf(k -> k.startsWith("cur_"));

        WeatherReport r = WeatherCollectReader.toReport(m);

        assertThat(r.current()).isNull();
        assertThat(r.daily()).extracting(WeatherReport.Daily::date).containsExactly("2026-10-09", "2026-10-11");
        assertThat(r.daily().get(0).pop()).isNull();
    }

    @Test
    @DisplayName("SLOT(yyyyMMddHHmm) → 시각, 모양이 틀리면 null")
    void parsesSlot() {
        assertThat(WeatherCollectReader.parseSlot("202610091230")).isEqualTo(LocalDateTime.of(2026, 10, 9, 12, 30));
        assertThat(WeatherCollectReader.parseSlot("2026-10-09")).isNull();
        assertThat(WeatherCollectReader.parseSlot(null)).isNull();
    }

    private static Map<String, Object> job(String id, String name, String varsJson) {
        Map<String, Object> m = new HashMap<>();
        m.put("JOB_ID", id);
        m.put("JOB_NM", name);
        m.put("VARS_JSON", varsJson);
        return m;
    }

    private static String vars(String lat, String lon) {
        return "[{\"name\":\"lat\",\"type\":\"STRING\",\"value\":\"" + lat + "\"},"
                + "{\"name\":\"lon\",\"type\":\"STRING\",\"value\":\"" + lon + "\"}]";
    }

    @Test
    @DisplayName("지점 목록 — 작업 이름에서 「날씨 수집」 을 떼고 변수 좌표(소수 둘째 자리)를 준다. 좌표가 없거나 깨진 작업은 건너뛴다")
    void listsPlacesFromCollectJobs() {
        JdbcTemplate jdbc = Mockito.mock(JdbcTemplate.class);
        Mockito.when(jdbc.queryForList(Mockito.anyString())).thenReturn(List.of(
                job("mcm.weather.seoul", "날씨 수집 서울", vars("37.57", "126.98")),
                job("mcm.weather.noname", "날씨 수집", vars("35.1", "129.0")),
                job("mcm.weather.custom", "울산 수집", vars("35.54", "129.31")),
                job("mcm.weather.nolon", "날씨 수집 없음", "[{\"name\":\"lat\",\"type\":\"STRING\",\"value\":\"1\"}]"),
                job("mcm.weather.broken", "날씨 수집 깨짐", "not json")));

        List<WeatherCollectReader.Place> places = new WeatherCollectReader(jdbc, "MCMAPUSER").places();

        assertThat(places).containsExactly(
                new WeatherCollectReader.Place("서울", new BigDecimal("37.57"), new BigDecimal("126.98")),
                new WeatherCollectReader.Place("날씨 수집", new BigDecimal("35.10"), new BigDecimal("129.00")),
                new WeatherCollectReader.Place("울산 수집", new BigDecimal("35.54"), new BigDecimal("129.31")));
    }
}
