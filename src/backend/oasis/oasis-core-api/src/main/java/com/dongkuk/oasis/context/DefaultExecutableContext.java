package com.dongkuk.oasis.context;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.event.Event;

import java.lang.reflect.Type;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public final class DefaultExecutableContext implements ExecutableContext {
    private final ProcessContext processContext;

    /**
     * @param processContext 프로세스 컨텍스트
     */
    public DefaultExecutableContext(ProcessContext processContext) {
        this.processContext = processContext;
    }

    /**
     * {@link ProcessContext}에 해당하는 키의 값이 있으면 반환하고, 없으면 상위 컨텍스트에서 값을 찾아온다.
     * 찾을 수 없으면 {@code null}을 반환한다.
     *
     * @param key key
     * @return 결과 객체
     */
    @Override
    public TypedObject get(String key) {
        if (key == null)
            throw new IllegalArgumentException("Key cannot be null.");
        return processContext.get(key);
    }

    @Override
    public List<TypedObject> get(Type type) {
        if (type == null)
            throw new IllegalArgumentException("Type cannot be null.");
        return processContext.get(type);
    }

    @Override
    public ServiceContext serviceContext() {
        return processContext.serviceContext();
    }

    @Override
    public ProcessContext processContext() {
        return processContext;
    }

    @Override
    public Object getObject(ObjectSearchCondition condition) {
        return processContext.getObject(condition);
    }

    @Override
    public void registerObject(Object object, ObjectRegisterInfo info) {
        processContext.registerObject(object, info);
    }

    @Override
    public void raiseEvent(Event event) {
        processContext.raiseEvent(event);
    }
}
