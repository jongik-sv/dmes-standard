package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import java.time.LocalDateTime;

/** 카테고리·소속 사건 1건의 결과 — 동작과 저장 시각. */
public record SegmentOutcome(MdmTemporalSegmentAction action, LocalDateTime at) {
}
