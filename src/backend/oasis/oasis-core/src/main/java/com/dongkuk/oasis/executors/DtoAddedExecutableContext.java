package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.methodinvoker.TypeUtils;

import java.lang.reflect.Type;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

class DtoAddedExecutableContext implements ExecutableContext {
    private final ExecutableContext context;
    private final Map<String, TypedObject> dtos;

    /**
     * DTO를 추가한 {@link ExecutableContext}를 생성한다.
     *
     * @param context 원본 {@link ExecutableContext}
     * @param dtos    DTO 목록
     */
    public DtoAddedExecutableContext(ExecutableContext context, Map<String, TypedObject> dtos) {
        this.context = context;
        this.dtos = dtos;
    }

    @Override
    public TypedObject get(String key) {
        TypedObject typedObject = dtos.get(key);
        if (typedObject == null)
            return context.get(key);
        return typedObject;
    }

    @Override
    public List<TypedObject> get(Type type) {
        List<TypedObject> collect = dtos.values().stream()
                .filter(typedObject -> TypeUtils.isAssignable(type, typedObject.getType()))
                .collect(Collectors.toList());

        if (collect.size() == 0)
            return context.get(type);
        else
            return collect;
    }

    @Override
    public ServiceContext serviceContext() {
        return context.serviceContext();
    }

    @Override
    public ProcessContext processContext() {
        return context.processContext();
    }

    @Override
    public Object getObject(ObjectSearchCondition condition) {
        return context.getObject(condition);
    }

    @Override
    public void registerObject(Object object, ObjectRegisterInfo info) {
        context.registerObject(object, info);
    }

    @Override
    public void raiseEvent(Event event) {
        context.raiseEvent(event);
    }
}
