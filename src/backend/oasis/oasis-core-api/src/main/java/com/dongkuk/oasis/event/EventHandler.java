package com.dongkuk.oasis.event;

/**
 * 전달 받은 이벤트에 대한 처리기.
 *
 * @author Jeongjin Kim
 * @since 2021-06-21
 */
public interface EventHandler {
    /**
     * @param event event
     */
    void handle(Event event);
}
