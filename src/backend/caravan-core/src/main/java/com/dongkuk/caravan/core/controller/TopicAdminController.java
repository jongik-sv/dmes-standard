package com.dongkuk.caravan.core.controller;

import com.dongkuk.caravan.core.entity.TopicInfoEntity;
import com.dongkuk.caravan.core.entity.TopicInfoId;
import com.dongkuk.caravan.core.service.TopicSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 토픽 메타와 Kafka 브로커 토픽을 동기화하는 관리 REST API.
 *
 * <table border="1">
 *   <tr><th>메서드</th><th>URL</th><th>설명</th></tr>
 *   <tr><td>POST</td><td>/kafkaApi/topics</td><td>DB INSERT + Kafka 토픽(+DLT) 생성</td></tr>
 *   <tr><td>PUT</td><td>/kafkaApi/topics</td><td>DB UPDATE (메타 5필드 — Kafka 불변)</td></tr>
 *   <tr><td>DELETE</td><td>/kafkaApi/topics</td><td>DB DELETE + Kafka 토픽(+DLT) 삭제</td></tr>
 * </table>
 */
@Slf4j
@RestController
@RequestMapping("/kafkaApi/topics")
@RequiredArgsConstructor
public class TopicAdminController {

    private final TopicSyncService topicSyncService;

    /**
     * 토픽 생성. body 예시:
     * <pre>{@code
     * {
     *   "topicId": "MMPPMERPTT01",
     *   "bizSystem": "caravan-hub",
     *   "groupId": "caravan-hub-group-01",
     *   "topicDesc": "PQR 거래용",
     *   "sendModuleId": "MPP",
     *   "recvModuleId": "MERP",
     *   "useTp": "Y",
     *   "status": "ACTIVE"
     * }
     * }</pre>
     */
    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, String> body) {
        String topicId = required(body, "topicId");
        String bizSystem = required(body, "bizSystem");
        // GROUP_ID 는 NOT NULL 이다. Oracle 은 빈 문자열을 NULL 로 저장하므로 빈 값은 DB 오류(ORA-01400) 대신 여기서 막는다.
        String groupId = required(body, "groupId");

        TopicInfoEntity entity = TopicInfoEntity.builder()
                .topicId(topicId)
                .bizSystem(bizSystem)
                .groupId(groupId)
                .topicDesc(body.get("topicDesc"))
                .sendModuleId(body.get("sendModuleId"))
                .recvModuleId(body.get("recvModuleId"))
                .useTp(body.getOrDefault("useTp", "Y"))
                .status(body.get("status"))
                .build();

        topicSyncService.createTopic(entity);

        return response("CREATE", topicId, bizSystem, "토픽 생성 완료 (DB INSERT + Kafka)");
    }

    /**
     * 토픽 메타 수정 (토픽 관리 화면 rowStatus=U). body 는 create 와 동일 형식 —
     * PK(topicId/bizSystem)로 찾고 메타 5필드(topicDesc/groupId/sendModuleId/recvModuleId/useTp)만 갱신.
     * Kafka broker 토픽은 불변(토픽명=PK)이라 DB UPDATE 만 수행한다.
     */
    @PutMapping
    public Map<String, Object> update(@RequestBody Map<String, String> body) {
        String topicId = required(body, "topicId");
        String bizSystem = required(body, "bizSystem");

        topicSyncService.updateTopicMeta(new TopicInfoId(topicId, bizSystem),
                body.get("topicDesc"), body.get("groupId"),
                body.get("sendModuleId"), body.get("recvModuleId"), body.get("useTp"));

        return response("UPDATE", topicId, bizSystem, "토픽 메타 수정 완료 (DB UPDATE)");
    }

    /**
     * 토픽 삭제. body 예시:
     * <pre>{@code
     * {"topicId": "MMPPMERPTT01", "bizSystem": "caravan-hub"}
     * }</pre>
     */
    @DeleteMapping
    public Map<String, Object> delete(@RequestBody Map<String, String> body) {
        String topicId = required(body, "topicId");
        String bizSystem = required(body, "bizSystem");

        topicSyncService.deleteTopic(new TopicInfoId(topicId, bizSystem));

        return response("DELETE", topicId, bizSystem, "토픽 삭제 완료 (DB DELETE + Kafka)");
    }

    private String required(Map<String, String> body, String key) {
        String value = body.get(key);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(key + " is required");
        }
        return value;
    }

    private Map<String, Object> response(String action, String topicId, String bizSystem, String message) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("action", action);
        r.put("topicId", topicId);
        r.put("bizSystem", bizSystem);
        r.put("success", true);
        r.put("message", message);
        return r;
    }
}
