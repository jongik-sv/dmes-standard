package com.dongkuk.caravan.core.service;

import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.entity.TopicInfoEntity;
import com.dongkuk.caravan.core.entity.TopicInfoId;
import com.dongkuk.caravan.core.jpa.TopicInfoJpaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.common.errors.TopicExistsException;
import org.apache.kafka.common.errors.UnknownTopicOrPartitionException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * 토픽 메타(TB_CARAVAN_TOPICS) 와 실제 Kafka 브로커의 토픽을 동기화한다.
 *
 * <p>패턴: <b>DB 먼저 → Kafka</b>. Kafka 호출이 실패하면 RuntimeException 으로 전파해
 * `@Transactional` 경계가 DB 변경을 rollback 한다 (commit 후 실패 = 발산을 회피).</p>
 *
 * <p>원본 토픽 + DLT(`{topic}.dlt`) 를 함께 처리한다. 기본 partitions=1,
 * replicas={@code caravan.kafka.replication-factor}(기본 1).</p>
 *
 * <p>멱등성:</p>
 * <ul>
 *   <li>CREATE 시 브로커에 이미 토픽이 있으면 (TopicExistsException) skip 후 정상 진행</li>
 *   <li>DELETE 시 브로커에 토픽이 없으면 (UnknownTopicOrPartitionException) skip 후 정상 진행</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TopicSyncService {

    private static final int DEFAULT_PARTITIONS = 1;
    private static final String DLT_SUFFIX = ".dlt";
    private static final long ADMIN_TIMEOUT_SECONDS = 10;

    private final TopicInfoJpaRepository topicJpaRepository;
    private final AdminClient adminClient;
    private final CaravanProperties caravanProperties;

    /**
     * 토픽 메타를 DB 에 INSERT 하고 Kafka 브로커에 토픽(+DLT)을 생성한다.
     *
     * @param entity DB 저장할 메타. {@code topicId} / {@code bizSystem} 필수.
     * @return 저장된 엔티티
     */
    @Transactional("caravanTransactionManager")
    public TopicInfoEntity createTopic(TopicInfoEntity entity) {
        String topicId = entity.getTopicId();

        TopicInfoEntity saved = topicJpaRepository.save(entity);
        log.info("[TopicSync] DB INSERT done: topicId={}, bizSystem={}",
                saved.getTopicId(), saved.getBizSystem());

        createKafkaTopic(topicId);
        createKafkaTopic(topicId + DLT_SUFFIX);
        log.info("[TopicSync] Kafka topic created (+ DLT): {}", topicId);

        return saved;
    }

    /**
     * 토픽 메타를 DB 에서 UPDATE 한다 (토픽 관리 화면 rowStatus=U).
     *
     * <p>Kafka broker 는 건드리지 않는다 — 토픽명=PK 불변이고 메타 5필드
     * (topicDesc/groupId/sendModuleId/recvModuleId/useTp) 는 DB 전용이다.</p>
     *
     * @throws IllegalArgumentException PK 미존재 시 (존재하는 행만 U 가능)
     */
    @Transactional("caravanTransactionManager")
    public TopicInfoEntity updateTopicMeta(TopicInfoId id, String topicDesc, String groupId,
                                           String sendModuleId, String recvModuleId, String useTp) {
        TopicInfoEntity entity = topicJpaRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException(
                        "topic not found: " + id.getTopicId() + "/" + id.getBizSystem()));
        entity.updateMeta(topicDesc, groupId, sendModuleId, recvModuleId, useTp);
        TopicInfoEntity saved = topicJpaRepository.save(entity);
        log.info("[TopicSync] DB UPDATE done: topicId={}, bizSystem={}",
                saved.getTopicId(), saved.getBizSystem());
        return saved;
    }

    /**
     * 토픽 메타를 DB 에서 DELETE 하고 Kafka 브로커에서 토픽(+DLT)을 삭제한다.
     */
    @Transactional("caravanTransactionManager")
    public void deleteTopic(TopicInfoId id) {
        if (topicJpaRepository.existsById(id)) {
            topicJpaRepository.deleteById(id);
            log.info("[TopicSync] DB DELETE done: topicId={}, bizSystem={}",
                    id.getTopicId(), id.getBizSystem());
        } else {
            log.warn("[TopicSync] DB row not found, skip DB delete: topicId={}, bizSystem={}",
                    id.getTopicId(), id.getBizSystem());
        }

        deleteKafkaTopic(id.getTopicId());
        deleteKafkaTopic(id.getTopicId() + DLT_SUFFIX);
        log.info("[TopicSync] Kafka topic deleted (+ DLT): {}", id.getTopicId());
    }

    private void createKafkaTopic(String topic) {
        NewTopic newTopic = new NewTopic(topic, DEFAULT_PARTITIONS, caravanProperties.getReplicationFactor());
        try {
            adminClient.createTopics(List.of(newTopic))
                    .all()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
            if (e.getCause() instanceof TopicExistsException) {
                log.info("[TopicSync] Kafka topic already exists, skip create: {}", topic);
                return;
            }
            throw new RuntimeException("Kafka 토픽 생성 실패: " + topic, e.getCause());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Kafka 토픽 생성 중단: " + topic, e);
        } catch (TimeoutException e) {
            throw new RuntimeException("Kafka 토픽 생성 타임아웃: " + topic, e);
        }
    }

    private void deleteKafkaTopic(String topic) {
        try {
            adminClient.deleteTopics(List.of(topic))
                    .all()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
            if (e.getCause() instanceof UnknownTopicOrPartitionException) {
                log.info("[TopicSync] Kafka topic not found, skip delete: {}", topic);
                return;
            }
            throw new RuntimeException("Kafka 토픽 삭제 실패: " + topic, e.getCause());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Kafka 토픽 삭제 중단: " + topic, e);
        } catch (TimeoutException e) {
            throw new RuntimeException("Kafka 토픽 삭제 타임아웃: " + topic, e);
        }
    }
}
