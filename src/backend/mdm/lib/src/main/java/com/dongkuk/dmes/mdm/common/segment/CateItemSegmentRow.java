package com.dongkuk.dmes.mdm.common.segment;

import java.time.LocalDateTime;

/** {@code TB_MDM_DATA_CATE_ITEM} 선분 행 한 줄(네이티브 읽기 결과). 값 칸이 없다. */
public record CateItemSegmentRow(DataCateItemKey key, LocalDateTime validFrom, LocalDateTime validTo, long chgSeq)
        implements SegmentRow {
}
