package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.event.EventHandler;

import java.lang.reflect.Type;
import java.util.List;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-05-14
 */
public class EmptyServiceContext implements ServiceContext {
    @Override
    public Map<String, TypedObject> serviceInputs() {
        return null;
    }

    @Override
    public TypedObject serviceInput(String key) {
        return null;
    }

    @Override
    public List<TypedObject> serviceInput(Type type) {
        return null;
    }

    @Override
    public TypedObject get(String key) {
        return null;
    }

    @Override
    public List<TypedObject> get(Type type) {
        return null;
    }

    @Override
    public ServiceContext createSubServiceContext(Map<String, TypedObject> serviceInputs) {
        return null;
    }

    @Override
    public ServiceContext createServiceContext(Map<String, TypedObject> serviceInputs) {
        return null;
    }

    @Override
    public void listenEvent(Class<? extends Event> eventClass, EventHandler eventHandler) {

    }

    @Override
    public void raiseEvent(Event event) {

    }
}
