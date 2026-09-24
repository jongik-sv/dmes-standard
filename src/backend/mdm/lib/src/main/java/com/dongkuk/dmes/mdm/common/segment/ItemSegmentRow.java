package com.dongkuk.dmes.mdm.common.segment;

import java.time.LocalDateTime;

/** {@code TB_MDM_DATA_ITEM} 선분 행 한 줄(네이티브 읽기 결과). */
public record ItemSegmentRow(DataItemKey key, LocalDateTime validFrom, LocalDateTime validTo, DataItemValue value,
                             int rowVersion, long chgSeq) implements SegmentRow {
}
