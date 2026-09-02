package com.dongkuk.oasis.model;

import com.dongkuk.oasis.event.Event;

/**
 * @author Jeongjin Kim
 * @since 2021-06-24
 */
public final class ElementExecutedEvent implements Event {
    private final Element element;

    /**
     * @param element 실행된 요소
     */
    public ElementExecutedEvent(Element element) {
        this.element = element;
    }

    /**
     * @return 요소
     */
    public Element getElement() {
        return element;
    }
}
