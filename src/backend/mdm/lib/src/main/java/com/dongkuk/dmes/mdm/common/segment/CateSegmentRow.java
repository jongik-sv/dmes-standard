package com.dongkuk.dmes.mdm.common.segment;

import java.time.LocalDateTime;

/** {@code TB_MDM_DATA_CATE} 선분 행 한 줄(네이티브 읽기 결과). 카테고리에는 ROW_VERSION 이 없다(F8). */
public record CateSegmentRow(DataCateKey key, LocalDateTime validFrom, LocalDateTime validTo, DataCateValue value,
                             long chgSeq) implements SegmentRow {
}
