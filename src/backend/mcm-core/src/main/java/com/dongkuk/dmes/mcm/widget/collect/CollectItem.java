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
    /**
     * 변환 전에 걸러 낼 십진수의 크기 — 지수가 큰 짧은 입력({@code 1e999999999}·{@code 1e-100000000})은 {@code toPlainString}·{@code setScale} 에서
     * 메모리·CPU 를 끝없이 쓴다(실측: OOM, 29.5초). scale 이 ±100 을 벗어나거나 유효 자릿수가 100 을 넘으면 그 항목은 건너뛴다.
     */
    static final int SCALE_ABS_MAX = 100;
    static final int PRECISION_MAX = 100;
    /** 숫자 글자로 읽어 볼 최대 길이 — 더 길면 숫자로 파싱하지 않고 글자로 둔다. */
    static final int NUMERIC_TEXT_MAX = 120;
    private static final Pattern NUMERIC_TEXT = Pattern.compile("^[+-]?[0-9]+(\\.[0-9]+)?$");

    /**
     * 원천에서 읽은 값을 항목으로. null·빈 글자·객체·배열·크기가 한도를 넘는 십진수이면 null(건너뜀). 숫자·숫자 글자는 숫자, 불리언·그 밖 글자는 글자.
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
        if (trimmed.length() <= NUMERIC_TEXT_MAX && NUMERIC_TEXT.matcher(trimmed).matches()) return numeric(key, new BigDecimal(trimmed));
        return text(key, s);
    }

    /** 크기가 한도를 넘는 십진수는 변환(toPlainString·setScale)을 부르지 않고 null(건너뜀). 모든 BigDecimal 경로(HTTP·SQL·환율)가 여기를 지난다. */
    private static CollectItem numeric(String key, BigDecimal n) {
        if (n.scale() > SCALE_ABS_MAX || n.scale() < -SCALE_ABS_MAX || n.precision() > PRECISION_MAX) return null;
        BigDecimal scaled = n.scale() > SCALE ? n.setScale(SCALE, RoundingMode.HALF_UP) : n;
        if (scaled.precision() - scaled.scale() > INTEGER_DIGITS_MAX) return text(key, n.toPlainString());
        return new CollectItem(key, scaled, null);
    }

    private static CollectItem text(String key, String s) {
        return new CollectItem(key, null, s.length() > 200 ? s.substring(0, 200) : s);
    }
}
