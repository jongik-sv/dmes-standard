package com.dongkuk.caravan.core.offset;

import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.exception.KafkaOffsetException;
import com.dongkuk.caravan.core.service.KafkaGroupQueryService;
import com.dongkuk.caravan.core.service.KafkaGroupQueryService.GroupInfo;
import com.dongkuk.caravan.core.service.TopicControlService;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Kafka Offset 관리 서비스
 *
 * <p>Consumer Group의 Offset을 조회하고 조작하는 기능을 제공합니다.</p>
 *
 * <h3>주요 기능</h3>
 * <ul>
 *   <li>현재 Offset 조회: Consumer Group이 커밋한 마지막 Offset</li>
 *   <li>최대 Offset 조회: 토픽의 가장 최신 메시지 Offset (Log End Offset)</li>
 *   <li>최소 Offset 조회: 토픽의 가장 오래된 메시지 Offset</li>
 *   <li>Offset 스킵: 특정 개수만큼 Offset을 건너뛰기</li>
 * </ul>
 *
 * <h3>Offset 스킵 사용 시나리오</h3>
 * <ul>
 *   <li>특정 메시지가 계속 처리 실패할 때 해당 메시지를 건너뛰기</li>
 *   <li>장애 복구 시 특정 Offset부터 재처리</li>
 *   <li>테스트 목적으로 메시지를 스킵</li>
 * </ul>
 *
 * <h3>주의사항</h3>
 * <p>Offset 조작은 데이터 유실을 초래할 수 있으므로 신중하게 사용해야 합니다.</p>
 *
 * @author Caravan
 * @version 1.0.0
 * @see OffsetInfo
 * @see ContainerController
 */
@Service
@RequiredArgsConstructor
public class KafkaOffsetManager {

    private static final Logger log = LoggerFactory.getLogger(KafkaOffsetManager.class);

    /** 기본 파티션 (단일 파티션 토픽 가정) */
    private static final int DEFAULT_PARTITION = 0;

    /** AdminClient 작업 타임아웃 (초) */
    private static final int TIMEOUT_SECONDS = 10;

    /** 그룹 EMPTY 대기 최대 시간 (밀리초) */
    private static final long EMPTY_WAIT_TIMEOUT_MS = 10_000L;

    /** EMPTY polling 간격 (밀리초) */
    private static final long EMPTY_POLL_INTERVAL_MS = 200L;

    private final AdminClient adminClient;
    private final TopicControlService topicControlService;
    private final KafkaGroupQueryService groupQueryService;
    private final CaravanProperties properties;

    /**
     * 지정한 개수만큼 Offset을 건너뜁니다.
     *
     * <p>이 메서드는 다음 순서로 동작합니다:</p>
     * <ol>
     *   <li>Listener 컨테이너 정지</li>
     *   <li>현재 Offset 조회</li>
     *   <li>새 Offset 계산 (현재 + count, 최대 Offset 이하)</li>
     *   <li>Offset 변경</li>
     *   <li>Listener 컨테이너 재시작</li>
     * </ol>
     *
     * <h4>Offset 범위</h4>
     * <p>새 Offset은 최대 Offset을 초과할 수 없습니다.
     * 예를 들어, 현재 Offset이 100이고 최대 Offset이 105일 때
     * count=10을 지정하면 새 Offset은 105가 됩니다.</p>
     *
     * <h4>사용 예시</h4>
     * <pre>{@code
     * // 1개 메시지 스킵
     * OffsetInfo info = offsetManager.skipOffset("listener-my-topic", "my-group", "my-topic", 1);
     * log.info("Offset 변경: {} -> {}", info.getBeforeOffset(), info.getAfterOffset());
     * }</pre>
     *
     * @param listenerId Listener ID (컨테이너 제어에 사용)
     * @param groupId    Consumer Group ID
     * @param topic      토픽명
     * @param count      스킵할 메시지 개수 (양수)
     * @return Offset 변경 정보를 담은 {@link OffsetInfo} 객체
     *         <ul>
     *           <li>{@code beforeOffset}: 변경 전 Offset</li>
     *           <li>{@code afterOffset}: 변경 후 Offset</li>
     *           <li>{@code maxOffset}: 토픽의 최대 Offset</li>
     *         </ul>
     * @throws KafkaOffsetException Offset 조회 또는 변경 실패 시
     */
    public OffsetInfo skipOffset(String listenerId, String groupId, String topic, int count) {
        log.info("Offset 스킵 시작 - listenerId: {}, groupId: {}, topic: {}, count: {}",
            listenerId, groupId, topic, count);

        String bizSystem = properties.getBizSystem();

        // Phase 8 LB 안전 절차:
        // 1. DB UPDATE STATUS='STOPPED' + control STOP publish
        //    → 모든 인스턴스 ~100ms 안에 컨테이너 stop
        topicControlService.stop(topic, bizSystem);

        try {
            // 2. describeConsumerGroups 가 EMPTY 가 될 때까지 polling (max 10초)
            //    → empty 안 되면 IllegalStateException
            waitForGroupEmpty(groupId, topic);

            // 3. 변경 전 offset 조회 + 새 offset 계산
            long currentOffset = getCurrentOffset(groupId, topic);
            long beforeMaxOffset = getMaxOffset(topic);
            long newOffset = Math.min(currentOffset + count, beforeMaxOffset);

            // 4. AdminClient.alterConsumerGroupOffsets 으로 offset 변경
            TopicPartition tp = new TopicPartition(topic, DEFAULT_PARTITION);
            Map<TopicPartition, OffsetAndMetadata> offsets = Collections.singletonMap(
                tp, new OffsetAndMetadata(newOffset)
            );
            adminClient.alterConsumerGroupOffsets(groupId, offsets).all()
                .get(TIMEOUT_SECONDS, TimeUnit.SECONDS);

            // 5. 변경 후 offset 조회
            long afterCurrentOffset = getCurrentOffset(groupId, topic);
            long afterMaxOffset = getMaxOffset(topic);

            log.info("Offset 스킵 완료 - topic: {}, {} -> {} (beforeMax: {}, afterMax: {})",
                topic, currentOffset, afterCurrentOffset, beforeMaxOffset, afterMaxOffset);

            return OffsetInfo.builder()
                .beforeOffset(currentOffset)
                .afterOffset(afterCurrentOffset)
                .beforeMaxOffset(beforeMaxOffset)
                .afterMaxOffset(afterMaxOffset)
                .maxOffset(afterMaxOffset)
                .partition(DEFAULT_PARTITION)
                .topic(topic)
                .groupId(groupId)
                .build();

        } catch (KafkaOffsetException e) {
            throw e;
        } catch (Exception e) {
            log.error("Offset 스킵 실패 - topic: {}, groupId: {}", topic, groupId, e);
            throw new KafkaOffsetException("Offset 스킵 실패: " + e.getMessage(), e, topic, groupId);
        } finally {
            // 6. DB UPDATE STATUS='RUNNING' + control RESUME publish
            //    → 모든 인스턴스 ~100ms 안에 컨테이너 resume. ERROR_*=NULL 도 함께.
            try {
                topicControlService.resume(topic, bizSystem);
            } catch (Exception e) {
                log.warn("Offset 스킵 후 RESUME 실패 - topic: {}: {}", topic, e.getMessage());
            }
        }
    }

    /**
     * Consumer group 이 EMPTY 상태가 될 때까지 polling.
     * Phase 6 의 STOP publish 가 broadcast 되어 모든 인스턴스가 컨테이너를 stop 한 뒤,
     * Kafka group coordinator 가 group state 를 EMPTY 로 갱신하기까지 기다림.
     */
    private void waitForGroupEmpty(String groupId, String topic) {
        long deadline = System.currentTimeMillis() + EMPTY_WAIT_TIMEOUT_MS;
        while (System.currentTimeMillis() < deadline) {
            GroupInfo info = groupQueryService.describe(groupId, topic);
            String state = info.getState();
            if ("EMPTY".equalsIgnoreCase(state) || "DEAD".equalsIgnoreCase(state)) {
                log.info("Consumer group EMPTY 확인 - groupId: {}, state: {}", groupId, state);
                return;
            }
            log.debug("Consumer group EMPTY 대기 중 - groupId: {}, currentState: {}", groupId, state);
            try {
                Thread.sleep(EMPTY_POLL_INTERVAL_MS);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                throw new KafkaOffsetException(
                    "EMPTY 대기 중 인터럽트", ie, topic, groupId);
            }
        }
        throw new KafkaOffsetException(
            "Consumer group 이 " + EMPTY_WAIT_TIMEOUT_MS + "ms 안에 EMPTY 가 되지 않음",
            null, topic, groupId);
    }

    /**
     * Consumer Group의 현재 커밋된 Offset을 조회합니다.
     *
     * <p>Consumer Group이 아직 해당 토픽을 구독하지 않았거나,
     * 커밋된 Offset이 없는 경우 0을 반환합니다.</p>
     *
     * <h4>Offset 의미</h4>
     * <p>반환되는 Offset은 "다음에 읽을 메시지의 Offset"입니다.
     * 예를 들어, Offset 100을 반환하면 Offset 100번 메시지부터 소비합니다.</p>
     *
     * @param groupId Consumer Group ID
     * @param topic   토픽명
     * @return 현재 커밋된 Offset (미커밋 시 0)
     * @throws KafkaOffsetException Offset 조회 실패 시
     */
    public long getCurrentOffset(String groupId, String topic) {
        try {
            TopicPartition tp = new TopicPartition(topic, DEFAULT_PARTITION);

            Map<TopicPartition, OffsetAndMetadata> offsets =
                adminClient.listConsumerGroupOffsets(groupId)
                    .partitionsToOffsetAndMetadata()
                    .get(TIMEOUT_SECONDS, TimeUnit.SECONDS);

            OffsetAndMetadata offsetMeta = offsets.get(tp);
            if (offsetMeta == null) {
                log.warn("Offset 정보 없음 - topic: {}, groupId: {}", topic, groupId);
                return 0;
            }

            return offsetMeta.offset();
        } catch (InterruptedException | ExecutionException | TimeoutException e) {
            log.error("현재 Offset 조회 실패 - topic: {}, groupId: {}", topic, groupId, e);
            throw new KafkaOffsetException("Offset 조회 실패: " + e.getMessage(), e, topic, groupId);
        }
    }

    /**
     * 토픽의 최대 Offset (Log End Offset)을 조회합니다.
     *
     * <p>Log End Offset은 다음 메시지가 기록될 Offset을 의미합니다.
     * 따라서 실제 마지막 메시지의 Offset은 (maxOffset - 1)입니다.</p>
     *
     * <h4>Lag 계산</h4>
     * <p>Consumer Lag는 {@code maxOffset - currentOffset}으로 계산할 수 있습니다.</p>
     *
     * @param topic 토픽명
     * @return 최대 Offset (Log End Offset)
     * @throws KafkaOffsetException Offset 조회 실패 시
     */
    public long getMaxOffset(String topic) {
        try {
            TopicPartition tp = new TopicPartition(topic, DEFAULT_PARTITION);
            Map<TopicPartition, OffsetSpec> request = Collections.singletonMap(tp, OffsetSpec.latest());

            ListOffsetsResult result = adminClient.listOffsets(request);
            return result.partitionResult(tp).get(TIMEOUT_SECONDS, TimeUnit.SECONDS).offset();
        } catch (InterruptedException | ExecutionException | TimeoutException e) {
            log.error("최대 Offset 조회 실패 - topic: {}", topic, e);
            throw new KafkaOffsetException("최대 Offset 조회 실패: " + e.getMessage(), e, topic, null);
        }
    }

    /**
     * 토픽의 최소 Offset (Log Start Offset)을 조회합니다.
     *
     * <p>Log Start Offset은 토픽에서 가장 오래된 메시지의 Offset입니다.
     * Retention 정책에 의해 삭제된 메시지는 조회할 수 없으므로,
     * 이 Offset 이전의 메시지는 더 이상 존재하지 않습니다.</p>
     *
     * @param topic 토픽명
     * @return 최소 Offset (Log Start Offset)
     * @throws KafkaOffsetException Offset 조회 실패 시
     */
    public long getMinOffset(String topic) {
        try {
            TopicPartition tp = new TopicPartition(topic, DEFAULT_PARTITION);
            Map<TopicPartition, OffsetSpec> request = Collections.singletonMap(tp, OffsetSpec.earliest());

            ListOffsetsResult result = adminClient.listOffsets(request);
            return result.partitionResult(tp).get(TIMEOUT_SECONDS, TimeUnit.SECONDS).offset();
        } catch (InterruptedException | ExecutionException | TimeoutException e) {
            log.error("최소 Offset 조회 실패 - topic: {}", topic, e);
            throw new KafkaOffsetException("최소 Offset 조회 실패: " + e.getMessage(), e, topic, null);
        }
    }
}
