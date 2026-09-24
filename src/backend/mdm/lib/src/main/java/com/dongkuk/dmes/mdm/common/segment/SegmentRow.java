package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentRules;
import java.time.LocalDateTime;
import java.util.List;

/** 선분 행 공통 — 열린 행 판정은 {@code valid_to = OPEN_END} 하나다(S10). */
public interface SegmentRow {

    LocalDateTime validFrom();

    LocalDateTime validTo();

    default boolean isOpen() {
        return MdmTemporalSegmentRules.OPEN_END.equals(validTo());
    }

    /** 그 키의 행 목록에서 열린 행(있으면 하나뿐, S11)을 찾는다. 없으면 null. */
    static <T extends SegmentRow> T firstOpen(List<T> own) {
        return own.stream().filter(SegmentRow::isOpen).findFirst().orElse(null);
    }
}
