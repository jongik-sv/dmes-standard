package com.dongkuk.dmes.mls.sample.dto;

import com.dongkuk.dmes.mls.sample.domain.SampleInventoryItem;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record SampleInventoryItemCreateRequest(
        @NotBlank String itemCode,
        @NotBlank String itemName,
        @NotNull BigDecimal qty,
        String location
) {

    public SampleInventoryItem toEntity() {
        return SampleInventoryItem.builder()
                .itemCode(itemCode)
                .itemName(itemName)
                .qty(qty)
                .location(location)
                .build();
    }
}
