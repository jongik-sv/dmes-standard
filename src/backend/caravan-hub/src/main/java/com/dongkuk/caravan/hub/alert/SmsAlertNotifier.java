package com.dongkuk.caravan.hub.alert;

import com.dongkuk.caravan.core.alert.AlertEvent;
import com.dongkuk.caravan.core.alert.AlertNotifier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * SMS 발송 어댑터 (게이트웨이 실연동 자리).
 *
 * <p>caravan-core 가 큐막기/DLT 시점에 호출하는 {@link AlertNotifier} 의 caravan-hub 구현.
 * 이 빈이 등록되면 caravan-core 의 기본 {@code LoggingAlertNotifier}({@code @ConditionalOnMissingBean})
 * 대신 사용된다.</p>
 *
 * <h3>활성화 조건</h3>
 * <p>{@code caravan-hub.alert.sms.enabled=true} 일 때만 등록된다. 게이트웨이 미연동 상태(기본값 false)
 * 에서는 이 빈이 뜨지 않아 core 의 WARN 로그 fallback 이 동작한다 — "배선은 지금, 실 발송은 게이트웨이
 * 연동 후" 원칙.</p>
 *
 * <h3>TODO — 게이트웨이 연동 시</h3>
 * <ul>
 *   <li>수신번호 매핑(bizSystem/토픽별) 로드</li>
 *   <li>SMS 게이트웨이 API 호출({@link #send(AlertEvent)} 본문)</li>
 *   <li>발송 실패 재시도/폴백 정책</li>
 * </ul>
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "caravan-hub.alert.sms", name = "enabled", havingValue = "true")
public class SmsAlertNotifier implements AlertNotifier {

    @Override
    public void send(AlertEvent event) {
        // TODO: SMS 게이트웨이 연동 — 현재는 미구현 스텁(연동 전까지 WARN 로그).
        //   예) smsGatewayClient.send(resolveRecipients(event.getBizSystem()), format(event));
        log.warn("[SMS-TODO] 게이트웨이 미구현 — 발송 대상 이벤트: {}", event);
    }
}
