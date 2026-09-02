package com.dongkuk.caravan.console.proxy;

import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * 각 모듈 WAS 의 {@code /kafkaApi/*} REST 호출 — caravan 라이브러리가 자동 노출하는 엔드포인트.
 *
 * <p>v3: caravan-console 가 caravan internal class import 0 + REST 호출 패턴. caravan 의
 * {@code KafkaStatusController} (8 메서드) + {@code TopicAdminController} (2 메서드) 가
 * 각 모듈 caravan 의존만으로 자동 활성. caravan-console 는 RestClient 로 호출만.</p>
 *
 * <p>LB 안전성: caravan 측이 ControlTopicPublisher 로 broadcast — REST 호출 1회로 모든 인스턴스 동기화.
 * 자세한 매트릭스는 {@code caravan-console-core-화면별-API-설계.md §4}.</p>
 *
 * <p>호출 실패 처리: 각 메서드는 fallback 가능하도록 null 반환 또는 예외 전파를 적절히 분기 (§5-4 정책).</p>
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CaravanApiClient {

    private final RestClient consoleRestClient;

    /**
     * GET /kafkaApi/status?topicId=  — DB STATUS + broker AdminClient 종합 응답.
     * 응답: {@code List<Map<String,Object>>} — TOPIC_ID, CONTAINER_STATUS, CURRENT_OFFSET, MAX_OFFSET, LAG 등.
     */
    public List<Map<String, Object>> getStatus(String hostUrl, String topicId) {
        try {
            UriComponentsBuilder b = UriComponentsBuilder.fromUriString(hostUrl + "/kafkaApi/status");
            if (topicId != null && !topicId.isBlank()) {
                b.queryParam("topicId", topicId);
            }
            return consoleRestClient.get()
                    .uri(b.toUriString())
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});
        } catch (Exception e) {
            log.error("getStatus 실패 - host: {}, topicId: {}, err: {}", hostUrl, topicId, e.getMessage());
            return null;
        }
    }

    /**
     * POST /kafkaApi/{action}  body={topicId} — 컨테이너 제어. action: pause/resume/stop/start.
     * caravan 측 LB-safe broadcast (DB UPDATE + ControlTopicPublisher).
     * <p>{@code start} 는 caravan 측 {@code /kafkaApi/startConsumer} 매핑 — LB-unsafe deprecated. 호출 회피 권장.</p>
     */
    public Map<String, Object> controlConsumer(String hostUrl, String action, String topicId) {
        String caravanAction = "start".equals(action) ? "startConsumer" : action;
        return consoleRestClient.post()
                .uri(hostUrl + "/kafkaApi/" + caravanAction)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("topicId", topicId))
                .retrieve()
                .body(new ParameterizedTypeReference<>() {});
    }

    /**
     * POST /kafkaApi/skipOffset  body={topicId, groupId, count} — offset skip (LB broadcast 포함).
     * caravan 측 KafkaOffsetManager 위임.
     */
    public Map<String, Object> skipOffset(String hostUrl, String topicId, String groupId, int count) {
        return consoleRestClient.post()
                .uri(hostUrl + "/kafkaApi/skipOffset")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("topicId", topicId, "groupId", groupId, "count", count))
                .retrieve()
                .body(new ParameterizedTypeReference<>() {});
    }

    /**
     * GET /kafkaApi/browse?topicId&fromTimestamp&toTimestamp&maxCount — 시간범위 메시지.
     * 응답: {@code List<Map<String,Object>>} — TOPIC, OFFSET, PARTITION, TIMESTAMP, KEY, VALUE 등 (UPPERCASE).
     */
    public List<Map<String, Object>> browseMessages(String hostUrl, String topicId,
                                                     long fromTs, long toTs, int maxCount) {
        try {
            String url = UriComponentsBuilder.fromUriString(hostUrl + "/kafkaApi/browse")
                    .queryParam("topicId", topicId)
                    .queryParam("fromTimestamp", fromTs)
                    .queryParam("toTimestamp", toTs)
                    .queryParam("maxCount", maxCount)
                    .toUriString();
            return consoleRestClient.get()
                    .uri(url)
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});
        } catch (Exception e) {
            log.error("browseMessages 실패 - host: {}, topic: {}, err: {}", hostUrl, topicId, e.getMessage());
            return null;
        }
    }

    /**
     * GET /kafkaApi/peekOffset?topicId&offset — 단건 offset peek.
     * 응답: {@code Map} — topicId, offset, found, message (string raw value).
     */
    public Map<String, Object> peekOffset(String hostUrl, String topicId, long offset) {
        try {
            String url = UriComponentsBuilder.fromUriString(hostUrl + "/kafkaApi/peekOffset")
                    .queryParam("topicId", topicId)
                    .queryParam("offset", offset)
                    .toUriString();
            return consoleRestClient.get()
                    .uri(url)
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});
        } catch (Exception e) {
            log.error("peekOffset 실패 - host: {}, topic: {}, offset: {}, err: {}",
                    hostUrl, topicId, offset, e.getMessage());
            return null;
        }
    }

    /**
     * POST /kafkaApi/topics  — caravan TopicAdminController. broker NewTopic(+DLT) + caravan DB INSERT.
     * v3 신규 — caravan-console saveTopics(C) 의 fan-out 호출.
     */
    public Map<String, Object> createTopic(String hostUrl, Map<String, Object> request) {
        return consoleRestClient.post()
                .uri(hostUrl + "/kafkaApi/topics")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(new ParameterizedTypeReference<>() {});
    }

    /**
     * PUT /kafkaApi/topics  — caravan TopicAdminController. DB 메타 UPDATE (Kafka 불변).
     * 토픽 관리 화면 saveTopics(U) 의 fan-out 호출.
     */
    public Map<String, Object> updateTopic(String hostUrl, Map<String, Object> request) {
        return consoleRestClient.put()
                .uri(hostUrl + "/kafkaApi/topics")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(new ParameterizedTypeReference<>() {});
    }

    /**
     * DELETE /kafkaApi/topics?topicId&bizSystem  — caravan TopicAdminController. broker delete + DB DELETE.
     * v3 신규 — caravan-console saveTopics(D) 의 fan-out 호출.
     */
    public void deleteTopic(String hostUrl, String topicId, String bizSystem) {
        String url = UriComponentsBuilder.fromUriString(hostUrl + "/kafkaApi/topics")
                .queryParam("topicId", topicId)
                .queryParam("bizSystem", bizSystem)
                .toUriString();
        consoleRestClient.delete()
                .uri(url)
                .retrieve()
                .toBodilessEntity();
    }
}
