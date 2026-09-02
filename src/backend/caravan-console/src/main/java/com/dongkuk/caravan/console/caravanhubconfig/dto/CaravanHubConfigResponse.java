package com.dongkuk.caravan.console.caravanhubconfig.dto;

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
public class CaravanHubConfigResponse {

    private String topicId;
    private String direction;
    private String integrationType;
    private Integer pollingIntervalMs;
    private String dbTableName;
    private String dbSchema;
    private String filePath;
    private String backupPath;
    private String ftpHost;
    private Integer ftpPort;
    private String ftpUser;
    private String ftpPassword;
    private String httpUrl;
    private String httpMethod;
    private String httpHeaders;
    private String useYn;
}
