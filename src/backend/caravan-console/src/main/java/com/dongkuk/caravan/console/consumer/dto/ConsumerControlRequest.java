package com.dongkuk.caravan.console.consumer.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ConsumerControlRequest {

    private String topicId;   // OASIS body 바인딩 (As-Is REST 는 path variable, Q-005 path→body)
    private String bizSystem;
}
