package com.dongkuk.caravan.console.topic.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TopicSearchRequest {

    private String topicId;
    private String bizSystem;
    private String sendModuleId;
    private String recvModuleId;
}
