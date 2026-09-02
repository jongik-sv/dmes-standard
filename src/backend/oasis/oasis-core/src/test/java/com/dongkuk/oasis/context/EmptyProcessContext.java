package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.event.EventHandler;
import com.dongkuk.oasis.model.SubProcess;

import java.lang.reflect.Type;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-05-14
 */
public class EmptyProcessContext implements ProcessContext {
    @Override
    public void add(String key, TypedObject object) {
        throw new UnsupportedOperationException();
    }

    @Override
    public Map<String, TypedObject> elementOutputs() {
        return new HashMap<>();
    }

    @Override
    public ServiceContext serviceContext() {
        return null;
    }

    @Override
    public TypedObject elementOutput(String key) {
        return null;
    }

    @Override
    public List<TypedObject> elementOutput(Type type) {
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
    public Collection<? extends SubProcess> parallelSubProcesses() {
        return null;
    }

    @Override
    public void setParallelSubProcesses(Collection<? extends SubProcess> subProcesses) {

    }

    @Override
    public Object getObject(ObjectSearchCondition condition) {
        return null;
    }

    @Override
    public void registerObject(Object object, ObjectRegisterInfo objectInfo) {

    }

    @Override
    public void raiseEvent(Event event) {

    }

    @Override
    public void listenEvent(Class<? extends Event> eventClass, EventHandler eventHandler) {

    }
}
