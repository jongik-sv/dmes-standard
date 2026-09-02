package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.event.EventHandler;
import com.dongkuk.oasis.model.SubProcess;
import com.dongkuk.oasis.methodinvoker.TypeUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Type;
import java.util.*;

/**
 * 기본 프로세스 컨텍스트.
 * <p>
 * not thread-safe
 *
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public final class DefaultProcessContext implements ProcessContext {
    private static final Logger log = LoggerFactory.getLogger(DefaultProcessContext.class);
    private final ServiceContext serviceContext;
    private final Map<String, TypedObject> processOutputs = new HashMap<>();
    private final Map<Type, Object> objects = new HashMap<>();
    private Collection<? extends SubProcess> parallelSubProcesses;

    /**
     * @param serviceContext 서비스 컨텍스트
     */
    public DefaultProcessContext(ServiceContext serviceContext) {
        if (serviceContext == null)
            throw new IllegalArgumentException("service context is null");

        this.serviceContext = serviceContext;
    }

    @Override
    synchronized public void add(String key, TypedObject object) {
        if (processOutputs.containsKey(key))
            log.warn("Key [{}] already exists in the process result. Overwriting the existing value.", key);
        processOutputs.put(key, object);
    }

    @Override
    public Map<String, TypedObject> elementOutputs() {
        return Collections.unmodifiableMap(processOutputs);
    }

    @Override
    public ServiceContext serviceContext() {
        return serviceContext;
    }

    @Override
    public TypedObject elementOutput(String key) {
        return processOutputs.get(key);
    }

    @Override
    public List<TypedObject> elementOutput(Type type) {
        List<TypedObject> typedObjects = new ArrayList<>();
        for (TypedObject value : processOutputs.values()) {
            if (TypeUtils.isAssignable(type, value.getType()))
                typedObjects.add(value);
        }
        return typedObjects;
    }

    @Override
    public TypedObject get(String key) {
        TypedObject typedObject = elementOutput(key);
        if (typedObject == null)
            return serviceContext.get(key);
        else return typedObject;
    }

    @Override
    public List<TypedObject> get(Type type) {
        List<TypedObject> typedObjects = elementOutput(type);
        if (typedObjects.size() == 0)
            return serviceContext.get(type);
        else
            return typedObjects;
    }

    @Override
    public Collection<? extends SubProcess> parallelSubProcesses() {
        return parallelSubProcesses == null ? Collections.emptyList() : parallelSubProcesses;
    }

    @Override
    public void setParallelSubProcesses(Collection<? extends SubProcess> subProcesses) {
        this.parallelSubProcesses = subProcesses;
    }

    @Override
    public Object getObject(ObjectSearchCondition condition) {
        String name = condition.name();
        if (name != null)
            throw new UnsupportedOperationException("Name search is not supported.");

        Class<?> aClass = condition.classType();
        if (aClass == null) {
            return null;
        }

        Object o = this.serviceContext.getObject(aClass);
        if(o != null)
            return o;

        o = objects.get(aClass);

        if (o == null) {
            List<TypedObject> typedObjects = this.get(aClass);
            if (typedObjects.size() > 1)
                throw new IllegalArgumentException(aClass.getName() + "exists more than 2");
            else if (typedObjects.size() == 0)
                return null;
            else
                return typedObjects.get(0).getObject();
        }
        return o;
    }

    @Override
    synchronized public void registerObject(Object object, ObjectRegisterInfo objectInfo) {
        String name = objectInfo.name();
        if (name != null)
            throw new UnsupportedOperationException("Name registration is not supported.");

        Class<?> aClass = objectInfo.classType();
        if (aClass == null)
            throw new IllegalArgumentException("The type information of the object to register is null.");

        objects.put(aClass, object);
    }

    @Override
    public void raiseEvent(Event event) {
        serviceContext.raiseEvent(event);
    }

    @Override
    public void listenEvent(Class<? extends Event> eventClass, EventHandler eventHandler) {
        serviceContext.listenEvent(eventClass, eventHandler);
    }
}
