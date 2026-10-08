package com.dongkuk.dmes.mcm.job.builtin;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.sql.Types;

/** 작업 변수 값을 JDBC 바인드 값으로 — 형(NUMBER·DATE·JSON·STRING)을 따른다. 날짜 글자는 {@code java.sql.Date}/{@code Timestamp} 로 바꿔 NLS 설정에 기대지 않는다. */
public final class JobBind {

    private static final ObjectMapper JSON = new ObjectMapper();

    public record Bound(Object value, int sqlType) {}

    private JobBind() {}

    public static Bound of(Object value, String type) {
        String t = type == null ? "STRING" : type;
        if (value == null) return new Bound(null, "DATE".equals(t) ? Types.TIMESTAMP : "NUMBER".equals(t) ? Types.NUMERIC : Types.VARCHAR);
        switch (t) {
            case "NUMBER":
                return new Bound(value instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(value)), Types.NUMERIC);
            case "DATE": {
                String s = String.valueOf(value);
                return s.length() <= 10 ? new Bound(java.sql.Date.valueOf(s), Types.DATE) : new Bound(Timestamp.valueOf(s.replace('T', ' ')), Types.TIMESTAMP);
            }
            case "JSON":
                try {
                    return new Bound(value instanceof String s ? s : JSON.writeValueAsString(value), Types.VARCHAR);
                } catch (JsonProcessingException e) {
                    throw new IllegalArgumentException("JSON 변수를 글자로 바꿀 수 없습니다");
                }
            default:
                return new Bound(String.valueOf(value), Types.VARCHAR);
        }
    }
}
