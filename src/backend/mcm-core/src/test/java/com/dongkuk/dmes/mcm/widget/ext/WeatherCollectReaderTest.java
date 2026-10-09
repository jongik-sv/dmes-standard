package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

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
}
