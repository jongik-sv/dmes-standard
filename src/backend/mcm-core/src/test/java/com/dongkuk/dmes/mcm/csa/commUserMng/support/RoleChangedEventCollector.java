package com.dongkuk.dmes.mcm.csa.commUserMng.support;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import org.springframework.context.event.EventListener;

import java.util.ArrayList;
import java.util.List;

/** 테스트 컨텍스트에서 발행된 {@link RoleChangedEvent} 를 발행 순서대로 모은다. */
public class RoleChangedEventCollector {

    private final List<RoleChangedEvent> events = new ArrayList<>();

    @EventListener
    public synchronized void on(RoleChangedEvent event) {
        events.add(event);
    }

    public synchronized List<RoleChangedEvent> events() {
        return List.copyOf(events);
    }

    public synchronized void clear() {
        events.clear();
    }
}
