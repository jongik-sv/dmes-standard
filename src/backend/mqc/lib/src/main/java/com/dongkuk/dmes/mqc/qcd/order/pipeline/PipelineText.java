package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/** 파이프라인 숫자·글 도우미(순수 함수). */
public final class PipelineText {

    private PipelineText() {
    }

    /** 숫자 글 → BigDecimal. 쉼표는 뺀다. 숫자가 아니면 null. */
    public static BigDecimal num(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal b) return b;
        if (v instanceof Number n) return new BigDecimal(n.toString());
        String s = String.valueOf(v).replace(",", "").trim();
        if (s.isEmpty()) return null;
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public static Double dbl(Object v) {
        BigDecimal b = num(v);
        return b == null ? null : b.doubleValue();
    }

    /** 값 → 글. 숫자는 끝 0 을 뗀다. */
    public static String plain(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal b) return b.stripTrailingZeros().toPlainString();
        if (v instanceof Double || v instanceof Float) return BigDecimal.valueOf(((Number) v).doubleValue()).stripTrailingZeros().toPlainString();
        return String.valueOf(v);
    }

    /** 결과 셀 val → 끝 0 을 뗀 숫자 글. 숫자가 아니면 그대로. */
    public static String tidyNumber(String v) {
        if (v == null || v.isBlank()) return v;
        try {
            return new BigDecimal(v.trim()).stripTrailingZeros().toPlainString();
        } catch (NumberFormatException e) {
            return v;
        }
    }

    /** 소수 3자리 아래를 버린다(PLTCM 출측두께 절삭). */
    public static BigDecimal trunc3(BigDecimal v) {
        return v.setScale(3, RoundingMode.DOWN);
    }

    /**
     * SET 눈금(0.005 mm). 소수 셋째 자리가 0·5 면 그대로, 1·2 → 0, 3·4·6·7 → 5, 8·9 → 둘째 자리까지 + 0.01(PLTCM_압연SET_logic §4.2).
     */
    public static BigDecimal snapSet(BigDecimal out3) {
        BigDecimal v = out3.setScale(3, RoundingMode.DOWN);
        int d3 = v.movePointRight(3).remainder(BigDecimal.TEN).abs().intValue();
        BigDecimal base2 = v.setScale(2, RoundingMode.DOWN);
        return switch (d3) {
            case 0, 5 -> v;
            case 1, 2 -> base2.setScale(3, RoundingMode.UNNECESSARY);
            case 3, 4, 6, 7 -> base2.add(new BigDecimal("0.005"));
            default -> base2.add(new BigDecimal("0.010")).setScale(3, RoundingMode.UNNECESSARY);
        };
    }

    /** 고정 소수 자리 글. */
    public static String fixed(Number v, int scale) {
        if (v == null) return "";
        return new BigDecimal(v.toString()).setScale(scale, RoundingMode.HALF_UP).toPlainString();
    }

    /** 천 단위 쉼표 + 소수 1자리(1,490.0). */
    public static String width1(Number v) {
        if (v == null) return "";
        DecimalFormat f = new DecimalFormat("#,##0.0", DecimalFormatSymbols.getInstance(Locale.KOREA));
        return f.format(v.doubleValue());
    }

    public static String orBlank(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    public static boolean blank(Object v) {
        return v == null || String.valueOf(v).isBlank();
    }
}
