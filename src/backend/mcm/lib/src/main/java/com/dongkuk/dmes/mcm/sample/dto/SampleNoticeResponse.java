package com.dongkuk.dmes.mcm.sample.dto;

import com.dongkuk.dmes.mcm.sample.domain.SampleNotice;

public record SampleNoticeResponse(
        Long id,
        String title,
        String content,
        Boolean active
) {

    public static SampleNoticeResponse from(SampleNotice entity) {
        return new SampleNoticeResponse(
                entity.getId(),
                entity.getTitle(),
                entity.getContent(),
                entity.getActive()
        );
    }
}
