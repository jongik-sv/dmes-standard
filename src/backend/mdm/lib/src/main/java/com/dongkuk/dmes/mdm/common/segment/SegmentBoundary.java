package com.dongkuk.dmes.mdm.common.segment;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Collection;

/**
 * 저장 시각(경계) 확정 — S9, D5. 저장 시각은 초 단위로 자른 지금이다. 같은 키의 사건은 앞 사건보다 뒤 시각이어야 하므로
 * (05 「선분과 닫기」 경계) 그 키의 최대 경계(valid_from 과 OPEN_END 가 아닌 valid_to 중 최댓값) 이상이면 최대 경계 +1초로
 * 민다.
 */
public final class SegmentBoundary {

    private SegmentBoundary() {
    }

    public static LocalDateTime next(LocalDateTime now, Collection<? extends SegmentRow> rows) {
        LocalDateTime at = now.truncatedTo(ChronoUnit.SECONDS);
        LocalDateTime max = null;
        for (SegmentRow row : rows) {
            max = later(max, row.validFrom());
            if (!row.isOpen()) {
                max = later(max, row.validTo());
            }
        }
        return max != null && !at.isAfter(max) ? max.plusSeconds(1) : at;
    }

    private static LocalDateTime later(LocalDateTime a, LocalDateTime b) {
        return a == null || b.isAfter(a) ? b : a;
    }
}
