package com.dongkuk.dmes.aps.sample.dto;

import com.dongkuk.dmes.aps.sample.domain.SampleItem;
import java.time.LocalDateTime;

public record SampleItemResponse(
        Long id,
        String code,
        String name,
        String status,
        LocalDateTime createdAt
) {

    public static SampleItemResponse from(SampleItem item) {
        return new SampleItemResponse(
                item.getId(),
                item.getCode(),
                item.getName(),
                item.getStatus(),
                item.getCreatedAt()
        );
    }
}
