package com.dongkuk.caravan.console.caravanhubconfig.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CaravanHubConfigSearchRequest {

    private String direction;
    private String topicId;
    private String useYn;
}
