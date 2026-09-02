package com.dongkuk.caravan.core.alert;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 기본 fallback 알림 구현 — 실제 발송 채널(SMS 등) 미연동 시 WARN 로그만 남긴다.
 *
 * <p>caravan-hub 가 {@link AlertNotifier} 구현 빈(예: {@code SmsAlertNotifier})을 등록하지 않은 동안
 * caravan-core 가 이 빈을 기본으로 사용한다({@code @ConditionalOnMissingBean}). 이로써 게이트웨이
 * 연동 전에도 알림 지점이 로그로 남아 배선을 검증할 수 있다.</p>
 */
public class LoggingAlertNotifier implements AlertNotifier {

    private static final Logger log = LoggerFactory.getLogger(LoggingAlertNotifier.class);

    @Override
    public void send(AlertEvent event) {
        log.warn("[ALERT:{}] biz={} topic={} tc={} {} code={} msg={} "
                        + "— 알림 채널 미연동(로그만). 운영자 개입 필요.",
                event.getStage(), event.getBizSystem(), event.getTopicId(),
                event.getTransactionCode(), event.getLocator(),
                event.getErrorCode(), event.getErrorMsg());
    }
}
