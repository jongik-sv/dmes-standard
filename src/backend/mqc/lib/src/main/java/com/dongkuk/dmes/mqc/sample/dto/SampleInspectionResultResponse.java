package com.dongkuk.dmes.mqc.sample.dto;

import com.dongkuk.dmes.mqc.sample.domain.SampleInspectionResult;
import com.dongkuk.dmes.mqc.sample.domain.InspectionJudgement;
import java.time.LocalDateTime;

public record SampleInspectionResultResponse(
        Long id,
        String lotNo,
        LocalDateTime inspectedAt,
        InspectionJudgement result,
        String remark
) {

    public static SampleInspectionResultResponse from(SampleInspectionResult entity) {
        return new SampleInspectionResultResponse(
                entity.getId(),
                entity.getLotNo(),
                entity.getInspectedAt(),
                entity.getResult(),
                entity.getRemark()
        );
    }
}
