package com.dongkuk.oasis.event;

/**
 * 이벤트를 발생시킬 수 있는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2021-06-21
 */
public interface EventPublisher {

    /**
     * @param event event
     */
    void raiseEvent(Event event);
}
