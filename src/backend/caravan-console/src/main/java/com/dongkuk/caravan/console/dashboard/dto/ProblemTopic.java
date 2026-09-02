package com.dongkuk.caravan.console.dashboard.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProblemTopic {

    private String topicId;
    private String bizSystem;
    /** PAUSED / LAG / ERROR(큐막기) */
    private String problemType;
    private String containerStatus;
    private Long currentOffset;
    private Long maxOffset;
    private Long lag;
    private String description;
}
