package com.dongkuk.caravan.console.consumer.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OffsetSkipResponse {

    private String topicId;
    private String groupId;
    private long beforeOffset;
    private long afterOffset;
    private long maxOffset;
    private boolean success;
    private String message;
}
