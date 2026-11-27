package com.dongkuk.dmes.mcm.csa.commObjMng.support;

import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import org.springframework.context.event.EventListener;

import java.util.ArrayList;
import java.util.List;

/** 시험 컨텍스트에서 발행된 {@link RoleChangedEvent}·{@link MenuChangedEvent} 를 발행 순서대로 모은다. 시험마다 {@link #clear()} 한다. */
public class SecEventCollector {

    private final List<RoleChangedEvent> roleEvents = new ArrayList<>();
    private final List<MenuChangedEvent> menuEvents = new ArrayList<>();

    @EventListener
    public synchronized void on(RoleChangedEvent event) {
        roleEvents.add(event);
    }

    @EventListener
    public synchronized void on(MenuChangedEvent event) {
        menuEvents.add(event);
    }

    public synchronized List<RoleChangedEvent> roleEvents() {
        return List.copyOf(roleEvents);
    }

    public synchronized List<MenuChangedEvent> menuEvents() {
        return List.copyOf(menuEvents);
    }

    public synchronized void clear() {
        roleEvents.clear();
        menuEvents.clear();
    }
}
