package com.dongkuk.dmes.mdm.common.segment;

import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import java.time.LocalDateTime;

/** 화면 경로 항목 사건 1건의 결과 — 동작, 사건 뒤 그 키의 마지막 행, 저장 시각. */
public record SaveOutcome(MdmTemporalSegmentAction action, ItemSegmentRow latest, LocalDateTime at) {
}
