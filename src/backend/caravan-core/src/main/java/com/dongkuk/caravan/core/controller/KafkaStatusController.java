package com.dongkuk.caravan.core.controller;

import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.container.ContainerController;
import com.dongkuk.caravan.core.container.ContainerStatus;
import com.dongkuk.caravan.core.entity.TopicInfoEntity;
import com.dongkuk.caravan.core.model.BrowseResult;
import com.dongkuk.caravan.core.offset.KafkaOffsetManager;
import com.dongkuk.caravan.core.offset.MessageBrowser;
import com.dongkuk.caravan.core.offset.OffsetInfo;
import com.dongkuk.caravan.core.repository.KafkaTopicRepository;
import com.dongkuk.caravan.core.service.KafkaGroupQueryService;
import com.dongkuk.caravan.core.service.KafkaGroupQueryService.GroupInfo;
import com.dongkuk.caravan.core.service.TopicControlService;
import com.dongkuk.caravan.core.util.KafkaConstants;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Kafka 상태 조회/제어 REST API Controller
 *
 * <p>Kafka Consumer 컨테이너의 상태를 조회하고 제어하는 REST API를 제공합니다.</p>
 *
 * <h3>API 엔드포인트</h3>
 * <table border="1">
 *   <tr><th>메서드</th><th>URL</th><th>설명</th></tr>
 *   <tr><td>GET</td><td>/kafkaApi/status</td><td>Kafka 상태 조회 (DB STATUS + AdminClient broker)</td></tr>
 *   <tr><td>POST</td><td>/kafkaApi/stop</td><td>컨테이너 정지 (LB broadcast)</td></tr>
 *   <tr><td>POST</td><td>/kafkaApi/pause</td><td>컨테이너 일시정지 (LB broadcast)</td></tr>
 *   <tr><td>POST</td><td>/kafkaApi/resume</td><td>컨테이너 재개 (LB broadcast)</td></tr>
 *   <tr><td>POST</td><td>/kafkaApi/startConsumer</td><td>컨테이너 시작 (1 인스턴스만, deprecated)</td></tr>
 *   <tr><td>POST</td><td>/kafkaApi/skipOffset</td><td>Offset 스킵 (LB broadcast 정지/재개 포함)</td></tr>
 *   <tr><td>GET</td><td>/kafkaApi/browse</td><td>시간 범위로 메시지 조회</td></tr>
 *   <tr><td>GET</td><td>/kafkaApi/peekOffset</td><td>특정 Offset 메시지 조회</td></tr>
 * </table>
 *
 * <h3>NGINX LB 다중 인스턴스 동작</h3>
 * <p>{@code /pause}, {@code /resume}, {@code /stop}, {@code /skipOffset} 모두 다음 흐름으로
 * 동작하여 LB 뒤 모든 인스턴스에서 일관된 결과를 보장합니다 (전형적인 적용 시간 ~100ms):</p>
 * <ol>
 *   <li>요청받은 인스턴스가 DB UPDATE (TB_CARAVAN_TOPICS.STATUS, ERROR_*)</li>
 *   <li>TX commit → afterCommit hook 으로 caravan.control 토픽에 명령 publish</li>
 *   <li>모든 인스턴스의 control listener 가 명령 수신 → 자기 JVM 컨테이너 ensure*</li>
 * </ol>
 *
 * <p>{@code /status} 는 DB ({@code TB_CARAVAN_TOPICS.STATUS}) 가 운영 의도 source of truth
 * 이며, Kafka 실시간 상태 (group state / offset / lag) 는 AdminClient 로 broker 직접 조회 →
 * 모든 인스턴스에서 동일 응답.</p>
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * // 상태 조회
 * GET /kafkaApi/status?topicId=my-topic
 *
 * // 컨테이너 일시정지
 * POST /kafkaApi/pause
 * {"topicId": "my-topic"}
 *
 * // Offset 스킵
 * POST /kafkaApi/skipOffset
 * {"topicId": "my-topic", "groupId": "my-group", "count": 1}
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 * @see ContainerController
 * @see KafkaOffsetManager
 * @see MessageBrowser
 */
@RestController
@RequestMapping("/kafkaApi")
@RequiredArgsConstructor
public class KafkaStatusController {

    private static final Logger log = LoggerFactory.getLogger(KafkaStatusController.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final ObjectWriter PRETTY_WRITER = OBJECT_MAPPER.writerWithDefaultPrettyPrinter();
    private static final DateTimeFormatter TS_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.of("Asia/Seoul"));

    private final ContainerController containerController;
    private final KafkaOffsetManager offsetManager;
    private final MessageBrowser messageBrowser;
    private final KafkaTopicRepository topicRepository;
    private final KafkaGroupQueryService groupQueryService;
    private final TopicControlService topicControlService;
    private final CaravanProperties properties;

    /**
     * Kafka Consumer 상태를 조회합니다.
     *
     * <p>등록된 토픽의 컨테이너 상태, Offset 정보를 조회합니다.</p>
     *
     * <p>NGINX LB 다중 인스턴스 환경에서도 일관된 응답을 보장하기 위해
     * DB ({@code TB_CARAVAN_TOPICS.STATUS}) 가 운영 의도의 source of truth 이며,
     * Kafka group state / offset / lag 은 AdminClient 로 broker 에서 직접 조회한다.</p>
     *
     * <h4>응답 필드</h4>
     * <ul>
     *   <li>{@code TOPIC_ID}: 토픽 ID</li>
     *   <li>{@code TOPIC_DESC}: 토픽 설명</li>
     *   <li>{@code GROUP_ID}: Consumer Group ID</li>
     *   <li>{@code BIZ_SYSTEM}: 비즈니스 시스템</li>
     *   <li>{@code USE_TP}: 사용 여부 (Y/N)</li>
     *   <li>{@code CONTAINER_STATUS}: DB 상태 (RUNNING/PAUSED/STOPPED/ERROR)</li>
     *   <li>{@code KAFKA_GROUP_STATE}: Kafka 그룹 상태 (STABLE/EMPTY/...)</li>
     *   <li>{@code ACTIVE_MEMBERS}: Kafka 그룹 활성 컨슈머 수</li>
     *   <li>{@code CURRENT_OFFSET}: 그룹 commit offset</li>
     *   <li>{@code MAX_OFFSET}: 토픽 latest offset</li>
     *   <li>{@code LAG}: maxOffset - currentOffset (음수면 -1)</li>
     *   <li>{@code ERROR_AT}, {@code ERROR_OFFSET}, {@code LAST_ERROR_CODE},
     *       {@code LAST_ERROR_MSG}: STATUS=ERROR 일 때만 포함</li>
     * </ul>
     *
     * @param topicId      토픽 ID 필터 (선택)
     * @param sendModuleId 송신 모듈 ID 필터 (선택)
     * @param recvModuleId 수신 모듈 ID 필터 (선택)
     * @return 토픽별 상태 정보 목록
     */
    @GetMapping("/status")
    public List<Map<String, Object>> getStatus(
            @RequestParam(required = false) String topicId,
            @RequestParam(required = false) String sendModuleId,
            @RequestParam(required = false) String recvModuleId) {

        List<TopicInfoEntity> topics = topicRepository.getTopicEntities(topicId, sendModuleId, recvModuleId);
        List<Map<String, Object>> result = new ArrayList<>();

        for (TopicInfoEntity entity : topics) {
            Map<String, Object> map = new LinkedHashMap<>();

            map.put("TOPIC_ID", entity.getTopicId());
            map.put("TOPIC_DESC", entity.getTopicDesc());
            map.put("GROUP_ID", entity.getGroupId());
            map.put("BIZ_SYSTEM", entity.getBizSystem());
            map.put("USE_TP", entity.getUseTp());

            // DB STATUS 가 운영 의도 source of truth (Phase 1)
            String dbStatus = entity.getStatus() != null ? entity.getStatus() : "UNKNOWN";
            map.put("CONTAINER_STATUS", dbStatus);

            // Kafka broker 에서 직접 조회 (모든 인스턴스 동일 응답)
            GroupInfo group = groupQueryService.describe(entity.getGroupId(), entity.getTopicId());
            map.put("KAFKA_GROUP_STATE", group.getState());
            map.put("ACTIVE_MEMBERS", group.getMembers());
            map.put("CURRENT_OFFSET", group.getCurrentOffset());
            map.put("MAX_OFFSET", group.getMaxOffset());
            map.put("LAG", group.getLag());

            // 자동 ERROR 진입 정보 (Phase 5)
            if ("ERROR".equals(dbStatus)) {
                map.put("ERROR_AT", entity.getErrorAt());
                map.put("ERROR_OFFSET", entity.getErrorOffset());
                map.put("LAST_ERROR_CODE", entity.getLastErrorCode());
                map.put("LAST_ERROR_MSG", entity.getLastErrorMsg());
            }

            result.add(map);
        }
        return result;
    }

    /**
     * Phase 6: STATUS=STOPPED 로 UPDATE + control STOP publish.
     *
     * <p>API 호출 → DB UPDATE → afterCommit publish → 모든 인스턴스의 control listener 가
     * ensureStopped 호출하여 컨테이너 stop. 본 인스턴스도 listener 통해 동일 경로 처리.</p>
     *
     * <h4>요청 본문</h4>
     * <pre>{@code {"topicId": "my-topic"}}</pre>
     *
     * @param param 요청 파라미터 ({@code topicId} 필수)
     * @return 처리 결과 (listenerId, topicId, action, success, message)
     */
    @PostMapping("/stop")
    public Map<String, Object> stop(@RequestBody Map<String, String> param) {
        String topicId = param.get("topicId");
        String listenerId = KafkaConstants.LISTENER_PREFIX + topicId;

        topicControlService.stop(topicId, properties.getBizSystem());

        return buildResponse(listenerId, topicId, "STOP", "토픽 STOP 명령 발행 완료 (DB UPDATE + control publish)");
    }

    /**
     * Phase 6: STATUS=PAUSED 로 UPDATE + control PAUSE publish.
     *
     * <h4>요청 본문</h4>
     * <pre>{@code {"topicId": "my-topic"}}</pre>
     *
     * @param param 요청 파라미터 ({@code topicId} 필수)
     * @return 처리 결과
     */
    @PostMapping("/pause")
    public Map<String, Object> pause(@RequestBody Map<String, String> param) {
        String topicId = param.get("topicId");
        String listenerId = KafkaConstants.LISTENER_PREFIX + topicId;

        topicControlService.pause(topicId, properties.getBizSystem());

        return buildResponse(listenerId, topicId, "PAUSE", "토픽 PAUSE 명령 발행 완료 (DB UPDATE + control publish)");
    }

    /**
     * Phase 6: STATUS=RUNNING 으로 UPDATE + ERROR_* NULL + control RESUME publish.
     *
     * <p>ERROR 진입 (Phase 5) 했던 토픽도 본 API 로 정상화. 마지막 fail 했던 메시지부터
     * 재처리되며, 다시 fail 시 자동 ERROR 재진입.</p>
     *
     * <h4>요청 본문</h4>
     * <pre>{@code {"topicId": "my-topic"}}</pre>
     *
     * @param param 요청 파라미터 ({@code topicId} 필수)
     * @return 처리 결과
     */
    @PostMapping("/resume")
    public Map<String, Object> resume(@RequestBody Map<String, String> param) {
        String topicId = param.get("topicId");
        String listenerId = KafkaConstants.LISTENER_PREFIX + topicId;

        topicControlService.resume(topicId, properties.getBizSystem());

        return buildResponse(listenerId, topicId, "RESUME", "토픽 RESUME 명령 발행 완료 (DB UPDATE + control publish)");
    }

    /**
     * Phase 6-ext: STATUS='RUNNING' + ERROR_* NULL 로 UPDATE + control START publish (LB-safe broadcast).
     *
     * <p>RESUME 의 super-set 동작 — ControlTopicListener.ensureStarted 가:
     * <ul>
     *   <li>컨테이너 미존재 → {@code createConsumer} 로 신규 등록 (런타임 토픽 동적 등록 지원)</li>
     *   <li>STOPPED → start, PAUSED → resume, RUNNING → noop</li>
     * </ul>
     * pause/resume/stop 과 동일한 broadcast 패턴 — DB UPDATE + control 토픽 publish 로 LB 뒤 모든 인스턴스 동기화.</p>
     *
     * <h4>요청 본문</h4>
     * <pre>{@code {"topicId": "my-topic"}}</pre>
     *
     * <p>URL 이 {@code /startConsumer} 인 것은 0.1.x 호환(caravan-console CaravanApiClient 가 action="start" 를
     * "startConsumer" 로 remap). 동작은 pause/resume/stop 과 대칭.</p>
     *
     * @param param 요청 파라미터 ({@code topicId} 필수)
     * @return 처리 결과 (listenerId, topicId, action="START", success, message)
     */
    @PostMapping("/startConsumer")
    public Map<String, Object> startConsumer(@RequestBody Map<String, String> param) {
        String topicId = param.get("topicId");
        String listenerId = KafkaConstants.LISTENER_PREFIX + topicId;

        topicControlService.start(topicId, properties.getBizSystem());

        return buildResponse(listenerId, topicId, "START",
                "토픽 START 명령 발행 완료 (DB UPDATE + control publish — LB-safe broadcast)");
    }

    /**
     * 지정된 개수만큼 Offset을 스킵합니다.
     *
     * <p>특정 메시지가 계속 처리 실패하여 컨테이너가 일시정지된 경우,
     * 해당 메시지를 건너뛰고 다음 메시지부터 처리하도록 합니다.</p>
     *
     * <h4>요청 본문</h4>
     * <pre>{@code
     * {
     *   "topicId": "my-topic",
     *   "groupId": "my-group",
     *   "count": 1  // 기본값: 1
     * }
     * }</pre>
     *
     * <h4>주의사항</h4>
     * <ul>
     *   <li>스킵된 메시지는 처리되지 않고 유실됩니다.</li>
     *   <li>스킵 전후로 컨테이너가 자동으로 정지/재시작됩니다.</li>
     * </ul>
     *
     * @param param 요청 파라미터 ({@code topicId}, {@code groupId} 필수, {@code count} 선택)
     * @return 처리 결과 (beforeCurrentOffset, afterCurrentOffset, maxOffset 포함)
     */
    @PostMapping("/skipOffset")
    public Map<String, Object> skipOffset(@RequestBody Map<String, Object> param) {
        String topicId = (String) param.get("topicId");
        String groupId = (String) param.get("groupId");
        int count = param.containsKey("count") ? ((Number) param.get("count")).intValue() : 1;
        String listenerId = KafkaConstants.LISTENER_PREFIX + topicId;

        OffsetInfo offsetInfo = offsetManager.skipOffset(listenerId, groupId, topicId, count);

        Map<String, Object> result = buildResponse(listenerId, topicId, "SKIP_OFFSET", "OFFSET SKIP 완료");
        result.put("groupId", groupId);
        result.put("beforeCurrentOffset", offsetInfo.getBeforeOffset());
        result.put("beforeMaxOffset", offsetInfo.getBeforeMaxOffset());
        result.put("afterCurrentOffset", offsetInfo.getAfterOffset());
        result.put("afterMaxOffset", offsetInfo.getAfterMaxOffset());

        return result;
    }

    /**
     * 시간 범위로 Kafka 메시지를 조회합니다.
     *
     * <p>지정된 시간 범위 내의 메시지를 조회합니다. 디버깅이나 메시지 확인 용도로 사용합니다.</p>
     *
     * <h4>요청 예시</h4>
     * <pre>{@code
     * GET /kafkaApi/browse?topicId=my-topic&fromTimestamp=1704067200000&toTimestamp=1704153600000&maxCount=50
     * }</pre>
     *
     * <h4>응답 형식 (cactus-dmesfw 호환)</h4>
     * <pre>{@code
     * [{"TOPIC":"...", "TRANSACTION_CODE":"...", "KAFKA_KEYDATA":"...",
     *   "PARTITION":0, "OFFSET":100, "TIMESTAMP":"2024-01-01 10:00:00",
     *   "KEY":"...", "VALUE":"... (pretty-printed)"}]
     * }</pre>
     *
     * @param topicId       조회할 토픽 ID
     * @param fromTimestamp 시작 시간 (Unix Epoch milliseconds)
     * @param toTimestamp   끝 시간 (Unix Epoch milliseconds)
     * @param maxCount      최대 조회 건수 (기본값: 100)
     * @return 조회된 메시지 목록
     */
    @GetMapping("/browse")
    public List<Map<String, Object>> browseMessages(
            @RequestParam String topicId,
            @RequestParam long fromTimestamp,
            @RequestParam long toTimestamp,
            @RequestParam(defaultValue = "100") int maxCount) {

        List<BrowseResult> results = messageBrowser.browseByTimeRange(topicId, fromTimestamp, toTimestamp, maxCount);
        List<Map<String, Object>> response = new ArrayList<>();

        for (BrowseResult br : results) {
            response.add(toBrowseMap(br));
        }

        return response;
    }

    /**
     * 특정 Offset의 메시지를 조회합니다.
     *
     * <p>지정된 Offset의 단일 메시지를 조회합니다. 에러 발생 메시지 확인 등에 유용합니다.</p>
     *
     * <h4>요청 예시</h4>
     * <pre>{@code
     * GET /kafkaApi/peekOffset?topicId=my-topic&offset=105
     * }</pre>
     *
     * <h4>응답 예시 (cactus-dmesfw 호환)</h4>
     * <pre>{@code
     * {
     *   "topicId": "my-topic",
     *   "offset": 105,
     *   "found": true,
     *   "message": "{\"TRANSACTION_CODE\":\"...\", ...}"
     * }
     * }</pre>
     *
     * @param topicId 조회할 토픽 ID
     * @param offset  조회할 Offset
     * @return 조회 결과 (found 여부 및 메시지 value 문자열)
     */
    @GetMapping("/peekOffset")
    public Map<String, Object> peekOffset(
            @RequestParam String topicId,
            @RequestParam long offset) {

        Optional<BrowseResult> result = messageBrowser.peekAtOffset(topicId, offset);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("topicId", topicId);
        response.put("offset", offset);

        if (result.isPresent()) {
            response.put("found", true);
            response.put("message", result.get().getValue());
        } else {
            response.put("found", false);
            response.put("message", null);
        }

        return response;
    }

    /**
     * BrowseResult → cactus-dmesfw 호환 UPPERCASE Map 변환
     */
    private Map<String, Object> toBrowseMap(BrowseResult br) {
        Map<String, Object> row = new LinkedHashMap<>();

        // TRANSACTION_CODE, KAFKA_KEYDATA 파싱
        String tcCode = "";
        String kafkaKeyData = "";
        String prettyValue = br.getValue();

        try {
            if (br.getValue() != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> valueMap = OBJECT_MAPPER.readValue(br.getValue(), Map.class);
                tcCode = valueMap.get("TRANSACTION_CODE") != null
                        ? String.valueOf(valueMap.get("TRANSACTION_CODE")) : "";
                kafkaKeyData = valueMap.get("KAFKA_KEYDATA") != null
                        ? String.valueOf(valueMap.get("KAFKA_KEYDATA")) : "";
                prettyValue = PRETTY_WRITER.writeValueAsString(valueMap);
            }
        } catch (Exception e) {
            // JSON 파싱 실패 시 원본 유지
        }

        row.put("TOPIC", br.getTopic());
        row.put("TRANSACTION_CODE", tcCode);
        row.put("KAFKA_KEYDATA", kafkaKeyData);
        row.put("PARTITION", br.getPartition());
        row.put("OFFSET", br.getOffset());
        row.put("TIMESTAMP", TS_FORMAT.format(Instant.ofEpochMilli(br.getTimestamp())));
        row.put("KEY", br.getKey());
        row.put("VALUE", prettyValue);

        return row;
    }

    private Map<String, Object> buildResponse(String listenerId, String topicId,
                                               String action, String message) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("listenerId", listenerId);
        result.put("topicId", topicId);
        result.put("action", action);
        result.put("isRunning", containerController.getStatus(listenerId) == ContainerStatus.RUNNING);
        result.put("isPaused", containerController.getStatus(listenerId) == ContainerStatus.PAUSED);
        result.put("success", true);
        result.put("message", message);
        return result;
    }
}
