package com.dongkuk.caravan.core.service;

import com.dongkuk.caravan.core.jpa.TopicInfoJpaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 7: 부팅 시 STATUS reset 서비스.
 *
 * <p>UPDATE 단일 트랜잭션. 컨테이너 등록 (broker 호출) 등 외부 자원 작업은 호출자
 * ({@code CaravanBootstrapResetRunner}) 가 트랜잭션 밖에서 수행 — DB 락 점유 시간 최소화.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TopicResetService {

    private final TopicInfoJpaRepository topicRepository;

    /**
     * 해당 bizSystem 의 USE_TP='Y' 토픽 STATUS 를 RUNNING 으로 reset.
     * ERROR_AT/ERROR_OFFSET/LAST_ERROR_CODE/LAST_ERROR_MSG 도 NULL 로 초기화.
     */
    @Transactional("caravanTransactionManager")
    public int resetStatus(String bizSystem) {
        int affected = topicRepository.resetStatusForBizSystem(bizSystem);
        log.info("[BootstrapReset] STATUS=RUNNING reset — bizSystem={}, affected={}", bizSystem, affected);
        return affected;
    }
}
