package com.dongkuk.caravan.core.service;

import com.dongkuk.caravan.core.entity.TopicInfoEntity;
import com.dongkuk.caravan.core.jpa.TopicInfoJpaRepository;
import com.dongkuk.caravan.core.model.ControlCommand;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 자동 ERROR 진입 처리 (Phase 5).
 *
 * <p>max retry 초과 시 컨슈머가 호출. DB STATUS=ERROR 업데이트 + 메타정보 기록 +
 * control topic 으로 ERROR 명령 발행 (afterCommit 으로 commit 후 발행 보장).</p>
 *
 * <p>{@link ControlTopicPublisher#publish} 가 트랜잭션 안에서 호출되므로 실제 send 는
 * 메서드 종료 후 commit 시점. 다른 인스턴스가 “아직 commit 안 된 STATUS” 를 보지 않음.</p>
 *
 * <p>멱등성: 같은 메시지가 두 인스턴스에서 처리될 수 있는 rebalance 직후 시나리오에서도
 * STATUS='ERROR' 자체는 동일. ERROR_AT/ERROR_OFFSET/LAST_ERROR_* 는 last-write-wins.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TopicErrorService {

    private final TopicInfoJpaRepository topicRepository;
    private final ControlTopicPublisher publisher;

    /**
     * 자동 ERROR 진입.
     *
     * @param topicId      해당 토픽 ID
     * @param bizSystem    비즈니스 시스템 (복합키 일부)
     * @param failedOffset 차단된 메시지 offset
     * @param code         에러 코드 (최대 100자)
     * @param msg          에러 메시지 (최대 1000자, 더 길면 truncate)
     */
    @Transactional("caravanTransactionManager")
    public void markError(String topicId, String bizSystem,
                          long failedOffset, String code, String msg) {
        TopicInfoEntity entity = topicRepository.findByTopicIdAndBizSystem(topicId, bizSystem)
                .orElseThrow(() -> new IllegalStateException(
                        "ERROR 진입 대상 토픽 미존재: topicId=" + topicId + ", bizSystem=" + bizSystem));

        entity.setStatus("ERROR");
        entity.setErrorAt(LocalDateTime.now());
        entity.setErrorOffset(failedOffset);
        entity.setLastErrorCode(truncate(code, 100));
        entity.setLastErrorMsg(truncate(msg, 1000));
        topicRepository.save(entity);

        publisher.publish(ControlCommand.error(topicId, bizSystem));

        log.warn("[CaravanError] STATUS=ERROR 진입 — topicId={}, offset={}, code={}",
                topicId, failedOffset, code);
    }

    private String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
