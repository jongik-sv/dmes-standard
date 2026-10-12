package com.dongkuk.dmes.mdm.common.metarev;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * MDM 메타 변경 신호 설정 {@code mdm.meta-signal.*}(ADR-0007 D2 개정, 2026-10-12). 변경 기록을 커밋한 뒤 업무 모듈에 "지금 확인" 신호를 보낸다
 * ({@link MetaChangeSignaler}). 기본은 꺼짐·대상 없음 — 앱 설정(application.yml·프로파일)이 켜고 대상을 준다.
 *
 * <p>{@code targets} 는 업무 모듈 인스턴스의 기준 주소 목록이다(예 {@code http://localhost:8100}). 경로 {@code /internal/mdm/metaSignal} 은 붙이지
 * 않는다. 한 주소가 부하 분산 주소면 그 뒤 인스턴스 하나만 신호를 받는다 — 나머지는 정기 확인(기본 5분)에서 따라온다.
 */
@ConfigurationProperties(prefix = "mdm.meta-signal")
public class MetaSignalProperties {

    private boolean enabled = false;
    private List<String> targets = new ArrayList<>();
    private Duration connectTimeout = Duration.ofSeconds(1);
    private Duration readTimeout = Duration.ofSeconds(2);
    /** 커밋 뒤 보내기까지 기다리는 시간 — 짧은 사이에 커밋된 여러 트랜잭션의 신호를 한 번으로 모은다. */
    private Duration debounce = Duration.ofMillis(100);

    public boolean isEnabled() { return enabled; }
    public List<String> getTargets() { return targets; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public Duration getReadTimeout() { return readTimeout; }
    public Duration getDebounce() { return debounce; }

    public void setEnabled(boolean v) { this.enabled = v; }
    public void setTargets(List<String> v) { this.targets = v == null ? new ArrayList<>() : v; }
    public void setConnectTimeout(Duration v) { this.connectTimeout = v; }
    public void setReadTimeout(Duration v) { this.readTimeout = v; }
    public void setDebounce(Duration v) { this.debounce = v; }
}
