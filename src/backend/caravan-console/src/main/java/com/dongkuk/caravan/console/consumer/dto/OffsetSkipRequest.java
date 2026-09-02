package com.dongkuk.caravan.console.consumer.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class OffsetSkipRequest {

    private String topicId;   // OASIS body 바인딩 (Q-005 path→body)
    private String bizSystem;
    private String groupId;
    private long currentOffset;
    private int count;
}
