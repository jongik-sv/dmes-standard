package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentRules;
import java.time.LocalDateTime;

/** 선분 행 공통 — 열린 행 판정은 {@code valid_to = OPEN_END} 하나다(S10). */
public interface SegmentRow {

    LocalDateTime validFrom();

    LocalDateTime validTo();

    default boolean isOpen() {
        return MdmTemporalSegmentRules.OPEN_END.equals(validTo());
    }
}
