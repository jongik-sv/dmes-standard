package com.dongkuk.dmes.mpp.sample.dto;

import com.dongkuk.dmes.mpp.sample.domain.SampleProductionRecord;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record SampleProductionRecordCreateRequest(
        @NotBlank String workOrderNo,
        @NotNull BigDecimal producedQty,
        @NotNull BigDecimal defectQty,
        @NotNull LocalDateTime recordedAt
) {

    public SampleProductionRecord toEntity() {
        return SampleProductionRecord.builder()
                .workOrderNo(workOrderNo)
                .producedQty(producedQty)
                .defectQty(defectQty)
                .recordedAt(recordedAt)
                .build();
    }
}
