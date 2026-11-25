package com.dongkuk.dmes.mqc.qdm.qualitySpec.engine;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 주문값과 사양 조건 비교(화면 dsl.ts 와 같은 규칙). 주문값이 없으면 늘 불일치다. */
public final class SpecMatcher {

    private static final Pattern RANGE = Pattern.compile("^(-?[\\d.]+)\\s*~\\s*(-?[\\d.]+)$");
    /** JS parseFloat 처럼 앞쪽 숫자 부분만 읽는다. */
    private static final Pattern LEADING_NUM = Pattern.compile("^\\s*([+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?)");

    private SpecMatcher() {}

    /**
     * = : 대소문자 무시 글자 같음 또는 숫자로 같음. ~ : 양끝 포함 범위. ≥ ≤ &gt; &lt; : 숫자 비교.
     */
    public static boolean compare(String op, String orderVal, String specVal) {
        if (orderVal == null || orderVal.isEmpty()) return false;
        BigDecimal n = num(orderVal);
        String sval = SpecDsl.stripQ(specVal == null ? "" : specVal);
        BigDecimal s = num(sval);
        switch (op) {
            case "=":
                return orderVal.trim().toUpperCase(Locale.ROOT).equals(sval.toUpperCase(Locale.ROOT))
                        || (n != null && s != null && n.compareTo(s) == 0);
            case "~": {
                Matcher m = RANGE.matcher(sval);
                if (!m.matches() || n == null) return false;
                BigDecimal lo = num(m.group(1));
                BigDecimal hi = num(m.group(2));
                return lo != null && hi != null && n.compareTo(lo) >= 0 && n.compareTo(hi) <= 0;
            }
            case "≥": return n != null && s != null && n.compareTo(s) >= 0;
            case "≤": return n != null && s != null && n.compareTo(s) <= 0;
            case ">": return n != null && s != null && n.compareTo(s) > 0;
            case "<": return n != null && s != null && n.compareTo(s) < 0;
            default: return false;
        }
    }

    static BigDecimal num(String text) {
        if (text == null) return null;
        Matcher m = LEADING_NUM.matcher(text);
        if (!m.find()) return null;
        try { return new BigDecimal(m.group(1)); }
        catch (NumberFormatException e) { return null; }
    }
}
