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
    /**
     * 이 모듈이 쓰는 MDM 시스템 코드(MES 등). 있으면 COLUMN 조회에 {@code params.systemCode} 로 실어 표준 물리명으로 못 찾은 이름을 그 시스템의 별칭으로 찾게
     * 한다. 기본 없음 = 별칭 매칭 끔(spec 2026-10-03-mdm-column-system-alias-design L2).
     */
    private String systemCode;
    private Duration pollInterval = Duration.ofSeconds(10);
    /** 대상 합계 상한. 넘으면 만료 항목, 그다음 오래 조회되지 않은 순(LRU)으로 지운다. */
    private int maxEntries = 20_000;
    /**
     * 적재 뒤 절대 상한 — 조회가 아무리 많아도 이 시간이 지나면 버리고 MDM 에서 다시 받는다(폴링이 오래 끊겨 지움 기록을 놓친 경우의 안전망).
     */
    private Duration maxAge = Duration.ofHours(24);
    /** 유휴 수명 — 마지막 조회 뒤 이 시간 동안 다시 조회되지 않으면 만료. 조회될 때마다 연장된다. */
    private Duration maxIdle = Duration.ofMinutes(60);
    /** 옛 버전·예약 버전 본문의 유휴 수명(D-154 결정 P6·P9). 목차·최종 본문은 {@code max-idle}. */
    private Duration oldVersionMaxIdle = Duration.ofMinutes(10);
    /** D-154 버전별 적재 스위치 — {@link VersionedFeed}. */
    private VersionedFeed versionedFeed = VersionedFeed.AUTO;
    private Duration connectTimeout = Duration.ofSeconds(2);
    private Duration readTimeout = Duration.ofSeconds(5);
    /** 한 번 폴링에서 받는 변경 수 상한. 넘으면(truncated) 캐시를 비운다(§5.3-3). */
    private int pageLimit = 1000;
    /**
     * 순번 역전 대비 되돌아보기(계획 검토 A1) — 폴러가 {@code since = max(0, appliedSeq - 이 값)} 으로 최근 순번을 다시 훑어 늦게 커밋된 낮은
     * 순번을 잡는다. 0 이면 끈다. 켰으면 {@code page-limit} 이 이 값보다 커야 한다(아니면 기동 때 예외).
     */
    private int revisionLookback = MdmRevisionPoller.DEFAULT_LOOKBACK;
    /** 저장 검증({@link MdmValidator}) 설정 {@code cactus.mdm.validation.*}(하위 프로젝트 C spec §6.3). */
    private final Validation validation = new Validation();

    /**
     * D-154 버전별 적재 — AUTO(기본): 버전 대상(룰·룰 세트·코드·전문)을 목차·본문으로 받는다(옛 MDM 이면 cactus 가 전 이력에서 만든다). OFF: part 를
     * 보내지 않고 지금처럼 전 이력 한 키로 돈다 — 배포 중 문제가 생기면 되돌리는 스위치이고 재기동해 반영한다. 모든 업무 모듈이 새 cactus 로 바뀐
     * 다음 릴리스에 지운다(결정 P12).
     */
    public enum VersionedFeed { AUTO, OFF }

    /** {@code cactus.mdm.validation.*}. */
    public static class Validation {

        /** 검사에 필요한 MDM 정의를 받을 수 없을 때 — REJECT(기본, 저장 거부) | PASS(WARN 을 남기고 그 항목만 건너뜀). spec C7. */
        private MdmValidator.OnUnavailable onUnavailable = MdmValidator.OnUnavailable.REJECT;

        public MdmValidator.OnUnavailable getOnUnavailable() { return onUnavailable; }

        public void setOnUnavailable(MdmValidator.OnUnavailable v) { this.onUnavailable = v; }
    }

    public Validation getValidation() { return validation; }

    public VersionedFeed getVersionedFeed() { return versionedFeed; }
    public void setVersionedFeed(VersionedFeed v) { this.versionedFeed = v; }

    public boolean isEnabled() { return enabled; }
    public String getModule() { return module; }
    public String getSystemCode() { return systemCode; }
    public String getBaseUrl() { return baseUrl; }
    public String getClientKey() { return clientKey; }
    public Duration getPollInterval() { return pollInterval; }
    public int getMaxEntries() { return maxEntries; }
    public Duration getMaxAge() { return maxAge; }
    public Duration getMaxIdle() { return maxIdle; }
    public Duration getOldVersionMaxIdle() { return oldVersionMaxIdle; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public Duration getReadTimeout() { return readTimeout; }
    public int getPageLimit() { return pageLimit; }
    public int getRevisionLookback() { return revisionLookback; }

    public void setEnabled(boolean v) { this.enabled = v; }
    public void setModule(String v) { this.module = v; }
    public void setSystemCode(String v) { this.systemCode = v; }
    public void setBaseUrl(String v) { this.baseUrl = v; }
    public void setClientKey(String v) { this.clientKey = v; }
    public void setPollInterval(Duration v) { this.pollInterval = v; }
    public void setMaxEntries(int v) { this.maxEntries = v; }
    public void setMaxAge(Duration v) { this.maxAge = v; }
    public void setMaxIdle(Duration v) { this.maxIdle = v; }
    public void setOldVersionMaxIdle(Duration v) { this.oldVersionMaxIdle = v; }
    public void setConnectTimeout(Duration v) { this.connectTimeout = v; }
    public void setReadTimeout(Duration v) { this.readTimeout = v; }
    public void setPageLimit(int v) { this.pageLimit = v; }
    public void setRevisionLookback(int v) { this.revisionLookback = v; }
}
