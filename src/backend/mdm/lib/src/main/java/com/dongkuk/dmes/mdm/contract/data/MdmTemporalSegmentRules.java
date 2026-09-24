package com.dongkuk.dmes.mdm.contract.data;

import java.time.LocalDateTime;

/** 일시 선분 경계 규칙 — 05 「선분과 닫기」(design/basic/05-master-data.md:220-236, TSK-07-01 design.md F6). */
public final class MdmTemporalSegmentRules {

    /** 열린 행의 valid_to 센티넬. */
    public static final LocalDateTime OPEN_END = LocalDateTime.of(9999, 12, 31, 0, 0, 0);

    private MdmTemporalSegmentRules() {
    }
}
