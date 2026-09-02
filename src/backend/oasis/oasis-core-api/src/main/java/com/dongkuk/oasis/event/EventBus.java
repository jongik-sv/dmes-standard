package com.dongkuk.oasis.event;

/**
 * 이벤트 목록을 관리하고 이벤트가 발생하면 핸들러를 실행한다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-22
 */
public interface EventBus extends EventPublisher, EventListener {
}
