package com.dongkuk.dmes.mqc.sample.dto;

import com.dongkuk.dmes.mqc.sample.domain.SampleInspectionResult;
import com.dongkuk.dmes.mqc.sample.domain.InspectionJudgement;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;

public record SampleInspectionResultCreateRequest(
        @NotBlank String lotNo,
        @NotNull LocalDateTime inspectedAt,
        @NotNull InspectionJudgement result,
        String remark
) {

    public SampleInspectionResult toEntity() {
        return SampleInspectionResult.builder()
                .lotNo(lotNo)
                .inspectedAt(inspectedAt)
                .result(result)
                .remark(remark)
                .build();
    }
}
