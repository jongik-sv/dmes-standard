package com.dongkuk.dmes.cactus.dmom.format;

import java.math.BigDecimal;
import java.util.List;

/**
 * TC → FORMAT 의 활성 레이아웃. {@link FormatItem} 목록(ITEM_SEQ 오름차순)을 보유한다.
 */
public record FormatLayout(
        String formatId,
        BigDecimal formatVer,
        List<FormatItem> items
) {

    public boolean isEmpty() {
        return items == null || items.isEmpty();
    }

    /** 포맷 부재(조회 0건) 를 표현하는 빈 레이아웃. */
    public static FormatLayout empty() {
        return new FormatLayout(null, null, List.of());
    }
}
