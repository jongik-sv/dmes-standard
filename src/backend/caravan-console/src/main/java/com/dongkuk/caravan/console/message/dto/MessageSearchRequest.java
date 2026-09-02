package com.dongkuk.caravan.console.message.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class MessageSearchRequest {

    private String topicIds;
    private String sendModuleIds;
    private String recvModuleIds;
    private String dateFrom;
    private String dateTo;
    private String messageStatus;
}
