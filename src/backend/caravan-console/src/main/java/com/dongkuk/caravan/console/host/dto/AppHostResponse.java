package com.dongkuk.caravan.console.host.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AppHostResponse {

    private String appHostId;
    private String worksCd;
    private String appHostNm;
    private String appHostUrl;
}
