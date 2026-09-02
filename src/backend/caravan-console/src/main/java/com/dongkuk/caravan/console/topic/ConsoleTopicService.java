package com.dongkuk.caravan.console.topic;

import com.dongkuk.caravan.console.consumer.ConsoleConsumerControlService;
import com.dongkuk.caravan.console.consumer.dto.ConsumerControlRequest;
import com.dongkuk.caravan.console.consumer.dto.OffsetSkipRequest;
import com.dongkuk.caravan.console.consumer.dto.OffsetSkipResponse;
import com.dongkuk.caravan.console.consumer.dto.SendTestRequest;
import com.dongkuk.caravan.console.exception.ConsoleException;
import com.dongkuk.caravan.console.host.AppHostService;
import com.dongkuk.caravan.console.message.ConsoleMessageService;
import com.dongkuk.caravan.console.message.dto.MessageResponse;
import com.dongkuk.caravan.console.proxy.CaravanApiClient;
import com.dongkuk.caravan.console.caravanhub.ConsoleCaravanHubClient;
import com.dongkuk.caravan.console.caravanhub.ConsoleCaravanHubSendResult;
import com.dongkuk.caravan.console.topic.dto.PeekRequest;
import com.dongkuk.caravan.console.topic.dto.TopicSearchRequest;
import com.dongkuk.caravan.console.topic.dto.TopicStatusResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

/**
 * 토픽 관리(topic) OASIS 서비스 — 8 action 집약 진입 빈.
 *
 * <p>OASIS 진입: {@code services/caravanConsole/topic.bpmn} 의 serviceTask {@code camunda:class="topicService"} 가
 * 8 메서드(search/pause/resume/stop/start/skipOffset/sendTest/peekFromOffset) 를 호출. 데이터/제어 로직은
 * 기존 caravan-console 빈({@link ConsoleConsumerControlService}/{@link ConsoleMessageService}/{@link ConsoleCaravanHubClient})에 위임.
 * (가이드 §6-B-1 — 진입 메서드 무 @Transactional. 본 화면은 DB 쓰기 없음 — 전부 Caravan/caravan-hub 외부 위임.)</p>
 *
 * <p>화면 성격 = Command(조회 + 컨슈머 제어). 토픽 자체 CRUD(saveTopics)는 본 화면 action 제외(Q-001, 별도 화면).</p>
 * <p>호스트 매핑: {@link AppHostService} (TB_CARAVAN_APPHOST SoT). 토픽 메타: caravan TB_CARAVAN_TOPICS read-only.</p>
 */
@Service("topicService")
public class ConsoleTopicService {

    private static final Logger log = LoggerFactory.getLogger(ConsoleTopicService.class);

    private final ConsoleTopicInfoJpaRepository consoleTopicInfoJpaRepository;
    private final AppHostService appHostService;
    private final CaravanApiClient caravanApiClient;
    private final ConsoleConsumerControlService consumerControlService;
    private final ConsoleMessageService messageService;
    private final ObjectProvider<ConsoleCaravanHubClient> caravanHubClientProvider;

    public ConsoleTopicService(ConsoleTopicInfoJpaRepository consoleTopicInfoJpaRepository,
                           AppHostService appHostService,
                           CaravanApiClient caravanApiClient,
                           ConsoleConsumerControlService consumerControlService,
                           ConsoleMessageService messageService,
                           ObjectProvider<ConsoleCaravanHubClient> caravanHubClientProvider) {
        this.consoleTopicInfoJpaRepository = consoleTopicInfoJpaRepository;
        this.appHostService = appHostService;
        this.caravanApiClient = caravanApiClient;
        this.consumerControlService = consumerControlService;
        this.messageService = messageService;
        this.caravanHubClientProvider = caravanHubClientProvider;
    }

    // ─────────────────────────── OASIS 진입 메서드 (8 action) ───────────────────────────

    /** 조회 (BPMN action=search) — 토픽 목록 + 실시간 상태. */
    public Map<String, Object> search(TopicSearchRequest request) {
        List<TopicStatusResponse> list = getTopicsWithStatus(request);
        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("cnt", list.size());
        return result;
    }

    /** 컨슈머 일시중지 (BPMN action=pause). */
    public Map<String, Object> pause(ConsumerControlRequest request) {
        return consumerControlService.control(request.getTopicId(), "pause", request);
    }

    /** 컨슈머 재개 (BPMN action=resume). */
    public Map<String, Object> resume(ConsumerControlRequest request) {
        return consumerControlService.control(request.getTopicId(), "resume", request);
    }

    /** 컨슈머 정지 (BPMN action=stop). */
    public Map<String, Object> stop(ConsumerControlRequest request) {
        return consumerControlService.control(request.getTopicId(), "stop", request);
    }

    /** 컨슈머 가동 (BPMN action=start). Q-002: start LB-unsafe(deprecated) — As-Is 보존. */
    public Map<String, Object> start(ConsumerControlRequest request) {
        return consumerControlService.control(request.getTopicId(), "start", request);
    }

    /** 오프셋 스킵 (BPMN action=skipOffset) — broker commit offset 영구 변경(BR-009). caravan 자체 검증(Q-003). */
    public Map<String, Object> skipOffset(OffsetSkipRequest request) {
        OffsetSkipResponse r = consumerControlService.skipOffset(request.getTopicId(), request);
        Map<String, Object> result = new HashMap<>();
        result.put("topicId", r.getTopicId());
        result.put("groupId", r.getGroupId());
        result.put("beforeOffset", r.getBeforeOffset());
        result.put("afterOffset", r.getAfterOffset());
        result.put("maxOffset", r.getMaxOffset());
        result.put("success", r.isSuccess());
        result.put("message", r.getMessage());
        return result;
    }

    /** 테스트 메시지 발행 (BPMN action=sendTest) — 운영 토픽 실제 발행(BR-010). caravan-hub 미설정 차단(Q-004). */
    public Map<String, Object> sendTest(SendTestRequest request) {
        ConsoleCaravanHubClient client = caravanHubClientProvider.getIfAvailable();
        if (client == null) {
            throw new ConsoleException("ConsoleCaravanHubClient 빈 미등록 — caravan-hub 연동 환경(caravan-console.caravanhub.enabled=true)에서만 동작");
        }
        ConsoleCaravanHubSendResult result = client.send(
                request.getTopicId(), request.getTransactionCode(), request.getInterfaceMsg());
        if (!result.isSuccess()) {
            throw new ConsoleException("caravan-hub 발행 실패: " + result.errorMessage());
        }
        Map<String, Object> out = new HashMap<>();
        out.put("kafkaKeyData", result.kafkaKeyData() != null ? result.kafkaKeyData() : "");
        return out;
    }

    /** 오프셋 미리보기 (BPMN action=peekFromOffset) — 조회만. message 화면과 공유하는 ConsoleMessageService 위임. */
    public Map<String, Object> peekFromOffset(PeekRequest request) {
        List<MessageResponse> list = messageService.getMessagesFromOffset(request.getTopicId(), request.getOffset());
        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("cnt", list.size());
        return result;
    }

    /**
     * 토픽 저장 (BPMN action=save) — rowStatus C/U/D fan-out 적용 후 자동 재조회.
     *
     * <p>{@code master} = grids.master.rows 자동 바인딩. 반환 = Map { list, cnt, cnt_save }.
     * 가이드 §6-B-1: 진입 메서드 {@code @Transactional} 금지 — 쓰기는 caravan API fan-out
     * (원자성은 caravan 측 {@code TopicSyncService @Transactional}) 이라 로컬 트랜잭션 불요.</p>
     */
    public Map<String, Object> save(TopicSearchRequest request, List<Map<String, Object>> master) {
        int cntSave = saveTopics(master);
        Map<String, Object> result = search(request);
        result.put("cnt_save", cntSave);
        return result;
    }

    // ─────────────────────────── 데이터 접근 로직 (As-Is 보존) ───────────────────────────

    /** 토픽 목록 + 실시간 상태 조회 (호스트별 caravan API 합성). */
    public List<TopicStatusResponse> getTopicsWithStatus(TopicSearchRequest request) {
        // 1. 자체 spec 으로 search
        Specification<ConsoleTopicInfoEntity> spec = Specification
                .where(ConsoleTopicInfoSpecification.topicIdLike(request.getTopicId()))
                .and(ConsoleTopicInfoSpecification.bizSystemEquals(request.getBizSystem()))
                .and(ConsoleTopicInfoSpecification.sendModuleIdEquals(request.getSendModuleId()))
                .and(ConsoleTopicInfoSpecification.recvModuleIdEquals(request.getRecvModuleId()));
        List<ConsoleTopicInfoEntity> topics = consoleTopicInfoJpaRepository.findAll(spec, Sort.by("topicId"));

        // 2. 호스트별 그룹핑 → 한 번씩만 caravan API 호출 (호스트 단위 1회)
        Map<String, String> hostUrlMap = appHostService.getHostUrlMap();
        Map<String, Map<String, Map<String, Object>>> hostStatusMap = new HashMap<>();
        topics.stream()
                .filter(t -> hostUrlMap.containsKey(t.getBizSystem()))
                .collect(Collectors.groupingBy(t -> hostUrlMap.get(t.getBizSystem())))
                .forEach((hostUrl, list) -> {
                    List<Map<String, Object>> statusList = caravanApiClient.getStatus(hostUrl, null);
                    if (statusList != null) {
                        Map<String, Map<String, Object>> byTopicId = statusList.stream()
                                .filter(s -> s.get("TOPIC_ID") != null)
                                .collect(Collectors.toMap(
                                        s -> (String) s.get("TOPIC_ID"),
                                        s -> s,
                                        (a, b) -> a));
                        hostStatusMap.put(hostUrl, byTopicId);
                    }
                });

        // 3. 결과 조립 + status 보강
        List<TopicStatusResponse> result = new ArrayList<>(topics.size());
        for (ConsoleTopicInfoEntity topic : topics) {
            TopicStatusResponse response = buildBase(topic);
            String hostUrl = hostUrlMap.get(topic.getBizSystem());
            enrichWithStatus(response, hostUrl, hostStatusMap);
            result.add(response);
        }
        return result;
    }

    /**
     * 토픽 일괄 저장 — caravan API fan-out only. caravan-console 자체 INSERT/UPDATE/DELETE 없음.
     * (Q-001 로 제외했던 save 액션을 2026-07-09 사용자 요청으로 본 화면에 활성 —
     * C=createTopic(DB+Kafka), U=updateTopic(DB 메타만, caravan PUT), D=deleteTopic(DB+Kafka).)
     *
     * <p>행 키는 가이드 §8-5/§9-3 표준 {@code rowStatus}(C/U/D) — appHost save 와 동일.</p>
     *
     * @return 적용 건수
     */
    public int saveTopics(List<Map<String, Object>> changes) {
        if (changes == null) {
            return 0;
        }
        int cnt = 0;
        for (Map<String, Object> change : changes) {
            String rowStatus = (String) change.get("rowStatus");
            if (rowStatus == null) continue;
            String topicId = (String) change.get("topicId");
            String bizSystem = (String) change.get("bizSystem");
            String hostUrl = appHostService.getHostUrl(bizSystem);

            switch (rowStatus) {
                case "C" -> {
                    caravanApiClient.createTopic(hostUrl, buildMetaRequest(change));
                    cnt++;
                }
                case "U" -> {
                    caravanApiClient.updateTopic(hostUrl, buildMetaRequest(change));
                    cnt++;
                }
                case "D" -> {
                    caravanApiClient.deleteTopic(hostUrl, topicId, bizSystem);
                    cnt++;
                }
                default -> log.warn("[ConsoleTopicService] 알 수 없는 rowStatus={}, 무시", rowStatus);
            }
        }
        return cnt;
    }

    /** caravan {@code POST/PUT /kafkaApi/topics} body (C/U 공용 — 메타 필드 + useYn→useTp 매핑). */
    private Map<String, Object> buildMetaRequest(Map<String, Object> change) {
        Map<String, Object> req = new HashMap<>();
        req.put("topicId", change.get("topicId"));
        req.put("bizSystem", change.get("bizSystem"));
        req.put("topicDesc", change.get("topicDesc"));
        req.put("groupId", change.get("groupId"));
        req.put("sendModuleId", change.get("sendModuleId"));
        req.put("recvModuleId", change.get("recvModuleId"));
        Object useYn = change.get("useYn");
        req.put("useTp", useYn != null ? useYn : "Y");
        return req;
    }

    private TopicStatusResponse buildBase(ConsoleTopicInfoEntity topic) {
        return TopicStatusResponse.builder()
                .topicId(topic.getTopicId())
                .topicDesc(topic.getTopicDesc())
                .groupId(topic.getGroupId())
                .bizSystem(topic.getBizSystem())
                .sendModuleId(topic.getSendModuleId())
                .recvModuleId(topic.getRecvModuleId())
                .useYn(topic.getUseTp())
                .build();
    }

    private void enrichWithStatus(TopicStatusResponse response, String hostUrl,
                                   Map<String, Map<String, Map<String, Object>>> hostStatusMap) {
        String topicId = response.getTopicId();

        // primary: host status map hit
        if (hostUrl != null && hostStatusMap.containsKey(hostUrl)) {
            Map<String, Object> s = hostStatusMap.get(hostUrl).get(topicId);
            if (s != null) {
                response.setContainerStatus(String.valueOf(s.getOrDefault("CONTAINER_STATUS", "UNKNOWN")));
                long cur = toLong(s.get("CURRENT_OFFSET"));
                long max = toLong(s.get("MAX_OFFSET"));
                response.setCurrentOffset(cur);
                response.setMaxOffset(max);
                response.setLag(toLong(s.get("LAG")));
                return;
            }
        }

        // fallback (BR-007): caravan 미응답 → UNKNOWN
        response.setContainerStatus("UNKNOWN");
    }

    private long toLong(Object value) {
        if (value == null) return 0L;
        if (value instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(value)); }
        catch (NumberFormatException e) { return 0L; }
    }
}
