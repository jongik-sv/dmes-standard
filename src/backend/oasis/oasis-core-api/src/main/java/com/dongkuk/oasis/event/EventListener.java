package com.dongkuk.oasis.event;

/**
 * 이벤트와 이벤트 핸들러를 등록하여 특정 이벤트가 발생시 핸들러를 호출하도록 한다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-21
 */
public interface EventListener {
    /**
     * @param eventHandler eventHandler
     * @param eventClass   eventClass
     */
    void listenEvent(Class<? extends Event> eventClass, EventHandler eventHandler);
}
