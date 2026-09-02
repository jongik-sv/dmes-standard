package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.event.EventBus;
import com.dongkuk.oasis.event.EventContainer;
import com.dongkuk.oasis.event.EventHandler;

import java.lang.reflect.Type;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 컨텍스트 내에 데이터를 가지고 있지 않으며, 상위 컨텍스트에도 접근 불가한 컨텍스트.
 * <p>
 * See {@code com.dongkuk.oasis.service.SpringServiceStarter}
 *
 * @author Jeongjin Kim
 * @since 2021-08-08
 */
public final class EmptyServiceContext implements ServiceContext {
    private final EventBus eventBus;
    private final Map<String, TypedObject> serviceInputs = Collections.emptyMap();

    /**
     * {@link EmptyServiceContext}를 생성합니다.
     *
     * @param eventBus eventBus
     */
    private EmptyServiceContext(EventBus eventBus) {

        this.eventBus = eventBus;
    }

    /**
     * {@link EmptyServiceContext}를 생성합니다.
     */
    public EmptyServiceContext() {
        this(new EventContainer());
    }

    @Override
    public Map<String, TypedObject> serviceInputs() {
        return serviceInputs;
    }

    @Override
    public TypedObject serviceInput(String key) {
        return serviceInputs.get(key);
    }

    @Override
    public List<TypedObject> serviceInput(Type type) {
        return Collections.emptyList();
    }

    @Override
    public TypedObject get(String key) {
        return null;
    }

    @Override
    public List<TypedObject> get(Type type) {
        return Collections.emptyList();
    }

    @Override
    public ServiceContext createSubServiceContext(Map<String, TypedObject> serviceInputs) {
        return new EmptyServiceContext(this.eventBus);
    }

    @Override
    public ServiceContext createServiceContext(Map<String, TypedObject> serviceInputs) {
        return new EmptyServiceContext();
    }

    @Override
    public void raiseEvent(Event event) {
        this.eventBus.raiseEvent(event);
    }

    @Override
    public void listenEvent(Class<? extends Event> eventClass, EventHandler eventHandler) {
        this.eventBus.listenEvent(eventClass, eventHandler);
    }
}
