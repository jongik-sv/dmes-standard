package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.audit.Audit;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.event.EventBus;
import com.dongkuk.oasis.event.EventContainer;
import com.dongkuk.oasis.event.EventHandler;
import com.dongkuk.oasis.methodinvoker.TypeUtils;

import java.lang.reflect.Type;
import java.util.*;

/**
 * 상위 컨텍스트를 서비스 컨텍스트 생성 이후에 설정가능한 서비스 컨텍스트이다.
 * <p>
 * See {@code com.dongkuk.oasis.service.SpringServiceStarter}
 *
 * @author Jeongjin Kim
 * @since 2021-04-09
 */
public final class DefaultServiceContext implements ServiceContext, ApplicationContextSettable {
    private final ServiceContext rootServiceContext;
    private final Map<String, TypedObject> serviceInputs;
    private final EventBus eventBus;
    private final Map<String, Object> classToObjectMap = new HashMap<>();
    private ApplicationContext applicationContext;
    private String requestTag;
    private Audit audit;

    /**
     * {@link DefaultServiceContext}를 생성합니다.
     *
     * @param applicationContext 애플리케이션 컨텍스트
     * @param serviceInputs      serviceInputs
     * @param eventBus           eventBus
     * @param rootServiceContext rootServiceContext
     * @param classToObjectMap   클래스 오브젝트 맵
     */
    private DefaultServiceContext(ApplicationContext applicationContext,
                                  Map<String, TypedObject> serviceInputs,
                                  EventBus eventBus,
                                  ServiceContext rootServiceContext,
                                  Map<String, Object> classToObjectMap) {
        if (applicationContext == null)
            throw new IllegalArgumentException("application context is null");
        if (serviceInputs == null)
            throw new IllegalArgumentException("serviceInputs is null");

        this.applicationContext = applicationContext;
        this.serviceInputs = Collections.unmodifiableMap(serviceInputs);
        this.eventBus = eventBus;
        this.rootServiceContext = rootServiceContext;
        this.classToObjectMap.putAll(classToObjectMap);
    }

    /**
     * {@link DefaultServiceContext}를 생성합니다.
     *
     * @param applicationContext 애플리케이션 컨텍스트
     * @param serviceInputs      serviceInputs
     * @param eventBus           eventBus
     * @param rootServiceContext rootServiceContext
     */
    private DefaultServiceContext(ApplicationContext applicationContext,
                                  Map<String, TypedObject> serviceInputs,
                                  EventBus eventBus,
                                  ServiceContext rootServiceContext) {
        this(applicationContext, serviceInputs, eventBus, rootServiceContext, Collections.emptyMap());
    }

    private DefaultServiceContext(ApplicationContext applicationContext,
                                  Map<String, TypedObject> serviceInputs,
                                  EventBus eventBus) {
        this(applicationContext, serviceInputs, eventBus, null);
    }

    /**
     * {@link DefaultServiceContext}를 생성합니다.
     *
     * @param applicationContext 애플리케이션 컨텍스트
     * @param serviceInputs      serviceInputs
     */
    public DefaultServiceContext(ApplicationContext applicationContext,
                                 Map<String, TypedObject> serviceInputs) {
        this(applicationContext, serviceInputs, new EventContainer());
    }

    /**
     * {@link DefaultServiceContext}를 생성합니다.
     *
     * @param serviceInputs serviceInputs
     */
    public DefaultServiceContext(Map<String, TypedObject> serviceInputs) {
        this(new DefaultApplicationContext(), serviceInputs);
    }

    /**
     * {@link DefaultServiceContext}를 생성합니다.
     *
     * @param applicationContext applicationContext
     */
    public DefaultServiceContext(ApplicationContext applicationContext) {
        this(applicationContext, Collections.emptyMap());
    }

    /**
     * {@link DefaultServiceContext}를 생성합니다.
     */
    public DefaultServiceContext() {
        this(new DefaultApplicationContext(), Collections.emptyMap());
    }

    /**
     * @param applicationContext 애플리케이션 컨텍스트
     */
    @Override
    public void setApplicationContext(ApplicationContext applicationContext) {
        if (applicationContext == null)
            throw new IllegalArgumentException("application context is null");

        this.applicationContext = applicationContext;
    }

    @Override
    public Map<String, TypedObject> serviceInputs() {
        if (rootServiceContext != null) {
            Map<String, TypedObject> rootServiceInputs = new HashMap<>(rootServiceContext.serviceInputs());
            rootServiceInputs.putAll(serviceInputs);
            return rootServiceInputs;
        } else
            return serviceInputs;
    }

    @Override
    public TypedObject serviceInput(String key) {
        TypedObject typedObject = serviceInputs.get(key);
        if (typedObject == null && this.rootServiceContext != null)
            return this.rootServiceContext.serviceInput(key);
        else
            return typedObject;
    }

    @Override
    public List<TypedObject> serviceInput(Type type) {
        List<TypedObject> typedObjects = new ArrayList<>();
        for (TypedObject value : serviceInputs.values()) {
            if (TypeUtils.isAssignable(type, value.getType()))
                typedObjects.add(value);
        }
        if (typedObjects.size() == 0 && this.rootServiceContext != null)
            return this.rootServiceContext.serviceInput(type);
        else
            return typedObjects;
    }

    @Override
    public TypedObject get(String key) {
        TypedObject typedObject = serviceInput(key);
        if (typedObject == null)
            return applicationContext.get(key);
        else
            return typedObject;
    }

    @Override
    public List<TypedObject> get(Type type) {
        List<TypedObject> typedObjects = serviceInput(type);
        if (typedObjects.size() == 0)
            return applicationContext.get(type);
        else
            return typedObjects;
    }

    @Override
    public ServiceContext createSubServiceContext(Map<String, TypedObject> serviceInputs) {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                this.applicationContext,
                serviceInputs,
                this.eventBus,
                this.rootServiceContext == null ? this : this.rootServiceContext,
                this.classToObjectMap);
        defaultServiceContext.setAudit(this.audit);
        return defaultServiceContext;
    }

    @Override
    public ServiceContext createServiceContext(Map<String, TypedObject> serviceInputs) {
        DefaultServiceContext defaultServiceContext = new DefaultServiceContext(
                this.applicationContext, serviceInputs
        );
        defaultServiceContext.setAudit(this.audit);
        return defaultServiceContext;
    }

    @Override
    public String requestTag() {
        return requestTag;
    }

    @Override
    public void raiseEvent(Event event) {
        this.eventBus.raiseEvent(event);
    }

    @Override
    public void listenEvent(Class<? extends Event> eventClass, EventHandler eventHandler) {
        this.eventBus.listenEvent(eventClass, eventHandler);
    }

    /**
     * {@link Audit}을 설정한다.
     *
     * @param audit audit
     */
    public void setAudit(Audit audit) {
        this.audit = audit;
    }

    /**
     * 요청 태그를 설정한다.
     *
     * @param requestTag 요청태그
     */
    public void setRequestTag(String requestTag) {
        this.requestTag = requestTag;
    }

    @Override
    public Audit audit() {
        return this.audit;
    }

    /**
     * Class와 Object를 저장한다.
     * <p>
     * Task에 지정된 클래스를 생성하기 전에 같은 타입의 오브젝트가 있는지 확인을 하는데 이 메소드로 등록된
     * 타입 목록을 참조한다.
     *
     * @param classToTestObjectMap 클래스 이름과 오브젝트 맵, not null
     */
    public void setClassToObjectMap(Map<String, Object> classToTestObjectMap) {
        if (classToTestObjectMap == null)
            throw new NullPointerException();
        this.classToObjectMap.putAll(classToTestObjectMap);
    }

    @Override
    public Object getObject(Class<?> aClass) {
        if (aClass == null)
            throw new NullPointerException();
        return this.classToObjectMap.get(aClass.getName());
    }
}
