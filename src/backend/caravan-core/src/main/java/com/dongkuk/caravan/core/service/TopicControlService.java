package com.dongkuk.caravan.core.service;

import com.dongkuk.caravan.core.entity.TopicInfoEntity;
import com.dongkuk.caravan.core.jpa.TopicInfoJpaRepository;
import com.dongkuk.caravan.core.model.ControlCommand;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 6: 운영자 명령 (pause/resume/stop) 처리.
 *
 * <p>모든 메서드 {@code @Transactional("caravanTransactionManager")} — caravan EMF 의 트랜잭션
 * (host 가 caravanDataSource 를 별도 분리한 환경에서도 정상). DB UPDATE 후 {@link ControlTopicPublisher} 가
 * afterCommit 으로 control topic 으로 발행. LB 뒤 모든 인스턴스가 listener 통해 ensure*
 * 호출 → 상태 동일화.</p>
 *
 * <p>API latency 는 DB UPDATE + Kafka publish (afterCommit) 만 — 컨테이너 pause/resume 은
 * control listener 의 비동기 처리. 즉시성보다 일관성 우선.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TopicControlService {

    private final TopicInfoJpaRepository topicRepository;
    private final ControlTopicPublisher publisher;

    /**
     * STATUS=PAUSED 로 UPDATE + control PAUSE publish.
     */
    @Transactional("caravanTransactionManager")
    public void pause(String topicId, String bizSystem) {
        TopicInfoEntity entity = load(topicId, bizSystem);
        entity.setStatus("PAUSED");
        topicRepository.save(entity);
        publisher.publish(ControlCommand.pause(topicId, bizSystem));
        log.info("[TopicControl] PAUSE — topicId={}", topicId);
    }

    /**
     * STATUS=RUNNING + ERROR_* NULL 로 UPDATE + control RESUME publish.
     * ERROR 진입했던 토픽도 본 메서드로 정상화.
     */
    @Transactional("caravanTransactionManager")
    public void resume(String topicId, String bizSystem) {
        TopicInfoEntity entity = load(topicId, bizSystem);
        entity.setStatus("RUNNING");
        entity.setErrorAt(null);
        entity.setErrorOffset(null);
        entity.setLastErrorCode(null);
        entity.setLastErrorMsg(null);
        topicRepository.save(entity);
        publisher.publish(ControlCommand.resume(topicId, bizSystem));
        log.info("[TopicControl] RESUME — topicId={}", topicId);
    }

    /**
     * STATUS=RUNNING + ERROR_* NULL 로 UPDATE + control START publish.
     * <p>RESUME 과의 차이: START 는 ControlTopicListener 에서 컨테이너가 없으면
     * {@code createConsumer} 로 신규 등록(런타임 토픽 동적 등록 지원). RESUME 은 컨테이너가
     * 이미 존재해야 동작(미존재 시 noop).</p>
     */
    @Transactional("caravanTransactionManager")
    public void start(String topicId, String bizSystem) {
        TopicInfoEntity entity = load(topicId, bizSystem);
        entity.setStatus("RUNNING");
        entity.setErrorAt(null);
        entity.setErrorOffset(null);
        entity.setLastErrorCode(null);
        entity.setLastErrorMsg(null);
        topicRepository.save(entity);
        publisher.publish(ControlCommand.start(topicId, bizSystem));
        log.info("[TopicControl] START — topicId={}", topicId);
    }

    /**
     * STATUS=STOPPED 로 UPDATE + control STOP publish.
     */
    @Transactional("caravanTransactionManager")
    public void stop(String topicId, String bizSystem) {
        TopicInfoEntity entity = load(topicId, bizSystem);
        entity.setStatus("STOPPED");
        topicRepository.save(entity);
        publisher.publish(ControlCommand.stop(topicId, bizSystem));
        log.info("[TopicControl] STOP — topicId={}", topicId);
    }

    private TopicInfoEntity load(String topicId, String bizSystem) {
        return topicRepository.findByTopicIdAndBizSystem(topicId, bizSystem)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Topic not found — topicId=" + topicId + ", bizSystem=" + bizSystem));
    }
}
