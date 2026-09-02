package com.dongkuk.caravan.console.consumer.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SendTestRequest {

    private String topicId;
    private String transactionCode;
    private String interfaceMsg;
}
