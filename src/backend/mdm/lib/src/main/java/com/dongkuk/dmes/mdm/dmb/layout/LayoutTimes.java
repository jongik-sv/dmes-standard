package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.List;

/** 판정 시각 T(asOf)·적용 시각 문자열(KST, 'yyyy-MM-dd HH:mm:ss'). 비면 서버 시계의 지금. */
public final class LayoutTimes {

    public static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private LayoutTimes() {
    }

    public static LocalDateTime asOf(String raw, Clock clock) {
        if (raw == null || raw.isBlank()) {
            return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        }
        try {
            return LocalDateTime.parse(raw.trim(), TEXT);
        } catch (DateTimeParseException e) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "시각 형식은 yyyy-MM-dd HH:mm:ss 입니다: " + raw, List.of());
        }
    }

    public static String text(LocalDateTime t) {
        return t == null ? null : TEXT.format(t);
    }
}
