package com.dongkuk.dmes.mdm.common.support;

import java.nio.charset.StandardCharsets;

/**
 * Oracle 칸 길이 상한(ORA-12899 예방)의 공용 정본. 저장 전에 사용자 오류로 막을 때 이 값과 메서드를 쓴다.
 *
 * <ul>
 *   <li>{@code VARCHAR2(4000 BYTE)} 칸 — DB 문자셋 AL32UTF8 기준 UTF-8 바이트 수로 잰다({@link #overBytes}). 한글은 3바이트,
 *       이모지는 4바이트라 글자 수로는 정확히 막을 수 없다.</li>
 *   <li>{@code VARCHAR2(n CHAR)} 칸 — 코드 포인트 수로 잰다({@link #overChars}, {@code NamingRules.length} 와 같은 기준).</li>
 * </ul>
 *
 * <p>CLOB 칸(overrides.json 의 21칸)에는 쓰지 않는다.
 */
public final class MdmTextLimits {

    /** {@code VARCHAR2(4000 BYTE)} 칸의 UTF-8 바이트 상한. */
    public static final int TEXT_BYTES_MAX = 4000;

    /** 키·코드·LVL 같은 {@code VARCHAR2(50 CHAR)} 칸의 글자 상한. */
    public static final int KEY_CHARS_MAX = 50;

    private MdmTextLimits() {
    }

    /** UTF-8 바이트 수. null 이면 0. */
    public static int bytes(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
    }

    /** {@link #TEXT_BYTES_MAX} 를 넘으면 true. null 은 false. */
    public static boolean overBytes(String value) {
        return bytes(value) > TEXT_BYTES_MAX;
    }

    /** 코드 포인트 수가 {@code max} 를 넘으면 true. null 은 false. */
    public static boolean overChars(String value, int max) {
        return value != null && value.codePointCount(0, value.length()) > max;
    }
}
