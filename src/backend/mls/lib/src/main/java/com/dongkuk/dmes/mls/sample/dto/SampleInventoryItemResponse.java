package com.dongkuk.dmes.mls.sample.dto;

import com.dongkuk.dmes.mls.sample.domain.SampleInventoryItem;
import java.math.BigDecimal;

public record SampleInventoryItemResponse(
        Long id,
        String itemCode,
        String itemName,
        BigDecimal qty,
        String location
) {

    public static SampleInventoryItemResponse from(SampleInventoryItem entity) {
        return new SampleInventoryItemResponse(
                entity.getId(),
                entity.getItemCode(),
                entity.getItemName(),
                entity.getQty(),
                entity.getLocation()
        );
    }
}
