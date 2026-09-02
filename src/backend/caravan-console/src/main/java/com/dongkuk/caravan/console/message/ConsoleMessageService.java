package com.dongkuk.caravan.console.message;

import com.dongkuk.caravan.console.config.ConsoleProperties;
import com.dongkuk.caravan.console.exception.ConsoleException;
import com.dongkuk.caravan.console.host.AppHostService;
import com.dongkuk.caravan.console.message.dto.MessageFromOffsetRequest;
import com.dongkuk.caravan.console.message.dto.MessageResponse;
import com.dongkuk.caravan.console.message.dto.MessageSearchRequest;
import com.dongkuk.caravan.console.proxy.CaravanApiClient;
import com.dongkuk.caravan.console.topic.ConsoleTopicInfoEntity;
import com.dongkuk.caravan.console.topic.ConsoleTopicInfoJpaRepository;
import com.dongkuk.caravan.console.topic.ConsoleTopicInfoSpecification;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

/**
 * 메시지 모니터 서비스 — v3 재플랜.
 *
 * <p>v2 → v3 변경:</p>
 * <ul>
 *   <li>caravan {@code TopicInfoJpaRepository} / {@code TopicInfoSpecification} →
 *       caravan-console 자체 {@link ConsoleTopicInfoJpaRepository} / {@link ConsoleTopicInfoSpecification}
 *       (caravan {@code TB_CARAVAN_TOPICS} read-only 매핑).</li>
 *   <li>caravan {@code MessageBrowser.browseByTimeRange} / {@code peekAtOffset} →
 *       {@link CaravanApiClient#browseMessages} / {@link CaravanApiClient#peekOffset} REST 위임
 *       (각 모듈 WAS {@code /kafkaApi/browse} + {@code /kafkaApi/peekOffset}).</li>
 *   <li>caravan {@code KafkaGroupQueryService.describe} → {@link CaravanApiClient#getStatus}
 *       (모듈 WAS 의 {@code /kafkaApi/status} 응답에 currentOffset/maxOffset 포함). 폴백 — caravan 의존 제거
 *       (2026-05-12) 로 제거. ConsoleCaravanHubClient 도입 시 caravan-hub API 응답으로 복구 예정.</li>
 * </ul>
 *
 * <p>호스트 매핑: {@link AppHostService}. 메시지 상태 판별 로직은 caravan-console 원본 SearchKafkaMessageList
 * 의 분기 그대로 보존 (WAIT/DONE/PROCESSING/ERROR/UNKNOWN).</p>
 */
@Service("messageService")
@Slf4j
public class ConsoleMessageService {

    private final ConsoleTopicInfoJpaRepository consoleTopicInfoJpaRepository;
    private final AppHostService appHostService;
    private final CaravanApiClient caravanApiClient;
    private final ConsoleProperties consoleProperties;

    private static final DateTimeFormatter DT_FORMAT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    public ConsoleMessageService(ConsoleTopicInfoJpaRepository consoleTopicInfoJpaRepository,
                             AppHostService appHostService,
                             CaravanApiClient caravanApiClient,
                             ConsoleProperties consoleProperties) {
        this.consoleTopicInfoJpaRepository = consoleTopicInfoJpaRepository;
        this.appHostService = appHostService;
        this.caravanApiClient = caravanApiClient;
        this.consoleProperties = consoleProperties;
    }

    // ─────────────────────────── OASIS 진입 메서드 ───────────────────────────

    /** 조회 (BPMN action=search) — searchMessages 위임. Map{list,cnt} → data.result. */
    public Map<String, Object> search(MessageSearchRequest request) {
        List<MessageResponse> list = searchMessages(request);
        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("cnt", list.size());
        return result;
    }

    /** 오프셋 미리보기 (BPMN action=fromOffset, Q-001) — getMessagesFromOffset 위임(topic 화면 공유 메서드 보존). */
    public Map<String, Object> fromOffset(MessageFromOffsetRequest request) {
        List<MessageResponse> list = getMessagesFromOffset(request.getTopicId(), request.getOffset());
        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("cnt", list.size());
        return result;
    }

    /** 메시지 목록 조회 + 상태 판별. */
    public List<MessageResponse> searchMessages(MessageSearchRequest request) {
        List<String> topicIds = splitToList(request.getTopicIds());
        List<String> sendModuleIds = splitToList(request.getSendModuleIds());
        List<String> recvModuleIds = splitToList(request.getRecvModuleIds());

        Specification<ConsoleTopicInfoEntity> spec = Specification
                .where(ConsoleTopicInfoSpecification.useTpEquals("Y"))
                .and(ConsoleTopicInfoSpecification.topicIdIn(topicIds))
                .and(ConsoleTopicInfoSpecification.sendModuleIdIn(sendModuleIds))
                .and(ConsoleTopicInfoSpecification.recvModuleIdIn(recvModuleIds));
        List<ConsoleTopicInfoEntity> topics = consoleTopicInfoJpaRepository.findAll(spec, Sort.by("topicId"));

        Map<String, String> hostUrlMap = appHostService.getHostUrlMap();
        long fromTs = parseTimestamp(request.getDateFrom(), 0L,             false);
        long toTs   = parseTimestamp(request.getDateTo(),   Long.MAX_VALUE, true);
        List<String> statusFilter = splitToList(request.getMessageStatus());
        int maxBrowseCount = consoleProperties.message().maxBrowseCount();

        List<MessageResponse> result = new ArrayList<>();
        for (ConsoleTopicInfoEntity topic : topics) {
            String tid = topic.getTopicId();
            String groupId = topic.getGroupId();
            String hostUrl = hostUrlMap.get(topic.getBizSystem());

            TopicStatus status = getTopicStatus(tid, groupId, hostUrl);
            List<MessageResponse> messages = browseMessages(tid, hostUrl, fromTs, toTs, maxBrowseCount);

            for (MessageResponse msg : messages) {
                String messageStatus = determineMessageStatus(
                        msg.getOffset(), status.currentOffset(), status.containerStatus(),
                        msg.getKafkaKeyData(), tid, hostUrl);

                msg.setMessageStatus(messageStatus);
                msg.setContainerStatus(status.containerStatus());
                msg.setCurrentOffset(status.currentOffset());
                msg.setMaxOffset(status.maxOffset());
                msg.setTopicDesc(topic.getTopicDesc());
                msg.setSendModuleId(topic.getSendModuleId());
                msg.setRecvModuleId(topic.getRecvModuleId());

                if (statusFilter.isEmpty() || statusFilter.contains(messageStatus)) {
                    result.add(msg);
                }
            }
        }
        return result;
    }

    /** 특정 offset 단건 peek (OffsetControlModal 용). */
    public List<MessageResponse> getMessagesFromOffset(String topicId, long offset) {
        ConsoleTopicInfoEntity topic = consoleTopicInfoJpaRepository.findAll().stream()
                .filter(t -> topicId.equals(t.getTopicId()))
                .findFirst()
                .orElseThrow(() -> new ConsoleException("토픽 미등록: " + topicId));
        String hostUrl = appHostService.getHostUrl(topic.getBizSystem());

        Map<String, Object> peek = caravanApiClient.peekOffset(hostUrl, topicId, offset);
        if (peek == null || !Boolean.TRUE.equals(peek.get("found"))) {
            return List.of();
        }
        return List.of(toMessageResponseFromPeek(topicId, offset, peek));
    }

    /** 메시지 상태 판별 (caravan-console SearchKafkaMessageList 분기 보존). */
    private String determineMessageStatus(long msgOffset, long currentOffset,
                                           String containerStatus, String kafkaKeyData,
                                           String topicId, String hostUrl) {
        if (msgOffset > currentOffset) return "WAIT";
        if (msgOffset < currentOffset) return "DONE";
        if (containerStatus == null) return "UNKNOWN";
        return switch (containerStatus.toUpperCase()) {
            case "RUN", "RUNNING" -> "PROCESSING";
            case "PAUSE", "PAUSED", "STOP", "STOPPED" -> checkDltError(kafkaKeyData, topicId, hostUrl);
            default -> "UNKNOWN";
        };
    }

    /** DLT 에러 체크 — caravan API peekOffset (DLT 마지막 메시지) + KAFKA_KEYDATA 매칭. */
    private String checkDltError(String kafkaKeyData, String topicId, String hostUrl) {
        try {
            String dltTopic = topicId + ".dlt";

            // primary: caravan API getStatus 로 DLT maxOffset
            // fallback (broker AdminClient 직접) — caravan 의존 제거 (2026-05-12) 로 제거. ConsoleCaravanHubClient 도입 시 caravan-hub API 로 복구 예정.
            Long dltMaxOffset = null;
            if (hostUrl != null && !hostUrl.isBlank()) {
                List<Map<String, Object>> statusList = caravanApiClient.getStatus(hostUrl, dltTopic);
                if (statusList != null && !statusList.isEmpty()) {
                    dltMaxOffset = toLong(statusList.get(0).get("MAX_OFFSET"));
                }
            }
            if (dltMaxOffset == null) {
                return "WAIT"; // primary 미응답 시 보수적 처리
            }
            long lastMsgOffset = dltMaxOffset - 1;
            if (lastMsgOffset < 0) {
                return "WAIT";
            }

            // DLT 마지막 메시지 peek
            if (hostUrl != null && !hostUrl.isBlank()) {
                Map<String, Object> peek = caravanApiClient.peekOffset(hostUrl, dltTopic, lastMsgOffset);
                if (peek != null && Boolean.TRUE.equals(peek.get("found"))) {
                    String msgValue = (String) peek.get("message");
                    return compareDltKeyData(kafkaKeyData, msgValue);
                }
            }
            return "WAIT";
        } catch (Exception e) {
            log.warn("DLT 체크 실패 - topic: {}", topicId, e);
            return "UNKNOWN";
        }
    }

    private String compareDltKeyData(String expectedKeyData, String dltMessageValue) {
        if (dltMessageValue == null) return "WAIT";
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> valueMap = OBJECT_MAPPER.readValue(dltMessageValue, Map.class);
            Object dltKeyData = valueMap.get("KAFKA_KEYDATA");
            if (dltKeyData != null && expectedKeyData != null
                    && expectedKeyData.equals(String.valueOf(dltKeyData))) {
                return "ERROR";
            }
        } catch (Exception e) {
            log.debug("DLT 메시지 value JSON 파싱 실패");
        }
        return "WAIT";
    }

    private TopicStatus getTopicStatus(String topicId, String groupId, String hostUrl) {
        // primary: caravan API getStatus → CONTAINER_STATUS / CURRENT_OFFSET / MAX_OFFSET
        if (hostUrl != null && !hostUrl.isBlank()) {
            try {
                List<Map<String, Object>> statusList = caravanApiClient.getStatus(hostUrl, topicId);
                if (statusList != null && !statusList.isEmpty()) {
                    Map<String, Object> s = statusList.get(0);
                    return new TopicStatus(
                            String.valueOf(s.getOrDefault("CONTAINER_STATUS", "UNKNOWN")),
                            toLong(s.get("CURRENT_OFFSET")),
                            toLong(s.get("MAX_OFFSET")));
                }
            } catch (Exception e) {
                log.warn("getStatus 실패, 폴백 - topic: {}, host: {}", topicId, hostUrl);
            }
        }
        // fallback: caravan 의존 제거 (2026-05-12) 로 broker AdminClient 직접 호출 제거.
        // ConsoleCaravanHubClient 도입 시 caravan-hub API 응답으로 복구 예정.
        return new TopicStatus("UNKNOWN", 0L, 0L);
    }

    /** 시간범위 메시지 브라우즈 — caravan API only (host null 시 빈 배열). */
    private List<MessageResponse> browseMessages(String topicId, String hostUrl,
                                                   long fromTs, long toTs, int maxCount) {
        if (hostUrl == null || hostUrl.isBlank()) {
            log.warn("hostUrl 미등록 — browse skip topic: {}", topicId);
            return List.of();
        }
        List<Map<String, Object>> rows = caravanApiClient.browseMessages(hostUrl, topicId, fromTs, toTs, maxCount);
        if (rows == null) {
            return List.of();
        }
        return rows.stream().map(this::toMessageResponseFromBrowse).collect(Collectors.toList());
    }

    /** caravan API browse 응답 (UPPERCASE 필드) → caravan-console MessageResponse. */
    private MessageResponse toMessageResponseFromBrowse(Map<String, Object> b) {
        return MessageResponse.builder()
                .topic((String) b.get("TOPIC"))
                .offset(toLong(b.get("OFFSET")))
                .partition(toInt(b.get("PARTITION")))
                .timestamp((String) b.get("TIMESTAMP"))
                .transactionCode((String) b.getOrDefault("TRANSACTION_CODE", ""))
                .kafkaKeyData((String) b.getOrDefault("KAFKA_KEYDATA", ""))
                .value((String) b.get("VALUE"))
                .build();
    }

    /** caravan API peekOffset 응답 → caravan-console MessageResponse. */
    private MessageResponse toMessageResponseFromPeek(String topicId, long offset, Map<String, Object> peek) {
        String value = (String) peek.get("message");
        String transactionCode = "";
        String kafkaKeyData = "";
        if (value != null) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> valueMap = OBJECT_MAPPER.readValue(value, Map.class);
                Object tc = valueMap.get("TRANSACTION_CODE");
                if (tc != null) transactionCode = String.valueOf(tc);
                Object kkd = valueMap.get("KAFKA_KEYDATA");
                if (kkd != null) kafkaKeyData = String.valueOf(kkd);
            } catch (Exception ignore) {}
        }
        return MessageResponse.builder()
                .topic(topicId)
                .offset(offset)
                .timestamp("")
                .transactionCode(transactionCode)
                .kafkaKeyData(kafkaKeyData)
                .value(value)
                .build();
    }

    private List<String> splitToList(String csv) {
        if (csv == null || csv.isBlank()) return Collections.emptyList();
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }

    /**
     * 사용자 입력 일시 문자열을 epoch millis 로 변환. 빈 입력 또는 인식 불가 시
     * {@code defaultIfMissing} 반환 (관용: from = {@code 0L}, to = {@code Long.MAX_VALUE}).
     *
     * <p>지원 포맷:
     * <ul>
     *   <li>{@code yyyyMMddHHmmss} (14자리 숫자, legacy)</li>
     *   <li>{@code YYYY-MM-DD} (날짜만 — upper bound 인 경우 23:59:59.999999999, lower 인 경우 00:00:00)</li>
     *   <li>{@code YYYY-MM-DD HH:mm[:ss]} 또는 {@code YYYY-MM-DDTHH:mm[:ss]}</li>
     * </ul>
     *
     * <p>2026-05-28 보정 — 종전 {@code parseTimestamp(null) → 0L} 로 인해
     * {@code toTimestamp=0} 이 caravan 에 전달되어 항상 빈 결과를 반환하던 버그 수정.
     */
    private long parseTimestamp(String dateStr, long defaultIfMissing, boolean isUpperBound) {
        if (dateStr == null || dateStr.isBlank()) return defaultIfMissing;
        String s = dateStr.trim();
        LocalDateTime ldt = tryParseDateTime(s, isUpperBound);
        if (ldt == null) {
            log.warn("parseTimestamp: '{}' 인식 실패 — default {} 사용", s, defaultIfMissing);
            return defaultIfMissing;
        }
        return ldt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    /** 다중 포맷 시도. 매칭 실패 시 {@code null}. */
    private LocalDateTime tryParseDateTime(String s, boolean isUpperBound) {
        // 1) 14자리 숫자 = yyyyMMddHHmmss (기존 호환)
        if (s.matches("\\d{14}")) {
            try { return LocalDateTime.parse(s, DT_FORMAT); } catch (Exception ignored) { /* 다음 시도 */ }
        }
        // 2) 날짜만 YYYY-MM-DD → upper bound 면 일말(23:59:59.999999999), 그 외 일초(00:00:00)
        if (s.matches("\\d{4}-\\d{2}-\\d{2}")) {
            try {
                LocalDate d = LocalDate.parse(s);
                return isUpperBound ? d.atTime(LocalTime.MAX) : d.atStartOfDay();
            } catch (Exception ignored) { /* 다음 시도 */ }
        }
        // 3) 날짜시간 — 공백/T 모두 허용, 초 생략 허용
        String iso = s.replace(' ', 'T');
        try { return LocalDateTime.parse(iso); } catch (Exception ignored) { /* 다음 시도 */ }
        try { return LocalDateTime.parse(iso + ":00"); } catch (Exception ignored) { /* 실패 */ }
        return null;
    }

    private long toLong(Object value) {
        if (value == null) return 0L;
        if (value instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(value)); }
        catch (NumberFormatException e) { return 0L; }
    }

    private int toInt(Object value) {
        if (value == null) return 0;
        if (value instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(value)); }
        catch (NumberFormatException e) { return 0; }
    }

    private record TopicStatus(String containerStatus, long currentOffset, long maxOffset) {}
}
