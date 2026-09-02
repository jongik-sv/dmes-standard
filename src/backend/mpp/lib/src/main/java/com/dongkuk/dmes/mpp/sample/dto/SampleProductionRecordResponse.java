package com.dongkuk.dmes.mpp.sample.dto;

import com.dongkuk.dmes.mpp.sample.domain.SampleProductionRecord;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record SampleProductionRecordResponse(
        Long id,
        String workOrderNo,
        BigDecimal producedQty,
        BigDecimal defectQty,
        LocalDateTime recordedAt
) {

    public static SampleProductionRecordResponse from(SampleProductionRecord entity) {
        return new SampleProductionRecordResponse(
                entity.getId(),
                entity.getWorkOrderNo(),
                entity.getProducedQty(),
                entity.getDefectQty(),
                entity.getRecordedAt()
        );
    }
}
