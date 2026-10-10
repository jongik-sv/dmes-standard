package com.dongkuk.dmes.mcm.widget.ext;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.def.JobVar;
import com.dongkuk.dmes.mcm.job.def.JobVars;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** WeatherCollectReader 가 VARS_JSON 을 직접 읽어도(job 패키지 의존 제거) JobVars 와 같은 lat·lon 을 얻는지. */
class WeatherCollectReaderCoordsTest {

    private static BigDecimal[] viaJobVars(String json) {
        BigDecimal lat = null;
        BigDecimal lon = null;
        try {
            for (JobVar v : JobVars.parse(json)) {
                if ("lat".equals(v.name())) lat = c(v.value());
                if ("lon".equals(v.name())) lon = c(v.value());
            }
        } catch (RuntimeException e) {
            return null;
        }
        return lat == null || lon == null ? null : new BigDecimal[] {lat, lon};
    }

    private static BigDecimal c(String text) {
        try {
            return new BigDecimal(text.strip()).setScale(2, RoundingMode.HALF_UP);
        } catch (RuntimeException e) {
            return null;
        }
    }

    @Test
    @DisplayName("같은 VARS_JSON 입력 → JobVars 로 읽은 것과 같은 lat·lon")
    void sameCoordsAsJobVars() {
        String[] inputs = {
                "[{\"name\":\"lat\",\"type\":\"NUMBER\",\"value\":\"37.5665\",\"desc\":\"위도\"},{\"name\":\"lon\",\"type\":\"NUMBER\",\"value\":\"126.978\",\"desc\":\"경도\"}]",
                "[{\"name\":\"lon\",\"value\":\" 126.9 \"},{\"name\":\"lat\",\"value\":\"37.555\"}]",
                "[{\"name\":\"lat\",\"type\":\"NUMBER\",\"value\":37.5},{\"name\":\"lon\",\"type\":\"NUMBER\",\"value\":127}]",
                "[{\"name\":\"lat\",\"type\":\"STRING\",\"value\":\"abc\"},{\"name\":\"lon\",\"type\":\"STRING\",\"value\":\"127\"}]",
                "[{\"name\":\"lat\",\"type\":\"STRING\",\"value\":\"37\"}]",
                "[{\"name\":\"other\",\"type\":\"STRING\",\"value\":\"1\"}]",
                "[]", "", "not json", "{\"name\":\"lat\"}"};
        for (String json : inputs) {
            Map<String, Object> row = new HashMap<>();
            row.put("JOB_ID", "mcm.weather.x");
            row.put("VARS_JSON", json);
            BigDecimal[] expected = viaJobVars(json);
            BigDecimal[] actual = WeatherCollectReader.coords(row);
            if (expected == null) assertThat(actual).as(json).isNull();
            else assertThat(actual).as(json).containsExactly(expected);
        }
    }
}
