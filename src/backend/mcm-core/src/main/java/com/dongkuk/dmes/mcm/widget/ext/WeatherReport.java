package com.dongkuk.dmes.mcm.widget.ext;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 날씨 응답(스펙 §5.1) — {@code current: {temp, code, wind, humidity}}, {@code daily: [{date, min, max, code, pop}]}.
 * 바람은 Open-Meteo 기본 단위(km/h) 그대로 둔다 — m/s 변환은 렌더러가 한다(계획 Task 12). 빠진 값은 null.
 */
public record WeatherReport(Current current, List<Daily> daily) {

    public record Current(Double temp, Integer code, Double wind, Integer humidity) {}

    public record Daily(String date, Double min, Double max, Integer code, Integer pop) {}

    /** 응답 Map(OASIS output=result). */
    public Map<String, Object> toMap() {
        Map<String, Object> out = new LinkedHashMap<>();
        if (current == null) {
            out.put("current", null);
        } else {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("temp", current.temp());
            c.put("code", current.code());
            c.put("wind", current.wind());
            c.put("humidity", current.humidity());
            out.put("current", c);
        }
        List<Map<String, Object>> days = new ArrayList<>();
        for (Daily d : daily == null ? List.<Daily>of() : daily) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("date", d.date());
            m.put("min", d.min());
            m.put("max", d.max());
            m.put("code", d.code());
            m.put("pop", d.pop());
            days.add(m);
        }
        out.put("daily", days);
        return out;
    }
}
