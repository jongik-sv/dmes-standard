package com.dongkuk.dmes.mdm.dmb.layout.codec;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * AUTO 채움 값(TSK-05-03 design.md §2, D5). SEND_TIME 은 항목 길이로 형식을 가른다 — 14 {@code yyyyMMddHHmmss}, 8 {@code yyyyMMdd},
 * 6 {@code HHmmss}. 그 밖의 길이는 오류(AUTO 종류를 늘리지 않는다, 03:21).
 */
public final class LayoutAutoValues {

    public static final String SEND_TIME = "SEND_TIME";
    public static final String MSG_LENGTH = "MSG_LENGTH";
    public static final String SEQ = "SEQ";
    public static final String LAYOUT_ID = "LAYOUT_ID";

    private LayoutAutoValues() {
    }

    public static String sendTime(LocalDateTime t, int length) {
        String pattern = switch (length) {
            case 14 -> "yyyyMMddHHmmss";
            case 8 -> "yyyyMMdd";
            case 6 -> "HHmmss";
            default -> throw new LayoutCodecException("SEND_TIME 항목 길이는 14·8·6 중 하나다: " + length);
        };
        return t.format(DateTimeFormatter.ofPattern(pattern));
    }
}
