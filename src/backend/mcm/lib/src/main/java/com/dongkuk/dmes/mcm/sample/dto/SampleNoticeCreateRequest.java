package com.dongkuk.dmes.mcm.sample.dto;

import com.dongkuk.dmes.mcm.sample.domain.SampleNotice;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SampleNoticeCreateRequest(
        @NotBlank String title,
        String content,
        @NotNull Boolean active
) {

    public SampleNotice toEntity() {
        return SampleNotice.builder()
                .title(title)
                .content(content)
                .active(active)
                .build();
    }
}
