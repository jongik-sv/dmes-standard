package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ObjectRegisterInfo;
import com.dongkuk.oasis.context.ObjectSearchCondition;
import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.event.EventHandler;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.model.SubProcess;
import com.dongkuk.oasis.service.ServiceFindableContext;
import com.dongkuk.oasis.methodinvoker.TypeUtils;

import java.lang.reflect.Type;
import java.util.*;

/**
 * @author Jeongjin Kim
 * @since 2021-07-16
 */
class IteratorUnpackedProcessContext implements ServiceFindableContext {
    private final ProcessContext processContext;
    private final Map<String, TypedObject> unpackedTypedObjectMap;

    public IteratorUnpackedProcessContext(ProcessContext processContext, Map<String, TypedObject> unpackedIterable) {
        this.processContext = processContext;
        this.unpackedTypedObjectMap = unpackedIterable;
    }

    @Override
    public void add(String key, TypedObject object) {
        processContext.add(key, object);
    }

    @Override
    public Map<String, TypedObject> elementOutputs() {
        Map<String, TypedObject> stringTypedObjectMap = new HashMap<>(processContext.elementOutputs());
        stringTypedObjectMap.putAll(unpackedTypedObjectMap);
        return stringTypedObjectMap;
    }

    @Override
    public ServiceContext serviceContext() {
        return processContext.serviceContext();
    }

    @Override
    public TypedObject elementOutput(String key) {
        TypedObject typedObject = unpackedTypedObjectMap.get(key);
        if (typedObject == null)
            return processContext.elementOutput(key);
        else
            return typedObject;
    }

    @Override
    public List<TypedObject> elementOutput(Type type) {
        List<TypedObject> typedObjects = new ArrayList<>();
        for (TypedObject value : unpackedTypedObjectMap.values()) {
            if (TypeUtils.isAssignable(type, value.getType()))
                typedObjects.add(value);
        }
        List<TypedObject> orgTypedObjects = processContext.elementOutput(type);
        typedObjects.addAll(orgTypedObjects);
        return typedObjects;
    }

    @Override
    public TypedObject get(String key) {
        TypedObject typedObject = unpackedTypedObjectMap.get(key);
        if (typedObject == null)
            return processContext.get(key);
        else
            return typedObject;
    }

    @Override
    public List<TypedObject> get(Type type) {
        List<TypedObject> typedObjects = new ArrayList<>();
        for (TypedObject value : unpackedTypedObjectMap.values()) {
            if (TypeUtils.isAssignable(type, value.getType()))
                typedObjects.add(value);
        }
        List<TypedObject> orgTypedObjects1 = processContext.get(type);
        typedObjects.addAll(orgTypedObjects1);

        return typedObjects;
    }

    @Override
    public void listenEvent(Class<? extends Event> eventClass, EventHandler eventHandler) {
        processContext.listenEvent(eventClass, eventHandler);
    }

    @Override
    public void raiseEvent(Event event) {
        processContext.raiseEvent(event);
    }

    public Service service(String serviceId) {
        return ((ServiceFindableContext) this.processContext).service(serviceId);
    }

    @Override
    public Collection<? extends SubProcess> parallelSubProcesses() {
        return processContext.parallelSubProcesses();
    }

    @Override
    public void setParallelSubProcesses(Collection<? extends SubProcess> subProcesses) {
        processContext.setParallelSubProcesses(subProcesses);
    }

    @Override
    public Object getObject(ObjectSearchCondition condition) {
        return processContext.getObject(condition);
    }

    @Override
    public void registerObject(Object object, ObjectRegisterInfo objectInfo) {
        processContext.registerObject(object, objectInfo);
    }
}
