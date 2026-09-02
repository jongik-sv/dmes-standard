package com.dongkuk.caravan.console.dashboard.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DashboardSummaryResponse {

    private List<HostStatusSummary> hosts;
    private List<ProblemTopic> problemTopics;
    private int totalTopicCount;
    private int activeTopicCount;
    /** 큐막기(STATUS='ERROR') 토픽 수 — 운영자 개입이 필요한 실제 실패 신호. (구 dltTopicCount) */
    private int errorTopicCount;
}
