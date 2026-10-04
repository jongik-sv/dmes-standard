package com.dongkuk.dmes.mcm.common.util;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.LocalDateTime;

/**
 * mcm-core 서비스들에 흩어져 있던 값 변환 유틸 모음. 순수 static 유틸이며 다른 업무 슬라이스를 참조하지 않는다.
 * 의미가 다른 변형은 합치지 않고 이름으로 구분한다.
 */
public final class McmValues {

    private static final Logger log = LoggerFactory.getLogger(McmValues.class);

    private McmValues() {
    }

    /** null 이면 null, 아니면 {@code String.valueOf}. trim 하지 않는다. */
    public static String strOf(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    /** null 이면 null, 아니면 {@code String.valueOf} 뒤 trim. 공백만 있으면 "". */
    public static String strOfTrim(Object o) {
        return o == null ? null : String.valueOf(o).trim();
    }

    /** null·공백이면 null, 아니면 trim 한 값. */
    public static String blankToNullTrim(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    /** null·공백이면 null, 아니면 원본 그대로(trim 없음). */
    public static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    /**
     * Map row 의 날짜 값 → {@link LocalDateTime}. LocalDateTime 직접, "yyyyMMdd", "yyyy-MM-dd",
     * "yyyy-MM-dd HH:mm:ss[.SSS]", ISO_LOCAL_DATE_TIME 문자열을 받는다. null·빈 값·"null"·파싱 실패는 fallback.
     */
    public static LocalDateTime parseLocalDateTime(Object v, LocalDateTime fallback) {
        if (v == null) return fallback;
        if (v instanceof LocalDateTime ldt) return ldt;
        String s = String.valueOf(v).trim();
        if (s.isEmpty() || "null".equals(s)) return fallback;
        try {
            if (s.length() == 8 && s.matches("\\d{8}")) {
                return LocalDateTime.parse(
                        s.substring(0, 4) + "-" + s.substring(4, 6) + "-" + s.substring(6, 8) + "T00:00:00");
            }
            if (s.length() == 10) {
                return LocalDateTime.parse(s + "T00:00:00");
            }
            if (s.contains(" ")) {
                return LocalDateTime.parse(s.replace(' ', 'T'));
            }
            return LocalDateTime.parse(s);
        } catch (Exception e) {
            log.warn("[McmValues.parseLocalDateTime] parse failed value={} — fallback", s);
            return fallback;
        }
    }

    /** 정수 변환 — 공란 → null, 콤마 허용, 실패하면 {@link BusinessException}(INVALID_VALUE). */
    public static Integer toIntStrict(Object v, String label) {
        String s = strOfTrim(v);
        if (s == null || s.isBlank()) return null;
        try {
            return Integer.valueOf(s.replace(",", ""));
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, label + "은(는) 정수만 입력 가능합니다.");
        }
    }

    /** Number 는 intValue, 문자열은 trim 후 parseInt, 공란·실패는 null. */
    public static Integer toIntOrNull(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        String s = o.toString().trim();
        if (s.isEmpty()) return null;
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return null; }
    }
}
