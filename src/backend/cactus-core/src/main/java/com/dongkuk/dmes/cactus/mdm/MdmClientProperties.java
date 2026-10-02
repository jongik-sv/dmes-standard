package com.dongkuk.dmes.cactus.mdm;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 업무 모듈의 MDM 메타 캐시 설정 {@code cactus.mdm.*}(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.1).
 * 기본은 꺼짐이다 — 업무 모듈이 켠다. MDM 서버 자신은 켜지 않는다. 선례는 {@code CaravanHubClientProperties}.
 */
@ConfigurationProperties(prefix = "cactus.mdm")
public class MdmClientProperties {

    private boolean enabled = false;
    /** 이 모듈 코드(mcm·mls·mqc·mpp·mpn). 비면 {@code cactus.oasis.service-group}. 엔드포인트 {@code /api/{module}/mdmMeta} 와 호출자 이름에 쓴다. */
    private String module;
    private String baseUrl = "http://localhost:8096";
    private String clientKey;
    private Duration pollInterval = Duration.ofSeconds(10);
    /** 대상 합계 상한. 넘으면 적재가 오래된 순으로 지운다. */
    private int maxEntries = 20_000;
    /** 기록 누락에 대비한 안전망 — 이 수명이 지난 항목은 조회 때 버린다. */
    private Duration maxAge = Duration.ofMinutes(60);
    private Duration connectTimeout = Duration.ofSeconds(2);
    private Duration readTimeout = Duration.ofSeconds(5);
    /** 한 번 폴링에서 받는 변경 수 상한. 넘으면(truncated) 캐시를 비운다(§5.3-3). */
    private int pageLimit = 1000;
    /**
     * 순번 역전 대비 되돌아보기(계획 검토 A1) — 폴러가 {@code since = max(0, appliedSeq - 이 값)} 으로 최근 순번을 다시 훑어 늦게 커밋된 낮은
     * 순번을 잡는다. 0 이면 끈다. 켰으면 {@code page-limit} 이 이 값보다 커야 한다(아니면 기동 때 예외).
     */
    private int revisionLookback = MdmRevisionPoller.DEFAULT_LOOKBACK;

    public boolean isEnabled() { return enabled; }
    public String getModule() { return module; }
    public String getBaseUrl() { return baseUrl; }
    public String getClientKey() { return clientKey; }
    public Duration getPollInterval() { return pollInterval; }
    public int getMaxEntries() { return maxEntries; }
    public Duration getMaxAge() { return maxAge; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public Duration getReadTimeout() { return readTimeout; }
    public int getPageLimit() { return pageLimit; }
    public int getRevisionLookback() { return revisionLookback; }

    public void setEnabled(boolean v) { this.enabled = v; }
    public void setModule(String v) { this.module = v; }
    public void setBaseUrl(String v) { this.baseUrl = v; }
    public void setClientKey(String v) { this.clientKey = v; }
    public void setPollInterval(Duration v) { this.pollInterval = v; }
    public void setMaxEntries(int v) { this.maxEntries = v; }
    public void setMaxAge(Duration v) { this.maxAge = v; }
    public void setConnectTimeout(Duration v) { this.connectTimeout = v; }
    public void setReadTimeout(Duration v) { this.readTimeout = v; }
    public void setPageLimit(int v) { this.pageLimit = v; }
    public void setRevisionLookback(int v) { this.revisionLookback = v; }
}
