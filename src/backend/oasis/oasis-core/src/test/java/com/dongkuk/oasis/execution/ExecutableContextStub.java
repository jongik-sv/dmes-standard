package com.dongkuk.oasis.execution;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.event.Event;

import java.lang.reflect.Type;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-04-09
 */
public class ExecutableContextStub implements ExecutableContext {
    private final TypedObject getData;

    public ExecutableContextStub(TypedObject getData) {
        this.getData = getData;
    }

    @Override
    public TypedObject get(String key) {
        return getData;
    }

    @Override
    public List<TypedObject> get(Type type) {
        return null;
    }

    @Override
    public ServiceContext serviceContext() {
        return null;
    }

    @Override
    public ProcessContext processContext() {
        return null;
    }

    @Override
    public Object getObject(ObjectSearchCondition condition) {
        return null;
    }

    @Override
    public void registerObject(Object object, ObjectRegisterInfo info) {

    }

    @Override
    public void raiseEvent(Event event) {

    }
}
