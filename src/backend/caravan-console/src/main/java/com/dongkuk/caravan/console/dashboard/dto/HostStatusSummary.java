package com.dongkuk.caravan.console.dashboard.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * BIZ_SYSTEM 단위 토픽 상태 집계 카드.
 *
 * <p>caravan-console 원본 HostStatusSummary 의 caravan-console 이전체 — D-4 결정 결과: AppHost 폐기로 host 단위
 * 라우팅이 사라진 후, 본 카드는 <b>BIZ_SYSTEM 단위 토픽 상태 집계</b> 로 재정의.
 * {@code hostUrl} 필드는 nullable — 운영(NGINX LB) 환경에서는 비어있고, 단일 인스턴스 운영 시 표기.</p>
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HostStatusSummary {

    private String bizSystem;
    /** D-4 결정 — NGINX LB 환경에서는 nullable. caravan-console 호환을 위해 필드 보존. */
    private String hostUrl;
    private boolean alive;
    private long responseTimeMs;
    private int runningCount;
    private int pausedCount;
    private int stoppedCount;
    private int notExistsCount;
    private String error;
}
