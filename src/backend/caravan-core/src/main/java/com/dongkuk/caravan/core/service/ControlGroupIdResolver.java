package com.dongkuk.caravan.core.service;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * caravan.control 토픽 listener 의 unique groupId 를 결정한다.
 *
 * <p>각 caravan 인스턴스가 unique groupId 를 사용해야 broadcast 효과가 발생
 * (모든 인스턴스가 모든 메시지 수신 후 자기 시스템 명령만 처리).</p>
 *
 * <p>우선순위:</p>
 * <ol>
 *   <li>환경변수 {@code CARAVAN_INSTANCE_ID} (운영팀 명시 통제)</li>
 *   <li>호스트명 (K8s/Docker 자연스러움, 같은 호스트 재기동 시 같은 groupId 재사용 → broker dead group sprawl 방지)</li>
 *   <li>UUID 첫 8자 (최후 fallback)</li>
 * </ol>
 *
 * <p>모두 {@code caravan-control-} prefix 를 붙여 식별 용이.</p>
 */
@Slf4j
@Component
public class ControlGroupIdResolver {

    private static final String PREFIX = "caravan-control-";

    private final String groupId;

    public ControlGroupIdResolver() {
        this.groupId = resolve();
        log.info("[CaravanControl] resolved groupId = {}", this.groupId);
    }

    public String get() {
        return groupId;
    }

    private String resolve() {
        String envId = System.getenv("CARAVAN_INSTANCE_ID");
        if (envId != null && !envId.isBlank()) {
            return PREFIX + envId;
        }
        try {
            return PREFIX + InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException e) {
            return PREFIX + UUID.randomUUID().toString().substring(0, 8);
        }
    }
}
