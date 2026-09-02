package com.dongkuk.caravan.core.service;

import com.dongkuk.caravan.core.config.CaravanProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Phase 7: 부팅 시 STATUS RUNNING reset Runner ("X 옵션 — restart = clean slate").
 *
 * <p>{@link ApplicationRunner} 로 동작 → KafkaListenerConfigurer 의 boot-time 리스너 등록 이후 실행.
 * caravan-hub 의 {@code DataInitializer} (테이블 생성) 도 {@code @PostConstruct} 라서 더 먼저 끝남.</p>
 *
 * <p>처리:
 * <ol>
 *   <li>{@code TopicResetService.resetStatus(bizSystem)} — DB STATUS='RUNNING' 일괄 UPDATE
 *       (USE_TP='Y' 만, ERROR_*=NULL).</li>
 *   <li>컨테이너는 {@code KafkaListenerConfigurer} 가 이미 boot 시점에 등록 + start.
 *       이 Runner 는 추가 등록 안 함.</li>
 * </ol>
 *
 * <p>의도: 어떤 인스턴스에서 ERROR 였던 토픽도 재기동 후엔 일괄 RUNNING 으로 시작해서
 * 운영자가 LB 뒤 인스턴스 상태를 다시 동일화. 같은 메시지가 여전히 fail 이면
 * Phase 5 자동 ERROR 진입이 다시 처리.</p>
 */
@Slf4j
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
@RequiredArgsConstructor
public class CaravanBootstrapResetRunner implements ApplicationRunner {

    private final TopicResetService topicResetService;
    private final CaravanProperties props;

    @Override
    public void run(ApplicationArguments args) {
        String bizSystem = props.getBizSystem();
        if (bizSystem == null || bizSystem.isBlank()) {
            log.warn("[BootstrapReset] caravan.kafka.biz-system 미설정 — STATUS reset 스킵");
            return;
        }

        try {
            topicResetService.resetStatus(bizSystem);
        } catch (Exception e) {
            // reset 실패해도 caravan 자체 부팅은 진행 (existing listener 는 이미 동작 중).
            // DB STATUS 가 stale 일 수 있으나 다음 control 명령으로 정상화 가능.
            log.error("[BootstrapReset] STATUS reset 실패 — bizSystem={}", bizSystem, e);
        }
    }
}
