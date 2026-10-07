package com.dongkuk.dmes.mdm.common.support;

import java.sql.Clob;
import java.sql.SQLException;

/**
 * 서비스들이 따로 두던 문자열 보조 메서드의 공용 정본.
 *
 * <p>{@code blankToNull} 과 {@code trimToNull} 은 비어 있다고 보는 기준이 다르다. 앞은 유니코드 공백만 있어도(isBlank) null,
 * 뒤는 {@link String#trim()} 결과가 빈 문자열일 때만 null 이다. 호출부가 쓰던 기준 그대로 이름을 골라 쓴다.
 */
public final class MdmStrings {

    private MdmStrings() {
    }

    /** null·공백(유니코드 공백 포함)이면 null, 아니면 {@code trim()} 한 값. */
    public static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** null 이면 null, {@code trim()} 결과가 빈 문자열이면 null, 아니면 그 결과. */
    public static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /** null 이면 null, 아니면 {@code toString()}. */
    public static String str(Object value) {
        return value == null ? null : value.toString();
    }

    /**
     * 네이티브 SQL 결과 칸 → 문자열. Oracle CLOB 칸은 {@link Clob} 으로 올 수 있어 {@code toString()}·{@code (String)} 캐스트로는 내용을
     * 얻지 못한다(앞은 객체 표시 문자열, 뒤는 ClassCastException). null 이면 null, 문자열이면 그대로, Clob 이면 전체 내용이다.
     */
    public static String text(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String s) {
            return s;
        }
        if (value instanceof Clob clob) {
            try {
                long length = clob.length();
                return length == 0 ? "" : clob.getSubString(1, Math.toIntExact(length));
            } catch (SQLException e) {
                throw new IllegalStateException("CLOB 값을 읽지 못했습니다", e);
            }
        }
        return value.toString();
    }
}
