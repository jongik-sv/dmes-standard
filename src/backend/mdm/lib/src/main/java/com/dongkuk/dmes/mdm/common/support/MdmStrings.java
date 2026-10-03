package com.dongkuk.dmes.mdm.common.support;

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
}
