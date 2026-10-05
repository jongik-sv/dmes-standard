package com.dongkuk.dmes.mcm.widget.collect;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.regex.Pattern;

/**
 * 한 회차에서 수집한 항목 하나 — 숫자는 num(소수 8자리), 그 밖의 글자는 txt(200자까지). 둘 중 하나만 값이 있다.
 */
public record CollectItem(String key, BigDecimal num, String txt) {

    static final int SCALE = 8;
    /** VALUE_NUM numeric(24,8) 의 정수부 자릿수 상한. 넘으면 글자로 저장한다. */
    static final int INTEGER_DIGITS_MAX = 16;
    private static final Pattern NUMERIC_TEXT = Pattern.compile("^[+-]?[0-9]+(\\.[0-9]+)?$");

    /**
     * 원천에서 읽은 값을 항목으로. null·빈 글자·객체·배열이면 null(건너뜀). 숫자·숫자 글자는 숫자, 불리언·그 밖 글자는 글자.
     * key 는 호출자가 1~100자로 맞춘다.
     */
    public static CollectItem of(String key, Object value) {
        if (key == null || key.isBlank() || value == null) return null;
        if (value instanceof BigDecimal n) return numeric(key, n);
        if (value instanceof Number n) {
            if (n instanceof Double || n instanceof Float) {
                double d = n.doubleValue();
                if (Double.isNaN(d) || Double.isInfinite(d)) return text(key, String.valueOf(d));
                return numeric(key, BigDecimal.valueOf(d));
            }
            return numeric(key, new BigDecimal(n.toString()));
        }
        if (value instanceof Boolean b) return text(key, b.toString());
        String s = value.toString();
        if (s.isBlank()) return null;
        String trimmed = s.strip();
        if (NUMERIC_TEXT.matcher(trimmed).matches()) return numeric(key, new BigDecimal(trimmed));
        return text(key, s);
    }

    private static CollectItem numeric(String key, BigDecimal n) {
        BigDecimal scaled = n.scale() > SCALE ? n.setScale(SCALE, RoundingMode.HALF_UP) : n;
        if (scaled.precision() - scaled.scale() > INTEGER_DIGITS_MAX) return text(key, n.toPlainString());
        return new CollectItem(key, scaled, null);
    }

    private static CollectItem text(String key, String s) {
        return new CollectItem(key, null, s.length() > 200 ? s.substring(0, 200) : s);
    }
}
