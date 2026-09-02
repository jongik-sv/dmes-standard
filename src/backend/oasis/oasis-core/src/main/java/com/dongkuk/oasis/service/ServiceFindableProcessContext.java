package com.dongkuk.oasis.service;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ObjectRegisterInfo;
import com.dongkuk.oasis.context.ObjectSearchCondition;
import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.event.EventHandler;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.model.SubProcess;
import com.dongkuk.oasis.provider.ServiceProvider;

import java.lang.reflect.Type;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
public class ServiceFindableProcessContext implements ServiceFindableContext {
    private final ProcessContext processContext;
    private final ServiceProvider serviceProvider;
    private final ServiceFindableContext serviceFindableContext;

    /**
     * @param processContext  기반 프로세스 컨텍스트
     * @param serviceProvider 서비스 제공자
     */
    public ServiceFindableProcessContext(ProcessContext processContext,
                                         ServiceProvider serviceProvider) {
        this.processContext = processContext;
        this.serviceProvider = serviceProvider;
        this.serviceFindableContext = null;
    }

    /**
     * @param processContext         기반 프로세스 컨텍스트
     * @param serviceFindableContext 서비스 제공 가능 컨텍스트
     */
    public ServiceFindableProcessContext(ProcessContext processContext,
                                         ServiceFindableContext serviceFindableContext) {
        this.processContext = processContext;
        this.serviceProvider = null;
        this.serviceFindableContext = serviceFindableContext;
    }

    @Override
    public void add(String key, TypedObject object) {
        processContext.add(key, object);
    }

    @Override
    public Map<String, TypedObject> elementOutputs() {
        return processContext.elementOutputs();
    }

    @Override
    public ServiceContext serviceContext() {
        return processContext.serviceContext();
    }

    @Override
    public TypedObject elementOutput(String key) {
        return processContext.elementOutput(key);
    }

    @Override
    public List<TypedObject> elementOutput(Type type) {
        return processContext.elementOutput(type);
    }

    @Override
    public TypedObject get(String key) {
        return processContext.get(key);
    }

    @Override
    public List<TypedObject> get(Type type) {
        return processContext.get(type);
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

    @Override
    public void listenEvent(Class<? extends Event> eventClass, EventHandler eventHandler) {
        processContext.listenEvent(eventClass, eventHandler);
    }

    @Override
    public void raiseEvent(Event event) {
        processContext.raiseEvent(event);
    }

    /**
     * @param serviceId 서비스 식별자
     * @return element
     */
    @Override
    public Service service(String serviceId) {
        if (serviceProvider != null)
            return serviceProvider.service(serviceId);
        else if (serviceFindableContext != null)
            return serviceFindableContext.service(serviceId);
        throw new IllegalStateException("No Service Provider.");
    }
}
