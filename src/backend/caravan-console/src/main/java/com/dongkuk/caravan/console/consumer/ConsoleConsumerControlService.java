package com.dongkuk.caravan.console.consumer;

import com.dongkuk.caravan.console.consumer.dto.ConsumerControlRequest;
import com.dongkuk.caravan.console.consumer.dto.OffsetSkipRequest;
import com.dongkuk.caravan.console.consumer.dto.OffsetSkipResponse;
import com.dongkuk.caravan.console.exception.ConsoleException;
import com.dongkuk.caravan.console.host.AppHostService;
import com.dongkuk.caravan.console.proxy.CaravanApiClient;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 컨슈머 제어 서비스 — v3 재플랜.
 *
 * <p>v2 → v3 변경:</p>
 * <ul>
 *   <li>caravan {@code ContainerController} 직접 호출 (LB-unsafe 자기 인스턴스만) →
 *       {@link CaravanApiClient#controlConsumer} (POST /kafkaApi/{action}) 위임.
 *       caravan 측 {@code TopicControlService} 가 DB UPDATE + ControlTopicPublisher.publish 로 broadcast →
 *       LB 환경 모든 인스턴스 동기화.</li>
 *   <li>caravan {@code KafkaOffsetManager} 직접 호출 → {@link CaravanApiClient#skipOffset} 위임.</li>
 *   <li>offset 사전 검증 — caravan 의존 제거 (2026-05-12) 로 일시 우회. caravan API 가 자체 검증. ConsoleCaravanHubClient 도입 시 caravan-hub API 응답으로 복구 예정.</li>
 * </ul>
 *
 * <p>호스트 매핑 lookup: {@link AppHostService#getHostUrl(String)} (caravan-console DB의 TB_CARAVAN_APPHOST SoT).</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ConsoleConsumerControlService {

    private static final Set<String> ALLOWED_ACTIONS = Set.of("pause", "resume", "stop", "start");

    private final AppHostService appHostService;
    private final CaravanApiClient caravanApiClient;

    /**
     * 컨슈머 제어 (pause / resume / stop / start) — caravan 측 LB-safe broadcast.
     *
     * <p>{@code start} 는 caravan 측 {@code /kafkaApi/startConsumer} 가 deprecated/LB-unsafe — 호출 가능하나
     * 영구 등록은 caravan 부팅 시 자동 (CaravanBootstrapResetRunner), 재가동은 {@code /resume} 권장.</p>
     */
    public Map<String, Object> control(String topicId, String action, ConsumerControlRequest request) {
        if (action == null || !ALLOWED_ACTIONS.contains(action)) {
            throw new ConsoleException("알 수 없는 action: " + action);
        }
        String hostUrl = appHostService.getHostUrl(request.getBizSystem());
        return caravanApiClient.controlConsumer(hostUrl, action, topicId);
    }

    /** Offset 스킵 — caravan API 위임. 사전 검증은 caravan 측이 자체 수행. */
    public OffsetSkipResponse skipOffset(String topicId, OffsetSkipRequest request) {
        // 사전 검증 (broker 의 commit offset vs 화면 offset 일치) — caravan 의존 제거 (2026-05-12) 로 일시 우회.
        // caravan API 가 자체 검증 + ConsoleCaravanHubClient 도입 시 caravan-hub API 응답으로 복구 예정.

        // caravan API 위임 — 자기 인스턴스 stop → broker offset alter → resume 절차 (caravan 내부 처리)
        String hostUrl = appHostService.getHostUrl(request.getBizSystem());
        Map<String, Object> result = caravanApiClient.skipOffset(
                hostUrl, topicId, request.getGroupId(), request.getCount());

        // 3. caravan 응답 (UPPERCASE 필드) → caravan-console OffsetSkipResponse 변환
        return OffsetSkipResponse.builder()
                .topicId(topicId)
                .groupId(request.getGroupId())
                .beforeOffset(toLong(result.get("beforeCurrentOffset")))
                .afterOffset(toLong(result.get("afterCurrentOffset")))
                .maxOffset(toLong(result.get("afterMaxOffset")))
                .success(Boolean.TRUE.equals(result.get("success")))
                .message((String) result.get("message"))
                .build();
    }

    private long toLong(Object value) {
        if (value == null) return 0L;
        if (value instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0L;
        }
    }
}
