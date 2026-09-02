package com.dongkuk.dmes.mcm.sample.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record SampleMasterCodeCreateRequest(
        @NotBlank @Size(max = 50) String codeGroup,
        @NotBlank @Size(max = 50) String codeValue,
        @NotBlank @Size(max = 200) String label,
        @PositiveOrZero Integer sortOrder
) {
}
