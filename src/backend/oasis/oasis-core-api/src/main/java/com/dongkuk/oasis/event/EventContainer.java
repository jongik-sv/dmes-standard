package com.dongkuk.oasis.event;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-06-22
 */
public class EventContainer implements EventBus {
    private final Map<Class<? extends Event>, List<EventHandler>> bus = new HashMap<>();

    @Override
    public void listenEvent(Class<? extends Event> eventClass, EventHandler eventHandler) {
        List<EventHandler> eventHandlers = bus.computeIfAbsent(eventClass, k -> new ArrayList<>());
        eventHandlers.add(eventHandler);
    }

    @Override
    public void raiseEvent(Event event) {
        List<EventHandler> eventHandlers = bus.get(event.getClass());
        if (eventHandlers != null)
            for (EventHandler eventHandler : eventHandlers) {
                eventHandler.handle(event);
            }
    }
}
