package com.dongkuk.caravan.core.alert;

/**
 * 운영자 알림 발송 포트(SPI).
 *
 * <p>caravan-core 는 "언제·무엇을 알릴지"(정책)만 안다 — 큐막기/DLT 시점에 {@link #send(AlertEvent)} 를 호출한다.
 * "어떻게 보낼지"(SMS 게이트웨이 등 수단)는 앱(caravan-hub)이 구현한다.</p>
 *
 * <p>구현체가 없으면 caravan-core 의 {@link LoggingAlertNotifier}(WARN 로그)가 기본으로 동작한다
 * ({@code @ConditionalOnMissingBean}). 앱이 구현 빈을 등록하면 그 빈이 우선한다.</p>
 *
 * <p>구현체는 예외를 던지지 않도록 방어적으로 작성한다 — 호출부는 알림 실패가 큐막기 흐름을 막지
 * 않도록 별도로 감싸지만, 발송 자체의 신뢰성은 구현체 책임이다.</p>
 */
public interface AlertNotifier {

    /**
     * 알림을 발송한다.
     *
     * @param event 큐막기/DLT 등 도달 실패 이벤트
     */
    void send(AlertEvent event);
}
